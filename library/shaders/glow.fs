/*{
  "DESCRIPTION": "Cheap single-pass bloom: bright areas bleed light.",
  "CREDIT": "Gumpkestra",
  "CATEGORIES": ["Effect", "Color"],
  "INPUTS": [
    { "NAME": "inputImage", "TYPE": "image" },
    { "NAME": "threshold", "TYPE": "float", "DEFAULT": 0.4, "MIN": 0.0, "MAX": 1.0 },
    { "NAME": "radius", "TYPE": "float", "DEFAULT": 12.0, "MIN": 1.0, "MAX": 60.0, "LABEL": "Radius (px)" },
    { "NAME": "intensity", "TYPE": "float", "DEFAULT": 0.8, "MIN": 0.0, "MAX": 3.0 }
  ]
}*/

vec3 bright(vec2 uv) {
  vec3 c = IMG_NORM_PIXEL(inputImage, uv).rgb;
  return max(c - threshold, 0.0) / max(1.0 - threshold, 0.01);
}

void main() {
  vec2 uv = isf_FragNormCoord;
  vec2 px = radius / RENDERSIZE;
  vec3 sum = vec3(0.0);
  float total = 0.0;
  // Golden-angle spiral, 24 taps.
  for (int i = 0; i < 24; i++) {
    float fi = float(i);
    float r = sqrt((fi + 0.5) / 24.0);
    float a = fi * 2.39996;
    float w = 1.0 - r * 0.7;
    sum += bright(uv + vec2(cos(a), sin(a)) * r * px) * w;
    total += w;
  }
  vec3 base = IMG_NORM_PIXEL(inputImage, uv).rgb;
  gl_FragColor = vec4(base + sum / total * intensity, 1.0);
}
