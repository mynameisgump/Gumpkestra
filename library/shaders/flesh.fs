/*{
  "DESCRIPTION": "Wet, writhing meat: wriggling fat cells, muscle striations and specular slime. Swells with the bass.",
  "CREDIT": "Gumpkestra",
  "CATEGORIES": ["Generator", "Biological"],
  "INPUTS": [
    { "NAME": "scale", "TYPE": "float", "DEFAULT": 3.0, "MIN": 1.0, "MAX": 10.0 },
    { "NAME": "writhe", "TYPE": "float", "DEFAULT": 0.4, "MIN": 0.0, "MAX": 1.5 },
    { "NAME": "throb", "TYPE": "float", "DEFAULT": 0.6, "MIN": 0.0, "MAX": 2.0, "LABEL": "Bass throb" },
    { "NAME": "fibers", "TYPE": "float", "DEFAULT": 0.5, "MIN": 0.0, "MAX": 1.0, "LABEL": "Muscle fibre" },
    { "NAME": "fat", "TYPE": "float", "DEFAULT": 0.3, "MIN": 0.0, "MAX": 1.0 },
    { "NAME": "wetness", "TYPE": "float", "DEFAULT": 0.7, "MIN": 0.0, "MAX": 1.5 },
    { "NAME": "speed", "TYPE": "float", "DEFAULT": 0.2, "MIN": 0.0, "MAX": 2.0 },
    { "NAME": "meatColor", "TYPE": "color", "DEFAULT": [0.55, 0.03, 0.05, 1.0] },
    { "NAME": "fatColor", "TYPE": "color", "DEFAULT": [0.95, 0.78, 0.5, 1.0] }
  ]
}*/

vec2 hash2(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453);
}

float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash2(i).x, hash2(i + vec2(1.0, 0.0)).x, u.x),
             mix(hash2(i + vec2(0.0, 1.0)).x, hash2(i + vec2(1.0, 1.0)).x, u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * vnoise(p); p = p * 2.07 + 3.1; a *= 0.5; }
  return v;
}

// x = distance to the nearest cell point, y = to the second nearest.
vec2 voronoi(vec2 x, float t) {
  vec2 n = floor(x), f = fract(x);
  float f1 = 8.0, f2 = 8.0;
  for (int j = -1; j <= 1; j++)
  for (int i = -1; i <= 1; i++) {
    vec2 g = vec2(float(i), float(j));
    vec2 o = 0.5 + 0.4 * sin(t + 6.2831 * hash2(n + g));
    vec2 r = g + o - f;
    float d = dot(r, r);
    if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) { f2 = d; }
  }
  return sqrt(vec2(f1, f2));
}

float tissue(vec2 p, out float fatMask) {
  float t = TIME * speed;
  vec2 w = vec2(fbm(p * 0.6 + t), fbm(p * 0.6 - t + 4.7)) - 0.5;
  p += w * writhe * 2.0;
  vec2 v = voronoi(p * 1.4, t * 3.0);
  float cells = smoothstep(0.0, 0.3, v.y - v.x);
  float fib = 0.5 + 0.5 * sin((p.x * 0.5 + p.y) * 14.0 + fbm(p * 2.5) * 8.0);
  float m = fbm(p * 0.8 + 11.0);
  fatMask = smoothstep(0.75 - fat * 0.5, 0.8 - fat * 0.5, m);
  return cells * 0.55 + fbm(p * 2.0) * 0.35 + fib * fibers * 0.12 * (1.0 - fatMask) + fatMask * 0.15;
}

void main() {
  vec2 uv = (isf_FragNormCoord - 0.5) * vec2(RENDERSIZE.x / RENDERSIZE.y, 1.0);
  uv /= 1.0 + AUDIO_BASS * throb * 0.12;
  vec2 p = uv * scale;

  float fm, unused;
  float e = 0.015;
  float h = tissue(p, fm);
  float hx = tissue(p + vec2(e, 0.0), unused);
  float hy = tissue(p + vec2(0.0, e), unused);
  vec3 n = normalize(vec3((h - hx) / e, (h - hy) / e, 3.0));

  vec3 l = normalize(vec3(-0.4, 0.6, 0.7));
  float diff = max(dot(n, l), 0.0);
  float spec = pow(max(dot(reflect(-l, n), vec3(0.0, 0.0, 1.0)), 0.0), 40.0) * wetness;

  vec3 meat = mix(meatColor.rgb * 0.3, meatColor.rgb * 1.6, h);
  vec3 col = mix(meat, fatColor.rgb * (0.7 + h * 0.4), fm);
  col *= 0.35 + diff * 0.9;
  col += spec * mix(vec3(1.0, 0.8, 0.75), vec3(1.0), fm);
  col += meatColor.rgb * AUDIO_BEAT * 0.3;
  gl_FragColor = vec4(col, 1.0);
}
