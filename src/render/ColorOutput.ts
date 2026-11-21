import { VERTEX_SHADER } from '../isf/isf';
import { createTarget, deleteTarget, link, uniformCache } from './gl';
import { MitchFlash } from './MitchFlash';

// Native WebGL HDR is experimental. Check actual functions and accepted state;
// assigning an unrecognised context property would otherwise appear to succeed.
type HDRContext = WebGL2RenderingContext & {
  drawingBufferStorage?: (format: number, width: number, height: number) => void;
  drawingBufferFormat?: number;
  drawingBufferToneMapping?: (options?: { mode: 'standard' | 'extended' }) => { mode: string };
};

const OUTPUT_FS = `#version 300 es
precision highp float;
in vec2 isf_FragNormCoord;
out vec4 color;
uniform sampler2D src;
uniform bool hdr;
uniform bool extended;
uniform float exposure;
uniform bool brightnessTest;
uniform sampler2D messageMask;
uniform float messagePhase;
uniform vec2 outputSize;
vec3 cameo(vec3 image) {
  float t = messagePhase;
  bool visible = t >= 0.0 && (t < 0.22 || (t >= 1.0 && t < 1.22) || (t >= 2.0 && t < 2.6));
  if (!visible) return image;
  float aspect = outputSize.x / outputSize.y;
  float width = min(0.86, 1.8 / aspect);
  vec2 size = vec2(width, width * aspect / 4.0);
  vec2 p = isf_FragNormCoord - 0.5;
  p += vec2(sin(floor(t * 17.0) * 9.0), cos(floor(t * 13.0) * 7.0)) * 2.0 / outputSize;
  vec2 uv = p / size + 0.5;
  uv.x += sin(floor(uv.y * 42.0) * 3.0 + floor(t * 12.0)) * 0.004;
  if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) return image;
  float ink = texture(messageMask, uv).a;
  vec2 px = vec2(3.0) / (outputSize * size);
  float glow = 0.0;
  for (int i = 0; i < 8; i++) {
    float a = float(i) * 0.785398;
    glow += texture(messageMask, uv + vec2(cos(a), sin(a)) * px * 2.0).a / 8.0;
  }
  float edge = max(0.0, ink - texture(messageMask, uv + vec2(0.0, 0.006)).a);
  float fade = 1.0 - smoothstep(2.4, 2.6, t);
  vec3 blood = mix(vec3(0.95, 0.015, 0.035), vec3(1.0, 0.8, 0.65), edge);
  image *= 1.0 - glow * fade * 0.75;
  image += vec3(0.3, 0.0, 0.01) * glow * fade;
  return mix(image, blood, ink * fade);
}
vec3 decode(vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c));
}
vec3 encode(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
}
void main() {
  if (brightnessTest) {
    // Fixed linear-light references bypass scene exposure and SDR tone mapping.
    // On an SDR path all three deliberately clip to the same white, so the
    // test cannot falsely suggest HDR merely because tone mapping differs.
    vec2 uv = isf_FragNormCoord;
    float x = fract(uv.x * 3.0);
    bool isPatch = x > 0.18 && x < 0.82 && uv.y > 0.38 && uv.y < 0.62;
    float white = exp2(floor(uv.x * 3.0));
    if (!extended) white = min(white, 1.0);
    color = vec4(isPatch ? encode(vec3(white)) : vec3(0.0), 1.0);
    return;
  }
  vec3 scene = texture(src, isf_FragNormCoord).rgb;
  if (!hdr) { color = vec4(cameo(scene), 1.0); return; }
  // Library shaders and textures use display-referred sRGB values. Decode only
  // at presentation for exposure and the highlight shoulder, preserving old presets.
  vec3 linear = decode(clamp(scene, 0.0, 64.0)) * exp2(exposure);
  if (!extended) {
    float peak = max(linear.r, max(linear.g, linear.b));
    // Preserve shadows/midtones; smoothly compress highlights, retaining their hue.
    if (peak > 0.6) {
      float excess = peak - 0.6;
      float mapped = 0.6 + 0.4 * excess / (0.4 + excess);
      linear *= mapped / peak;
    }
  }
  color = vec4(cameo(encode(min(linear, vec3(64.0)))), 1.0);
}`;

