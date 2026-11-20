/*{
  "DESCRIPTION": "Hue rotate, saturation, contrast, exposure. Put an LFO on hue for colour cycling.",
  "CREDIT": "Gumpkestra",
  "CATEGORIES": ["Effect", "Color"],
  "INPUTS": [
    { "NAME": "inputImage", "TYPE": "image" },
    { "NAME": "hue", "TYPE": "float", "GROUP": "Color", "LABEL": "Hue", "DESCRIPTION": "Rotate all colours around the hue wheel", "DEFAULT": 0, "MIN": 0, "MAX": 1 },
    { "NAME": "saturation", "TYPE": "float", "GROUP": "Color", "LABEL": "Saturation", "DESCRIPTION": "Colour intensity (0 = greyscale)", "DEFAULT": 1, "MIN": 0, "MAX": 2.5 },
    { "NAME": "contrast", "TYPE": "float", "GROUP": "Tone", "LABEL": "Contrast", "DESCRIPTION": "Expand or compress midtone contrast", "DEFAULT": 1, "MIN": 0.3, "MAX": 2.5 },
    { "NAME": "exposure", "TYPE": "float", "GROUP": "Tone", "LABEL": "Exposure", "DESCRIPTION": "Brightness shift in stops", "DEFAULT": 0, "MIN": -2, "MAX": 2 },
    { "NAME": "invert", "TYPE": "bool", "GROUP": "Color", "LABEL": "Invert", "DESCRIPTION": "Invert output RGB colours", "DEFAULT": false }
  ]
}*/

vec3 hueShift(vec3 c, float h) {
  const mat3 toYIQ = mat3(0.299, 0.596, 0.211, 0.587, -0.274, -0.523, 0.114, -0.322, 0.312);
  const mat3 toRGB = mat3(1.0, 1.0, 1.0, 0.956, -0.272, -1.106, 0.621, -0.647, 1.703);
  vec3 yiq = toYIQ * c;
  float a = h * 6.28318;
  float cs = cos(a), sn = sin(a);
  yiq.yz = mat2(cs, sn, -sn, cs) * yiq.yz;
  return toRGB * yiq;
}

void main() {
  vec3 c = IMG_THIS_PIXEL(inputImage).rgb;
  c = hueShift(c, hue);
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, saturation);
  c = (c - 0.5) * contrast + 0.5;
  c *= exp2(exposure);
  if (invert) c = 1.0 - c;
  gl_FragColor = vec4(max(c, 0.0), 1.0);
}
