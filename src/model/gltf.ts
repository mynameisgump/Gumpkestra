import { fromTRS, identity, multiply } from './math';
import { SoupBuilder, type MeshData, type MeshTexture, type Rig } from './mesh';

// glTF 2.0 / GLB loader: static meshes, node hierarchies, skins and animations
// (translation/rotation/scale channels). Not supported: Draco/meshopt
// compression, morph targets, external .bin files (use .glb or embedded .gltf).

/* eslint-disable @typescript-eslint/no-explicit-any */
type Json = any;

const COMPONENTS: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const ARRAYS: Record<number, { BYTES_PER_ELEMENT: number; get: (dv: DataView, o: number) => number; norm: number }> = {
  5120: { BYTES_PER_ELEMENT: 1, get: (dv, o) => dv.getInt8(o), norm: 127 },
  5121: { BYTES_PER_ELEMENT: 1, get: (dv, o) => dv.getUint8(o), norm: 255 },
  5122: { BYTES_PER_ELEMENT: 2, get: (dv, o) => dv.getInt16(o, true), norm: 32767 },
  5123: { BYTES_PER_ELEMENT: 2, get: (dv, o) => dv.getUint16(o, true), norm: 65535 },
  5125: { BYTES_PER_ELEMENT: 4, get: (dv, o) => dv.getUint32(o, true), norm: 1 },
  5126: { BYTES_PER_ELEMENT: 4, get: (dv, o) => dv.getFloat32(o, true), norm: 1 },
};

function readAccessor(json: Json, buffers: Uint8Array[], index: number): Float32Array {
  const acc = json.accessors[index];
  const comps = COMPONENTS[acc.type];
  const out = new Float32Array(acc.count * comps);
  if (acc.bufferView === undefined) return out;
  const bv = json.bufferViews[acc.bufferView];
  const buf = buffers[bv.buffer];
  const kind = ARRAYS[acc.componentType];
  const stride = bv.byteStride ?? comps * kind.BYTES_PER_ELEMENT;
  const base = buf.byteOffset + (bv.byteOffset ?? 0) + (acc.byteOffset ?? 0);
  const dv = new DataView(buf.buffer);
  const scale = acc.normalized ? kind.norm : 1;
  for (let i = 0; i < acc.count; i++) {
    for (let c = 0; c < comps; c++) {
      const v = kind.get(dv, base + i * stride + c * kind.BYTES_PER_ELEMENT);
      out[i * comps + c] = scale === 1 ? v : Math.max(v / scale, -1);
    }
  }
  return out;
}

const decodeDataUri = async (uri: string) => new Uint8Array(await (await fetch(uri)).arrayBuffer());

function triangulate(mode: number, count: number, indices: ArrayLike<number> | null): number[] | ArrayLike<number> | null {
  if (mode === 4) return indices;
  const at = (i: number) => (indices ? indices[i] : i);
  const out: number[] = [];
  if (mode === 5) {
    for (let i = 0; i + 2 < count; i++) out.push(...(i % 2 ? [at(i + 1), at(i), at(i + 2)] : [at(i), at(i + 1), at(i + 2)]));
  } else if (mode === 6) {
    for (let i = 1; i + 1 < count; i++) out.push(at(0), at(i), at(i + 1));
  }
  return out;
}

interface Channel {
  node: number;
  path: 'translation' | 'rotation' | 'scale';
  times: Float32Array;
  values: Float32Array;
  interp: string;
}

/** Node hierarchy + skins + animations. Slot layout: [one per node][skin 0 joints][skin 1 joints]… */
class GltfRig implements Rig {
  readonly slots: number;
  readonly animations: { name: string; duration: number; channels: Channel[]; nodes: Set<number> }[] = [];
  private readonly rest: { t: Float32Array; r: Float32Array; s: Float32Array; matrix?: Float32Array }[];
  private readonly t: Float32Array[];
  private readonly r: Float32Array[];
  private readonly s: Float32Array[];
  private readonly world: Float32Array[];
  private readonly order: { node: number; parent: number }[] = [];
  readonly skinOffsets: number[] = [];
  private readonly skins: { joints: number[]; ibm: Float32Array }[];

