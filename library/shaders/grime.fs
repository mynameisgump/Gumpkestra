/*{
  "DESCRIPTION": "Industrial filth: film grain, dust and scratches, a smeared lens, buzzing fluorescent flicker, crushed blacks and a sodium tint.",
  "CREDIT": "Gumpkestra",
  "CATEGORIES": ["Effect", "Industrial", "Color"],
  "INPUTS": [
    { "NAME": "inputImage", "TYPE": "image" },
    { "NAME": "grain", "TYPE": "float", "DEFAULT": 0.12, "MIN": 0.0, "MAX": 0.5 },
    { "NAME": "dust", "TYPE": "float", "DEFAULT": 0.3, "MIN": 0.0, "MAX": 1.0, "LABEL": "Dust & scratches" },
    { "NAME": "smudge", "TYPE": "float", "DEFAULT": 0.3, "MIN": 0.0, "MAX": 1.0, "LABEL": "Dirty lens" },
    { "NAME": "flicker", "TYPE": "float", "DEFAULT": 0.25, "MIN": 0.0, "MAX": 1.0, "LABEL": "Fluorescent flicker" },
    { "NAME": "crush", "TYPE": "float", "DEFAULT": 0.25, "MIN": 0.0, "MAX": 1.0, "LABEL": "Crush blacks" },
    { "NAME": "vignette", "TYPE": "float", "DEFAULT": 0.6, "MIN": 0.0, "MAX": 1.5 },
    { "NAME": "tintAmount", "TYPE": "float", "DEFAULT": 0.3, "MIN": 0.0, "MAX": 1.0 },
    { "NAME": "tint", "TYPE": "color", "DEFAULT": [1.0, 0.75, 0.45, 1.0] }
  ]
}*/

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

void main() {
  vec2 uv = isf_FragNormCoord;
  vec2 asp = vec2(RENDERSIZE.x / RENDERSIZE.y, 1.0);
  vec3 c = IMG_NORM_PIXEL(inputImage, uv).rgb;
  float fr = floor(TIME * 24.0);

  c = mix(c, c * tint.rgb * 1.2, tintAmount);
  c = max(c - crush * 0.15, 0.0) / (1.0 - crush * 0.15);

  float s = vnoise(uv * asp * 3.0 + 4.0) * 0.6 + vnoise(uv * asp * 7.0) * 0.4;
  c = mix(c, c * 0.6 + 0.04, smudge * smoothstep(0.45, 0.8, s));

  float drop = step(0.92 - flicker * 0.1, hash(vec2(fr, 1.0)));
  c *= 1.0 - flicker * (0.04 * (0.5 + 0.5 * sin(TIME * 628.0)) + 0.5 * drop * hash(vec2(fr, 2.0)));

  vec2 speckCell = floor(gl_FragCoord.xy / 2.0);
  float speck = step(0.9985 - dust * 0.002, hash(speckCell + fr * 7.0));
  c = mix(c, vec3(step(0.5, hash(speckCell + fr)) * 0.9 + 0.05), speck * dust);
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float x = hash(vec2(fr, fi)) + sin(uv.y * 10.0 + fr) * 0.002;
    float vis = step(1.0 - dust * 0.5, hash(vec2(fr, fi + 10.0)));
    c = mix(c, vec3(0.85), smoothstep(1.5 / RENDERSIZE.x, 0.0, abs(uv.x - x)) * vis * 0.6);
  }

  vec2 cc = (uv - 0.5) * asp;
  c *= clamp(1.0 - dot(cc, cc) * vignette * 1.5, 0.0, 1.0);
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c += (hash(gl_FragCoord.xy + fract(TIME) * 137.0) - 0.5) * grain * max(1.3 - l, 0.0);
  gl_FragColor = vec4(max(c, 0.0), 1.0);
}
