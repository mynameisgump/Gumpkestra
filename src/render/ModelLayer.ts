import type { ISFInput, ParsedISF } from '../isf/isf';
import { VERTEX_SHADER } from '../isf/isf';
import { axisAngle, fromTRS, perspective, quatMul } from '../model/math';
import { STRIDE, type MeshData } from '../model/mesh';
import { createTarget, deleteTarget, link, uniformCache, type Target } from './gl';
import { floatRange, Layer, type FrameContext } from './Layer';

/** The `shader` name model layers use in presets. */
export const MODEL_SHADER = '@model';

// Order in the vertex shader below:
// skin → normalise to unit size → explode → twist → writhe →
// inflate → spectrum spikes → melt → model transform → ring copy → camera → snap.
const MESH_VS = `#version 300 es
precision highp float;
precision highp sampler2D;
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec2 aUV;
layout(location = 3) in vec4 aJoints;
layout(location = 4) in vec4 aWeights;
layout(location = 5) in vec3 aCentroid;
layout(location = 6) in vec3 aFaceNormal;

uniform sampler2D uJoints;
uniform sampler2D AUDIO_FFT;
uniform mat4 uModel, uView, uProj;
uniform vec3 uCenter;
uniform float uNormScale, TIME, uAspect;
uniform float uInflate, uWrithe, uWritheScale, uWritheSpeed, uFFT, uTwist, uExplode, uMelt, uSnap;
uniform int uCopies;
uniform float uSpread, uOrbit;

out vec3 vNormal;
out vec3 vViewPos;
out vec2 vUV;
out vec3 vUVw;
out vec3 vBary;

mat4 joint(float i) {
  int r = int(i + 0.5);
  return mat4(texelFetch(uJoints, ivec2(0, r), 0), texelFetch(uJoints, ivec2(1, r), 0),
              texelFetch(uJoints, ivec2(2, r), 0), texelFetch(uJoints, ivec2(3, r), 0));
}

float hash3(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float noise3(vec3 x) {
  vec3 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash3(i), hash3(i + vec3(1, 0, 0)), f.x), mix(hash3(i + vec3(0, 1, 0)), hash3(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(hash3(i + vec3(0, 0, 1)), hash3(i + vec3(1, 0, 1)), f.x), mix(hash3(i + vec3(0, 1, 1)), hash3(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}

void main() {
  int corner = gl_VertexID % 3;
  vBary = vec3(corner == 0, corner == 1, corner == 2);
  float tri = float(gl_VertexID / 3);
  float rnd = fract(sin(tri * 12.9898 + 78.233) * 43758.5453);
  float inst = float(gl_InstanceID);

  mat4 skin = aWeights.x * joint(aJoints.x) + aWeights.y * joint(aJoints.y)
            + aWeights.z * joint(aJoints.z) + aWeights.w * joint(aJoints.w);
  vec3 p = ((skin * vec4(aPos, 1.0)).xyz - uCenter) * uNormScale;
  vec3 n = normalize(mat3(skin) * aNormal);

  // Shatter: each triangle tumbles about its own centre and flies out along its face normal.
  if (uExplode > 0.0) {
    vec3 c = ((skin * vec4(aCentroid, 1.0)).xyz - uCenter) * uNormScale;
    vec3 axis = normalize(vec3(rnd - 0.5, fract(rnd * 7.13) - 0.5, fract(rnd * 3.71) - 0.5) + 1e-4);
    float ang = uExplode * (rnd - 0.5) * 10.0;
    vec3 d = p - c;
    d = d * cos(ang) + cross(axis, d) * sin(ang) + axis * dot(axis, d) * (1.0 - cos(ang));
    p = c + d + normalize(mat3(skin) * aFaceNormal) * uExplode * (0.2 + rnd);
  }

  float a = uTwist * p.y;
  mat2 tw = mat2(cos(a), -sin(a), sin(a), cos(a));
  p.xz = tw * p.xz;
  n.xz = tw * n.xz;

  if (uWrithe > 0.0) {
    vec3 q = p * uWritheScale + vec3(0.0, TIME * uWritheSpeed, inst * 7.31);
    float w = noise3(q) * 0.65 + noise3(q * 2.03 + 11.0) * 0.35;
    p += n * (w - 0.5) * 2.0 * uWrithe;
  }
  p += n * uInflate;
  if (uFFT > 0.0) p += n * texture(AUDIO_FFT, vec2(clamp(p.y * 0.5 + 0.5, 0.0, 1.0), 0.5)).r * uFFT;

  if (uMelt > 0.0) {
    float h = clamp((p.y + 1.0) * 0.5, 0.0, 1.0);
    float drip = noise3(vec3(p.xz * 3.0, inst));
    p.y = max(p.y - uMelt * (0.6 + 0.8 * drip) * h * 2.0, -1.0 - drip * 0.05 * uMelt);
    p.xz *= 1.0 + uMelt * 1.2 * (1.0 - clamp((p.y + 1.0) * 1.5, 0.0, 1.0));
  }

  vec4 world = uModel * vec4(p, 1.0);
  if (uCopies > 1) {
    float ang = 6.2831853 * inst / float(uCopies) + uOrbit;
    world.xy += vec2(cos(ang), sin(ang)) * uSpread;
  }
  vec4 view = uView * world;
  gl_Position = uProj * view;

  if (uSnap > 0.0) {
    // PSX-style vertex wobble: snap projected vertices to a coarse screen grid.
    vec2 grid = vec2(uAspect, 1.0) * mix(240.0, 18.0, uSnap);
    gl_Position.xy = floor(gl_Position.xy / gl_Position.w * grid + 0.5) / grid * gl_Position.w;
  }

  vViewPos = view.xyz;
  vNormal = mat3(uView) * mat3(uModel) * n;
  vUV = aUV;
  vUVw = vec3(aUV * gl_Position.w, gl_Position.w);
}`;

