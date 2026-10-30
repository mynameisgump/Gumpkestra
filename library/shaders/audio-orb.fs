/*{
  "DESCRIPTION": "Raymarched sphere whose surface is displaced by the spectrum: lumps low on the ball follow the bass, higher up the treble. It swells with the bass and its edge glows with the highs through modulators on radius and Edge glow (∿). Wrap it in a texture (try the built-in Meat) and add bump and gloss for a wet, fleshy look; set Texture mix to 0 for the plain hue colouring.",
  "CREDIT": "Gumpkestra",
  "CATEGORIES": ["Generator", "Audio", "3D", "Texture"],
  "INPUTS": [
    { "NAME": "audioFFT", "TYPE": "audioFFT" },
    { "NAME": "radius", "TYPE": "float", "DEFAULT": 0.9, "MIN": 0.3, "MAX": 1.6, "MODS": [{ "SOURCE": "bass", "AMOUNT": 0.1731 }] },
    { "NAME": "displace", "TYPE": "float", "DEFAULT": 0.25, "MIN": 0.0, "MAX": 0.8, "LABEL": "Lump height" },
    { "NAME": "frequency", "TYPE": "float", "DEFAULT": 6.0, "MIN": 1.0, "MAX": 20.0, "LABEL": "Lump count" },
    { "NAME": "spin", "TYPE": "float", "DEFAULT": 0.3, "MIN": -2.0, "MAX": 2.0 },
    { "NAME": "hue", "TYPE": "float", "DEFAULT": 0.55, "MIN": 0.0, "MAX": 1.0 },
    { "NAME": "rim", "TYPE": "float", "DEFAULT": 0.6, "MIN": 0.0, "MAX": 2.0, "LABEL": "Edge glow", "MODS": [{ "SOURCE": "high", "AMOUNT": 0.5 }] },
    { "NAME": "tex", "TYPE": "image", "DEFAULT": "@meat", "LABEL": "Texture" },
    { "NAME": "texMix", "TYPE": "float", "DEFAULT": 1.0, "MIN": 0.0, "MAX": 1.0, "LABEL": "Texture mix" },
    { "NAME": "texScale", "TYPE": "float", "DEFAULT": 1.0, "MIN": 0.25, "MAX": 6.0, "LABEL": "Texture scale" },
    { "NAME": "bump", "TYPE": "float", "DEFAULT": 0.6, "MIN": 0.0, "MAX": 2.0, "LABEL": "Texture bump" },
    { "NAME": "gloss", "TYPE": "float", "DEFAULT": 0.5, "MIN": 0.0, "MAX": 2.0, "LABEL": "Wet gloss" }
  ]
}*/

mat2 rot(float a) {
  float c = cos(a), s = sin(a);
  return mat2(c, -s, s, c);
}

// World → orb space, so the surface pattern and texture spin with the orb.
vec3 toOrb(vec3 p) {
  p.xz *= rot(TIME * spin);
  p.xy *= rot(TIME * spin * 0.6);
  return p;
}

vec3 fromOrb(vec3 p) {
  p.xy *= rot(-TIME * spin * 0.6);
  p.xz *= rot(-TIME * spin);
  return p;
}

float map(vec3 p) {
  p = toOrb(p);
  float r = length(p);
  vec3 n = p / max(r, 1e-4);
  float f = IMG_NORM_PIXEL(audioFFT, vec2(0.03 + 0.55 * (0.5 + 0.5 * n.y), 0.5)).r;
  float d = sin(n.x * frequency + TIME) * sin(n.y * frequency + TIME * 1.3) * sin(n.z * frequency - TIME * 0.7);
  return r - (radius + d * displace * (0.2 + f * 1.5));
}

vec3 normalAt(vec3 p) {
  vec2 e = vec2(0.002, 0.0);
  return normalize(vec3(map(p + e.xyy) - map(p - e.xyy), map(p + e.yxy) - map(p - e.yxy), map(p + e.yyx) - map(p - e.yyx)));
}

// Triplanar lookup (w = per-axis blend weights) with explicit gradients, so mip selection
// doesn't depend on the raymarch's divergent control flow.
vec3 triplanar(vec3 q, vec3 w, vec3 dx, vec3 dy) {
  return textureGrad(tex, q.zy, dx.zy, dy.zy).rgb * w.x
       + textureGrad(tex, q.xz, dx.xz, dy.xz).rgb * w.y
       + textureGrad(tex, q.xy, dx.xy, dy.xy).rgb * w.z;
}

float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

void main() {
  vec2 uv = (isf_FragNormCoord - 0.5) * vec2(RENDERSIZE.x / RENDERSIZE.y, 1.0);
  vec3 ro = vec3(0.0, 0.0, 3.2);
  vec3 rd = normalize(vec3(uv, -1.4));
  float t = 0.0;
  bool hit = false;
  for (int i = 0; i < 80; i++) {
    float d = map(ro + rd * t);
    if (d < 0.001) { hit = true; break; }
    t += d * 0.6;
    if (t > 8.0) break;
  }
  // Shade every pixel and discard misses at the end, so dFdx/dFdy run in uniform control flow.
  vec3 p = ro + rd * t;
  vec3 n = normalAt(p);
  vec3 q = toOrb(p) * texScale;
  vec3 w = pow(abs(toOrb(n)), vec3(4.0));
  w /= w.x + w.y + w.z;
  vec3 dx = dFdx(q), dy = dFdy(q);
  vec3 albedo = triplanar(q, w, dx, dy);
  if (bump > 0.0) {
    // Treat brightness as height: tilt the normal away from the brighter side.
    const float e = 0.02;
    float h0 = luma(albedo);
    vec3 g = vec3(
      luma(triplanar(q + vec3(e, 0.0, 0.0), w, dx, dy)),
      luma(triplanar(q + vec3(0.0, e, 0.0), w, dx, dy)),
      luma(triplanar(q + vec3(0.0, 0.0, e), w, dx, dy))) - h0;
    g = fromOrb(g / e) * texScale;
    n = normalize(n - bump * 0.05 * (g - dot(g, n) * n));
  }
  vec3 base = mix(0.5 + 0.5 * cos(6.28318 * (hue + n.y * 0.25 + vec3(0.0, 0.33, 0.67))), albedo, texMix);
  vec3 light = normalize(vec3(0.6, 0.8, 0.5));
  float diff = max(dot(n, light), 0.0);
  float fres = pow(1.0 - max(dot(n, -rd), 0.0), 3.0);
  float spec = pow(max(dot(reflect(rd, n), light), 0.0), 40.0);
  vec3 col = base * (0.15 + diff * 0.85) + fres * rim + spec * gloss;
  gl_FragColor = vec4(hit ? col : vec3(0.0), 1.0);
}
