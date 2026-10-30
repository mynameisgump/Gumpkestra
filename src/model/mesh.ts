import { identity } from './math';

// Meshes are stored as an interleaved *triangle soup* (no index buffer): every
// triangle owns its three vertices. That costs memory but lets the vertex
// shader do per-triangle effects — explode/shatter (via the face centroid and
// normal), wireframe (barycentrics from gl_VertexID) — with no geometry shader.
//
// Every vertex is skinned. Rigid meshes simply point all four joint slots at
// their node's matrix with weight 1, so skeletal animation, node animation and
// static models all go through one code path.

/** pos3 normal3 uv2 joints4 weights4 centroid3 faceNormal3 */
export const STRIDE = 22;

export interface MeshGroup {
  /** First vertex and vertex count (multiples of 3). */
  start: number;
  count: number;
  color: [number, number, number, number];
  /** Index into MeshData.textures, or -1. */
  texture: number;
}

export interface MeshTexture {
  image: ImageBitmap;
  magFilter?: number;
  minFilter?: number;
  wrapS?: number;
  wrapT?: number;
}

/** Produces one mat4 per joint slot for a given animation time. */
export interface Rig {
  readonly slots: number;
  readonly animations: { name: string; duration: number }[];
  /** anim < 0 → rest pose. Writes `slots` column-major mat4s into `out`. */
  pose(anim: number, time: number, out: Float32Array): void;
}

export interface MeshData {
  name: string;
  vertices: Float32Array;
  vertexCount: number;
  groups: MeshGroup[];
  textures: MeshTexture[];
  rig: Rig;
  /** Bounding sphere (rest pose + animations), used to normalise any model to ~unit size. */
  center: [number, number, number];
  radius: number;
}

export const staticRig = (): Rig => ({
  slots: 1,
  animations: [],
  pose: (_a, _t, out) => identity(out.subarray(0, 16)),
});

export interface Primitive {
  positions: ArrayLike<number>;
  normals?: ArrayLike<number> | null;
  uvs?: ArrayLike<number> | null;
  indices?: ArrayLike<number> | null;
  /** 4 per vertex, already mapped to rig slots. */
  joints?: ArrayLike<number> | null;
  weights?: ArrayLike<number> | null;
  /** Slot used when there are no joints. */
  slot?: number;
  color?: [number, number, number, number];
  texture?: number;
}

export class SoupBuilder {
  private data = new Float32Array(STRIDE * 3 * 1024);
  private count = 0;
  groups: MeshGroup[] = [];

  private reserve(vertices: number) {
    const need = (this.count + vertices) * STRIDE;
    if (need <= this.data.length) return;
    const next = new Float32Array(Math.max(need, this.data.length * 2));
    next.set(this.data);
    this.data = next;
  }

