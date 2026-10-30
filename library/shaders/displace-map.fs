/*{
  "DESCRIPTION": "Warps the image with a texture used as a displacement map, and can stain it with the texture too. Use any image or video; the built-in Noise or Meat give an organic crawl. Kicks harder on the beat.",
  "CATEGORIES": ["Effect", "Texture", "Distortion"],
  "INPUTS": [
    { "NAME": "inputImage", "TYPE": "image" },
    { "NAME": "map", "TYPE": "image", "DEFAULT": "@noise", "LABEL": "Displacement map" },
    { "NAME": "amount", "TYPE": "float", "DEFAULT": 0.025, "MIN": 0.0, "MAX": 0.25 },
    { "NAME": "beatKick", "TYPE": "float", "DEFAULT": 0.04, "MIN": 0.0, "MAX": 0.25, "LABEL": "Beat kick" },
    { "NAME": "scale", "TYPE": "float", "DEFAULT": 1.0, "MIN": 0.25, "MAX": 8.0, "LABEL": "Map scale" },
    { "NAME": "scroll", "TYPE": "point2D", "DEFAULT": [0.0, 0.03], "MIN": [-0.5, -0.5], "MAX": [0.5, 0.5], "LABEL": "Map scroll (/s)" },
    { "NAME": "mode", "TYPE": "long", "DEFAULT": 0, "VALUES": [0, 1], "LABELS": ["Crawl (two-way)", "Radial (bulge)"] },
    { "NAME": "stain", "TYPE": "float", "DEFAULT": 0.0, "MIN": 0.0, "MAX": 1.0, "LABEL": "Stain with map" }
  ]
}*/

float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

void main() {
  vec2 uv = isf_FragNormCoord;
  vec2 mp = (uv - 0.5) * vec2(RENDERSIZE.x / RENDERSIZE.y, 1.0) * scale + TIME * scroll;
  vec4 m = IMG_NORM_PIXEL(map, mp);
  float l = luma(m.rgb);
  vec2 d;
  if (mode == 0) {
    // Two decorrelated reads so a greyscale map still pushes in both directions.
    d = vec2(l, luma(IMG_NORM_PIXEL(map, mp + vec2(0.37, 0.61)).rgb)) - 0.5;
  } else {
    d = normalize(uv - 0.5 + 1e-5) * (l - 0.5);
  }
  float amt = amount + beatKick * AUDIO_BEAT;
  vec4 c = IMG_NORM_PIXEL(inputImage, uv + d * 2.0 * amt);
  c.rgb = mix(c.rgb, c.rgb * m.rgb * 1.8, stain);
  gl_FragColor = vec4(c.rgb, 1.0);
}
