/*{
  "DESCRIPTION": "Shows a texture: an image or looping video from library/textures, a built-in, or the layers below. Fit, tile, scroll, spin, and pulse on the beat. Transparent outside the picture in Contain mode.",
  "CATEGORIES": ["Generator", "Texture"],
  "INPUTS": [
    { "NAME": "tex", "TYPE": "image", "DEFAULT": "@meat", "LABEL": "Texture", "TILE_SEQUENCE": true },
    { "NAME": "fit", "TYPE": "long", "DEFAULT": 1, "VALUES": [0, 1, 2, 3], "LABELS": ["Contain", "Cover", "Stretch", "Tile"] },
    { "NAME": "zoom", "TYPE": "float", "DEFAULT": 1.0, "MIN": 0.25, "MAX": 4.0 },
    { "NAME": "pulse", "TYPE": "float", "DEFAULT": 0.0, "MIN": 0.0, "MAX": 0.5, "LABEL": "Pulse", "MODS": [{ "SOURCE": "beat", "AMOUNT": 0.12 }] },
    { "NAME": "rotate", "TYPE": "float", "DEFAULT": 0.0, "MIN": -180.0, "MAX": 180.0, "LABEL": "Rotate°" },
    { "NAME": "spin", "TYPE": "float", "DEFAULT": 0.0, "MIN": -0.5, "MAX": 0.5, "LABEL": "Spin (rev/s)" },
    { "NAME": "offset", "TYPE": "point2D", "DEFAULT": [0.0, 0.0], "MIN": [-1.0, -1.0], "MAX": [1.0, 1.0] },
    { "NAME": "scroll", "TYPE": "point2D", "DEFAULT": [0.0, 0.0], "MIN": [-0.5, -0.5], "MAX": [0.5, 0.5], "LABEL": "Scroll (/s)" },
    { "NAME": "brightness", "TYPE": "float", "DEFAULT": 1.0, "MIN": 0.0, "MAX": 3.0 },
    { "NAME": "tint", "TYPE": "color", "DEFAULT": [1.0, 1.0, 1.0, 1.0] }
  ]
}*/

void main() {
  float sa = RENDERSIZE.x / RENDERSIZE.y;
  vec2 img = IMG_SIZE(tex);
  float ia = img.x / max(img.y, 1.0);

  // Screen space with height 1, centred.
  vec2 p = (isf_FragNormCoord - 0.5) * vec2(sa, 1.0);
  p /= zoom * (1.0 + pulse);
  float a = radians(rotate) + TIME * spin * 6.2831853;
  p = mat2(cos(a), sin(a), -sin(a), cos(a)) * p;

  // Size of the picture on screen for each fit mode.
  vec2 size;
  if (fit == 0) size = sa > ia ? vec2(ia, 1.0) : vec2(sa, sa / ia);       // contain
  else if (fit == 1) size = sa > ia ? vec2(sa, sa / ia) : vec2(ia, 1.0);  // cover
  else if (fit == 2) size = vec2(sa, 1.0);                                // stretch
  else size = vec2(ia, 1.0);                                              // tile

  vec2 uv = p / size + 0.5 - offset - TIME * scroll;
  float inside = fit == 0 ? step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0) : 1.0;
  vec4 c = IMG_NORM_PIXEL(tex, fract(uv));
  if (fit == 3 && tex_tileCount > 0) {
    // Advance across columns and rows; positive modulo also handles backwards scrolling.
    float tile = mod(floor(uv.x) + floor(uv.y), float(tex_tileCount));
    vec2 local = fract(uv);
    vec2 tileSize = vec2(textureSize(tex_tiles, 0).xy);
    // Wrap the four bilinear taps within this tile, avoiding seams at repeated edges.
    vec2 pixel = local * tileSize - 0.5;
    vec2 base = floor(pixel), f = fract(pixel);
    vec2 a = (mod(base, tileSize) + 0.5) / tileSize;
    vec2 b = (mod(base + 1.0, tileSize) + 0.5) / tileSize;
    c = mix(mix(texture(tex_tiles, vec3(a, tile)), texture(tex_tiles, vec3(b.x, a.y, tile)), f.x),
            mix(texture(tex_tiles, vec3(a.x, b.y, tile)), texture(tex_tiles, vec3(b, tile)), f.x), f.y);
  }
  gl_FragColor = vec4(c.rgb * tint.rgb * brightness, c.a * inside);
}
