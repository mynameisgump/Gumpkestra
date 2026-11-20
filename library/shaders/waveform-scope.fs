/*{
  "DESCRIPTION": "Oscilloscope trace of the waveform with a soft glow.",
  "CREDIT": "Gumpkestra",
  "CATEGORIES": ["Generator", "Audio"],
  "INPUTS": [
    { "NAME": "audio", "TYPE": "audio" },
    { "NAME": "amplitude", "TYPE": "float", "GROUP": "Trace", "LABEL": "Amplitude", "DESCRIPTION": "Vertical height of the oscilloscope wave", "DEFAULT": 0.4, "MIN": 0, "MAX": 2 },
    { "NAME": "thickness", "TYPE": "float", "GROUP": "Trace", "LABEL": "Thickness (px)", "DESCRIPTION": "Core trace line width in pixels", "DEFAULT": 2.5, "MIN": 0.5, "MAX": 20 },
    { "NAME": "glow", "TYPE": "float", "GROUP": "Glow & Color", "LABEL": "Glow (px)", "DESCRIPTION": "Soft phosphor halo radius in pixels", "DEFAULT": 12, "MIN": 0, "MAX": 60 },
    { "NAME": "brightness", "TYPE": "float", "GROUP": "Glow & Color", "LABEL": "Brightness", "DESCRIPTION": "Overall trace luminance", "DEFAULT": 0.8, "MIN": 0, "MAX": 2, "MODS": [{ "SOURCE": "level", "AMOUNT": 0.3 }] },
    { "NAME": "color", "TYPE": "color", "GROUP": "Glow & Color", "LABEL": "Colour", "DESCRIPTION": "Phosphor trace colour", "DEFAULT": [0.7, 1, 0.3, 1] }
  ]
}*/

float sampleWave(float x) {
  return IMG_NORM_PIXEL(audio, vec2(x, 0.5)).r - 0.5;
}

void main() {
  vec2 uv = isf_FragNormCoord;
  float dx = 1.0 / 256.0;
  float s0 = sampleWave(uv.x);
  float s1 = sampleWave(uv.x + dx);
  float y = 0.5 + s0 * amplitude * 2.0;

  // Distance to the line in pixels, corrected for slope so steep segments stay thick.
  float slope = ((s1 - s0) * amplitude * 2.0 * RENDERSIZE.y) / (dx * RENDERSIZE.x);
  float d = abs(uv.y - y) * RENDERSIZE.y / sqrt(1.0 + slope * slope);

  float line = smoothstep(thickness, thickness * 0.5, d);
  float halo = glow > 0.0 ? exp(-d / glow) * 0.5 : 0.0;
  gl_FragColor = vec4(color.rgb * (line + halo) * brightness, 1.0);
}
