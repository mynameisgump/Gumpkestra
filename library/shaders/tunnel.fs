/*{
  "DESCRIPTION": "Infinite grid tunnel. Modulate 'push' with bass to lurch forward on kicks.",
  "CREDIT": "Gumpkestra",
  "CATEGORIES": ["Generator", "Audio"],
  "INPUTS": [
    { "NAME": "audioFFT", "TYPE": "audioFFT" },
    { "NAME": "speed", "TYPE": "float", "GROUP": "Motion", "LABEL": "Speed", "DESCRIPTION": "Forward travel speed through the tunnel", "DEFAULT": 0.4, "MIN": 0, "MAX": 3 },
    { "NAME": "push", "TYPE": "float", "GROUP": "Motion", "LABEL": "Push", "DESCRIPTION": "Extra forward lurch offset", "DEFAULT": 0, "MIN": 0, "MAX": 2 },
    { "NAME": "segments", "TYPE": "float", "GROUP": "Geometry", "LABEL": "Segments", "DESCRIPTION": "Radial grid divisions around the tunnel", "DEFAULT": 8, "MIN": 2, "MAX": 32 },
    { "NAME": "rings", "TYPE": "float", "GROUP": "Geometry", "LABEL": "Rings", "DESCRIPTION": "Density of depth rings", "DEFAULT": 4, "MIN": 1, "MAX": 16 },
    { "NAME": "twist", "TYPE": "float", "GROUP": "Geometry", "LABEL": "Twist", "DESCRIPTION": "Spiral twist down the tunnel", "DEFAULT": 0.3, "MIN": -2, "MAX": 2 },
    { "NAME": "colorA", "TYPE": "color", "GROUP": "Color", "LABEL": "Colour A", "DESCRIPTION": "Primary neon grid colour", "DEFAULT": [0.1, 0.6, 1, 1] },
    { "NAME": "colorB", "TYPE": "color", "GROUP": "Color", "LABEL": "Colour B", "DESCRIPTION": "Secondary alternating grid colour", "DEFAULT": [1, 0.3, 0.1, 1] }
  ]
}*/

void main() {
  vec2 p = (isf_FragNormCoord - 0.5) * vec2(RENDERSIZE.x / RENDERSIZE.y, 1.0);
  float r = length(p) + 1e-4;
  float a = atan(p.y, p.x);

  float z = 0.25 / r + TIME * speed + push;
  float u = a / 6.28318 * floor(segments) + z * twist;
  float v = z * rings;
  float lines = max(smoothstep(0.92, 1.0, abs(cos(u * 3.14159))), smoothstep(0.92, 1.0, abs(cos(v * 3.14159))));

  float fft = IMG_NORM_PIXEL(audioFFT, vec2(abs(a) / 3.14159 * 0.6 + 0.02, 0.5)).r;
  vec3 col = mix(colorA.rgb, colorB.rgb, 0.5 + 0.5 * sin(v * 0.7 + TIME * 0.5));
  float fog = smoothstep(0.0, 0.45, r);
  vec3 c = col * lines * (0.5 + fft * 1.6) * fog;
  c += col * pow(fft, 3.0) * fog * 0.35;
  gl_FragColor = vec4(c, 1.0);
}
