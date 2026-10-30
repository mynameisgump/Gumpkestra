import { TEX_WIDTH, type AudioEngine } from '../audio/AudioEngine';
import { VERTEX_SHADER, type ParsedISF } from '../isf/isf';
import { createDataTexture, createFullscreenTriangle, createTarget, deleteTarget, link, uniformCache, type Target } from './gl';
import { BLEND_MODES, Layer, type FrameContext } from './Layer';

const COMPOSITE_FS = `#version 300 es
precision highp float;
in vec2 isf_FragNormCoord;
out vec4 color;
uniform sampler2D base;
uniform sampler2D top;
uniform float opacity;
uniform int mode;
void main() {
  vec3 b = texture(base, isf_FragNormCoord).rgb;
  vec4 t4 = texture(top, isf_FragNormCoord);
  vec3 t = t4.rgb;
  vec3 r;
  if (mode == 0) r = t;
  else if (mode == 1) r = b + t;
  else if (mode == 2) r = 1.0 - (1.0 - b) * (1.0 - t);
  else if (mode == 3) r = b * t;
  else if (mode == 4) r = abs(b - t);
  else r = max(b, t);
  color = vec4(mix(b, r, opacity * t4.a), 1.0);
}`;

const BLIT_FS = `#version 300 es
precision highp float;
in vec2 isf_FragNormCoord;
out vec4 color;
uniform sampler2D src;
void main() { color = texture(src, isf_FragNormCoord); }`;

/**
 * Renders the layer stack. Layers are processed in order (index 0 = bottom):
 * generators are drawn and blended over what's below; filters receive what's
 * below as `inputImage` and their result is blended back the same way.
 */
export class Engine {
  readonly gl: WebGL2RenderingContext;
  layers: Layer[] = [];
  /** Render resolution as a fraction of the canvas' device pixels. */
  scale = 1;
  width = 0;
  height = 0;
  frame = 0;

  private vao: WebGLVertexArrayObject;
  private acc: [Target, Target] | null = null;
  private composite: WebGLProgram;
  private cu: (n: string) => WebGLUniformLocation | null;
  private blitProg: WebGLProgram;
  private fftTex: WebGLTexture;
  private waveTex: WebGLTexture;

  constructor(readonly canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, preserveDrawingBuffer: false });
    if (!gl) throw new Error('WebGL2 is not available in this browser.');
    this.gl = gl;
    this.vao = createFullscreenTriangle(gl);
    this.composite = link(gl, VERTEX_SHADER, COMPOSITE_FS);
    this.cu = uniformCache(gl, this.composite);
    this.blitProg = link(gl, VERTEX_SHADER, BLIT_FS);
    this.fftTex = createDataTexture(gl, TEX_WIDTH);
    this.waveTex = createDataTexture(gl, TEX_WIDTH);
  }

  private ensureSize() {
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(this.canvas.clientWidth * dpr * this.scale));
    const h = Math.max(1, Math.round(this.canvas.clientHeight * dpr * this.scale));
    if (w === this.width && h === this.height && this.acc) return;
    this.width = this.canvas.width = w;
    this.height = this.canvas.height = h;
    this.acc?.forEach((t) => deleteTarget(this.gl, t));
    this.acc = [createTarget(this.gl, w, h), createTarget(this.gl, w, h)];
    for (const l of this.layers) l.resize(w, h);
  }

  addLayer(shaderName: string, parsed: ParsedISF, index = this.layers.length) {
    return this.insertLayer(new Layer(this.gl, shaderName, parsed), index);
  }

  insertLayer<T extends Layer>(layer: T, index = this.layers.length): T {
    if (this.width) layer.resize(this.width, this.height);
    this.layers.splice(index, 0, layer);
    return layer;
  }

  removeLayer(layer: Layer) {
    layer.dispose();
    this.layers = this.layers.filter((l) => l !== layer);
  }

  moveLayer(layer: Layer, delta: number) {
    const i = this.layers.indexOf(layer);
    const j = Math.max(0, Math.min(this.layers.length - 1, i + delta));
    this.layers.splice(i, 1);
    this.layers.splice(j, 0, layer);
  }

  clear() {
    this.layers.forEach((l) => l.dispose());
    this.layers = [];
  }

  private blit(src: WebGLTexture, dst: Target | null) {
    const gl = this.gl;
    gl.useProgram(this.blitProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, src);
    gl.bindFramebuffer(gl.FRAMEBUFFER, dst?.fbo ?? null);
    gl.viewport(0, 0, dst?.width ?? this.width, dst?.height ?? this.height);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  render(time: number, dt: number, audio: AudioEngine) {
    this.ensureSize();
    const gl = this.gl;
    const acc = this.acc!;
    gl.bindVertexArray(this.vao);

    gl.bindTexture(gl.TEXTURE_2D, this.fftTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, TEX_WIDTH, 1, gl.RGBA, gl.UNSIGNED_BYTE, audio.fftTex);
    gl.bindTexture(gl.TEXTURE_2D, this.waveTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, TEX_WIDTH, 1, gl.RGBA, gl.UNSIGNED_BYTE, audio.waveTex);

    const ctx: FrameContext = {
      gl, width: this.width, height: this.height, time, dt, frame: this.frame++,
      audio: audio.features, fftTex: this.fftTex, waveTex: this.waveTex, quad: this.vao,
      blit: (src, dst) => this.blit(src, dst),
    };

    let cur = 0;
    gl.bindFramebuffer(gl.FRAMEBUFFER, acc[0].fbo);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    for (const layer of this.layers) {
      if (!layer.enabled) continue;
      const opacity = layer.modulated(layer.opacity, 0, 1, ctx);
      layer.live.__opacity = opacity;
      if (opacity <= 0) continue;
      layer.render(ctx, acc[cur].tex);

      const cu = this.cu;
      gl.useProgram(this.composite);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, acc[cur].tex);
      gl.uniform1i(cu('base'), 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, layer.output!.tex);
      gl.uniform1i(cu('top'), 1);
      gl.uniform1f(cu('opacity'), opacity);
      gl.uniform1i(cu('mode'), BLEND_MODES.indexOf(layer.blend));
      cur = 1 - cur;
      gl.bindFramebuffer(gl.FRAMEBUFFER, acc[cur].fbo);
      gl.viewport(0, 0, this.width, this.height);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    this.blit(acc[cur].tex, null);
  }
}
