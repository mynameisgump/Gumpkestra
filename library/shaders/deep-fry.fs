/*{
  "DESCRIPTION": "Nauseating oversaturation: blown contrast, oversharpening, JPEG chroma blocking, posterisation and a centre bulge.",
  "CREDIT": "Gumpkestra",
  "CATEGORIES": ["Effect", "Glitch", "Color"],
  "INPUTS": [
    { "NAME": "inputImage", "TYPE": "image" },
    { "NAME": "saturation", "TYPE": "float", "DEFAULT": 2.5, "MIN": 0.0, "MAX": 5.0 },
    { "NAME": "contrast", "TYPE": "float", "DEFAULT": 1.6, "MIN": 0.5, "MAX": 3.0 },
    { "NAME": "sharpen", "TYPE": "float", "DEFAULT": 1.5, "MIN": 0.0, "MAX": 4.0 },
    { "NAME": "jpeg", "TYPE": "float", "DEFAULT": 0.6, "MIN": 0.0, "MAX": 1.0, "LABEL": "JPEG crunch" },
    { "NAME": "posterize", "TYPE": "float", "DEFAULT": 8.0, "MIN": 2.0, "MAX": 32.0 },
    { "NAME": "bulge", "TYPE": "float", "DEFAULT": 0.0, "MIN": 0.0, "MAX": 1.0 },
    { "NAME": "hueSpin", "TYPE": "float", "DEFAULT": 0.0, "MIN": 0.0, "MAX": 1.0 },
    { "NAME": "grit", "TYPE": "float", "DEFAULT": 0.15, "MIN": 0.0, "MAX": 1.0 }
  ]
}*/

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
vec3 rgb2yiq(vec3 c) { return mat3(0.299, 0.596, 0.211, 0.587, -0.274, -0.523, 0.114, -0.322, 0.312) * c; }
vec3 yiq2rgb(vec3 c) { return mat3(1.0, 1.0, 1.0, 0.956, -0.272, -1.106, 0.621, -0.647, 1.703) * c; }

void main() {
  float aspect = RENDERSIZE.x / RENDERSIZE.y;
  vec2 c = isf_FragNormCoord - 0.5;
  float r = length(c * vec2(aspect, 1.0));
  vec2 uv = 0.5 + c * (1.0 - bulge * 0.6 * (1.0 - smoothstep(0.0, 0.5, r)));

  vec2 px = 1.5 / RENDERSIZE;
  vec3 c0 = IMG_NORM_PIXEL(inputImage, uv).rgb;
  vec3 blur = (IMG_NORM_PIXEL(inputImage, uv + vec2(px.x, 0.0)).rgb + IMG_NORM_PIXEL(inputImage, uv - vec2(px.x, 0.0)).rgb
             + IMG_NORM_PIXEL(inputImage, uv + vec2(0.0, px.y)).rgb + IMG_NORM_PIXEL(inputImage, uv - vec2(0.0, px.y)).rgb) * 0.25;
  vec3 sharp = c0 + (c0 - blur) * sharpen;

  // Chroma subsampled per 8x8 block, like a badly compressed JPEG.
  vec2 blockUV = (floor(uv * RENDERSIZE / 8.0) * 8.0 + 4.0) / RENDERSIZE;
  vec3 blockC = IMG_NORM_PIXEL(inputImage, blockUV).rgb;
  vec3 yiq = rgb2yiq(sharp);
  yiq.yz = mix(yiq.yz, rgb2yiq(blockC).yz, jpeg);
  yiq.x = mix(yiq.x, floor(yiq.x * 12.0 + 0.5) / 12.0, jpeg * 0.5);

  float a = hueSpin * 6.28318;
  yiq.yz = mat2(cos(a), sin(a), -sin(a), cos(a)) * yiq.yz * saturation;
  yiq.x = (yiq.x - 0.5) * contrast + 0.5;
  vec3 col = yiq2rgb(yiq);
  col = floor(col * posterize + 0.5) / posterize;
  col += (hash(gl_FragCoord.xy + fract(TIME) * 91.0) - 0.5) * grit * 0.3;
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
