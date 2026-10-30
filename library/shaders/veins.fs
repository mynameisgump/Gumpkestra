/*{
  "DESCRIPTION": "Vein network under translucent skin. Blood surges outward from the centre on each beat; 'spread' grows the veins.",
  "CREDIT": "Gumpkestra",
  "CATEGORIES": ["Generator", "Biological"],
  "INPUTS": [
    { "NAME": "scale", "TYPE": "float", "DEFAULT": 2.5, "MIN": 0.5, "MAX": 8.0 },
    { "NAME": "thickness", "TYPE": "float", "DEFAULT": 0.05, "MIN": 0.005, "MAX": 0.2 },
    { "NAME": "capillaries", "TYPE": "float", "DEFAULT": 0.5, "MIN": 0.0, "MAX": 1.0 },
    { "NAME": "spread", "TYPE": "float", "DEFAULT": 1.0, "MIN": 0.0, "MAX": 1.0 },
    { "NAME": "flow", "TYPE": "float", "DEFAULT": 0.6, "MIN": 0.0, "MAX": 3.0, "LABEL": "Pulse speed" },
    { "NAME": "surge", "TYPE": "float", "DEFAULT": 0.8, "MIN": 0.0, "MAX": 2.0, "LABEL": "Beat surge" },
    { "NAME": "writhe", "TYPE": "float", "DEFAULT": 0.2, "MIN": 0.0, "MAX": 1.0 },
    { "NAME": "skinColor", "TYPE": "color", "DEFAULT": [0.12, 0.07, 0.07, 1.0] },
    { "NAME": "veinColor", "TYPE": "color", "DEFAULT": [0.3, 0.03, 0.14, 1.0] },
    { "NAME": "bloodColor", "TYPE": "color", "DEFAULT": [1.0, 0.08, 0.04, 1.0] }
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

void main() {
  vec2 uv = (isf_FragNormCoord - 0.5) * vec2(RENDERSIZE.x / RENDERSIZE.y, 1.0);
  float r = length(uv);
  vec2 p = uv * scale;
  p += (vec2(fbm(p + TIME * 0.1), fbm(p - TIME * 0.1 + 5.0)) - 0.5) * writhe;

  // Zero-crossings of signed fbm form a branching, vein-like network.
  float big = fbm(p) * 2.0 - 1.0;
  float small = fbm(p * 3.0 + 7.0) * 2.0 - 1.0;
  float th = thickness * (1.3 - r);
  float bigLine = smoothstep(th, th * 0.3, abs(big));
  float smallLine = smoothstep(th * 0.4, 0.0, abs(small)) * capillaries;
  float grow = smoothstep(spread * 1.2, spread * 1.2 - 0.15, r + fbm(p * 1.5) * 0.3);
  float veins = max(bigLine, smallLine * 0.7) * grow;
  float halo = smoothstep(th * 5.0, 0.0, abs(big)) * grow * 0.35;

  float wave = pow(0.5 + 0.5 * sin(r * 12.0 - TIME * flow * 6.0), 6.0);
  float front = (1.0 - AUDIO_BEAT) * 1.2;
  float ring = exp(-abs(r - front) * 8.0) * AUDIO_BEAT;
  float blood = veins * (0.25 + wave * 0.4 + ring * surge * 2.0);

  vec3 col = skinColor.rgb * (0.6 + fbm(p * 4.0) * 0.6);
  col += veinColor.rgb * halo;
  col = mix(col, veinColor.rgb, veins);
  col += bloodColor.rgb * blood;
  gl_FragColor = vec4(col, 1.0);
}
