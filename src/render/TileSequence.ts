import type { FrameContext } from './Layer';

/** Resample an ordered texture list into independently filtered GPU slices. */
export class TileSequence {
  readonly texture: WebGLTexture;
  count = 0;
  private read: WebGLFramebuffer;
  private draw: WebGLFramebuffer;
  private width = 0;
  private height = 0;
  private readonly maxLayers: number;
  private sources: (WebGLTexture | null)[] = [];

  constructor(private gl: WebGL2RenderingContext) {
    this.maxLayers = gl.getParameter(gl.MAX_ARRAY_TEXTURE_LAYERS) as number;
    this.texture = gl.createTexture()!;
    this.read = gl.createFramebuffer()!;
    this.draw = gl.createFramebuffer()!;
  }

  update(names: string[], ctx: FrameContext, input: WebGLTexture) {
    const gl = this.gl;
    const sources = names.slice(0, this.maxLayers).map((name) => {
      if (name === '@input') return { tex: input, width: ctx.width, height: ctx.height, moving: true };
      const tex = ctx.textures.get(name);
      const info = ctx.textures.info(name);
      return { tex, width: info?.width ?? 1, height: info?.height ?? 1, moving: !!info?.video };
    });
    // Keep a bounded per-tile resolution; each source fills the first tile's aspect ratio.
    const first = sources[0];
    // Bound total array storage to about 64 MiB even for very long sequences.
    const maxSide = Math.min(1024, Math.floor(Math.sqrt(16 * 1024 * 1024 / sources.length)));
    const scale = Math.min(1, maxSide / Math.max(first.width, first.height));
    const width = Math.max(1, Math.round(first.width * scale));
    const height = Math.max(1, Math.round(first.height * scale));
    const resized = width !== this.width || height !== this.height || sources.length !== this.count;
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.texture);
    if (resized) {
      this.width = width; this.height = height; this.count = sources.length;
      gl.texImage3D(gl.TEXTURE_2D_ARRAY, 0, gl.RGBA8, width, height, this.count, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.REPEAT);
    }
    sources.forEach((source, i) => {
      if (!resized && source.tex === this.sources[i] && !source.moving) return;
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.draw);
      gl.framebufferTextureLayer(gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, this.texture, 0, i);
      if (source.tex) {
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.read);
        gl.framebufferTexture2D(gl.READ_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, source.tex, 0);
        gl.blitFramebuffer(0, 0, source.width, source.height, 0, 0, width, height, gl.COLOR_BUFFER_BIT, gl.LINEAR);
      } else {
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
      }
    });
    this.sources = sources.map((s) => s.tex);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  dispose() {
    this.gl.deleteTexture(this.texture);
    this.gl.deleteFramebuffer(this.read);
    this.gl.deleteFramebuffer(this.draw);
  }
}