const MESH_FS = `#version 300 es
precision highp float;
in vec3 vNormal;
in vec3 vViewPos;
in vec2 vUV;
in vec3 vUVw;
in vec3 vBary;
out vec4 fragColor;

uniform sampler2D uTex;
uniform vec4 uBaseColor, uTint, uRimColor, uWireColor;
uniform int uShading;
uniform float uRim, uWet, uWire, uLightAngle, uFog, uFogStart, uAffine;

void main() {
  // Interpolating uv*w and w perspective-correctly then dividing yields *affine*
  // (screen-space) uvs — the PS1's warping textures.
  vec2 uv = mix(vUV, vUVw.xy / vUVw.z, uAffine);
  vec4 albedo = uBaseColor * texture(uTex, uv);
  if (albedo.a < 0.4) discard;

  vec3 N = normalize(vNormal);
  if (uShading == 1) N = normalize(cross(dFdx(vViewPos), dFdy(vViewPos)));
  vec3 V = normalize(-vViewPos);
  if (dot(N, V) < 0.0) N = -N; // everything is double-sided
  vec3 L = normalize(vec3(sin(uLightAngle), 0.55, cos(uLightAngle)));
  float diff = max(dot(N, L), 0.0);
  float spec = pow(max(dot(N, normalize(L + V)), 0.0), 48.0) * uWet;
  float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
  vec3 base = albedo.rgb * uTint.rgb;
  vec3 ambient = mix(vec3(0.07, 0.05, 0.06), vec3(0.24), N.y * 0.5 + 0.5);

  vec3 d = fwidth(vBary);
  vec3 e = smoothstep(vec3(0.0), d * 1.3, vBary);
  float line = 1.0 - min(min(e.x, e.y), e.z);

  vec3 col;
  float alpha = 1.0;
  if (uShading <= 1) col = base * (ambient + diff * 0.95) + spec + uRimColor.rgb * fres * uRim;
  else if (uShading == 2) col = base + uRimColor.rgb * fres * uRim;
  else if (uShading == 3) col = N * 0.5 + 0.5;
  else if (uShading == 4) { col = (base * 0.25 + uRimColor.rgb) * (0.05 + fres * 1.6); alpha = clamp(fres * 1.5, 0.0, 1.0); }
  else { if (line < 0.02) discard; col = uWireColor.rgb; alpha = line; }

  if (uShading != 5) col = mix(col, uWireColor.rgb, line * uWire);
  col *= exp(-uFog * max(-vViewPos.z - uFogStart, 0.0));
  // Premultiplied: the layer is resolved from MSAA then un-premultiplied for compositing.
  fragColor = vec4(col * alpha, alpha);
}`;

