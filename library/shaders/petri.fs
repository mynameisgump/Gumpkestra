/*{
  "DESCRIPTION": "Stained cells under a microscope. Blobs merge and split like mitosis, jitter with the treble and swell with the bass.",
  "CREDIT": "Gumpkestra",
  "CATEGORIES": ["Generator", "Biological"],
  "INPUTS": [
    { "NAME": "scale", "TYPE": "float", "DEFAULT": 6.0, "MIN": 2.0, "MAX": 16.0, "LABEL": "Zoom out" },
    { "NAME": "density", "TYPE": "float", "DEFAULT": 0.7, "MIN": 0.0, "MAX": 1.0 },
    { "NAME": "size", "TYPE": "float", "DEFAULT": 0.45, "MIN": 0.2, "MAX": 0.8 },
    { "NAME": "writhe", "TYPE": "float", "DEFAULT": 0.4, "MIN": 0.0, "MAX": 1.0 },
    { "NAME": "jitter", "TYPE": "float", "DEFAULT": 0.0, "MIN": 0.0, "MAX": 2.0, "LABEL": "Jitter", "MODS": [{ "SOURCE": "high", "AMOUNT": 0.3 }] },
    { "NAME": "swell", "TYPE": "float", "DEFAULT": 0.0, "MIN": 0.0, "MAX": 1.0, "LABEL": "Swell", "MODS": [{ "SOURCE": "bass", "AMOUNT": 0.5 }] },
    { "NAME": "lens", "TYPE": "float", "DEFAULT": 0.48, "MIN": 0.3, "MAX": 1.0, "LABEL": "Lens radius" },
    { "NAME": "stain", "TYPE": "color", "DEFAULT": [0.6, 0.25, 0.65, 1.0] },
    { "NAME": "nucleusColor", "TYPE": "color", "DEFAULT": [0.18, 0.04, 0.32, 1.0] },
    { "NAME": "background", "TYPE": "color", "DEFAULT": [0.92, 0.86, 0.8, 1.0] }
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

void main() {
  vec2 uv = (isf_FragNormCoord - 0.5) * vec2(RENDERSIZE.x / RENDERSIZE.y, 1.0);
  vec2 p = uv * scale + vec2(TIME * 0.04, TIME * 0.02);
  vec2 n = floor(p), f = fract(p);

  float field = 0.0;
  float nuc = 0.0;
  for (int j = -1; j <= 1; j++)
  for (int i = -1; i <= 1; i++) {
    vec2 g = vec2(float(i), float(j));
    vec2 cell = n + g;
    vec2 h = hash2(cell);
    if (h.x > density) continue;
    vec2 o = 0.5 + 0.35 * sin(TIME * (0.3 + h) * writhe * 2.0 + 6.2831 * h);
    o += (hash2(cell + floor(TIME * 20.0)) - 0.5) * jitter * 0.08;
    vec2 rel = g + o - f;
    float rad = size * (0.7 + 0.6 * h.y) * (1.0 + swell * 0.35);
    float a = atan(rel.y, rel.x);
    rad *= 1.0 + 0.12 * sin(a * 3.0 + TIME * 2.0 * writhe + h.x * 20.0) * writhe;
    float d = length(rel);
    field += exp(-d * d / (rad * rad) * 1.5);
    vec2 wob = 0.12 * rad * vec2(sin(h.x * 9.0 + TIME), cos(h.y * 7.0 + TIME));
    nuc = max(nuc, smoothstep(0.3, 0.24, length(rel - wob) / rad));
  }

  float body = smoothstep(0.45, 0.55, field);
  float membrane = smoothstep(0.09, 0.0, abs(field - 0.5));
  float gran = vnoise(p * 9.0);

  vec3 col = background.rgb * (0.88 + 0.12 * vnoise(p * 20.0));
  col = mix(col, stain.rgb * (0.75 + 0.5 * gran), body * 0.85);
  col = mix(col, stain.rgb * 0.35, membrane);
  col = mix(col, nucleusColor.rgb * (0.8 + gran * 0.4), nuc * body);

  // Microscope eyepiece: circular field with chromatic fringe.
  float rr = length(uv);
  float lensMask = smoothstep(lens, lens - 0.02, rr);
  vec3 fringe = vec3(0.2, 0.4, 1.0) * smoothstep(0.02, 0.0, abs(rr - lens + 0.015)) * 0.5;
  col = col * lensMask * (1.0 - smoothstep(lens * 0.6, lens, rr) * 0.35) + fringe;
  gl_FragColor = vec4(col, 1.0);
}
