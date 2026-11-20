/*{
  "DESCRIPTION": "Circular spectrum: a ring that pulses with the bass and sprouts frequency spikes.",
  "CREDIT": "Gumpkestra",
  "CATEGORIES": ["Generator", "Audio"],
  "INPUTS": [
    { "NAME": "audioFFT", "TYPE": "audioFFT" },
    { "NAME": "radius", "TYPE": "float", "GROUP": "Ring", "LABEL": "Radius", "DESCRIPTION": "Base radius of the spectrum ring", "DEFAULT": 0.22, "MIN": 0.02, "MAX": 0.6 },
    { "NAME": "pulse", "TYPE": "float", "GROUP": "Audio Reaction", "LABEL": "Pulse", "DESCRIPTION": "Radial expansion pulse", "DEFAULT": 0, "MIN": 0, "MAX": 1.5, "MODS": [{ "SOURCE": "bass", "AMOUNT": 0.2333 }] },
    { "NAME": "spikes", "TYPE": "float", "GROUP": "Audio Reaction", "LABEL": "Spikes", "DESCRIPTION": "Height of FFT frequency spikes around the ring", "DEFAULT": 0.35, "MIN": 0, "MAX": 1 },
    { "NAME": "coreGlow", "TYPE": "float", "GROUP": "Audio Reaction", "LABEL": "Core glow", "DESCRIPTION": "Soft glow filling the centre of the ring", "DEFAULT": 0, "MIN": 0, "MAX": 1, "MODS": [{ "SOURCE": "beat", "AMOUNT": 0.35 }] },
    { "NAME": "thickness", "TYPE": "float", "GROUP": "Ring", "LABEL": "Thickness", "DESCRIPTION": "Stroke width of the ring and spikes", "DEFAULT": 0.006, "MIN": 0.001, "MAX": 0.05 },
    { "NAME": "spin", "TYPE": "float", "GROUP": "Ring", "LABEL": "Spin", "DESCRIPTION": "Rotation speed around the centre", "DEFAULT": 0.03, "MIN": -0.5, "MAX": 0.5 },
    { "NAME": "colorA", "TYPE": "color", "GROUP": "Color", "LABEL": "Colour A", "DESCRIPTION": "Inner / low-frequency gradient colour", "DEFAULT": [0.2, 0.9, 1, 1] },
    { "NAME": "colorB", "TYPE": "color", "GROUP": "Color", "LABEL": "Colour B", "DESCRIPTION": "Outer / high-frequency gradient colour", "DEFAULT": [1, 0.25, 0.7, 1] }
  ]
}*/

void main() {
  vec2 p = (isf_FragNormCoord - 0.5) * vec2(RENDERSIZE.x / RENDERSIZE.y, 1.0);
  float r = length(p);
  float a = fract(atan(p.y, p.x) / 6.28318 + 0.5 + TIME * spin);
  // Mirror the angle so the spectrum is symmetric and has no seam.
  float m = abs(a * 2.0 - 1.0);
  float f = IMG_NORM_PIXEL(audioFFT, vec2(0.02 + m * 0.8, 0.5)).r;

  float rr = radius * (1.0 + pulse);
  float outer = rr + pow(f, 2.2) * spikes;
  float ring = smoothstep(thickness, 0.0, abs(r - rr));
  float bars = step(rr, r) * step(r, outer);
  float tip = exp(-abs(r - outer) * 60.0) * step(rr, r);

  vec3 col = mix(colorA.rgb, colorB.rgb, m);
  vec3 c = col * (bars * 0.75 + tip * 0.8) + vec3(1.0) * ring;
  c += colorA.rgb * smoothstep(rr, 0.0, r) * coreGlow;
  gl_FragColor = vec4(c, 1.0);
}