  add(prim: Primitive) {
    const { positions: P, normals, uvs, indices, joints, weights } = prim;
    const vertCount = P.length / 3;
    const triCount = Math.floor((indices ? indices.length : vertCount) / 3);
    const idx = (i: number) => (indices ? indices[i] : i);
    // Smooth normals if the source has none (indexed), otherwise flat.
    const N = normals ?? (indices ? smoothNormals(P, indices) : null);

    this.reserve(triCount * 3);
    const start = this.count;
    const d = this.data;
    const slot = prim.slot ?? 0;
    for (let t = 0; t < triCount; t++) {
      const a = idx(t * 3) * 3, b = idx(t * 3 + 1) * 3, c = idx(t * 3 + 2) * 3;
      const e1x = P[b] - P[a], e1y = P[b + 1] - P[a + 1], e1z = P[b + 2] - P[a + 2];
      const e2x = P[c] - P[a], e2y = P[c + 1] - P[a + 1], e2z = P[c + 2] - P[a + 2];
      let fx = e1y * e2z - e1z * e2y, fy = e1z * e2x - e1x * e2z, fz = e1x * e2y - e1y * e2x;
      const fl = Math.hypot(fx, fy, fz);
      if (fl > 0) { fx /= fl; fy /= fl; fz /= fl; } else { fx = 0; fy = 1; fz = 0; }
      // Winding varies between exporters; trust the vertex normals for which side is "out".
      if (N && fx * (N[a] + N[b] + N[c]) + fy * (N[a + 1] + N[b + 1] + N[c + 1]) + fz * (N[a + 2] + N[b + 2] + N[c + 2]) < 0) {
        fx = -fx; fy = -fy; fz = -fz;
      }
      const cx = (P[a] + P[b] + P[c]) / 3, cy = (P[a + 1] + P[b + 1] + P[c + 1]) / 3, cz = (P[a + 2] + P[b + 2] + P[c + 2]) / 3;

      for (let k = 0; k < 3; k++) {
        const vi = idx(t * 3 + k);
        let o = (this.count++) * STRIDE;
        d[o++] = P[vi * 3]; d[o++] = P[vi * 3 + 1]; d[o++] = P[vi * 3 + 2];
        if (N) { d[o++] = N[vi * 3]; d[o++] = N[vi * 3 + 1]; d[o++] = N[vi * 3 + 2]; }
        else { d[o++] = fx; d[o++] = fy; d[o++] = fz; }
        d[o++] = uvs ? uvs[vi * 2] : 0; d[o++] = uvs ? uvs[vi * 2 + 1] : 0;
        if (joints && weights) {
          const ws = weights[vi * 4] + weights[vi * 4 + 1] + weights[vi * 4 + 2] + weights[vi * 4 + 3] || 1;
          for (let j = 0; j < 4; j++) d[o + j] = joints[vi * 4 + j];
          for (let j = 0; j < 4; j++) d[o + 4 + j] = weights[vi * 4 + j] / ws;
        } else {
          d[o] = d[o + 1] = d[o + 2] = d[o + 3] = slot;
          d[o + 4] = 1; d[o + 5] = d[o + 6] = d[o + 7] = 0;
        }
        o += 8;
        d[o++] = cx; d[o++] = cy; d[o++] = cz;
        d[o++] = fx; d[o++] = fy; d[o++] = fz;
      }
    }
    const color = prim.color ?? [1, 1, 1, 1];
    const texture = prim.texture ?? -1;
    const last = this.groups[this.groups.length - 1];
    // Merge consecutive primitives that share a material into one draw call.
    if (last && last.texture === texture && last.color.every((v, i) => v === color[i]) && last.start + last.count === start) {
      last.count += this.count - start;
    } else {
      this.groups.push({ start, count: this.count - start, color, texture });
    }
  }

  build(name: string, rig: Rig, textures: MeshTexture[] = []): MeshData {
    if (!this.count) throw new Error('model contains no triangles');
    const vertices = this.data.slice(0, this.count * STRIDE);
    const { center, radius } = bounds(vertices, this.count, rig);
    return { name, vertices, vertexCount: this.count, groups: this.groups, textures, rig, center, radius };
  }
}

function smoothNormals(P: ArrayLike<number>, I: ArrayLike<number>) {
  const n = new Float32Array(P.length);
  for (let t = 0; t + 2 < I.length; t += 3) {
    const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
    const e1 = [P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]];
    const e2 = [P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]];
    // Unnormalised cross product = area-weighted.
    const f = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    for (const v of [a, b, c]) for (let k = 0; k < 3; k++) n[v + k] += f[k];
  }
  for (let i = 0; i < n.length; i += 3) {
    const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1;
    n[i] /= l; n[i + 1] /= l; n[i + 2] /= l;
  }
  return n;
}

/**
 * Bounding sphere over the rest pose plus a few frames of every animation
 * (CPU-skinned), so rigged models are framed by where they actually move.
 */
