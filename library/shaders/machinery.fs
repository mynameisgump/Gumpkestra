/*{
  "DESCRIPTION": "Grimy gearbox under a swinging sodium lamp. Gears ratchet forward on every beat and a piston slams on the kick. Pick a texture and raise Texture mix to skin the gears and piston with it; it turns and moves with each part.",
  "CREDIT": "Gumpkestra",
  "CATEGORIES": ["Generator", "Industrial"],
  "INPUTS": [
    { "NAME": "speed", "TYPE": "float", "DEFAULT": 0.2, "MIN": -2.0, "MAX": 2.0 },
    { "NAME": "ratchet", "TYPE": "float", "DEFAULT": 0.6, "MIN": 0.0, "MAX": 3.0, "LABEL": "Beat ratchet" },
    { "NAME": "slam", "TYPE": "float", "DEFAULT": 0.0, "MIN": 0.0, "MAX": 1.0, "LABEL": "Piston slam", "MODS": [{ "SOURCE": "beat", "AMOUNT": 1.0 }] },
    { "NAME": "rust", "TYPE": "float", "DEFAULT": 0.5, "MIN": 0.0, "MAX": 1.0 },
    { "NAME": "lampSwing", "TYPE": "float", "DEFAULT": 0.3, "MIN": 0.0, "MAX": 1.0 },
    { "NAME": "tex", "TYPE": "image", "DEFAULT": "@rust", "LABEL": "Texture" },
    { "NAME": "texMix", "TYPE": "float", "DEFAULT": 0.0, "MIN": 0.0, "MAX": 1.0, "LABEL": "Texture mix" },
    { "NAME": "texScale", "TYPE": "float", "DEFAULT": 1.0, "MIN": 0.25, "MAX": 6.0, "LABEL": "Texture scale" },
    { "NAME": "lightColor", "TYPE": "color", "DEFAULT": [1.0, 0.6, 0.3, 1.0], "LABEL": "Light" },
    { "NAME": "hazard", "TYPE": "bool", "DEFAULT": true, "LABEL": "Hazard stripes" }
  ]
}*/

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * vnoise(p); p = p * 2.03 + 1.7; a *= 0.5; }
  return v;
}

float sdBox(vec2 p, vec2 b) {
  vec2 d = abs(p) - b;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}

float sdGear(vec2 p, float R, float teeth, float a) {
  float r = length(p);
  float ang = atan(p.y, p.x) + a;
  float tooth = smoothstep(-0.25, 0.25, cos(ang * teeth)) * R * 0.14;
  float d = r - (R + tooth);
  d = max(d, -(r - R * 0.18));
  float window = max(abs(r - R * 0.55) - R * 0.2, (0.3 - cos(ang * 5.0)) * R * 0.25);
  return max(d, -window);
}

vec2 rot2(vec2 v, float a) {
  float c = cos(a), s = sin(a);
  return vec2(c * v.x - s * v.y, s * v.x + c * v.y);
}

// Keep the nearest part, and its texture coordinates in that part's own frame
// (offset per part so they don't all show the same patch).
void part(inout float d, inout vec2 uv, float pd, vec2 local, float id) {
  if (pd < d) { d = pd; uv = local + vec2(id * 0.37, id * 0.61); }
}

float scene(vec2 p, out vec2 uv) {
  // Ratchet: BEAT_COUNT jumps by 1 while AUDIO_BEAT jumps to 1, so this eases forward after each beat.
  float a = TIME * speed + (float(BEAT_COUNT) - AUDIO_BEAT) * ratchet * 0.4;
  vec2 cA = vec2(-0.32, 0.02);
  vec2 cB = cA + normalize(vec2(1.0, 0.45)) * 0.515;
  vec2 cC = cB + normalize(vec2(0.25, -1.0)) * 0.305;
  float aB = -a * 16.0 / 9.0 + 0.35, aC = a * 16.0 / 6.0;
  float d = 1e9;
  uv = vec2(0.0);
  // sdGear turns a gear by -angle, so rotating by +angle undoes it.
  part(d, uv, sdGear(p - cA, 0.3, 16.0, a), rot2(p - cA, a), 1.0);
  part(d, uv, sdGear(p - cB, 0.17, 9.0, aB), rot2(p - cB, aB), 2.0);
  part(d, uv, sdGear(p - cC, 0.1, 6.0, aC), rot2(p - cC, aC), 3.0);

  vec2 pp = p - vec2(0.58, 0.0);
  float headY = 0.12 - slam * 0.3;
  part(d, uv, sdBox(pp - vec2(0.0, 0.33), vec2(0.07, 0.12)), pp, 4.0);
  part(d, uv, sdBox(pp - vec2(0.0, headY + 0.12), vec2(0.025, 0.12)), pp - vec2(0.0, headY), 5.0);
  part(d, uv, sdBox(pp - vec2(0.0, headY), vec2(0.09, 0.035)), pp - vec2(0.0, headY), 6.0);
  part(d, uv, sdBox(pp - vec2(0.0, -0.26), vec2(0.13, 0.04)), pp, 7.0);
  return d;
}

