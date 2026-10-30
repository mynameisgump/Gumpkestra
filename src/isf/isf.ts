// ISF (Interactive Shader Format, https://isf.video) support.
// An ISF file is a GLSL fragment shader whose first comment is a JSON blob
// describing its inputs and render passes. Using ISF means shaders from the
// wider ecosystem (VDMX, Arkestra, editor.isf.video) drop straight into the library.

export type ISFInputType =
  | 'float' | 'bool' | 'long' | 'color' | 'point2D' | 'event' | 'image' | 'audio' | 'audioFFT';

export interface ISFInput {
  NAME: string;
  TYPE: ISFInputType;
  LABEL?: string;
  DEFAULT?: unknown;
  MIN?: unknown;
  MAX?: unknown;
  VALUES?: number[];
  LABELS?: string[];
}

export interface ISFPass {
  TARGET?: string;
  PERSISTENT?: boolean;
  FLOAT?: boolean;
  WIDTH?: string | number;
  HEIGHT?: string | number;
}

export interface ISFMeta {
  DESCRIPTION?: string;
  CREDIT?: string;
  CATEGORIES?: string[];
  INPUTS: ISFInput[];
  PASSES: ISFPass[];
}

export interface ParsedISF {
  meta: ISFMeta;
  /** Source with the JSON header blanked out (line count preserved). */
  body: string;
  /** Has an `inputImage` — processes the layers below it rather than generating. */
  isFilter: boolean;
}

export class ISFError extends Error {
  constructor(message: string, readonly line?: number) {
    super(message);
  }
}

export function parseISF(source: string): ParsedISF {
  const start = source.indexOf('/*');
  const end = source.indexOf('*/', start + 2);
  if (start < 0 || end < 0) throw new ISFError('Missing ISF JSON header comment /*{ ... }*/', 1);
  const json = source.slice(start + 2, end);
  let meta: ISFMeta;
  try {
    meta = JSON.parse(json);
  } catch (e) {
    throw new ISFError(`ISF header JSON: ${(e as Error).message}`, 1);
  }
  meta.INPUTS ??= [];
  meta.PASSES ??= [];
  const header = source.slice(start, end + 2).replace(/[^\n]/g, '');
  const body = source.slice(0, start) + header + source.slice(end + 2);
  const isFilter = meta.INPUTS.some((i) => i.TYPE === 'image' && i.NAME === 'inputImage');
  return { meta, body, isFilter };
}

const UNIFORM_TYPES: Record<ISFInputType, string> = {
  float: 'float', bool: 'bool', long: 'int', color: 'vec4', point2D: 'vec2', event: 'bool',
  image: 'sampler2D', audio: 'sampler2D', audioFFT: 'sampler2D',
};

/** Built-in audio uniforms every shader gets for free (Gumpkestra extension to ISF). */
export const AUDIO_UNIFORMS = ['AUDIO_LEVEL', 'AUDIO_BASS', 'AUDIO_LOWMID', 'AUDIO_MID', 'AUDIO_HIGH', 'AUDIO_BEAT'];

export const VERTEX_SHADER = `#version 300 es
in vec2 position;
out vec2 isf_FragNormCoord;
void main() {
  isf_FragNormCoord = position * 0.5 + 0.5;
  gl_Position = vec4(position, 0.0, 1.0);
}`;

export function buildFragment(parsed: ParsedISF): { source: string; lineOffset: number } {
  const { meta } = parsed;
  const lines = [
    '#version 300 es',
    'precision highp float;',
    'precision highp int;',
    'in vec2 isf_FragNormCoord;',
    'out vec4 isf_FragColor;',
    'uniform int PASSINDEX;',
    'uniform vec2 RENDERSIZE;',
    'uniform float TIME;',
    'uniform float TIMEDELTA;',
    'uniform vec4 DATE;',
    'uniform int FRAMEINDEX;',
    ...AUDIO_UNIFORMS.map((u) => `uniform float ${u};`),
    'uniform int BEAT_COUNT;',
    'uniform sampler2D AUDIO_FFT;',
    'uniform sampler2D AUDIO_WAVE;',
    '#define vv_FragNormCoord isf_FragNormCoord',
    '#define IMG_SIZE(img) vec2(textureSize(img, 0))',
    '#define IMG_NORM_PIXEL(img, coord) texture(img, coord)',
    '#define IMG_PIXEL(img, coord) texture(img, (coord) / vec2(textureSize(img, 0)))',
    '#define IMG_THIS_PIXEL(img) texture(img, isf_FragNormCoord)',
    '#define IMG_THIS_NORM_PIXEL(img) texture(img, isf_FragNormCoord)',
    ...meta.INPUTS.map((i) => `uniform ${UNIFORM_TYPES[i.TYPE] ?? 'float'} ${i.NAME};`),
    ...meta.PASSES.filter((p) => p.TARGET).map((p) => `uniform sampler2D ${p.TARGET};`),
  ];
  // GLSL 1.x idioms common in ISF files → GLSL ES 3.00.
  const body = parsed.body
    .replace(/^[ \t]*#version.*$/m, '')
    .replace(/\bgl_FragColor\b/g, 'isf_FragColor')
    .replace(/\btexture2D\b/g, 'texture')
    .replace(/\bvarying\b/g, 'in');
  // `#line 1` would make error lines match the file directly, but drivers disagree on its
  // semantics, so the offset is subtracted by hand instead.
  return { source: lines.join('\n') + '\n' + body, lineOffset: lines.length };
}

/** Map a GL info log back onto the user's file line numbers. */
export function mapErrorLog(log: string, lineOffset: number): { message: string; line?: number }[] {
  return log
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => {
      const m = l.match(/^(?:ERROR|WARNING):\s*\d+:(\d+):\s*(.*)$/);
      if (!m) return { message: l };
      const line = Number(m[1]) - lineOffset;
      return { message: `line ${line}: ${m[2]}`, line };
    });
}

/** Evaluate a pass WIDTH/HEIGHT expression like "floor($WIDTH/2.0)". */
export function evalSizeExpr(expr: string | number | undefined, vars: Record<string, number>, fallback: number) {
  if (expr === undefined) return fallback;
  if (typeof expr === 'number') return Math.max(1, Math.round(expr));
  const substituted = expr.replace(/\$(\w+)/g, (_, k) => String(vars[k] ?? 0));
  if (!/^[\d\s+\-*/().,a-z]*$/.test(substituted)) return fallback;
  try {
    const { floor, ceil, round, max, min, pow, sqrt, abs } = Math;
    const v = new Function('floor', 'ceil', 'round', 'max', 'min', 'pow', 'sqrt', 'abs', `return (${substituted});`)(
      floor, ceil, round, max, min, pow, sqrt, abs,
    );
    return Number.isFinite(v) ? Math.max(1, Math.round(v)) : fallback;
  } catch {
    return fallback;
  }
}
