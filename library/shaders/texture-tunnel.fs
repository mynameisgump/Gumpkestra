/*{
  "DESCRIPTION": "Flies down a tunnel lined with a texture. Lurches forward on every beat, and the walls swell with the bass. Try the built-in Meat or Rust, or the layers below.",
  "CATEGORIES": ["Generator", "Texture"],
  "INPUTS": [
    { "NAME": "tex", "TYPE": "image", "DEFAULT": "@meat", "LABEL": "Texture" },
    { "NAME": "speed", "TYPE": "float", "DEFAULT": 0.25, "MIN": -2.0, "MAX": 2.0 },
    { "NAME": "kick", "TYPE": "float", "DEFAULT": 0.25, "MIN": 0.0, "MAX": 1.0, "LABEL": "Beat lurch" },
    { "NAME": "twist", "TYPE": "float", "DEFAULT": 0.15, "MIN": -2.0, "MAX": 2.0 },
    { "NAME": "roll", "TYPE": "float", "DEFAULT": 0.02, "MIN": -0.5, "MAX": 0.5, "LABEL": "Roll (rev/s)" },
    { "NAME": "wraps", "TYPE": "long", "DEFAULT": 2, "VALUES": [1, 2, 3, 4, 6], "LABEL": "Texture wraps" },
    { "NAME": "stretch", "TYPE": "float", "DEFAULT": 1.0, "MIN": 0.2, "MAX": 4.0, "LABEL": "Depth stretch" },
    { "NAME": "shape", "TYPE": "long", "DEFAULT": 0, "VALUES": [0, 1, 2], "LABELS": ["Round", "Square", "Hex"] },
    { "NAME": "swell", "TYPE": "float", "DEFAULT": 0.0, "MIN": 0.0, "MAX": 0.6, "LABEL": "Swell", "MODS": [{ "SOURCE": "bass", "AMOUNT": 0.25 }] },
    { "NAME": "darkness", "TYPE": "float", "DEFAULT": 1.5, "MIN": 0.0, "MAX": 4.0 },
    { "NAME": "flash", "TYPE": "float", "DEFAULT": 0.0, "MIN": 0.0, "MAX": 2.0, "LABEL": "Flash", "MODS": [{ "SOURCE": "beat", "AMOUNT": 0.15 }] },
    { "NAME": "tint", "TYPE": "color", "DEFAULT": [1.0, 1.0, 1.0, 1.0] }
  ]
}*/

const float TAU = 6.2831853;

void main() {
  vec2 p = (isf_FragNormCoord - 0.5) * vec2(RENDERSIZE.x / RENDERSIZE.y, 1.0);
  float ang = atan(p.y, p.x);
  float r = length(p);
  if (shape == 1) r = max(abs(p.x), abs(p.y));
  else if (shape == 2) {
    vec2 q = abs(p);
    r = max(q.x * 0.866 + q.y * 0.5, q.y);
  }
  // Walls breathe with the bass and ripple around the circumference.
  r *= 1.0 - swell * (0.7 + 0.3 * sin(ang * 5.0 + TIME * 3.0));

  // Smooth travel plus a lurch per beat ("ratchet"): BEAT_COUNT steps, AUDIO_BEAT eases each step in.
  float travel = TIME * speed + (float(BEAT_COUNT) - AUDIO_BEAT) * kick;
  float v = stretch * 0.25 / max(r, 1e-3) + travel;
  float turn = TIME * roll;
  vec2 uv = vec2((ang / TAU + turn) * float(wraps) + twist * v, v);

  // atan jumps at ±π, which would wreck mip selection along one line. Take
  // gradients from a copy whose seam is on the opposite side, wherever smaller.
  vec2 uv2 = vec2((atan(-p.y, -p.x) / TAU + turn) * float(wraps) + twist * v, v);
  vec2 dx = dFdx(uv), dy = dFdy(uv), dx2 = dFdx(uv2), dy2 = dFdy(uv2);
  if (abs(dx2.x) < abs(dx.x)) dx.x = dx2.x;
  if (abs(dy2.x) < abs(dy.x)) dy.x = dy2.x;
  vec4 c = textureGrad(tex, uv, dx, dy);

  float light = pow(clamp(r * 2.2, 0.0, 1.0), darkness);
  c.rgb *= tint.rgb * light * (1.0 + flash);
  gl_FragColor = vec4(c.rgb, 1.0);
}