  constructor(json: Json, buffers: Uint8Array[]) {
    const nodes: Json[] = json.nodes ?? [];
    this.rest = nodes.map((n) => ({
      t: new Float32Array(n.translation ?? [0, 0, 0]),
      r: new Float32Array(n.rotation ?? [0, 0, 0, 1]),
      s: new Float32Array(n.scale ?? [1, 1, 1]),
      matrix: n.matrix ? new Float32Array(n.matrix) : undefined,
    }));
    this.t = this.rest.map((n) => n.t.slice());
    this.r = this.rest.map((n) => n.r.slice());
    this.s = this.rest.map((n) => n.s.slice());
    this.world = nodes.map(() => identity());

    // Parent-before-child traversal order over every root.
    const parent = new Int32Array(nodes.length).fill(-1);
    nodes.forEach((n, i) => (n.children ?? []).forEach((c: number) => (parent[c] = i)));
    const visit = (node: number, p: number) => {
      this.order.push({ node, parent: p });
      for (const c of nodes[node].children ?? []) visit(c, node);
    };
    nodes.forEach((_, i) => parent[i] < 0 && visit(i, -1));

    let slots = nodes.length;
    this.skins = (json.skins ?? []).map((skin: Json) => {
      this.skinOffsets.push(slots);
      slots += skin.joints.length;
      const ibm = skin.inverseBindMatrices !== undefined
        ? readAccessor(json, buffers, skin.inverseBindMatrices)
        : new Float32Array(skin.joints.length * 16).map((_, i) => (i % 5 === 0 ? 1 : 0));
      return { joints: skin.joints, ibm };
    });
    this.slots = Math.max(1, slots);

    for (const anim of json.animations ?? []) {
      const channels: Channel[] = [];
      let duration = 0;
      for (const ch of anim.channels) {
        const path = ch.target.path;
        if (ch.target.node === undefined || !['translation', 'rotation', 'scale'].includes(path)) continue;
        const sampler = anim.samplers[ch.sampler];
        const times = readAccessor(json, buffers, sampler.input);
        duration = Math.max(duration, times[times.length - 1] ?? 0);
        channels.push({ node: ch.target.node, path, times, values: readAccessor(json, buffers, sampler.output), interp: sampler.interpolation ?? 'LINEAR' });
      }
      this.animations.push({ name: anim.name || `Animation ${this.animations.length + 1}`, duration, channels, nodes: new Set(channels.map((c) => c.node)) });
    }
  }

  private sample(ch: Channel, time: number) {
    const { times, values } = ch;
    const comps = ch.path === 'rotation' ? 4 : 3;
    const out = (ch.path === 'translation' ? this.t : ch.path === 'rotation' ? this.r : this.s)[ch.node];
    // Cubic spline stores [inTangent, value, outTangent] per key; we use the values only.
    const cubic = ch.interp === 'CUBICSPLINE';
    const val = (k: number, c: number) => values[cubic ? k * comps * 3 + comps + c : k * comps + c];
    const last = times.length - 1;
    if (time <= times[0] || last === 0) { for (let c = 0; c < comps; c++) out[c] = val(0, c); return; }
    if (time >= times[last]) { for (let c = 0; c < comps; c++) out[c] = val(last, c); return; }
    let lo = 0, hi = last;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (times[mid] <= time) lo = mid; else hi = mid;
    }
    const f = ch.interp === 'STEP' ? 0 : (time - times[lo]) / (times[hi] - times[lo]);
    if (comps === 4) {
      // Normalised lerp along the shortest arc — indistinguishable from slerp at animation key spacing.
      let dot = 0;
      for (let c = 0; c < 4; c++) dot += val(lo, c) * val(hi, c);
      const sign = dot < 0 ? -1 : 1;
      let len = 0;
      for (let c = 0; c < 4; c++) { out[c] = val(lo, c) * (1 - f) + val(hi, c) * f * sign; len += out[c] * out[c]; }
      len = Math.sqrt(len) || 1;
      for (let c = 0; c < 4; c++) out[c] /= len;
    } else {
      for (let c = 0; c < comps; c++) out[c] = val(lo, c) * (1 - f) + val(hi, c) * f;
    }
  }

  pose(anim: number, time: number, out: Float32Array) {
    this.rest.forEach((n, i) => { this.t[i].set(n.t); this.r[i].set(n.r); this.s[i].set(n.s); });
    const a = this.animations[anim];
    if (a) {
      const t = a.duration > 0 ? ((time % a.duration) + a.duration) % a.duration : 0;
      for (const ch of a.channels) this.sample(ch, t);
    }
    for (const { node, parent } of this.order) {
      const w = this.world[node];
      const matrix = this.rest[node].matrix;
      // Nodes given as a raw matrix keep it unless an animation drives their TRS.
      if (matrix && !a?.nodes.has(node)) w.set(matrix);
      else fromTRS(this.t[node], this.r[node], this.s[node], w);
      if (parent >= 0) multiply(this.world[parent], w, w);
      out.set(w, node * 16);
    }
    this.skins.forEach((skin, si) => {
      const off = this.skinOffsets[si];
      skin.joints.forEach((j, k) => {
        const m = out.subarray((off + k) * 16, (off + k + 1) * 16);
        multiply(this.world[j], skin.ibm.subarray(k * 16, k * 16 + 16), m);
      });
    });
    if (!this.rest.length) identity(out.subarray(0, 16));
  }
}