float scene(vec2 p) {
  vec2 unused;
  return scene(p, unused);
}

void main() {
  vec2 p = (isf_FragNormCoord - 0.5) * vec2(RENDERSIZE.x / RENDERSIZE.y, 1.0);

  // Riveted steel plate background
  vec2 pf = fract(p * 4.0) - 0.5;
  float seam = smoothstep(0.47, 0.5, max(abs(pf.x), abs(pf.y)));
  float rivet = smoothstep(0.035, 0.025, length(abs(pf) - 0.42));
  float n = fbm(p * 6.0);
  float rustMask = smoothstep(0.55 - rust * 0.3, 0.7 - rust * 0.3, fbm(p * 3.0 + 7.0));
  vec3 rustC = vec3(0.35, 0.14, 0.05) * (0.6 + fbm(p * 20.0) * 0.8);
  vec3 bg = mix(vec3(0.22, 0.22, 0.21) * (0.7 + n * 0.6), rustC, rustMask);
  bg *= 1.0 - seam * 0.6;
  bg += rivet * 0.12;
  if (hazard) {
    float stripe = step(0.5, fract((p.x + p.y) * 6.0));
    vec3 hz = mix(vec3(0.05), vec3(0.85, 0.65, 0.05), stripe) * (0.6 + n * 0.6);
    hz = mix(hz, rustC, rustMask * 0.6);
    bg = mix(bg, hz, step(p.y, -0.36));
    bg *= 1.0 - 0.6 * smoothstep(0.006, 0.0, abs(p.y + 0.36));
  }
  bg *= mix(0.3, 1.0, smoothstep(-0.01, 0.04, scene(p - vec2(0.025, -0.035))));

  // Bevelled metal objects
  vec2 partUV;
  float d = scene(p, partUV);
  float e = 0.002, bevel = 0.018;
  float hC = clamp(-d / bevel, 0.0, 1.0);
  float hX = clamp(-scene(p + vec2(e, 0.0)) / bevel, 0.0, 1.0);
  float hY = clamp(-scene(p + vec2(0.0, e)) / bevel, 0.0, 1.0);
  vec3 nrm = normalize(vec3((hC - hX) * bevel / e, (hC - hY) * bevel / e, 1.0));

  vec2 lampPos = vec2(sin(TIME * 0.7) * lampSwing * 0.6, 0.6);
  vec3 L = normalize(vec3(lampPos - p, 0.6));
  float diff = max(dot(nrm, L), 0.0);
  float spec = pow(max(dot(nrm, normalize(L + vec3(0.0, 0.0, 1.0))), 0.0), 30.0);
  vec3 metal = vec3(0.4, 0.38, 0.35) * (0.7 + fbm(p * 15.0) * 0.5);
  metal = mix(metal, IMG_NORM_PIXEL(tex, partUV * 2.0 * texScale).rgb, texMix);
  metal = mix(metal, rustC * 1.2, rustMask * 0.7);
  vec3 obj = metal * (0.25 + diff * 0.9) + spec * 0.6 * (1.0 - rustMask * 0.8);

  vec3 col = mix(bg * (0.35 + 0.65 * L.z), obj, smoothstep(0.002, -0.002, d));
  col *= lightColor.rgb * 1.6 / (1.0 + dot(p - lampPos, p - lampPos) * 2.5);

  vec2 impact = vec2(0.58, -0.215);
  col += vec3(1.0, 0.7, 0.3) * pow(slam, 4.0) * exp(-length(p - impact) * 12.0) * 1.2;
  gl_FragColor = vec4(col, 1.0);
}
