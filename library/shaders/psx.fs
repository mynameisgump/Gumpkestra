/*{
  "DESCRIPTION": "PS1-era output: low resolution, reduced colour depth with ordered dither, jittery affine wobble and a choppy frame rate.",
  "CREDIT": "Gumpkestra",
  "CATEGORIES": ["Effect", "Retro"],
  "INPUTS": [
    { "NAME": "inputImage", "TYPE": "image" },
    { "NAME": "resolution", "TYPE": "float", "DEFAULT": 240.0, "MIN": 60.0, "MAX": 720.0, "LABEL": "Vertical res" },
    { "NAME": "bits", "TYPE": "float", "DEFAULT": 5.0, "MIN": 1.0, "MAX": 8.0, "LABEL": "Bits / channel" },
    { "NAME": "dither", "TYPE": "float", "DEFAULT": 0.8, "MIN": 0.0, "MAX": 1.0 },
    { "NAME": "wobble", "TYPE": "float", "DEFAULT": 0.3, "MIN": 0.0, "MAX": 2.0, "LABEL": "Affine wobble" },
    { "NAME": "fps", "TYPE": "float", "DEFAULT": 20.0, "MIN": 0.0, "MAX": 60.0, "LABEL": "Frame rate (0 = full)" }
  ],
  "PASSES": [
    { "TARGET": "held", "PERSISTENT": true },
    {}
  ]
}*/

vec2 hash2(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453);
}

float bayer2(vec2 a) { a = floor(a); return fract(a.x / 2.0 + a.y * a.y * 0.75); }
float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }

void main() {
  vec2 uv = isf_FragNormCoord;
  if (PASSINDEX == 1) {
    gl_FragColor = IMG_NORM_PIXEL(held, uv);
    return;
  }
  // Hold the previous frame until the next tick of the low frame rate.
  if (fps > 0.5 && FRAMEINDEX > 1 && floor(TIME * fps) == floor((TIME - TIMEDELTA) * fps)) {
    gl_FragColor = IMG_NORM_PIXEL(held, uv);
    return;
  }
  float aspect = RENDERSIZE.x / RENDERSIZE.y;
  vec2 res = floor(vec2(resolution * aspect, resolution));
  vec2 cell = floor(uv * res);
  vec2 jit = (hash2(floor(cell / 8.0) + floor(TIME * max(fps, 12.0))) - 0.5) * wobble;
  vec3 c = IMG_NORM_PIXEL(inputImage, (cell + 0.5 + jit) / res).rgb;
  float levels = exp2(floor(bits)) - 1.0;
  float b = (bayer4(cell) - 0.5) * dither;
  c = floor(c * levels + 0.5 + b) / levels;
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}