/** HDR intermediates with one output transform after compositing and transitions. */
export class ColorOutput {
  readonly supported: boolean;
  enabled = false;
  exposure = 0;
  recordingSDR = false;
  nativeActive = false;
  brightnessTest = false;
  readonly display = matchMedia('(dynamic-range: high)');
  private configured = '';
  private program: WebGLProgram;
  private u: (name: string) => WebGLUniformLocation | null;
  readonly mitch: MitchFlash;

  constructor(private gl: HDRContext) {
    this.supported = !!gl.getExtension('EXT_color_buffer_float');
    if (this.supported) {
      const probe = createTarget(gl, 1, 1, true);
      gl.bindFramebuffer(gl.FRAMEBUFFER, probe.fbo);
      this.supported = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      deleteTarget(gl, probe);
    }
    this.program = link(gl, VERTEX_SHADER, OUTPUT_FS);
    this.u = uniformCache(gl, this.program);
    this.mitch = new MitchFlash(gl);
  }

  get status() {
    if (!this.supported) return 'HDR rendering unavailable on this device';
    if (!this.enabled) return 'SDR output';
    if (this.recordingSDR) return 'HDR rendering · SDR recording';
    if (this.nativeActive) return 'HDR display output';
    return this.display.matches ? 'HDR rendering · browser uses SDR output' : 'HDR rendering · SDR display';
  }

  configure(width: number, height: number) {
    const gl = this.gl;
    const wantNative = this.enabled && !this.recordingSDR && this.display.matches;
    const key = `${width}:${height}:${wantNative}`;
    if (key === this.configured) return;
    this.configured = key;
    const wasNative = this.nativeActive;
    this.nativeActive = false;
    if (typeof gl.drawingBufferStorage !== 'function' || typeof gl.drawingBufferToneMapping !== 'function') return;
    try {
      if (wantNative) {
        gl.drawingBufferStorage(gl.RGBA16F, width, height);
        const accepted = gl.getError() === gl.NO_ERROR && gl.drawingBufferFormat === gl.RGBA16F;
        if (accepted && gl.drawingBufferToneMapping({ mode: 'extended' }).mode === 'extended') {
          this.nativeActive = true;
          return;
        }
      }
      if (wantNative || wasNative) {
        gl.drawingBufferToneMapping({ mode: 'standard' });
        gl.drawingBufferStorage(gl.RGBA8, width, height);
      }
    } catch {
      // A partial implementation may reject extended output; retain HDR rendering.
      try {
        gl.drawingBufferToneMapping({ mode: 'standard' });
        gl.drawingBufferStorage(gl.RGBA8, width, height);
      } catch { /* The SDR drawing buffer remains the browser default. */ }
    }
  }

  present(src: WebGLTexture, width: number, height: number, time: number) {
    const gl = this.gl;
    gl.useProgram(this.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, src);
    gl.uniform1i(this.u('src'), 0);
    gl.uniform1i(this.u('hdr'), this.enabled ? 1 : 0);
    gl.uniform1i(this.u('extended'), this.nativeActive ? 1 : 0);
    gl.uniform1f(this.u('exposure'), this.exposure);
    gl.uniform1i(this.u('brightnessTest'), this.brightnessTest && this.enabled && !this.recordingSDR ? 1 : 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.mitch.texture);
    gl.uniform1i(this.u('messageMask'), 1);
    gl.uniform1f(this.u('messagePhase'), this.mitch.phaseAt(time));
    gl.uniform2f(this.u('outputSize'), width, height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, width, height);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}
