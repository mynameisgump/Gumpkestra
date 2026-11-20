/*{
  "DESCRIPTION": "Stained cells under a microscope. Blobs merge and split like mitosis, jitter with the treble and swell with the bass. Blend an image or video into the cells with Texture amount.",
  "CREDIT": "Gumpkestra",
  "CATEGORIES": ["Generator", "Biological"],
  "INPUTS": [
    { "NAME": "tex", "TYPE": "image", "GROUP": "Texture", "LABEL": "Cell texture", "DESCRIPTION": "Image or video blended inside each cell", "DEFAULT": "@meat" },
    { "NAME": "textureAmount", "TYPE": "float", "GROUP": "Texture", "LABEL": "Texture amount", "DESCRIPTION": "Blend strength of texture inside cells", "DEFAULT": 0, "MIN": 0, "MAX": 1 },
    { "NAME": "textureScale", "TYPE": "float", "GROUP": "Texture", "LABEL": "Texture scale", "DESCRIPTION": "Repetition scale of texture inside each cell", "DEFAULT": 1, "MIN": 0.2, "MAX": 8 },
    { "NAME": "scale", "TYPE": "float", "GROUP": "Cells", "LABEL": "Zoom out", "DESCRIPTION": "Field-of-view zoom (higher = smaller, more cells)", "DEFAULT": 6, "MIN": 2, "MAX": 16 },
    { "NAME": "density", "TYPE": "float", "GROUP": "Cells", "LABEL": "Density", "DESCRIPTION": "How packed the cells are", "DEFAULT": 0.7, "MIN": 0, "MAX": 1 },
    { "NAME": "size", "TYPE": "float", "GROUP": "Cells", "LABEL": "Cell size", "DESCRIPTION": "Base radius of each metaball cell", "DEFAULT": 0.45, "MIN": 0.2, "MAX": 0.8 },
    { "NAME": "writhe", "TYPE": "float", "GROUP": "Motion", "LABEL": "Writhe", "DESCRIPTION": "Organic drifting motion of cells", "DEFAULT": 0.4, "MIN": 0, "MAX": 1 },
    { "NAME": "jitter", "TYPE": "float", "GROUP": "Motion", "LABEL": "Jitter", "DESCRIPTION": "High-frequency trembling jitter", "DEFAULT": 0, "MIN": 0, "MAX": 2, "MODS": [{ "SOURCE": "high", "AMOUNT": 0.3 }] },
    { "NAME": "swell", "TYPE": "float", "GROUP": "Motion", "LABEL": "Swell", "DESCRIPTION": "Cell swelling expansion", "DEFAULT": 0, "MIN": 0, "MAX": 1, "MODS": [{ "SOURCE": "bass", "AMOUNT": 0.5 }] },
    { "NAME": "lens", "TYPE": "float", "GROUP": "Microscope & Color", "LABEL": "Lens radius", "DESCRIPTION": "Circular microscope aperture radius", "DEFAULT": 0.48, "MIN": 0.3, "MAX": 1 },
    { "NAME": "stain", "TYPE": "color", "GROUP": "Microscope & Color", "LABEL": "Stain", "DESCRIPTION": "Cell membrane and cytoplasm dye colour", "DEFAULT": [0.6, 0.25, 0.65, 1] },
    { "NAME": "nucleusColor", "TYPE": "color", "GROUP": "Microscope & Color", "LABEL": "Nucleus colour", "DESCRIPTION": "Colour of the dark cell nuclei", "DEFAULT": [0.18, 0.04, 0.32, 1] },
    { "NAME": "background", "TYPE": "color", "GROUP": "Microscope & Color", "LABEL": "Background", "DESCRIPTION": "Backlit microscope slide colour", "DEFAULT": [0.92, 0.86, 0.8, 1] }
  ]
}*/

vec2 hash2(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453);
}

float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash2(i).x, hash2(i + vec2(1.0, 0.0)).x, u.x),
             mix(hash2(i + vec2(0.0, 1.0)).x, hash2(i + vec2(1.0, 1.0)).x, u.x), u.y);
}

void main() {
  vec2 uv = (isf_FragNormCoord - 0.5) * vec2(RENDERSIZE.x / RENDERSIZE.y, 1.0);
  vec2 p = uv * scale + vec2(TIME * 0.04, TIME * 0.02);
  vec2 n = floor(p), f = fract(p);

  float field = 0.0;
  float nuc = 0.0;
  vec4 cellTexture = vec4(0.0);
  vec2 texDx = dFdx(p) * textureScale;
  vec2 texDy = dFdy(p) * textureScale;
  for (int j = -1; j <= 1; j++)
  for (int i = -1; i <= 1; i++) {
    vec2 g = vec2(float(i), float(j));
    vec2 cell = n + g;
    vec2 h = hash2(cell);
    if (h.x > density) continue;
    vec2 o = 0.5 + 0.35 * sin(TIME * (0.3 + h) * writhe * 2.0 + 6.2831 * h);
    o += (hash2(cell + floor(TIME * 20.0)) - 0.5) * jitter * 0.08;
    vec2 rel = g + o - f;
    float rad = size * (0.7 + 0.6 * h.y) * (1.0 + swell * 0.35);
    float a = atan(rel.y, rel.x);
    rad *= 1.0 + 0.12 * sin(a * 3.0 + TIME * 2.0 * writhe + h.x * 20.0) * writhe;
    float d = length(rel);
    float weight = exp(-d * d / (rad * rad) * 1.5);
    field += weight;
    if (textureAmount > 0.0) {
      // Local coordinates keep the image upright and attached to each moving cell.
      // Explicit gradients keep mip selection stable across cell boundaries.
      float diameter = 2.0 * rad;
      vec2 cellUV = 0.5 - rel * textureScale / diameter;
      vec4 sampleColor = textureGrad(tex, cellUV, texDx / diameter, texDy / diameter);
      cellTexture += vec4(sampleColor.rgb * sampleColor.a, sampleColor.a) * weight;
    }
    vec2 wob = 0.12 * rad * vec2(sin(h.x * 9.0 + TIME), cos(h.y * 7.0 + TIME));
    nuc = max(nuc, smoothstep(0.3, 0.24, length(rel - wob) / rad));
  }

  float body = smoothstep(0.45, 0.55, field);
  float membrane = smoothstep(0.09, 0.0, abs(field - 0.5));
  float gran = vnoise(p * 9.0);

  vec3 col = background.rgb * (0.88 + 0.12 * vnoise(p * 20.0));
  col = mix(col, stain.rgb * (0.75 + 0.5 * gran), body * 0.85);
  // Blend overlapping cells smoothly; transparent texels retain the original stain.
  vec3 textureColor = cellTexture.rgb / max(cellTexture.a, 1e-5);
  float textureAlpha = cellTexture.a / max(field, 1e-5);
  col = mix(col, textureColor * (0.75 + 0.5 * gran), body * textureAmount * textureAlpha);
  col = mix(col, stain.rgb * 0.35, membrane);
  col = mix(col, nucleusColor.rgb * (0.8 + gran * 0.4), nuc * body);

  // Microscope eyepiece: circular field with chromatic fringe.
  float rr = length(uv);
  float lensMask = smoothstep(lens, lens - 0.02, rr);
  vec3 fringe = vec3(0.2, 0.4, 1.0) * smoothstep(0.02, 0.0, abs(rr - lens + 0.015)) * 0.5;
  col = col * lensMask * (1.0 - smoothstep(lens * 0.6, lens, rr) * 0.35) + fringe;
  gl_FragColor = vec4(col, 1.0);
}
