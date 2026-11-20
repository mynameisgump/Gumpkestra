/*{
  "DESCRIPTION": "Flash, invert or zoom-punch on each detected beat.",
  "CREDIT": "Gumpkestra",
  "CATEGORIES": ["Effect", "Audio"],
  "INPUTS": [
    { "NAME": "inputImage", "TYPE": "image" },
    { "NAME": "flash", "TYPE": "float", "GROUP": "Beat Reaction", "LABEL": "Flash", "DESCRIPTION": "Intensity of the beat colour flash", "DEFAULT": 0, "MIN": 0, "MAX": 1, "MODS": [{ "SOURCE": "beat", "AMOUNT": 0.5 }] },
    { "NAME": "punch", "TYPE": "float", "GROUP": "Beat Reaction", "LABEL": "Zoom punch", "DESCRIPTION": "Zoom kick strength on each beat", "DEFAULT": 0, "MIN": 0, "MAX": 0.4, "MODS": [{ "SOURCE": "beat", "AMOUNT": 0.15 }] },
    { "NAME": "invertEvery", "TYPE": "long", "GROUP": "Beat Reaction", "LABEL": "Invert every", "DESCRIPTION": "Invert colours periodically on beat count", "DEFAULT": 0, "VALUES": [0, 2, 4, 8], "LABELS": ["Never", "2 beats", "4 beats", "8 beats"] },
    { "NAME": "flashColor", "TYPE": "color", "GROUP": "Color", "LABEL": "Flash colour", "DESCRIPTION": "Colour used for beat flashes", "DEFAULT": [1, 1, 1, 1] }
  ]
}*/

void main() {
  vec2 uv = (isf_FragNormCoord - 0.5) / (1.0 + punch) + 0.5;
  vec3 c = IMG_NORM_PIXEL(inputImage, uv).rgb;
  if (invertEvery > 0 && BEAT_COUNT % invertEvery == 0 && AUDIO_BEAT > 0.2) c = max(1.0 - c, 0.0);
  // Squared so a decaying beat flash snaps off quickly.
  c += flashColor.rgb * pow(flash, 2.0);
  gl_FragColor = vec4(max(c, 0.0), 1.0);
}
