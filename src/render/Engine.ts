import { TRANSITION_IDS, type Transition } from '../presetGroups';
import { TEX_WIDTH, type AudioEngine } from '../audio/AudioEngine';
import { VERTEX_SHADER, type ParsedISF } from '../isf/isf';
import { createDataTexture, createFullscreenTriangle, createTarget, deleteTarget, link, uniformCache, type Target } from './gl';
import { BLEND_MODES, Layer, type FrameContext } from './Layer';
import { TextureStore } from './Textures';

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

const TRANSITION_FS = `#version 300 es
precision highp float;
in vec2 isf_FragNormCoord;
out vec4 color;
uniform sampler2D previous;
uniform sampler2D next;
uniform float progress;
uniform float direction;
uniform int style;
uniform float seed;
float hash(vec2 v) {
  return fract(sin(dot(v, vec2(127.1, 311.7)) + seed) * 43758.5453);
}
float noise(vec2 v) {
  vec2 i = floor(v), f = fract(v);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x),
             mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
void main() {
  vec2 uv = isf_FragNormCoord;
  float p = smoothstep(0.0, 1.0, progress);
  vec4 a = texture(previous, uv);
  vec4 b = texture(next, uv);
  if (progress <= 0.0) { color = a; return; }
  if (progress >= 1.0) { color = b; return; }
  if (style == 1) {
    float x = direction > 0.0 ? uv.x : 1.0 - uv.x;
    color = mix(a, b, 1.0 - smoothstep(p - 0.01, p + 0.01, x));
  } else if (style == 2) {
    vec2 oldUV = uv + vec2(p * direction, 0.0);
    vec2 newUV = uv - vec2((1.0 - p) * direction, 0.0);
    color = oldUV.x >= 0.0 && oldUV.x <= 1.0 ? texture(previous, oldUV) : texture(next, newUV);
  } else if (style == 3) {
    color = p < 0.5 ? a * (1.0 - p * 2.0) : b * (p * 2.0 - 1.0);
  } else if (style == 4) {
    // Pitted, multiscale corrosion eats through the old picture.
    vec2 grid = uv * vec2(180.0, 110.0);
    float pits = 0.55 * noise(grid * 0.18) + 0.3 * noise(grid * 0.65) + 0.15 * hash(floor(grid));
    float threshold = mix(-0.15, 1.15, p);
    float reveal = 1.0 - smoothstep(threshold - 0.025, threshold + 0.025, pits);
    float edge = 1.0 - smoothstep(0.015, 0.09, abs(pits - threshold));
    vec3 image = mix(a.rgb, b.rgb, reveal);
    color = vec4(mix(image, vec3(0.24, 0.075, 0.018) * (0.4 + pits), edge * 0.9), 1.0);
  } else if (style == 5) {
    // Torn horizontal signal bands, channel separation and dirty scan lines.
    float envelope = sin(progress * 3.14159265);
    float tick = floor(progress * 32.0);
    float band = floor(uv.y * 48.0);
    float jitter = (hash(vec2(band, tick)) - 0.5) * 0.42 * envelope;
    vec2 torn = vec2(fract(uv.x + jitter * direction), uv.y);
    float reveal = step(hash(vec2(band, 91.0)), p);
    float split = 0.018 * envelope;
    vec3 oldRGB = vec3(texture(previous, torn + vec2(split, 0)).r,
      texture(previous, torn).g, texture(previous, torn - vec2(split, 0)).b);
    vec3 newRGB = vec3(texture(next, torn - vec2(split, 0)).r,
      texture(next, torn).g, texture(next, torn + vec2(split, 0)).b);
    float grit = hash(floor(uv * vec2(640, 400)) + vec2(tick, 0));
    float scan = mod(floor(uv.y * 400.0), 3.0) == 0.0 ? 0.45 : 1.0;
    color = vec4(mix(oldRGB, newRGB, reveal) * mix(1.0, scan, envelope)
      + (grit - 0.5) * 0.2 * envelope, 1.0);
  } else if (style == 6) {
    // Heavy staggered metal slats retract with a scarred leading edge.
    float slat = floor(uv.y * 12.0);
    float delay = hash(vec2(slat, 7.0)) * 0.22;
    float travel = clamp((progress - delay) / (1.0 - delay), 0.0, 1.0);
    travel = travel * travel * (3.0 - 2.0 * travel);
    float x = direction > 0.0 ? uv.x : 1.0 - uv.x;
    float scar = (noise(uv * vec2(90.0, 260.0)) - 0.5) * 0.035 * sin(travel * 3.14159265);
    float distance = x - travel + scar;
    float reveal = 1.0 - smoothstep(-0.002, 0.002, distance);
    vec2 dragged = vec2(clamp(uv.x - travel * direction, 0.0, 1.0), uv.y);
    vec3 plate = texture(previous, dragged).rgb;
    float edge = 1.0 - smoothstep(0.0, 0.035, abs(distance));
    float seam = step(0.95, fract(uv.y * 12.0));
    vec3 image = mix(plate * (1.0 - seam * 0.6 * sin(progress * 3.14159265)), b.rgb, reveal);
    color = vec4(mix(image, vec3(0.09, 0.10, 0.105), edge * sin(travel * 3.14159265)), 1.0);
  } else if (style == 7) {
    // Retro melt: neighbouring strips start at related times, then fall down.
    // Motion is stepped on a 200-line grid; the old image moves, not stretches.
    float column = floor(uv.x * 160.0);
    float delay = 0.22 * (0.7 * noise(vec2(column * 0.065, 13.0))
      + 0.3 * noise(vec2(column * 0.28, 41.0)));
    float fall = clamp((progress - delay) / (1.0 - delay), 0.0, 1.0);
    fall = fall * fall * (2.0 - fall);
    float drop = floor(fall * 200.0) / 200.0;
    vec2 oldUV = uv + vec2(0, drop);
    color = oldUV.y >= 1.0 ? b : texture(previous, oldUV);
  } else color = mix(a, b, p);
  color.a = 1.0;
}`;

