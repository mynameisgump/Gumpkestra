/*{
  "DESCRIPTION": "Flash, invert or zoom-punch on each detected beat.",
  "CREDIT": "Gumpkestra",
  "CATEGORIES": ["Effect", "Audio"],
  "INPUTS": [
    { "NAME": "inputImage", "TYPE": "image" },
    { "NAME": "flash", "TYPE": "float", "DEFAULT": 0.25, "MIN": 0.0, "MAX": 1.0 },
    { "NAME": "punch", "TYPE": "float", "DEFAULT": 0.06, "MIN": 0.0, "MAX": 0.4, "LABEL": "Zoom punch" },
    { "NAME": "invertEvery", "TYPE": "long", "DEFAULT": 0, "VALUES": [0, 2, 4, 8], "LABELS": ["Never", "2 beats", "4 beats", "8 beats"] },
    { "NAME": "flashColor", "TYPE": "color", "DEFAULT": [1.0, 1.0, 1.0, 1.0] }
  ]
}*/

void main() {
  vec2 uv = (isf_FragNormCoord - 0.5) / (1.0 + AUDIO_BEAT * punch) + 0.5;
  vec3 c = IMG_NORM_PIXEL(inputImage, uv).rgb;
  if (invertEvery > 0 && BEAT_COUNT % invertEvery == 0 && AUDIO_BEAT > 0.2) c = 1.0 - c;
  c += flashColor.rgb * pow(AUDIO_BEAT, 2.0) * flash;
  gl_FragColor = vec4(c, 1.0);
}