const UNPREMULTIPLY_FS = `#version 300 es
precision highp float;
in vec2 isf_FragNormCoord;
out vec4 color;
uniform sampler2D src;
void main() {
  vec4 c = texture(src, isf_FragNormCoord);
  color = c.a > 0.0 ? vec4(c.rgb / c.a, c.a) : vec4(0.0);
}`;

export const SHADING_MODES = ['Lit', 'Flat (faceted)', 'Unlit', 'Normals', 'X-ray', 'Wireframe'];

const f = (NAME: string, DEFAULT: number, MIN: number, MAX: number, LABEL?: string): ISFInput =>
  ({ NAME, TYPE: 'float', DEFAULT, MIN, MAX, LABEL });

// Declared ISF-style so the params panel, modulators and presets treat a model
// layer exactly like a shader layer.
const BASE_INPUTS: ISFInput[] = [
  { NAME: 'animation', TYPE: 'long', DEFAULT: 0, VALUES: [0], LABELS: ['(no animations)'] },
  f('animSpeed', 1, -2, 4, 'Anim speed'),
  f('scale', 1, 0.1, 4),
  f('spinY', 0.08, -1, 1, 'Spin (rev/s)'),
  f('spinX', 0, -1, 1, 'Tumble (rev/s)'),
  f('rotX', 0, -180, 180, 'Rotate X°'),
  f('rotY', 0, -180, 180, 'Rotate Y°'),
  f('rotZ', 0, -180, 180, 'Rotate Z°'),
  f('offsetX', 0, -2, 2, 'Offset X'),
  f('offsetY', 0, -2, 2, 'Offset Y'),
  f('zoom', 1, 0.3, 4),
  f('fov', 45, 10, 120, 'FOV°'),
  f('inflate', 0, -0.3, 0.6),
  f('writhe', 0, 0, 0.6),
  f('writheScale', 2.5, 0.5, 10, 'Writhe scale'),
  f('writheSpeed', 0.6, 0, 4, 'Writhe speed'),
  f('fftDisplace', 0, 0, 1.5, 'Spectrum spikes'),
  f('twist', 0, -6, 6),
  f('explode', 0, 0, 1, 'Explode / shatter'),
  f('melt', 0, 0, 1),
  f('snap', 0, 0, 1, 'Vertex snap (PSX)'),
  f('affine', 0, 0, 1, 'Affine textures (PSX)'),
  { NAME: 'copies', TYPE: 'long', DEFAULT: 1, VALUES: [1, 2, 3, 4, 5, 6, 8, 12] },
  f('spread', 1.8, 0, 4, 'Ring radius'),
  f('orbit', 0, -1, 1, 'Ring spin (rev/s)'),
  { NAME: 'shading', TYPE: 'long', DEFAULT: 0, VALUES: SHADING_MODES.map((_, i) => i), LABELS: SHADING_MODES },
  { NAME: 'tint', TYPE: 'color', DEFAULT: [1, 1, 1, 1] },
  f('wet', 0.4, 0, 2, 'Wet / specular'),
  f('rim', 0.4, 0, 2, 'Rim light'),
  { NAME: 'rimColor', TYPE: 'color', DEFAULT: [1, 0.25, 0.3, 1], LABEL: 'Rim colour' },
  f('lightAngle', 35, -180, 180, 'Light angle°'),
  f('wire', 0, 0, 1, 'Wire overlay'),
  { NAME: 'wireColor', TYPE: 'color', DEFAULT: [0.7, 1, 0.3, 1], LABEL: 'Wire colour' },
  f('fog', 0, 0, 3),
  { NAME: 'pixelated', TYPE: 'bool', DEFAULT: false, LABEL: 'Pixelated textures' },
];

