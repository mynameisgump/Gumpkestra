/*{
  "DESCRIPTION": "Log-frequency spectrum bars, optionally mirrored around the centre line.",
  "CREDIT": "Gumpkestra",
  "CATEGORIES": ["Generator", "Audio"],
  "INPUTS": [
    { "NAME": "audioFFT", "TYPE": "audioFFT" },
    { "NAME": "bars", "TYPE": "float", "DEFAULT": 64.0, "MIN": 8.0, "MAX": 256.0 },
    { "NAME": "height", "TYPE": "float", "DEFAULT": 0.8, "MIN": 0.1, "MAX": 2.0 },
    { "NAME": "gap", "TYPE": "float", "DEFAULT": 0.25, "MIN": 0.0, "MAX": 0.9 },
    { "NAME": "mirror", "TYPE": "bool", "DEFAULT": true },
    { "NAME": "colorLow", "TYPE": "color", "DEFAULT": [0.1, 1.0, 0.6, 1.0] },
    { "NAME": "colorHigh", "TYPE": "color", "DEFAULT": [1.0, 0.2, 0.6, 1.0] }
  ]
}*/

void main() {
  vec2 uv = isf_FragNormCoord;
  float y = mirror ? abs(uv.y - 0.5) * 2.0 : uv.y;
  float n = floor(bars);
  float idx = floor(uv.x * n);
  float local = fract(uv.x * n);
  float f = IMG_NORM_PIXEL(audioFFT, vec2((idx + 0.5) / n, 0.5)).r;
  float h = pow(f, 1.5) * height;

  float inBar = step(gap * 0.5, local) * step(local, 1.0 - gap * 0.5);
  float fill = step(y, h) * inBar;
  float glow = exp(-max(y - h, 0.0) * 18.0) * inBar * 0.45;

  vec3 col = mix(colorLow.rgb, colorHigh.rgb, uv.x);
  col *= max(fill, glow) * (1.0 + AUDIO_BEAT * 0.6);
  gl_FragColor = vec4(col, 1.0);
}
