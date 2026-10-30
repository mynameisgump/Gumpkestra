/*{
  "DESCRIPTION": "Worn VHS tape: line jitter, a rolling tracking band that tears on the beat, chroma bleed, tape noise and head-switching at the bottom.",
  "CREDIT": "Gumpkestra",
  "CATEGORIES": ["Effect", "Retro"],
  "INPUTS": [
    { "NAME": "inputImage", "TYPE": "image" },
    { "NAME": "tracking", "TYPE": "float", "DEFAULT": 0.2, "MIN": 0.0, "MAX": 1.0 },
    { "NAME": "beatTear", "TYPE": "float", "DEFAULT": 0.6, "MIN": 0.0, "MAX": 2.0, "LABEL": "Beat tear" },
    { "NAME": "chroma", "TYPE": "float", "DEFAULT": 0.5, "MIN": 0.0, "MAX": 1.0, "LABEL": "Chroma bleed" },
    { "NAME": "tapeNoise", "TYPE": "float", "DEFAULT": 0.35, "MIN": 0.0, "MAX": 1.0 },
    { "NAME": "saturation", "TYPE": "float", "DEFAULT": 0.8, "MIN": 0.0, "MAX": 1.5 },
    { "NAME": "headSwitch", "TYPE": "bool", "DEFAULT": true, "LABEL": "Head switching" }
  ]
}*/

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

vec3 rgb2yiq(vec3 c) { return mat3(0.299, 0.596, 0.211, 0.587, -0.274, -0.523, 0.114, -0.322, 0.312) * c; }
vec3 yiq2rgb(vec3 c) { return mat3(1.0, 1.0, 1.0, 0.956, -0.272, -1.106, 0.621, -0.647, 1.703) * c; }

void main() {
  vec2 uv = isf_FragNormCoord;
  float t = TIME;
  float ly = floor(uv.y * 240.0);
  float amt = tracking + AUDIO_BEAT * beatTear;

  float dx = (vnoise(vec2(ly * 0.3, t * 8.0)) - 0.5) * 0.004 * amt;
  float bandY = 1.0 - fract(t * 0.12 + 0.3 * vnoise(vec2(t * 0.5, 0.0)));
  float band = smoothstep(0.08, 0.0, abs(uv.y - bandY)) * amt;
  dx += band * (vnoise(vec2(ly, t * 30.0)) - 0.5) * 0.08;
  if (headSwitch) {
    dx += smoothstep(0.035, 0.0, uv.y) * (0.02 + 0.03 * vnoise(vec2(ly, t * 20.0)));
  }
  vec2 suv = vec2(uv.x + dx, uv.y);

  // Sharp-ish luma, smeared and delayed chroma.
  float Y = 0.0;
  vec2 IQ = vec2(0.0);
  for (int i = 0; i < 8; i++) {
    float o = float(i) / RENDERSIZE.x * (1.0 + chroma * 6.0);
    vec3 s = rgb2yiq(IMG_NORM_PIXEL(inputImage, suv - vec2(o, 0.0)).rgb);
    IQ += s.yz;
    if (i < 2) Y += s.x;
  }
  vec3 col = yiq2rgb(vec3(Y * 0.5, IQ / 8.0 * saturation));

  float fr = floor(t * 30.0);
  col += (hash(uv * RENDERSIZE + fract(t) * 100.0) - 0.5) * tapeNoise * 0.15;
  float streakLine = step(0.994 - band * 0.05, hash(vec2(ly, fr)));
  float streak = streakLine * step(fract(uv.x * 0.7 + hash(vec2(ly, fr + 1.0)) * 3.0), 0.3);
  col += streak * 0.7 * tapeNoise + band * 0.08;
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