function bounds(v: Float32Array, count: number, rig: Rig) {
  const poses: [number, number][] = [[-1, 0]];
  const perAnim = Math.max(2, Math.floor(24 / Math.max(1, rig.animations.length)));
  rig.animations.forEach((a, i) => {
    for (let k = 0; k < perAnim; k++) poses.push([i, (a.duration * k) / perAnim]);
  });
  // Big meshes: skin a subset of vertices for the extra poses.
  const step = Math.max(1, Math.floor((count * poses.length) / 2e6));
  const mats = new Float32Array(rig.slots * 16);
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  const pts: number[] = [];
  const p = [0, 0, 0];
  poses.forEach(([anim, time], pi) => {
    rig.pose(anim, time, mats);
    for (let i = 0; i < count; i += pi === 0 ? 1 : step) {
      const o = i * STRIDE;
      p[0] = p[1] = p[2] = 0;
      for (let j = 0; j < 4; j++) {
        const w = v[o + 12 + j];
        if (!w) continue;
        const m = v[o + 8 + j] * 16;
        for (let r = 0; r < 3; r++) {
          p[r] += w * (mats[m + r] * v[o] + mats[m + 4 + r] * v[o + 1] + mats[m + 8 + r] * v[o + 2] + mats[m + 12 + r]);
        }
      }
      for (let r = 0; r < 3; r++) {
        min[r] = Math.min(min[r], p[r]);
        max[r] = Math.max(max[r], p[r]);
      }
      pts.push(p[0], p[1], p[2]);
    }
  });
  const center: [number, number, number] = [0, 1, 2].map((r) => (min[r] + max[r]) / 2) as [number, number, number];
  let r2 = 0;
  for (let i = 0; i < pts.length; i += 3) {
    r2 = Math.max(r2, (pts[i] - center[0]) ** 2 + (pts[i + 1] - center[1]) ** 2 + (pts[i + 2] - center[2]) ** 2);
  }
  return { center, radius: Math.sqrt(r2) || 1 };
}

// ── Built-in primitives ────────────────────────────────────────────────────

type Vec6 = [number, number, number, number, number, number];

/** A (u, v) → [position, normal] surface sampled on a grid, as an indexed primitive. */
function surface(nu: number, nv: number, f: (u: number, v: number) => Vec6, wrapU = true, wrapV = true): Primitive {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const cols = wrapU ? nu : nu + 1;
  const rows = wrapV ? nv : nv + 1;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const pn = f(i / nu, j / nv);
      positions.push(pn[0], pn[1], pn[2]);
      normals.push(pn[3], pn[4], pn[5]);
      uvs.push(i / nu, j / nv);
    }
  }
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const i1 = wrapU ? (i + 1) % nu : i + 1;
      const j1 = wrapV ? (j + 1) % nv : j + 1;
      const a = j * cols + i, b = j * cols + i1, c = j1 * cols + i1, d = j1 * cols + i;
      indices.push(a, c, b, a, d, c);
    }
  }
  return { positions, normals, uvs, indices };
}

const TAU = Math.PI * 2;

