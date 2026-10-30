/*{
  "DESCRIPTION": "Domain-warped fbm clouds with a cosine palette. Good background layer.",
  "CREDIT": "Gumpkestra",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "scale", "TYPE": "float", "DEFAULT": 2.5, "MIN": 0.5, "MAX": 8.0 },
    { "NAME": "speed", "TYPE": "float", "DEFAULT": 0.08, "MIN": 0.0, "MAX": 1.0 },
    { "NAME": "warp", "TYPE": "float", "DEFAULT": 1.2, "MIN": 0.0, "MAX": 4.0 },
    { "NAME": "hue", "TYPE": "float", "DEFAULT": 0.6, "MIN": 0.0, "MAX": 1.0 },
    { "NAME": "brightness", "TYPE": "float", "DEFAULT": 0.8, "MIN": 0.0, "MAX": 2.0 }
  ]
}*/

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 5; i++) {
    v += amp * noise(p);
    p = p * 2.03 + vec2(1.7, 9.2);
    amp *= 0.5;
  }
  return v;
}

vec3 palette(float t) {
  return 0.5 + 0.5 * cos(6.28318 * (t + vec3(0.0, 0.33, 0.67)));
}

void main() {
  vec2 p = (isf_FragNormCoord - 0.5) * vec2(RENDERSIZE.x / RENDERSIZE.y, 1.0) * scale;
  float t = TIME * speed;
  vec2 q = vec2(fbm(p + t), fbm(p + vec2(5.2, 1.3) - t));
  vec2 r = vec2(fbm(p + warp * q + vec2(1.7, 9.2) + t * 0.7), fbm(p + warp * q + vec2(8.3, 2.8)));
  float f = fbm(p + warp * r);
  vec3 col = palette(hue + f * 0.6 + length(q) * 0.3) * (f * f * 1.8 + 0.1);
  gl_FragColor = vec4(col * brightness, 1.0);
}
