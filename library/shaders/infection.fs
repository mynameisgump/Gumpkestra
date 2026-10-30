/*{
  "DESCRIPTION": "Rot spreads across the image from seed points, leaving a sickly glowing rim. Trigger 'infect' (or tick 'on beat') to plant new seeds.",
  "CREDIT": "Gumpkestra",
  "CATEGORIES": ["Effect", "Biological", "Feedback"],
  "INPUTS": [
    { "NAME": "inputImage", "TYPE": "image" },
    { "NAME": "infect", "TYPE": "event" },
    { "NAME": "spreadRate", "TYPE": "float", "DEFAULT": 0.6, "MIN": 0.0, "MAX": 1.0, "LABEL": "Spread" },
    { "NAME": "seedSize", "TYPE": "float", "DEFAULT": 0.03, "MIN": 0.005, "MAX": 0.2 },
    { "NAME": "heal", "TYPE": "float", "DEFAULT": 0.15, "MIN": 0.0, "MAX": 1.0 },
    { "NAME": "corrupt", "TYPE": "float", "DEFAULT": 0.7, "MIN": 0.0, "MAX": 1.0, "LABEL": "Corruption" },
    { "NAME": "rimGlow", "TYPE": "float", "DEFAULT": 0.6, "MIN": 0.0, "MAX": 2.0, "LABEL": "Rim glow", "MODS": [{ "SOURCE": "high", "AMOUNT": 0.4 }] },
    { "NAME": "rotColor", "TYPE": "color", "DEFAULT": [0.3, 0.4, 0.05, 1.0] },
    { "NAME": "rimColor", "TYPE": "color", "DEFAULT": [0.85, 1.0, 0.25, 1.0] }
  ],
  "PASSES": [
    { "TARGET": "rotmap", "PERSISTENT": true, "FLOAT": true },
    {}
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
  if (PASSINDEX == 0) {
    float m = IMG_NORM_PIXEL(rotmap, uv).r;
    // Grow from neighbours in a random direction per pixel per frame, so fronts are
    // ragged and organic instead of following the pixel grid.
    float ra = hash(uv * RENDERSIZE + fract(TIME * 7.3)) * 6.28318;
    float nmax = 0.0;
    for (int i = 0; i < 4; i++) {
      float a = ra + float(i) * 1.5708;
      vec2 o = vec2(cos(a), sin(a)) * (1.0 + hash(uv * RENDERSIZE + float(i))) / RENDERSIZE;
      nmax = max(nmax, IMG_NORM_PIXEL(rotmap, uv + o).r);
    }
    // Noise gates where rot can grow, giving veiny, finger-like fronts.
    float gate = vnoise(uv * asp * 40.0) * 0.5 + vnoise(uv * asp * 9.0 + TIME * 0.05) * 0.5;
    float grow = step(1.0 - spreadRate * 0.8, gate + hash(uv * RENDERSIZE + fract(TIME)) * 0.35);
    m = max(m, nmax * grow * 0.999);
    m = max(0.0, m - heal * TIMEDELTA * 0.2);
    if (infect) {
      vec2 sp = vec2(hash(vec2(TIME, 1.0)), hash(vec2(TIME, 2.0)));
      m = max(m, smoothstep(seedSize, seedSize * 0.5, length((uv - sp) * asp)));
    }
    gl_FragColor = vec4(m, 0.0, 0.0, 1.0);
    return;
  }

  float m = IMG_NORM_PIXEL(rotmap, uv).r;
  vec2 wob = (vec2(vnoise(uv * 30.0 + TIME), vnoise(uv * 30.0 - TIME)) - 0.5) * 0.012 * m * corrupt;
  vec3 src = IMG_NORM_PIXEL(inputImage, uv + wob).rgb;
  float l = dot(src, vec3(0.299, 0.587, 0.114));
  float tex = vnoise(uv * asp * 60.0) * 0.5 + vnoise(uv * asp * 15.0) * 0.5;
  vec3 rotted = mix(src * 0.3, rotColor.rgb * (0.3 + tex * 1.2) * (0.5 + l), corrupt);
  rotted += rimColor.rgb * smoothstep(0.78, 0.82, vnoise(uv * asp * 120.0)) * 0.4;

  float body = smoothstep(0.3, 0.6, m);
  float rim = smoothstep(0.08, 0.3, m) * (1.0 - body);
  vec3 col = mix(src, rotted, body) + rimColor.rgb * rim * rimGlow;
  gl_FragColor = vec4(col, 1.0);
}
