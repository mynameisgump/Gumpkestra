import type { AudioFeatures } from '../audio/AudioEngine';
import { evalModulator, MOD_SOURCES, newModulator, serialiseModulator, type Modulator, type ModSource } from '../audio/Modulators';
import {
  AUDIO_UNIFORMS, buildFragment, evalSizeExpr, ISFError, mapErrorLog, VERTEX_SHADER,
  type ISFInput, type ISFPass, type ParsedISF,
} from '../isf/isf';
import { createTarget, deleteTarget, link, uniformCache, type Target } from './gl';
import { TileSequence } from './TileSequence';
import { INPUT_IMAGE, type TextureStore } from './Textures';

export const BLEND_MODES = ['normal', 'add', 'screen', 'multiply', 'difference', 'lighten'] as const;
export type BlendMode = (typeof BLEND_MODES)[number];

export interface ParamState {
  value: unknown;
  mods: Modulator[];
  /** `event` inputs only: fire automatically on each detected beat. */
  onBeat?: boolean;
  /** Additional textures after value, in tile order. */
  tiles?: string[];
}

export interface LayerJSON {
  shader: string;
  /** Model layers only: library model file or built-in primitive. */
  model?: string;
  enabled: boolean;
  blend: BlendMode;
  opacity: ParamState;
  params: Record<string, ParamState>;
}

export interface FrameContext {
  gl: WebGL2RenderingContext;
  width: number;
  height: number;
  time: number;
  dt: number;
  frame: number;
  audio: AudioFeatures;
  fftTex: WebGLTexture;
  waveTex: WebGLTexture;
  /** The fullscreen-triangle VAO. Layers that bind their own VAO must rebind this before returning. */
  quad: WebGLVertexArrayObject;
  textures: TextureStore;
  blit(src: WebGLTexture, dst: Target): void;
}

interface PassBuffers {
  pass: ISFPass;
  /** Double-buffered so a pass can read its own previous frame (feedback). */
  bufs: [Target, Target];
  read: 0 | 1;
}

const AUDIO_KEYS: Record<string, keyof AudioFeatures> = {
  AUDIO_LEVEL: 'level', AUDIO_BASS: 'bass', AUDIO_LOWMID: 'lowMid', AUDIO_MID: 'mid', AUDIO_HIGH: 'high', AUDIO_BEAT: 'beat',
};

export function defaultValue(input: ISFInput): unknown {
  switch (input.TYPE) {
    case 'float': return input.DEFAULT ?? input.MIN ?? 0;
    case 'bool': return !!input.DEFAULT;
    case 'long': return input.DEFAULT ?? input.VALUES?.[0] ?? 0;
    case 'color': return input.DEFAULT ?? [1, 1, 1, 1];
    case 'point2D': return input.DEFAULT ?? [0.5, 0.5];
    case 'event': return false;
    // Extra image inputs hold a texture name; "@input" means the layers below.
    case 'image': return typeof input.DEFAULT === 'string' ? input.DEFAULT : INPUT_IMAGE;
    default: return null;
  }
}

/** The modulators a shader attaches to an input by default (`MODS`); unknown sources are skipped. */
export function defaultMods(input: ISFInput): Modulator[] {
  return (input.MODS ?? []).filter((m) => m.SOURCE in MOD_SOURCES).map((m) => {
    const mod = newModulator(m.SOURCE as ModSource);
    return { ...mod, amount: m.AMOUNT ?? mod.amount, rate: m.RATE ?? mod.rate, smooth: m.SMOOTH ?? mod.smooth };
  });
}

export const floatRange = (input: ISFInput): [number, number] => [
  (input.MIN as number) ?? 0,
  (input.MAX as number) ?? 1,
];

/** The stack input of a filter; every other `image` input is a swappable texture. */
export const isInputImage = (input: ISFInput) => input.TYPE === 'image' && input.NAME === 'inputImage';

/** Texture for an image-input value: the layers below, a library/built-in texture, or black while loading. */
export function resolveImage(value: unknown, input: WebGLTexture, ctx: FrameContext): WebGLTexture {
  if (value === INPUT_IMAGE || typeof value !== 'string' || !value) return input;
  return ctx.textures.get(value) ?? ctx.textures.black;
}

let nextId = 1;

export class Layer {
  readonly id = nextId++;
  enabled = true;
  blend: BlendMode = 'normal';
  opacity: ParamState = { value: 1, mods: [] };
  params: Record<string, ParamState> = {};
  /** Post-modulation values from the last frame (for UI meters). */
  live: Record<string, number> = {};
  parsed!: ParsedISF;
  output: Target | null = null;
  /** Runtime problem to show in the stack (e.g. a model that failed to load). */
  status: string | null = null;

