/*{
  "DESCRIPTION": "Wet, writhing meat: wriggling fat cells, muscle striations and specular slime. Swells with the bass. Pick a texture and raise Texture mix to make the meat out of it; it writhes with the tissue.",
  "CREDIT": "Gumpkestra",
  "CATEGORIES": ["Generator", "Biological"],
  "INPUTS": [
    { "NAME": "scale", "TYPE": "float", "GROUP": "Tissue", "LABEL": "Scale", "DESCRIPTION": "Zoom scale of cells and striations", "DEFAULT": 3, "MIN": 1, "MAX": 10 },
    { "NAME": "writhe", "TYPE": "float", "GROUP": "Motion", "LABEL": "Writhe", "DESCRIPTION": "Organic tissue warping amplitude", "DEFAULT": 0.4, "MIN": 0, "MAX": 1.5 },
    { "NAME": "throb", "TYPE": "float", "GROUP": "Motion", "LABEL": "Throb", "DESCRIPTION": "Swelling throb intensity", "DEFAULT": 0, "MIN": 0, "MAX": 2, "MODS": [{ "SOURCE": "bass", "AMOUNT": 0.3 }] },
    { "NAME": "flush", "TYPE": "float", "GROUP": "Motion", "LABEL": "Flush", "DESCRIPTION": "Sudden blood-red brightness flush", "DEFAULT": 0, "MIN": 0, "MAX": 1, "MODS": [{ "SOURCE": "beat", "AMOUNT": 0.3 }] },
    { "NAME": "fibers", "TYPE": "float", "GROUP": "Tissue", "LABEL": "Muscle fibre", "DESCRIPTION": "Strength of striated muscle fibres", "DEFAULT": 0.5, "MIN": 0, "MAX": 1 },
    { "NAME": "fat", "TYPE": "float", "GROUP": "Tissue", "LABEL": "Fat", "DESCRIPTION": "Coverage of marbled fat cells", "DEFAULT": 0.3, "MIN": 0, "MAX": 1 },
    { "NAME": "wetness", "TYPE": "float", "GROUP": "Tissue", "LABEL": "Wetness", "DESCRIPTION": "Specular slime highlight brightness", "DEFAULT": 0.7, "MIN": 0, "MAX": 1.5 },
    { "NAME": "speed", "TYPE": "float", "GROUP": "Motion", "LABEL": "Speed", "DESCRIPTION": "Animation speed of writhing tissue", "DEFAULT": 0.2, "MIN": 0, "MAX": 2 },
    { "NAME": "tex", "TYPE": "image", "GROUP": "Texture", "LABEL": "Texture", "DESCRIPTION": "Optional texture warped along with the tissue", "DEFAULT": "@meat" },
    { "NAME": "texMix", "TYPE": "float", "GROUP": "Texture", "LABEL": "Texture mix", "DESCRIPTION": "Blend between procedural meat (0) and texture (1)", "DEFAULT": 0, "MIN": 0, "MAX": 1 },
    { "NAME": "texScale", "TYPE": "float", "GROUP": "Texture", "LABEL": "Texture scale", "DESCRIPTION": "Tiling scale of the surface texture", "DEFAULT": 1, "MIN": 0.25, "MAX": 6 },
    { "NAME": "meatColor", "TYPE": "color", "GROUP": "Color", "LABEL": "Meat colour", "DESCRIPTION": "Primary muscle tissue colour", "DEFAULT": [0.55, 0.03, 0.05, 1] },
    { "NAME": "fatColor", "TYPE": "color", "GROUP": "Color", "LABEL": "Fat colour", "DESCRIPTION": "Marbled fat cell colour", "DEFAULT": [0.95, 0.78, 0.5, 1] }
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

// warped = p after the writhe, so a texture can move with the tissue.
float tissue(vec2 p, out float fatMask, out vec2 warped) {
  float t = TIME * speed;
  vec2 w = vec2(fbm(p * 0.6 + t), fbm(p * 0.6 - t + 4.7)) - 0.5;
  p += w * writhe * 2.0;
  warped = p;
  vec2 v = voronoi(p * 1.4, t * 3.0);
  float cells = smoothstep(0.0, 0.3, v.y - v.x);
  float fib = 0.5 + 0.5 * sin((p.x * 0.5 + p.y) * 14.0 + fbm(p * 2.5) * 8.0);
  float m = fbm(p * 0.8 + 11.0);
  fatMask = smoothstep(0.75 - fat * 0.5, 0.8 - fat * 0.5, m);
  return cells * 0.55 + fbm(p * 2.0) * 0.35 + fib * fibers * 0.12 * (1.0 - fatMask) + fatMask * 0.15;
}

void main() {
  vec2 uv = (isf_FragNormCoord - 0.5) * vec2(RENDERSIZE.x / RENDERSIZE.y, 1.0);
  uv /= 1.0 + throb * 0.12;
  vec2 p = uv * scale;

  float fm, unused;
  vec2 wp, unusedP;
  float e = 0.015;
  float h = tissue(p, fm, wp);
  float hx = tissue(p + vec2(e, 0.0), unused, unusedP);
  float hy = tissue(p + vec2(0.0, e), unused, unusedP);
  vec3 n = normalize(vec3((h - hx) / e, (h - hy) / e, 3.0));

  vec3 l = normalize(vec3(-0.4, 0.6, 0.7));
  float diff = max(dot(n, l), 0.0);
  float spec = pow(max(dot(reflect(-l, n), vec3(0.0, 0.0, 1.0)), 0.0), 40.0) * wetness;

  vec3 meat = mix(meatColor.rgb * 0.3, meatColor.rgb * 1.6, h);
  // Textured meat keeps the tissue's relief as shading.
  vec3 texC = IMG_NORM_PIXEL(tex, wp / scale * texScale).rgb;
  meat = mix(meat, texC * (0.4 + h * 1.2), texMix);
  vec3 col = mix(meat, fatColor.rgb * (0.7 + h * 0.4), fm);
  col *= 0.35 + diff * 0.9;
  col += spec * mix(vec3(1.0, 0.8, 0.75), vec3(1.0), fm);
  col += meatColor.rgb * flush;
  gl_FragColor = vec4(col, 1.0);
}