export async function parseGLTF(name: string, data: ArrayBuffer): Promise<MeshData> {
  let json: Json;
  const buffers: Uint8Array[] = [];
  const head = new DataView(data);
  if (data.byteLength >= 12 && head.getUint32(0, true) === 0x46546c67) {
    // GLB: 12-byte header, then JSON chunk, then optional BIN chunk.
    let off = 12;
    let bin: Uint8Array | null = null;
    while (off + 8 <= data.byteLength) {
      const len = head.getUint32(off, true);
      const type = head.getUint32(off + 4, true);
      const chunk = new Uint8Array(data, off + 8, len);
      if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(chunk));
      else if (type === 0x004e4942) bin = chunk;
      off += 8 + len;
    }
    if (!json) throw new Error('GLB has no JSON chunk');
    for (const b of json.buffers ?? []) buffers.push(b.uri ? await decodeDataUri(b.uri) : bin!);
  } else {
    json = JSON.parse(new TextDecoder().decode(data));
    for (const b of json.buffers ?? []) {
      if (!b.uri?.startsWith('data:')) throw new Error('.gltf references an external .bin — export as .glb (or embedded .gltf) instead');
      buffers.push(await decodeDataUri(b.uri));
    }
  }
  const compressed = (json.extensionsRequired ?? []).filter((e: string) => /draco|meshopt/i.test(e));
  if (compressed.length) throw new Error(`${compressed.join(', ')} compression isn't supported — re-export without it`);

  // Textures (base colour only).
  const images: (Promise<ImageBitmap | null>)[] = (json.images ?? []).map(async (img: Json) => {
    try {
      let bytes: Uint8Array;
      if (img.bufferView !== undefined) {
        const bv = json.bufferViews[img.bufferView];
        const buf = buffers[bv.buffer];
        bytes = buf.subarray(bv.byteOffset ?? 0, (bv.byteOffset ?? 0) + bv.byteLength);
      } else if (img.uri?.startsWith('data:')) {
        bytes = await decodeDataUri(img.uri);
      } else {
        return null;
      }
      const blob = new Blob([bytes as BlobPart], { type: img.mimeType ?? 'image/png' });
      return await createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
    } catch {
      return null;
    }
  });
  const bitmaps = await Promise.all(images);
  const textures: MeshTexture[] = [];
  const textureIndex = new Map<number, number>();
  const resolveTexture = (index: number | undefined) => {
    if (index === undefined) return -1;
    if (textureIndex.has(index)) return textureIndex.get(index)!;
    const tex = json.textures?.[index];
    const src = tex?.source ?? tex?.extensions?.EXT_texture_webp?.source;
    const image = bitmaps[src];
    let slot = -1;
    if (image) {
      const s = json.samplers?.[tex.sampler] ?? {};
      slot = textures.push({ image, magFilter: s.magFilter, minFilter: s.minFilter, wrapS: s.wrapS, wrapT: s.wrapT }) - 1;
    }
    textureIndex.set(index, slot);
    return slot;
  };

  const rig = new GltfRig(json, buffers);
  const builder = new SoupBuilder();
  const scene = json.scenes?.[json.scene ?? 0];
  const roots: number[] = scene?.nodes ?? (json.nodes ?? []).map((_: Json, i: number) => i);
  const seen = new Set<number>();
  const walk = (ni: number) => {
    if (seen.has(ni)) return;
    seen.add(ni);
    const node = json.nodes[ni];
    if (node.mesh !== undefined) {
      const skinOffset = node.skin !== undefined ? rig.skinOffsets[node.skin] : -1;
      for (const prim of json.meshes[node.mesh].primitives) {
        const mode = prim.mode ?? 4;
        if (mode < 4 || prim.attributes.POSITION === undefined) continue;
        const A = prim.attributes;
        const positions = readAccessor(json, buffers, A.POSITION);
        const rawIdx = prim.indices !== undefined ? readAccessor(json, buffers, prim.indices) : null;
        const indices = triangulate(mode, rawIdx ? rawIdx.length : positions.length / 3, rawIdx);
        let joints: Float32Array | null = null;
        let weights: Float32Array | null = null;
        if (skinOffset >= 0 && A.JOINTS_0 !== undefined && A.WEIGHTS_0 !== undefined) {
          joints = readAccessor(json, buffers, A.JOINTS_0).map((j) => j + skinOffset);
          weights = readAccessor(json, buffers, A.WEIGHTS_0);
        }
        const mat = json.materials?.[prim.material]?.pbrMetallicRoughness ?? {};
        builder.add({
          positions,
          normals: A.NORMAL !== undefined ? readAccessor(json, buffers, A.NORMAL) : null,
          uvs: A.TEXCOORD_0 !== undefined ? readAccessor(json, buffers, A.TEXCOORD_0) : null,
          indices,
          joints,
          weights,
          slot: ni,
          color: mat.baseColorFactor ?? [1, 1, 1, 1],
          texture: resolveTexture(mat.baseColorTexture?.index),
        });
      }
    }
    for (const c of node.children ?? []) walk(c);
  };
  roots.forEach(walk);
  return builder.build(name, rig, textures);
}