  private program: WebGLProgram | null = null;
  private u!: (name: string) => WebGLUniformLocation | null;
  private passBuffers = new Map<string, PassBuffers>();
  private tileSequences = new Map<string, TileSequence>();
  private pendingEvents = new Set<string>();

  constructor(protected gl: WebGL2RenderingContext, public shaderName: string, parsed: ParsedISF) {
    this.setShader(parsed);
  }

  get inputs() {
    return this.parsed.meta.INPUTS;
  }

  /** Display name in the stack. */
  get label() {
    return this.shaderName;
  }

  /** Compile a new version of the shader, keeping parameter values whose name and type still match. */
  setShader(parsed: ParsedISF) {
    const { source, lineOffset } = buildFragment(parsed);
    let program: WebGLProgram;
    try {
      program = link(this.gl, VERTEX_SHADER, source);
    } catch (e) {
      const mapped = mapErrorLog((e as Error).message, lineOffset);
      throw new ISFError(mapped.map((m) => m.message).join('\n'), mapped.find((m) => m.line)?.line);
    }
    if (this.program) this.gl.deleteProgram(this.program);
    this.program = program;
    this.u = uniformCache(this.gl, program);
    this.setInputs(parsed);
    this.freeBuffers();
  }

  /** Adopt a new input list, keeping parameter values whose name and type still match. */
  protected setInputs(parsed: ParsedISF) {
    const oldInputs = new Map(this.parsed?.meta.INPUTS.map((i) => [i.NAME, i.TYPE]));
    const params: Record<string, ParamState> = {};
    for (const input of parsed.meta.INPUTS) {
      if (['audio', 'audioFFT'].includes(input.TYPE) || isInputImage(input)) continue;
      const keep = oldInputs.get(input.NAME) === input.TYPE ? this.params[input.NAME] : undefined;
      params[input.NAME] = keep ?? { value: defaultValue(input), mods: defaultMods(input) };
    }
    this.params = params;
    this.parsed = parsed;
  }

  trigger(name: string) {
    this.pendingEvents.add(name);
  }

  toJSON(): LayerJSON {
    const ser = (p: ParamState): ParamState => ({ ...p, mods: p.mods.map(serialiseModulator) });
    return {
      shader: this.shaderName,
      enabled: this.enabled,
      blend: this.blend,
      opacity: ser(this.opacity),
      params: Object.fromEntries(Object.entries(this.params).map(([k, v]) => [k, ser(v)])),
    };
  }

  applyJSON(json: Partial<LayerJSON>) {
    this.enabled = json.enabled ?? true;
    this.blend = json.blend ?? 'normal';
    if (json.opacity) this.opacity = { ...json.opacity, mods: json.opacity.mods ?? [] };
    for (const [k, v] of Object.entries(json.params ?? {})) {
      // A param saved without a mods list keeps the shader's default modulators.
      if (this.params[k]) this.params[k] = { ...v, mods: v.mods ?? this.params[k].mods };
    }
  }

  modulated(state: ParamState, min: number, max: number, ctx: FrameContext) {
    let v = state.value as number;
    for (const m of state.mods) v += evalModulator(m, ctx.audio, ctx.time, ctx.dt) * m.amount * (max - min);
    return Math.min(max, Math.max(min, v));
  }

  resize(width: number, height: number) {
    if (this.output) deleteTarget(this.gl, this.output);
    this.output = createTarget(this.gl, width, height);
    this.freeBuffers();
  }

  private freeBuffers() {
    for (const sequence of this.tileSequences.values()) sequence.dispose();
    this.tileSequences.clear();
    for (const pb of this.passBuffers.values()) pb.bufs.forEach((t) => deleteTarget(this.gl, t));
    this.passBuffers.clear();
  }

  private buffersFor(pass: ISFPass, w: number, h: number): PassBuffers {
    let pb = this.passBuffers.get(pass.TARGET!);
    if (!pb || pb.bufs[0].width !== w || pb.bufs[0].height !== h) {
      pb?.bufs.forEach((t) => deleteTarget(this.gl, t));
      pb = { pass, bufs: [createTarget(this.gl, w, h, pass.FLOAT), createTarget(this.gl, w, h, pass.FLOAT)], read: 0 };
      this.passBuffers.set(pass.TARGET!, pb);
    }
    return pb;
  }