export const PRIMITIVES: Record<string, () => Primitive[]> = {
  '@sphere': () => [surface(96, 64, (u, v) => {
    const th = u * TAU, ph = v * Math.PI;
    const p = [Math.sin(ph) * Math.cos(th), Math.cos(ph), Math.sin(ph) * Math.sin(th)];
    return [...p, ...p] as Vec6;
  }, true, false)],
  '@torus': () => [surface(128, 48, (u, v) => {
    const a = u * TAU, b = v * TAU, r = 1 + 0.4 * Math.cos(b);
    return [r * Math.cos(a), 0.4 * Math.sin(b), r * Math.sin(a), Math.cos(b) * Math.cos(a), Math.sin(b), Math.cos(b) * Math.sin(a)];
  })],
  '@knot': () => [surface(384, 32, (u, v) => {
    // (2,3) torus knot with a tube swept along it using a finite-difference frame.
    const P = (t: number) => {
      const a = t * TAU, r = 2 + Math.cos(3 * a);
      return [r * Math.cos(2 * a), r * Math.sin(2 * a), Math.sin(3 * a)];
    };
    const p = P(u), q = P(u + 1e-3);
    const T = q.map((x, i) => x - p[i]);
    const tl = Math.hypot(...T);
    T.forEach((_, i) => (T[i] /= tl));
    let B = [T[1] * p[2] - T[2] * p[1], T[2] * p[0] - T[0] * p[2], T[0] * p[1] - T[1] * p[0]];
    const bl = Math.hypot(...B);
    B = B.map((x) => x / bl);
    const N = [B[1] * T[2] - B[2] * T[1], B[2] * T[0] - B[0] * T[2], B[0] * T[1] - B[1] * T[0]];
    const a = v * TAU, r = 0.45;
    const n = [0, 1, 2].map((i) => Math.cos(a) * N[i] + Math.sin(a) * B[i]);
    return [...n.map((x, i) => p[i] + r * x), ...n] as Vec6;
  })],
  '@cube': () => {
    // Six subdivided faces so deformers have vertices to push around.
    const faces: [number[], number[], number[]][] = [
      [[1, 0, 0], [0, 0, -1], [0, 1, 0]], [[-1, 0, 0], [0, 0, 1], [0, 1, 0]],
      [[0, 1, 0], [1, 0, 0], [0, 0, -1]], [[0, -1, 0], [1, 0, 0], [0, 0, 1]],
      [[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [-1, 0, 0], [0, 1, 0]],
    ];
    return faces.map(([n, u, w]) => {
      return surface(24, 24, (s, t) => [...[0, 1, 2].map((i) => n[i] + (s * 2 - 1) * u[i] + (t * 2 - 1) * w[i]), ...n] as Vec6, false, false);
    });
  },
};

export function buildPrimitive(name: string): MeshData {
  const make = PRIMITIVES[name];
  if (!make) throw new Error(`unknown primitive ${name}`);
  const b = new SoupBuilder();
  for (const p of make()) b.add(p);
  return b.build(name, staticRig());
}

// ── OBJ / STL ──────────────────────────────────────────────────────────────

export function parseOBJ(name: string, text: string): MeshData {
  const v: number[] = [], vt: number[] = [], vn: number[] = [];
  const pos: number[] = [], uv: number[] = [], nrm: number[] = [];
  const posIndex: number[] = [];
  let hasUV = false, hasN = false;
  const at = (arr: number[], i: string, size: number) => {
    const n = parseInt(i, 10);
    return n < 0 ? arr.length / size + n : n - 1;
  };
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    const parts = line.split(/\s+/);
    switch (parts[0]) {
      case 'v': v.push(+parts[1], +parts[2], +parts[3]); break;
      case 'vt': vt.push(+parts[1], 1 - +(parts[2] ?? 0)); break; // OBJ's V points up; glTF/textures point down.
      case 'vn': vn.push(+parts[1], +parts[2], +parts[3]); break;
      case 'f': {
        const corners = parts.slice(1).filter(Boolean).map((c) => c.split('/'));
        for (let i = 1; i + 1 < corners.length; i++) {
          for (const c of [corners[0], corners[i], corners[i + 1]]) {
            const pi = at(v, c[0], 3);
            posIndex.push(pi);
            pos.push(v[pi * 3], v[pi * 3 + 1], v[pi * 3 + 2]);
            if (c[1]) { const ti = at(vt, c[1], 2); uv.push(vt[ti * 2], vt[ti * 2 + 1]); hasUV = true; } else uv.push(0, 0);
            if (c[2]) { const ni = at(vn, c[2], 3); nrm.push(vn[ni * 3], vn[ni * 3 + 1], vn[ni * 3 + 2]); hasN = true; } else nrm.push(0, 0, 0);
          }
        }
        break;
      }
    }
  }
  let normals: ArrayLike<number> | null = hasN ? nrm : null;
  if (!hasN) {
    // Smooth over shared positions, then expand per corner.
    const smooth = smoothNormals(v, posIndex);
    normals = posIndex.flatMap((pi) => [smooth[pi * 3], smooth[pi * 3 + 1], smooth[pi * 3 + 2]]);
  }
  const b = new SoupBuilder();
  b.add({ positions: pos, normals, uvs: hasUV ? uv : null });
  return b.build(name, staticRig());
}

export function parseSTL(name: string, buf: ArrayBuffer): MeshData {
  const dv = new DataView(buf);
  const tris = buf.byteLength >= 84 ? dv.getUint32(80, true) : 0;
  const positions: number[] = [];
  if (tris && 84 + tris * 50 === buf.byteLength) {
    for (let t = 0; t < tris; t++) {
      const o = 84 + t * 50 + 12;
      for (let k = 0; k < 9; k++) positions.push(dv.getFloat32(o + k * 4, true));
    }
  } else {
    const text = new TextDecoder().decode(buf);
    for (const m of text.matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g)) positions.push(+m[1], +m[2], +m[3]);
  }
  const b = new SoupBuilder();
  b.add({ positions });
  return b.build(name, staticRig());
}
