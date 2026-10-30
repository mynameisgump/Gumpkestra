/*{
  "DESCRIPTION": "Makes the image behave like living tissue: slow breathing warp, a heartbeat swell on the bass, and a wet fleshy sheen.",
  "CREDIT": "Gumpkestra",
  "CATEGORIES": ["Effect", "Biological"],
  "INPUTS": [
    { "NAME": "inputImage", "TYPE": "image" },
    { "NAME": "warp", "TYPE": "float", "DEFAULT": 0.025, "MIN": 0.0, "MAX": 0.15 },
    { "NAME": "scale", "TYPE": "float", "DEFAULT": 3.0, "MIN": 0.5, "MAX": 10.0 },
    { "NAME": "breathRate", "TYPE": "float", "DEFAULT": 0.25, "MIN": 0.0, "MAX": 2.0, "LABEL": "Breaths / sec" },
    { "NAME": "heartbeat", "TYPE": "float", "DEFAULT": 0.0, "MIN": 0.0, "MAX": 0.25, "LABEL": "Swell", "MODS": [{ "SOURCE": "bass", "AMOUNT": 0.24 }] },
    { "NAME": "fleshTint", "TYPE": "float", "DEFAULT": 0.3, "MIN": 0.0, "MAX": 1.0 },
    { "NAME": "wetness", "TYPE": "float", "DEFAULT": 0.4, "MIN": 0.0, "MAX": 1.5 },
    { "NAME": "tint", "TYPE": "color", "DEFAULT": [0.75, 0.12, 0.12, 1.0] }
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
  vec2 uv = isf_FragNormCoord;
  vec2 p = uv * scale * vec2(RENDERSIZE.x / RENDERSIZE.y, 1.0);
  float breath = 0.5 + 0.5 * sin(TIME * breathRate * 6.28318);
  vec2 d = vec2(fbm(p + TIME * 0.1), fbm(p + 5.2 - TIME * 0.1)) - 0.5;
  vec2 swell = -(uv - 0.5) * heartbeat;
  vec3 col = IMG_NORM_PIXEL(inputImage, uv + d * warp * (0.5 + breath) + swell).rgb;

  float e = 0.01;
  vec2 hp = p * 2.0 + d * 3.0;
  float h = fbm(hp);
  vec3 n = normalize(vec3((h - fbm(hp + vec2(e, 0.0))) / e, (h - fbm(hp + vec2(0.0, e))) / e, 4.0));
  float spec = pow(max(dot(n, normalize(vec3(-0.4, 0.5, 0.8))), 0.0), 30.0);

  float l = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(col, tint.rgb * (0.3 + l * 1.5), fleshTint);
  col *= 0.85 + h * 0.3;
  col += spec * wetness * 0.6;
  gl_FragColor = vec4(col, 1.0);
}