const DESCRIPTION = '3D model (.glb/.gltf, .obj, .stl or a built-in shape). Drop a file on the canvas to import it. Every deformer runs on the GPU and can be modulated.';

const parsedFor = (inputs: ISFInput[]): ParsedISF => ({ meta: { DESCRIPTION, INPUTS: inputs, PASSES: [] }, body: '', isFilter: false });

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

export class ModelLayer extends Layer {
  mesh: MeshData | null = null;
  private prog: WebGLProgram;
  private mu: (n: string) => WebGLUniformLocation | null;
  private unpremul: WebGLProgram;
  private vao: WebGLVertexArrayObject | null = null;
  private vbo: WebGLBuffer | null = null;
  private textures: WebGLTexture[] = [];
  /** 1×1 white, bound for untextured materials. */
  private white: WebGLTexture;
  private jointTex: WebGLTexture;
  private jointData = new Float32Array(16);
  private jointRows = 0;
  private nearest: WebGLSampler;
  private msaa: { fbo: WebGLFramebuffer; color: WebGLRenderbuffer; depth: WebGLRenderbuffer } | null = null;
  private resolved: Target | null = null;
  private spin = { x: 0, y: 0, orbit: 0 };
  private animTime = 0;
  private model = new Float32Array(16);
  private view = new Float32Array(16);
  private proj = new Float32Array(16);

