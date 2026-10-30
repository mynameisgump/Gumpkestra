/*{
  "DESCRIPTION": "Bloodshot eyes that dart to a new spot on every beat and dilate with the bass. Transparent outside the lids unless 'fill background' is on.",
  "CREDIT": "Gumpkestra",
  "CATEGORIES": ["Generator", "Biological"],
  "INPUTS": [
    { "NAME": "count", "TYPE": "float", "DEFAULT": 1.0, "MIN": 1.0, "MAX": 6.0, "LABEL": "Eyes (grid)" },
    { "NAME": "size", "TYPE": "float", "DEFAULT": 0.8, "MIN": 0.3, "MAX": 1.0 },
    { "NAME": "pupil", "TYPE": "float", "DEFAULT": 0.35, "MIN": 0.1, "MAX": 0.9 },
    { "NAME": "dilate", "TYPE": "float", "DEFAULT": 0.5, "MIN": 0.0, "MAX": 1.0, "LABEL": "Bass dilate" },
    { "NAME": "look", "TYPE": "float", "DEFAULT": 0.7, "MIN": 0.0, "MAX": 1.0, "LABEL": "Darting" },
    { "NAME": "blink", "TYPE": "float", "DEFAULT": 0.0, "MIN": 0.0, "MAX": 1.0 },
    { "NAME": "bloodshot", "TYPE": "float", "DEFAULT": 0.6, "MIN": 0.0, "MAX": 1.0 },
    { "NAME": "irisColor", "TYPE": "color", "DEFAULT": [0.4, 0.55, 0.2, 1.0] },
    { "NAME": "skinColor", "TYPE": "color", "DEFAULT": [0.4, 0.16, 0.13, 1.0] },
    { "NAME": "fillBackground", "TYPE": "bool", "DEFAULT": false, "LABEL": "Fill background" }
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

vec2 target(vec2 id, float n) { return hash2(id * 7.3 + n * 1.618) * 2.0 - 1.0; }

void main() {
  vec2 uv = (isf_FragNormCoord - 0.5) * vec2(RENDERSIZE.x / RENDERSIZE.y, 1.0);
  float n = floor(count);
  vec2 g = uv * n + (mod(n, 2.0) == 0.0 ? 0.5 : 0.0);
  vec2 id = floor(g + 0.5);
  vec2 q = (g - id) / (size * 0.5);
  float r = length(q);

  // Saccade: snap towards a new target on each beat (AUDIO_BEAT decays 1 → 0).
  float bc = float(BEAT_COUNT);
  vec2 lk = mix(target(id, bc), target(id, bc - 1.0), AUDIO_BEAT) * look * 0.4;
  lk += (vec2(vnoise(vec2(TIME * 4.0, id.x)), vnoise(vec2(id.y, TIME * 4.0))) - 0.5) * 0.04;

  float open = 1.0 - blink;
  float lidH = open * 0.75 * sqrt(max(1.0 - q.x * q.x, 0.0));

  // Sclera with bloodshot veins creeping in from the edge.
  vec3 sclera = mix(vec3(0.93, 0.88, 0.78), vec3(0.75, 0.32, 0.28), smoothstep(0.4, 1.0, r) * 0.6);
  vec2 dir = q / max(r, 1e-4);
  float vn = vnoise(dir * 3.0 + r * vec2(2.7, -1.9) + id * 13.0) + 0.5 * vnoise(dir * 7.0 + r * 5.0 + id * 3.0);
  float vein = smoothstep(0.05, 0.0, abs(vn - 0.8)) * smoothstep(0.3, 0.95, r) * bloodshot;
  sclera = mix(sclera, vec3(0.6, 0.02, 0.03), clamp(vein * (1.0 + AUDIO_BEAT), 0.0, 1.0));

  // Iris + pupil
  vec2 qi = q - lk;
  float ri = length(qi);
  float irisR = 0.45;
  float pr = irisR * clamp(pupil + AUDIO_BASS * dilate * 0.5, 0.05, 0.92);
  float fib = vnoise(qi / max(ri, 1e-4) * 9.0 + id * 3.0 + ri * 4.0);
  vec3 iris = irisColor.rgb * (0.45 + fib * 0.9);
  iris *= mix(1.0, 0.25, smoothstep(irisR * 0.7, irisR, ri));
  iris += irisColor.rgb * smoothstep(pr * 1.7, pr, ri) * 0.5;

  vec3 col = sclera;
  col = mix(col, iris, smoothstep(irisR + 0.01, irisR - 0.01, ri));
  col = mix(col, vec3(0.0), smoothstep(pr + 0.01, pr - 0.01, ri));
  col += smoothstep(0.09, 0.05, length(q - lk * 0.3 - vec2(-0.18, 0.2))) * 0.9;
  col *= mix(0.4, 1.0, smoothstep(lidH, lidH - 0.35, q.y));

  // Lids / surrounding skin
  vec3 skin = skinColor.rgb * (0.6 + vnoise(q * 6.0 + id * 5.0) * 0.6);
  skin *= mix(0.35, 1.0, smoothstep(0.0, 0.25, abs(q.y) - lidH));
  float inEye = smoothstep(lidH + 0.02, lidH - 0.02, abs(q.y)) * smoothstep(1.0, 0.97, r);
  vec3 outc = mix(skin, col, inEye);
  float alpha = fillBackground ? 1.0 : smoothstep(1.3, 1.0, r);
  gl_FragColor = vec4(outc, alpha);
}
