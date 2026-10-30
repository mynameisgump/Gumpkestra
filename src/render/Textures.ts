// GPU textures for image inputs, shared by every layer: library files
// (images and looping videos) plus a few procedural built-ins ("@noise", …).
//
// Convention: textures are uploaded bottom-up (flipped), matching ISF and our
// render targets, so IMG_NORM_PIXEL(tex, vec2(0)) is the image's bottom-left.

export const TEXTURE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.mp4', '.webm', '.mov'];
const VIDEO = /\.(mp4|webm|mov)$/i;
const VIDEO_TYPES: Record<string, string> = { mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime' };

export const isTextureFile = (name: string) => TEXTURE_EXTENSIONS.some((ext) => name.toLowerCase().endsWith(ext));
export const isVideoTexture = (name: string) => VIDEO.test(name);

/** Special image-input values that aren't textures. */
export const INPUT_IMAGE = '@input';

interface Entry {
  tex: WebGLTexture;
  video?: HTMLVideoElement;
  url?: string;
  /** A new video frame is ready to upload. */
  dirty: boolean;
  /** Frames since a layer last asked for this texture (videos pause when unused). */
  idle: number;
}

export class TextureStore {
  private entries = new Map<string, Entry>();
  /** Loads in flight, by name → token, so a stale load can't overwrite a newer one. */
  private pending = new Map<string, object>();
  private failed = new Set<string>();
  readonly black: WebGLTexture;
  /** Fetches a library texture file (wired to the Library at startup). */
  fetchBlob: (name: string) => Promise<Blob> = () => Promise.reject(new Error('no texture loader'));

  constructor(private gl: WebGL2RenderingContext) {
    this.black = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.black);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
  }

  /** The texture if it's ready; otherwise starts loading it and returns null. */
  get(name: string): WebGLTexture | null {
    const e = this.entries.get(name);
    if (e) {
      e.idle = 0;
      if (e.video?.paused) e.video.play().catch(() => {});
      return e.tex;
    }
    if (!this.pending.has(name) && !this.failed.has(name)) void this.load(name);
    return null;
  }

  /** Drop a texture (its file changed or was deleted); the next get() reloads it. */
  invalidate(name: string) {
    const e = this.entries.get(name);
    if (e) {
      this.gl.deleteTexture(e.tex);
      e.video?.pause();
      if (e.url) URL.revokeObjectURL(e.url);
    }
    this.entries.delete(name);
    this.pending.delete(name);
    this.failed.delete(name);
  }

  /** Per frame: upload new video frames for videos that are in use. */
  update() {
    const gl = this.gl;
    for (const e of this.entries.values()) {
      if (!e.video) continue;
      if (++e.idle > 90) { e.video.pause(); continue; }
      if (!e.dirty || e.video.readyState < 2) continue;
      e.dirty = false;
      gl.bindTexture(gl.TEXTURE_2D, e.tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, e.video);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    }
  }

  private async load(name: string) {
    const token = {};
    this.pending.set(name, token);
    try {
      const entry = name.startsWith('@') ? this.fromImage(builtinTexture(name)) : await this.fromBlob(name, await this.fetchBlob(name));
      if (this.pending.get(name) !== token) {
        this.gl.deleteTexture(entry.tex);
        return;
      }
      this.entries.set(name, entry);
    } catch (e) {
      if (this.pending.get(name) === token) this.failed.add(name);
      console.warn(`texture ${name}:`, e);
    } finally {
      if (this.pending.get(name) === token) this.pending.delete(name);
    }
  }

  private async fromBlob(name: string, blob: Blob): Promise<Entry> {
    if (!VIDEO.test(name)) {
      const bitmap = await createImageBitmap(blob, { imageOrientation: 'flipY', premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
      return this.fromImage(bitmap);
    }
    const ext = name.split('.').pop()!.toLowerCase();
    const url = URL.createObjectURL(new Blob([blob], { type: VIDEO_TYPES[ext] }));
    const video = Object.assign(document.createElement('video'), { src: url, muted: true, loop: true, playsInline: true });
    await video.play();
    const gl = this.gl;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
    setParams(gl, false);
    const entry: Entry = { tex, video, url, dirty: true, idle: 0 };
    // Only re-upload when the decoder actually produced a new frame.
    const onFrame = () => { entry.dirty = true; video.requestVideoFrameCallback(onFrame); };
    if ('requestVideoFrameCallback' in video) video.requestVideoFrameCallback(onFrame);
    else entry.dirty = true;
    return entry;
  }

  private fromImage(source: TexImageSource): Entry {
    const gl = this.gl;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.generateMipmap(gl.TEXTURE_2D);
    setParams(gl, true);
    if (source instanceof ImageBitmap) source.close();
    return { tex, dirty: false, idle: 0 };
  }
}

function setParams(gl: WebGL2RenderingContext, mips: boolean) {
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mips ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  // Repeat so shaders can tile and scroll textures freely.
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  const aniso = gl.getExtension('EXT_texture_filter_anisotropic');
  if (mips && aniso) gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, 8);
}

// ── Built-in procedural textures (all tileable) ────────────────────────────

const SIZE = 256;

function periodicNoise(period: number, seed: number) {
  const lattice = new Float32Array(period * period);
  let s = seed * 9301 + 49297;
  for (let i = 0; i < lattice.length; i++) {
    s = (s * 9301 + 49297) % 233280;
    lattice[i] = s / 233280;
  }
  return (x: number, y: number) => {
    const fx = (x / SIZE) * period, fy = (y / SIZE) * period;
    const ix = Math.floor(fx), iy = Math.floor(fy);
    let tx = fx - ix, ty = fy - iy;
    tx = tx * tx * (3 - 2 * tx);
    ty = ty * ty * (3 - 2 * ty);
    const at = (i: number, j: number) => lattice[((j % period + period) % period) * period + ((i % period + period) % period)];
    const a = at(ix, iy), b = at(ix + 1, iy), c = at(ix, iy + 1), d = at(ix + 1, iy + 1);
    return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
  };
}

function fbm(seed: number, base = 4, octaves = 5) {
  const layers = Array.from({ length: octaves }, (_, i) => periodicNoise(base << i, seed + i));
  return (x: number, y: number) => {
    let v = 0, amp = 0.5, norm = 0;
    for (const n of layers) { v += n(x, y) * amp; norm += amp; amp *= 0.5; }
    return v / norm;
  };
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

type Pixel = (x: number, y: number) => [number, number, number];

export const BUILTIN_TEXTURES: Record<string, { label: string; make: () => Pixel }> = {
  '@checker': { label: 'Checker', make: () => (x, y) => ((x >> 5) + (y >> 5)) % 2 ? [235, 235, 235] : [25, 25, 25] },
  '@grid': {
    label: 'Grid',
    make: () => (x, y) => {
      const line = x % 32 < 2 || y % 32 < 2 ? 1 : x % 8 === 0 || y % 8 === 0 ? 0.25 : 0;
      return [line * 255, line * 255, line * 255];
    },
  },
  '@noise': {
    label: 'Noise',
    make: () => {
      const n = fbm(1);
      return (x, y) => { const v = n(x, y) * 255; return [v, v, v]; };
    },
  },
  '@meat': {
    label: 'Meat',
    make: () => {
      const n = fbm(7, 4), r = fbm(13, 8, 4), fat = fbm(21, 16, 3);
      return (x, y) => {
        const ridge = 1 - Math.abs(r(x, y) * 2 - 1); // vein-like creases
        const vein = smooth(0.82, 0.97, ridge);
        const f = smooth(0.62, 0.72, fat(x, y));
        const base = 0.45 + n(x, y) * 0.6;
        const red = [170 * base, 35 * base, 40 * base];
        const marbled = red.map((c, i) => c * (1 - f) + [225, 190, 160][i] * f * base);
        return marbled.map((c, i) => c * (1 - vein * 0.75) + [60, 5, 25][i] * vein * 0.5) as [number, number, number];
      };
    },
  },
  '@rust': {
    label: 'Rust',
    make: () => {
      const n = fbm(3, 4), speck = fbm(5, 32, 3), pit = fbm(11, 16, 3);
      return (x, y) => {
        const v = n(x, y);
        const rust = smooth(0.4, 0.65, v + (speck(x, y) - 0.5) * 0.4);
        const metal = [95, 92, 88].map((c) => c * (0.7 + speck(x, y) * 0.5));
        const ox = [140, 62, 25].map((c) => c * (0.6 + v * 0.7));
        const dark = smooth(0.66, 0.75, pit(x, y));
        return metal.map((c, i) => (c * (1 - rust) + ox[i] * rust) * (1 - dark * 0.7)) as [number, number, number];
      };
    },
  },
};

const builtinCache = new Map<string, ImageData>();

export function builtinTexture(name: string): ImageData {
  let img = builtinCache.get(name);
  if (!img) {
    const def = BUILTIN_TEXTURES[name];
    if (!def) throw new Error(`unknown built-in texture ${name}`);
    const px = def.make();
    img = new ImageData(SIZE, SIZE);
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const [r, g, b] = px(x, y);
        const o = (y * SIZE + x) * 4;
        img.data[o] = r; img.data[o + 1] = g; img.data[o + 2] = b; img.data[o + 3] = 255;
      }
    }
    builtinCache.set(name, img);
  }
  return img;
}

const thumbs = new Map<string, string>();

/** An <img> src for a texture picker: data URL for built-ins, the library URL for files. */
export function thumbnailURL(name: string): string | null {
  if (name.startsWith('@')) {
    if (!BUILTIN_TEXTURES[name]) return null;
    if (!thumbs.has(name)) {
      const c = Object.assign(document.createElement('canvas'), { width: SIZE, height: SIZE });
      c.getContext('2d')!.putImageData(builtinTexture(name), 0, 0);
      thumbs.set(name, c.toDataURL());
    }
    return thumbs.get(name)!;
  }
  return VIDEO.test(name) ? null : `/api/library/textures/${encodeURIComponent(name)}`;
}
