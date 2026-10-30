/*{
  "DESCRIPTION": "Flash, invert or zoom-punch on each detected beat.",
  "CREDIT": "Gumpkestra",
  "CATEGORIES": ["Effect", "Audio"],
  "INPUTS": [
    { "NAME": "inputImage", "TYPE": "image" },
    { "NAME": "flash", "TYPE": "float", "DEFAULT": 0.0, "MIN": 0.0, "MAX": 1.0, "MODS": [{ "SOURCE": "beat", "AMOUNT": 0.5 }] },
    { "NAME": "punch", "TYPE": "float", "DEFAULT": 0.0, "MIN": 0.0, "MAX": 0.4, "LABEL": "Zoom punch", "MODS": [{ "SOURCE": "beat", "AMOUNT": 0.15 }] },
    { "NAME": "invertEvery", "TYPE": "long", "DEFAULT": 0, "VALUES": [0, 2, 4, 8], "LABELS": ["Never", "2 beats", "4 beats", "8 beats"] },
    { "NAME": "flashColor", "TYPE": "color", "DEFAULT": [1.0, 1.0, 1.0, 1.0] }
  ]
}*/

void main() {
  vec2 uv = (isf_FragNormCoord - 0.5) / (1.0 + punch) + 0.5;
  vec3 c = IMG_NORM_PIXEL(inputImage, uv).rgb;
  if (invertEvery > 0 && BEAT_COUNT % invertEvery == 0 && AUDIO_BEAT > 0.2) c = 1.0 - c;
  // Squared so a decaying beat flash snaps off quickly.
  c += flashColor.rgb * pow(flash, 2.0);
  gl_FragColor = vec4(c, 1.0);
}
