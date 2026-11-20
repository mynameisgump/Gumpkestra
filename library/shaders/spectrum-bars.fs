/*{
  "DESCRIPTION": "Log-frequency spectrum bars, optionally mirrored around the centre line.",
  "CREDIT": "Gumpkestra",
  "CATEGORIES": ["Generator", "Audio"],
  "INPUTS": [
    { "NAME": "audioFFT", "TYPE": "audioFFT" },
    { "NAME": "bars", "TYPE": "float", "GROUP": "Bars", "LABEL": "Bar count", "DESCRIPTION": "Number of frequency bands across the screen", "DEFAULT": 64, "MIN": 8, "MAX": 256 },
    { "NAME": "height", "TYPE": "float", "GROUP": "Bars", "LABEL": "Height", "DESCRIPTION": "Vertical gain of the spectrum bars", "DEFAULT": 0.8, "MIN": 0.1, "MAX": 2 },
    { "NAME": "gap", "TYPE": "float", "GROUP": "Bars", "LABEL": "Gap", "DESCRIPTION": "Empty spacing between adjacent bars", "DEFAULT": 0.25, "MIN": 0, "MAX": 0.9 },
    { "NAME": "boost", "TYPE": "float", "GROUP": "Bars", "LABEL": "Boost", "DESCRIPTION": "Extra height boost (often beat-modulated)", "DEFAULT": 0, "MIN": 0, "MAX": 2, "MODS": [{ "SOURCE": "beat", "AMOUNT": 0.3 }] },
    { "NAME": "mirror", "TYPE": "bool", "GROUP": "Bars", "LABEL": "Mirror", "DESCRIPTION": "Mirror bars symmetrically above and below the centre line", "DEFAULT": true },
    { "NAME": "colorLow", "TYPE": "color", "GROUP": "Color", "LABEL": "Low colour", "DESCRIPTION": "Colour at the base of bars", "DEFAULT": [0.1, 1, 0.6, 1] },
    { "NAME": "colorHigh", "TYPE": "color", "GROUP": "Color", "LABEL": "High colour", "DESCRIPTION": "Colour at the peaks of bars", "DEFAULT": [1, 0.2, 0.6, 1] }
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
  col *= max(fill, glow) * (1.0 + boost);
  gl_FragColor = vec4(col, 1.0);
}
