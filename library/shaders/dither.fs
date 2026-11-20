/*{
  "DESCRIPTION": "Ordered (Bayer) dither to a 4-colour palette.",
  "CREDIT": "Gumpkestra",
  "CATEGORIES": ["Effect", "Retro", "Color"],
  "INPUTS": [
    { "NAME": "inputImage", "TYPE": "image" },
    { "NAME": "palette", "TYPE": "long", "DEFAULT": 1, "VALUES": [0, 1, 2, 3, 4, 5], "LABELS": ["Mono", "Sickbay green", "Blood", "Rust", "Bruise", "Garish"] },
    { "NAME": "pixelSize", "TYPE": "float", "DEFAULT": 2.0, "MIN": 1.0, "MAX": 8.0 },
    { "NAME": "strength", "TYPE": "float", "DEFAULT": 1.0, "MIN": 0.0, "MAX": 1.0, "LABEL": "Dither strength" },
    { "NAME": "gamma", "TYPE": "float", "DEFAULT": 1.0, "MIN": 0.4, "MAX": 2.5 },
    { "NAME": "amount", "TYPE": "float", "DEFAULT": 1.0, "MIN": 0.0, "MAX": 1.0, "LABEL": "Mix" }
  ]
}*/

const vec3 PALS[24] = vec3[24](
  vec3(0.0), vec3(0.33), vec3(0.66), vec3(1.0),
  vec3(0.03, 0.06, 0.04), vec3(0.16, 0.27, 0.16), vec3(0.45, 0.55, 0.33), vec3(0.8, 0.85, 0.6),
  vec3(0.02, 0.0, 0.0), vec3(0.3, 0.02, 0.03), vec3(0.7, 0.08, 0.06), vec3(0.95, 0.85, 0.75),
  vec3(0.05, 0.04, 0.03), vec3(0.32, 0.16, 0.07), vec3(0.75, 0.4, 0.12), vec3(0.95, 0.85, 0.6),
  vec3(0.06, 0.02, 0.1), vec3(0.32, 0.12, 0.38), vec3(0.6, 0.5, 0.25), vec3(0.85, 0.85, 0.45),
  vec3(0.1, 0.0, 0.25), vec3(1.0, 0.0, 0.6), vec3(0.4, 1.0, 0.0), vec3(1.0, 1.0, 0.3)
);

float bayer2(vec2 a) { a = floor(a); return fract(a.x / 2.0 + a.y * a.y * 0.75); }
float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
float bayer8(vec2 a) { return bayer4(0.5 * a) * 0.25 + bayer2(a); }

void main() {
  float ps = floor(pixelSize);
  vec2 cell = floor(gl_FragCoord.xy / ps);
  vec3 c = IMG_NORM_PIXEL(inputImage, (cell + 0.5) * ps / RENDERSIZE).rgb;
  float peak = max(c.r, max(c.g, c.b));
  float l = pow(clamp(dot(c, vec3(0.299, 0.587, 0.114)), 0.0, 1.0), gamma);
  float v = l * 3.0;
  float i0 = floor(v);
  float idx = clamp(i0 + step(mix(0.5, bayer8(cell), strength), v - i0), 0.0, 3.0);
  int p = clamp(palette, 0, 5);
  vec3 q = PALS[p * 4 + int(idx)] * max(peak, 1.0);
  gl_FragColor = vec4(mix(IMG_NORM_PIXEL(inputImage, isf_FragNormCoord).rgb, q, amount), 1.0);
}
