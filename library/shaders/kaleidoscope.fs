/*{
  "DESCRIPTION": "Radial mirror segments.",
  "CREDIT": "Gumpkestra",
  "CATEGORIES": ["Effect", "Geometry"],
  "INPUTS": [
    { "NAME": "inputImage", "TYPE": "image" },
    { "NAME": "segments", "TYPE": "float", "GROUP": "Symmetry", "LABEL": "Segments", "DESCRIPTION": "Number of mirrored radial wedges", "DEFAULT": 6, "MIN": 1, "MAX": 24 },
    { "NAME": "rotation", "TYPE": "float", "GROUP": "Transform", "LABEL": "Rotation", "DESCRIPTION": "Rotate the kaleidoscope pattern", "DEFAULT": 0, "MIN": 0, "MAX": 1 },
    { "NAME": "zoom", "TYPE": "float", "GROUP": "Transform", "LABEL": "Zoom", "DESCRIPTION": "Scale the sampled image inside the wedges", "DEFAULT": 1, "MIN": 0.25, "MAX": 4 },
    { "NAME": "center", "TYPE": "point2D", "GROUP": "Symmetry", "LABEL": "Centre", "DESCRIPTION": "Focal centre point of the mirror wedges", "DEFAULT": [0.5, 0.5], "MIN": [0, 0], "MAX": [1, 1] }
  ]
}*/

void main() {
  float aspect = RENDERSIZE.x / RENDERSIZE.y;
  vec2 p = isf_FragNormCoord - 0.5;
  p.x *= aspect;
  float r = length(p) / zoom;
  float seg = 6.28318 / max(floor(segments), 1.0);
  float a = mod(atan(p.y, p.x) + rotation * 6.28318, seg);
  a = abs(a - seg * 0.5);
  vec2 q = vec2(cos(a), sin(a)) * r;
  q.x /= aspect;
  q += center;
  q = 1.0 - abs(1.0 - mod(q, 2.0)); // mirrored wrap
  gl_FragColor = IMG_NORM_PIXEL(inputImage, q);
}
