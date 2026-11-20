/*{
  "DESCRIPTION": "Milkdrop-style feedback: the previous frame is zoomed, rotated and hue-drifted behind the input.",
  "CREDIT": "Gumpkestra",
  "CATEGORIES": ["Effect", "Feedback"],
  "INPUTS": [
    { "NAME": "inputImage", "TYPE": "image" },
    { "NAME": "feedback", "TYPE": "float", "GROUP": "Feedback", "LABEL": "Feedback", "DESCRIPTION": "Amount of previous frame retained each step", "DEFAULT": 0.88, "MIN": 0, "MAX": 0.99 },
    { "NAME": "zoom", "TYPE": "float", "GROUP": "Transform", "LABEL": "Zoom", "DESCRIPTION": "Per-frame scale factor (> 1 zooms in, < 1 zooms out)", "DEFAULT": 1.015, "MIN": 0.9, "MAX": 1.15 },
    { "NAME": "rotate", "TYPE": "float", "GROUP": "Transform", "LABEL": "Rotate", "DESCRIPTION": "Per-frame spin angle in radians", "DEFAULT": 0, "MIN": -0.1, "MAX": 0.1 },
    { "NAME": "drift", "TYPE": "point2D", "GROUP": "Transform", "LABEL": "Drift", "DESCRIPTION": "Per-frame X/Y translation offset", "DEFAULT": [0, 0], "MIN": [-0.01, -0.01], "MAX": [0.01, 0.01] },
    { "NAME": "hueDrift", "TYPE": "float", "GROUP": "Color", "LABEL": "Hue drift", "DESCRIPTION": "Per-frame hue rotation applied to trails", "DEFAULT": 0.01, "MIN": 0, "MAX": 0.2 }
  ],
  "PASSES": [
    { "TARGET": "trail", "PERSISTENT": true, "FLOAT": true },
    {  }
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
  vec2 uv = isf_FragNormCoord;
  if (PASSINDEX == 0) {
    float aspect = RENDERSIZE.x / RENDERSIZE.y;
    vec2 c = uv - 0.5;
    c.x *= aspect;
    float cs = cos(rotate), sn = sin(rotate);
    c = mat2(cs, sn, -sn, cs) * c / zoom;
    c.x /= aspect;
    vec3 prev = IMG_NORM_PIXEL(trail, c + 0.5 - drift).rgb;
    prev = max(hueShift(prev, hueDrift), 0.0) * feedback;
    vec3 cur = IMG_NORM_PIXEL(inputImage, uv).rgb;
    gl_FragColor = vec4(max(cur, prev), 1.0);
  } else {
    gl_FragColor = vec4(IMG_NORM_PIXEL(trail, uv).rgb, 1.0);
  }
}
