/*{
  "DESCRIPTION": "Chromatic aberration. Push 'amount' with the beat modulator for hits.",
  "CREDIT": "Gumpkestra",
  "CATEGORIES": ["Effect", "Glitch"],
  "INPUTS": [
    { "NAME": "inputImage", "TYPE": "image" },
    { "NAME": "amount", "TYPE": "float", "GROUP": "Aberration", "LABEL": "Amount", "DESCRIPTION": "Channel separation distance", "DEFAULT": 0.006, "MIN": 0, "MAX": 0.08 },
    { "NAME": "radial", "TYPE": "bool", "GROUP": "Aberration", "LABEL": "Radial", "DESCRIPTION": "Radiate split outward from screen centre instead of a fixed angle", "DEFAULT": true },
    { "NAME": "angle", "TYPE": "float", "GROUP": "Aberration", "LABEL": "Angle", "DESCRIPTION": "Split direction in radians (when Radial is off)", "DEFAULT": 0, "MIN": 0, "MAX": 6.2832 }
  ]
}*/

void main() {
  vec2 uv = isf_FragNormCoord;
  vec2 dir = radial ? (uv - 0.5) * 2.0 : vec2(cos(angle), sin(angle));
  vec2 off = dir * amount;
  float r = IMG_NORM_PIXEL(inputImage, uv + off).r;
  float g = IMG_NORM_PIXEL(inputImage, uv).g;
  float b = IMG_NORM_PIXEL(inputImage, uv - off).b;
  gl_FragColor = vec4(r, g, b, 1.0);
}