  render(ctx: FrameContext, input: WebGLTexture) {
    const { gl } = ctx;
    const u = this.u;
    if (!this.program || !this.output) return;
    // Prepare arrays before binding shader inputs; preparation uses framebuffer bindings.
    for (const inp of this.inputs.filter((i) => i.TILE_SEQUENCE)) {
      const p = this.params[inp.NAME];
      if (p.tiles?.length && this.params.fit?.value === 3) {
        let sequence = this.tileSequences.get(inp.NAME);
        if (!sequence) { sequence = new TileSequence(gl); this.tileSequences.set(inp.NAME, sequence); }
        sequence.update([String(p.value), ...p.tiles], ctx, input);
      } else {
        this.tileSequences.get(inp.NAME)?.dispose();
        this.tileSequences.delete(inp.NAME);
      }
    }
    gl.useProgram(this.program);

    // Built-ins
    const now = new Date();
    gl.uniform1f(u('TIME'), ctx.time);
    gl.uniform1f(u('TIMEDELTA'), ctx.dt);
    gl.uniform1i(u('FRAMEINDEX'), ctx.frame);
    gl.uniform4f(u('DATE'), now.getFullYear(), now.getMonth() + 1, now.getDate(),
      now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds());
    for (const name of AUDIO_UNIFORMS) gl.uniform1f(u(name), ctx.audio[AUDIO_KEYS[name]] as number);
    gl.uniform1i(u('BEAT_COUNT'), ctx.audio.beatCount);

    // Parameters
    const sizeVars: Record<string, number> = { WIDTH: ctx.width, HEIGHT: ctx.height };
    let unit = 0;
    const bindTex = (name: string, tex: WebGLTexture) => {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(u(name), unit++);
    };
    bindTex('AUDIO_FFT', ctx.fftTex);
    bindTex('AUDIO_WAVE', ctx.waveTex);

    for (const inp of this.inputs) {
      const p = this.params[inp.NAME];
      const loc = u(inp.NAME);
      switch (inp.TYPE) {
        case 'image': {
          bindTex(inp.NAME, isInputImage(inp) ? input : resolveImage(p.value, input, ctx));
          if (inp.TILE_SEQUENCE) {
            const sequence = this.tileSequences.get(inp.NAME);
            gl.uniform1i(u(`${inp.NAME}_tileCount`), sequence?.count ?? 0);
            gl.activeTexture(gl.TEXTURE0 + unit);
            gl.bindTexture(gl.TEXTURE_2D_ARRAY, sequence?.texture ?? null);
            gl.uniform1i(u(`${inp.NAME}_tiles`), unit++);
          }
          break;
        }
        case 'audio': bindTex(inp.NAME, ctx.waveTex); break;
        case 'audioFFT': bindTex(inp.NAME, ctx.fftTex); break;
        case 'float': {
          const [min, max] = floatRange(inp);
          const v = this.modulated(p, min, max, ctx);
          this.live[inp.NAME] = v;
          sizeVars[inp.NAME] = v;
          gl.uniform1f(loc, v);
          break;
        }
        case 'bool': gl.uniform1i(loc, p.value ? 1 : 0); break;
        case 'long': gl.uniform1i(loc, Number(p.value)); break;
        case 'color': gl.uniform4fv(loc, p.value as number[]); break;
        case 'point2D': gl.uniform2fv(loc, p.value as number[]); break;
        case 'event': {
          const fire = this.pendingEvents.has(inp.NAME) || (!!p.onBeat && ctx.audio.onset);
          gl.uniform1i(loc, fire ? 1 : 0);
          break;
        }
      }
    }
    this.pendingEvents.clear();

    // Passes
    const passes: ISFPass[] = this.parsed.meta.PASSES.length ? this.parsed.meta.PASSES : [{}];
    const targeted = passes
      .filter((p) => p.TARGET)
      .map((p) => this.buffersFor(p,
        evalSizeExpr(p.WIDTH, sizeVars, ctx.width),
        evalSizeExpr(p.HEIGHT, sizeVars, ctx.height)));
    const firstTargetUnit = unit;

    passes.forEach((pass, i) => {
      unit = firstTargetUnit;
      for (const pb of targeted) bindTex(pb.pass.TARGET!, pb.bufs[pb.read].tex);

      const pb = pass.TARGET ? this.passBuffers.get(pass.TARGET)! : null;
      const dest = pb ? pb.bufs[1 - pb.read] : this.output!;
      gl.uniform1i(u('PASSINDEX'), i);
      gl.uniform2f(u('RENDERSIZE'), dest.width, dest.height);
      gl.bindFramebuffer(gl.FRAMEBUFFER, dest.fbo);
      gl.viewport(0, 0, dest.width, dest.height);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (pb) pb.read = (1 - pb.read) as 0 | 1;
    });

    // ISF draws the final pass to the output even if it also names a target.
    const last = passes[passes.length - 1];
    if (last.TARGET) {
      const pb = this.passBuffers.get(last.TARGET)!;
      ctx.blit(pb.bufs[pb.read].tex, this.output);
    }
  }

  dispose() {
    this.freeBuffers();
    if (this.output) deleteTarget(this.gl, this.output);
    if (this.program) this.gl.deleteProgram(this.program);
  }
}
