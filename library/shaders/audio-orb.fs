/*{
  "DESCRIPTION": "Raymarched sphere whose surface is displaced by the spectrum.",
  "CREDIT": "Gumpkestra",
  "CATEGORIES": ["Generator", "Audio", "3D"],
  "INPUTS": [
    { "NAME": "audioFFT", "TYPE": "audioFFT" },
    { "NAME": "radius", "TYPE": "float", "DEFAULT": 0.9, "MIN": 0.3, "MAX": 1.6 },
    { "NAME": "pulse", "TYPE": "float", "DEFAULT": 0.25, "MIN": 0.0, "MAX": 1.0, "LABEL": "Bass pulse" },
    { "NAME": "displace", "TYPE": "float", "DEFAULT": 0.25, "MIN": 0.0, "MAX": 0.8 },
    { "NAME": "frequency", "TYPE": "float", "DEFAULT": 6.0, "MIN": 1.0, "MAX": 20.0 },
    { "NAME": "spin", "TYPE": "float", "DEFAULT": 0.3, "MIN": -2.0, "MAX": 2.0 },
    { "NAME": "hue", "TYPE": "float", "DEFAULT": 0.55, "MIN": 0.0, "MAX": 1.0 }
  ]
}*/

mat2 rot(float a) {
  float c = cos(a), s = sin(a);
  return mat2(c, -s, s, c);
}

float map(vec3 p) {
  p.xz *= rot(TIME * spin);
  p.xy *= rot(TIME * spin * 0.6);
  float r = length(p);
  vec3 n = p / max(r, 1e-4);
  float f = IMG_NORM_PIXEL(audioFFT, vec2(0.03 + 0.55 * (0.5 + 0.5 * n.y), 0.5)).r;
  float d = sin(n.x * frequency + TIME) * sin(n.y * frequency + TIME * 1.3) * sin(n.z * frequency - TIME * 0.7);
  return r - (radius * (1.0 + AUDIO_BASS * pulse) + d * displace * (0.2 + f * 1.5));
}

vec3 normalAt(vec3 p) {
  vec2 e = vec2(0.002, 0.0);
  return normalize(vec3(map(p + e.xyy) - map(p - e.xyy), map(p + e.yxy) - map(p - e.yxy), map(p + e.yyx) - map(p - e.yyx)));
}

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
  vec3 col = vec3(0.0);
  if (hit) {
    vec3 p = ro + rd * t;
    vec3 n = normalAt(p);
    vec3 base = 0.5 + 0.5 * cos(6.28318 * (hue + n.y * 0.25 + vec3(0.0, 0.33, 0.67)));
    float diff = max(dot(n, normalize(vec3(0.6, 0.8, 0.5))), 0.0);
    float fres = pow(1.0 - max(dot(n, -rd), 0.0), 3.0);
    col = base * (0.15 + diff * 0.85) + fres * (0.6 + AUDIO_HIGH);
  }
  gl_FragColor = vec4(col, 1.0);
}
