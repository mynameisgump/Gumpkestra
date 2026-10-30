/*{
  "DESCRIPTION": "Something is wrong with you: double vision, slow sway, wavering image, sickly tint and tunnel vision that closes in with loudness.",
  "CREDIT": "Gumpkestra",
  "CATEGORIES": ["Effect", "Distortion"],
  "INPUTS": [
    { "NAME": "inputImage", "TYPE": "image" },
    { "NAME": "doubleVision", "TYPE": "float", "DEFAULT": 0.02, "MIN": 0.0, "MAX": 0.1 },
    { "NAME": "sway", "TYPE": "float", "DEFAULT": 0.04, "MIN": 0.0, "MAX": 0.2 },
    { "NAME": "rate", "TYPE": "float", "DEFAULT": 0.12, "MIN": 0.0, "MAX": 1.0, "LABEL": "Sway speed" },
    { "NAME": "waver", "TYPE": "float", "DEFAULT": 0.006, "MIN": 0.0, "MAX": 0.04 },
    { "NAME": "sick", "TYPE": "float", "DEFAULT": 0.35, "MIN": 0.0, "MAX": 1.0, "LABEL": "Sick tint" },
    { "NAME": "tunnelVision", "TYPE": "float", "DEFAULT": 0.5, "MIN": 0.0, "MAX": 1.0 }
  ]
}*/

void main() {
  float aspect = RENDERSIZE.x / RENDERSIZE.y;
  vec2 c = (isf_FragNormCoord - 0.5) * vec2(aspect, 1.0);
  float t = TIME * rate * 6.28318;
  float ang = sin(t) * sway;
  c = mat2(cos(ang), sin(ang), -sin(ang), cos(ang)) * c * (1.0 - sway * 0.5);
  c.x += sin(c.y * 12.0 + TIME * 1.7) * waver;
  c.y += sin(c.x * 9.0 + TIME * 1.3) * waver * 0.7;
  vec2 base = c / vec2(aspect, 1.0) + 0.5;

  vec2 off = vec2(cos(t * 0.7), sin(t * 1.3)) * doubleVision * (0.6 + 0.4 * sin(t * 0.5));
  off += vec2(doubleVision * AUDIO_BEAT, 0.0);
  vec3 col = 0.5 * (IMG_NORM_PIXEL(inputImage, base + off).rgb + IMG_NORM_PIXEL(inputImage, base - off).rgb);

  float l = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(col, l * vec3(0.85, 1.0, 0.55) + vec3(0.0, 0.02, 0.0), sick);
  float closing = 1.0 + tunnelVision * (0.6 + AUDIO_LEVEL * 0.4);
  float v = smoothstep(0.85, 0.15, length(c) * closing);
  gl_FragColor = vec4(col * mix(1.0, v, tunnelVision), 1.0);
}