/**
 * Renders the layer stack. Layers are processed in order (index 0 = bottom):
 * generators are drawn and blended over what's below; filters receive what's
 * below as `inputImage` and their result is blended back the same way.
 */
export class Engine {
  readonly gl: WebGL2RenderingContext;
  readonly textures: TextureStore;
  layers: Layer[] = [];
  /** Render resolution as a fraction of the canvas' device pixels. */
  scale = 1;
  /** Exact output pixels, independent of viewport size and device pixel ratio. */
  private resolution: { width: number; height: number } | null = null;
  readonly maxResolution: { width: number; height: number };
  width = 0;
  height = 0;
  frame = 0;

  private vao: WebGLVertexArrayObject;
  private acc: [Target, Target] | null = null;
  private composite: WebGLProgram;
  private cu: (n: string) => WebGLUniformLocation | null;
  private blitProg: WebGLProgram;
  private transitionProg: WebGLProgram;
  private tu: (n: string) => WebGLUniformLocation | null;
  private presented: Target | null = null;
  private outgoing: Target | null = null;
  private transition: { style: Transition; duration: number; direction: number; start: number } | null = null;
  private hasFrame = false;
  private fftTex: WebGLTexture;
  private waveTex: WebGLTexture;

  constructor(readonly canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, preserveDrawingBuffer: false });
    if (!gl) throw new Error('WebGL2 is not available in this browser.');
    this.gl = gl;
    const maxTexture = Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE), gl.getParameter(gl.MAX_RENDERBUFFER_SIZE));
    const maxViewport = gl.getParameter(gl.MAX_VIEWPORT_DIMS) as Int32Array;
    this.maxResolution = { width: Math.min(maxTexture, maxViewport[0]), height: Math.min(maxTexture, maxViewport[1]) };
    this.vao = createFullscreenTriangle(gl);
    this.composite = link(gl, VERTEX_SHADER, COMPOSITE_FS);
    this.cu = uniformCache(gl, this.composite);
    this.blitProg = link(gl, VERTEX_SHADER, BLIT_FS);
    this.transitionProg = link(gl, VERTEX_SHADER, TRANSITION_FS);
    this.tu = uniformCache(gl, this.transitionProg);
    this.fftTex = createDataTexture(gl, TEX_WIDTH);
    this.waveTex = createDataTexture(gl, TEX_WIDTH);
    this.textures = new TextureStore(gl);
  }

  get fixedResolution() { return this.resolution; }

  setResolution(size: { width: number; height: number } | null) {
    if (size && (!Number.isInteger(size.width) || !Number.isInteger(size.height)
      || size.width < 1 || size.height < 1
      || size.width > this.maxResolution.width || size.height > this.maxResolution.height)) {
      throw new Error(`Resolution must be whole pixels from 1×1 to ${this.maxResolution.width}×${this.maxResolution.height}.`);
    }
    this.resolution = size ? { ...size } : null;
    this.canvas.style.objectFit = size ? 'contain' : 'fill';
  }

  private ensureSize() {
    const dpr = window.devicePixelRatio || 1;
    const w = this.resolution?.width ?? Math.min(this.maxResolution.width, Math.max(1, Math.round(this.canvas.clientWidth * dpr * this.scale)));
    const h = this.resolution?.height ?? Math.min(this.maxResolution.height, Math.max(1, Math.round(this.canvas.clientHeight * dpr * this.scale)));
    if (w === this.width && h === this.height && this.acc) return;
    this.width = this.canvas.width = w;
    this.height = this.canvas.height = h;
    this.acc?.forEach((t) => deleteTarget(this.gl, t));
    if (this.presented) deleteTarget(this.gl, this.presented);
    if (this.outgoing) deleteTarget(this.gl, this.outgoing);
    this.presented = createTarget(this.gl, w, h);
    this.outgoing = null;
    this.transition = null;
    this.hasFrame = false;
    this.acc = [createTarget(this.gl, w, h), createTarget(this.gl, w, h)];
    for (const l of this.layers) l.resize(w, h);
  }

  /** Capture the displayed composite, including an interrupted transition. */
  beginTransition(style: Transition, duration: number, direction: 1 | -1) {
    const gl = this.gl;
    if (this.outgoing) deleteTarget(gl, this.outgoing);
    this.outgoing = null;
    this.transition = null;
    if (style === 'cut' || !this.presented || !this.hasFrame) return;
    this.outgoing = createTarget(gl, this.width, this.height);
    gl.bindVertexArray(this.vao);
    this.blit(this.presented.tex, this.outgoing);
    this.transition = { style, duration, direction, start: performance.now() / 1000 };
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
    this.textures.update();

    const ctx: FrameContext = {
      gl, width: this.width, height: this.height, time, dt, frame: this.frame++,
      audio: audio.features, fftTex: this.fftTex, waveTex: this.waveTex, quad: this.vao, textures: this.textures,
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

    if (this.transition && this.outgoing) {
      const { style, duration, direction, start } = this.transition;
      const progress = Math.min(1, Math.max(0, (time - start) / duration));
      if (progress < 1) {
        gl.useProgram(this.transitionProg);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.outgoing.tex);
        gl.uniform1i(this.tu('previous'), 0);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, acc[cur].tex);
        gl.uniform1i(this.tu('next'), 1);
        gl.uniform1f(this.tu('progress'), progress);
        gl.uniform1f(this.tu('direction'), direction);
        gl.uniform1f(this.tu('seed'), (start % 1000) * 13.37);
        gl.uniform1i(this.tu('style'), TRANSITION_IDS[style]);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.presented!.fbo);
        gl.viewport(0, 0, this.width, this.height);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      } else {
        deleteTarget(gl, this.outgoing);
        this.outgoing = null;
        this.transition = null;
        this.blit(acc[cur].tex, this.presented);
      }
    } else this.blit(acc[cur].tex, this.presented);
    this.blit(this.presented!.tex, null);
    this.hasFrame = true;
  }
}