  constructor(gl: WebGL2RenderingContext, public modelName: string) {
    super(gl, MODEL_SHADER, parsedFor(BASE_INPUTS));
    this.prog = link(gl, MESH_VS, MESH_FS);
    this.mu = uniformCache(gl, this.prog);
    this.unpremul = link(gl, VERTEX_SHADER, UNPREMULTIPLY_FS);
    this.jointTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.jointTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    this.white = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.white);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
    this.nearest = gl.createSampler()!;
    gl.samplerParameteri(this.nearest, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.samplerParameteri(this.nearest, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  }

  override get label() {
    return `◆ ${this.modelName.replace(/^@/, '')}`;
  }

  /** No GLSL to compile: just adopt the inputs. */
  override setShader(parsed: ParsedISF) {
    this.setInputs(parsed);
  }

  override toJSON() {
    return { ...super.toJSON(), model: this.modelName };
  }

  setMesh(mesh: MeshData) {
    const gl = this.gl;
    this.freeMesh();
    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);
    this.vbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.vertices, gl.STATIC_DRAW);
    const attrs = [3, 3, 2, 4, 4, 3, 3];
    let offset = 0;
    attrs.forEach((size, loc) => {
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, STRIDE * 4, offset * 4);
      offset += size;
    });
    gl.bindVertexArray(null);

    this.textures = mesh.textures.map((t) => {
      const tex = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, t.image);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, t.magFilter ?? gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, t.minFilter ?? gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, t.wrapS ?? gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, t.wrapT ?? gl.REPEAT);
      return tex;
    });

    this.jointData = new Float32Array(mesh.rig.slots * 16);
    this.jointRows = 0;
    this.mesh = mesh;
    this.animTime = 0;

    // Rebuild the animation dropdown for this model.
    const anims = mesh.rig.animations;
    const inputs = BASE_INPUTS.map((inp) => inp.NAME !== 'animation' ? inp : anims.length
      ? { ...inp, VALUES: [-1, ...anims.map((_, i) => i)], LABELS: ['Rest pose', ...anims.map((a) => a.name)] }
      : inp);
    this.setInputs(parsedFor(inputs));
  }

  private f(name: string, ctx: FrameContext) {
    const inp = this.inputs.find((i) => i.NAME === name)!;
    const [min, max] = floatRange(inp);
    const v = this.modulated(this.params[name], min, max, ctx);
    this.live[name] = v;
    return v;
  }

  private v<T>(name: string) {
    return this.params[name].value as T;
  }

  override resize(width: number, height: number) {
    super.resize(width, height);
    const gl = this.gl;
    this.freeTargets();
    const samples = Math.min(4, gl.getParameter(gl.MAX_SAMPLES) as number);
    const color = gl.createRenderbuffer()!;
    gl.bindRenderbuffer(gl.RENDERBUFFER, color);
    gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.RGBA8, width, height);
    const depth = gl.createRenderbuffer()!;
    gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
    gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.DEPTH_COMPONENT24, width, height);
    const fbo = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, color);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.msaa = { fbo, color, depth };
    this.resolved = createTarget(gl, width, height);
  }

  override render(ctx: FrameContext) {
    const { gl } = ctx;
    if (!this.output || !this.msaa || !this.resolved) return;
    const { width: W, height: H } = this.output;

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.msaa.fbo);
    gl.viewport(0, 0, W, H);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // Integrate speeds (rather than angle = speed × time) so modulating a speed
    // lurches the model forward instead of making it jump around.
    this.spin.y += this.f('spinY', ctx) * TAU * ctx.dt;
    this.spin.x += this.f('spinX', ctx) * TAU * ctx.dt;
    this.spin.orbit += this.f('orbit', ctx) * TAU * ctx.dt;
    this.animTime += this.f('animSpeed', ctx) * ctx.dt;

    const mesh = this.mesh;
    if (mesh && this.vao) {
      const u = this.mu;
      gl.useProgram(this.prog);

      // Skeleton → joint matrix texture (one mat4 per row).
      mesh.rig.pose(this.v<number>('animation'), this.animTime, this.jointData);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.jointTex);
      if (this.jointRows !== mesh.rig.slots) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, 4, mesh.rig.slots, 0, gl.RGBA, gl.FLOAT, this.jointData);
        this.jointRows = mesh.rig.slots;
      } else {
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 4, mesh.rig.slots, gl.RGBA, gl.FLOAT, this.jointData);
      }
      gl.uniform1i(u('uJoints'), 1);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, ctx.fftTex);
      gl.uniform1i(u('AUDIO_FFT'), 2);

      const q = quatMul(quatMul(
        axisAngle(0, 1, 0, this.f('rotY', ctx) * DEG + this.spin.y),
        axisAngle(1, 0, 0, this.f('rotX', ctx) * DEG + this.spin.x)),
        axisAngle(0, 0, 1, this.f('rotZ', ctx) * DEG));
      const s = this.f('scale', ctx);
      fromTRS([this.f('offsetX', ctx), this.f('offsetY', ctx), 0], q, [s, s, s], this.model);
      const dist = 3.2 / this.f('zoom', ctx);
      fromTRS([0, 0, -dist], [0, 0, 0, 1], [1, 1, 1], this.view);
      perspective(this.f('fov', ctx) * DEG, W / H, 0.05, 100, this.proj);
      gl.uniformMatrix4fv(u('uModel'), false, this.model);
      gl.uniformMatrix4fv(u('uView'), false, this.view);
      gl.uniformMatrix4fv(u('uProj'), false, this.proj);
      gl.uniform3fv(u('uCenter'), mesh.center);
      gl.uniform1f(u('uNormScale'), 1 / mesh.radius);
      gl.uniform1f(u('TIME'), ctx.time);
      gl.uniform1f(u('uAspect'), W / H);
      gl.uniform1f(u('uInflate'), this.f('inflate', ctx));
      gl.uniform1f(u('uWrithe'), this.f('writhe', ctx));
      gl.uniform1f(u('uWritheScale'), this.f('writheScale', ctx));
      gl.uniform1f(u('uWritheSpeed'), this.f('writheSpeed', ctx));
      gl.uniform1f(u('uFFT'), this.f('fftDisplace', ctx));
      gl.uniform1f(u('uTwist'), this.f('twist', ctx));
      gl.uniform1f(u('uExplode'), this.f('explode', ctx));
      gl.uniform1f(u('uMelt'), this.f('melt', ctx));
      gl.uniform1f(u('uSnap'), this.f('snap', ctx));
      const copies = Math.max(1, Number(this.v('copies')));
      gl.uniform1i(u('uCopies'), copies);
      gl.uniform1f(u('uSpread'), this.f('spread', ctx));
      gl.uniform1f(u('uOrbit'), this.spin.orbit);

      const shading = Number(this.v('shading'));
      gl.uniform1i(u('uShading'), shading);
      gl.uniform4fv(u('uTint'), this.v<number[]>('tint'));
      gl.uniform4fv(u('uRimColor'), this.v<number[]>('rimColor'));
      gl.uniform4fv(u('uWireColor'), this.v<number[]>('wireColor'));
      gl.uniform1f(u('uRim'), this.f('rim', ctx));
      gl.uniform1f(u('uWet'), this.f('wet', ctx));
      gl.uniform1f(u('uWire'), this.f('wire', ctx));
      gl.uniform1f(u('uLightAngle'), this.f('lightAngle', ctx) * DEG);
      gl.uniform1f(u('uFog'), this.f('fog', ctx));
      gl.uniform1f(u('uFogStart'), dist - 1);
      gl.uniform1f(u('uAffine'), this.f('affine', ctx));
      gl.uniform1i(u('uTex'), 0);

      const xray = shading === 4;
      if (xray) {
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE);
      } else {
        gl.enable(gl.DEPTH_TEST);
      }
      gl.bindVertexArray(this.vao);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindSampler(0, this.v('pixelated') ? this.nearest : null);
      for (const g of mesh.groups) {
        gl.bindTexture(gl.TEXTURE_2D, this.textures[g.texture] ?? this.white);
        gl.uniform4fv(u('uBaseColor'), g.color);
        gl.drawArraysInstanced(gl.TRIANGLES, g.start, g.count, copies);
      }
      gl.bindSampler(0, null);
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.BLEND);
      gl.bindVertexArray(ctx.quad);
    }

    // Resolve MSAA, then un-premultiply into the layer output.
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.msaa.fbo);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.resolved.fbo);
    gl.blitFramebuffer(0, 0, W, H, 0, 0, W, H, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    gl.useProgram(this.unpremul);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.resolved.tex);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.output.fbo);
    gl.viewport(0, 0, W, H);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private freeMesh() {
    const gl = this.gl;
    if (this.vao) gl.deleteVertexArray(this.vao);
    if (this.vbo) gl.deleteBuffer(this.vbo);
    this.textures.forEach((t) => gl.deleteTexture(t));
    this.vao = this.vbo = null;
    this.textures = [];
  }

  private freeTargets() {
    const gl = this.gl;
    if (this.msaa) {
      gl.deleteFramebuffer(this.msaa.fbo);
      gl.deleteRenderbuffer(this.msaa.color);
      gl.deleteRenderbuffer(this.msaa.depth);
      this.msaa = null;
    }
    if (this.resolved) deleteTarget(gl, this.resolved);
    this.resolved = null;
  }

  override dispose() {
    super.dispose();
    this.freeMesh();
    this.freeTargets();
    const gl = this.gl;
    gl.deleteProgram(this.prog);
    gl.deleteProgram(this.unpremul);
    gl.deleteTexture(this.jointTex);
    gl.deleteTexture(this.white);
    gl.deleteSampler(this.nearest);
  }
}
