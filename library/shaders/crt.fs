/*{
  "DESCRIPTION": "Curved CRT: scanlines, aperture-grille mask, convergence error, rolling hum bar, flicker and vignette.",
  "CREDIT": "Gumpkestra",
  "CATEGORIES": ["Effect", "Retro"],
  "INPUTS": [
    { "NAME": "inputImage", "TYPE": "image" },
    { "NAME": "curvature", "TYPE": "float", "GROUP": "Tube & Screen", "LABEL": "Curvature", "DESCRIPTION": "Barrel distortion simulating curved glass", "DEFAULT": 0.3, "MIN": 0, "MAX": 1 },
    { "NAME": "scanlines", "TYPE": "float", "GROUP": "Scanlines & Mask", "LABEL": "Scanlines", "DESCRIPTION": "Darkness of horizontal scanlines", "DEFAULT": 0.55, "MIN": 0, "MAX": 1 },
    { "NAME": "lineSize", "TYPE": "float", "GROUP": "Scanlines & Mask", "LABEL": "Line size (px)", "DESCRIPTION": "Vertical spacing of scanlines in pixels", "DEFAULT": 3, "MIN": 1, "MAX": 8 },
    { "NAME": "mask", "TYPE": "float", "GROUP": "Scanlines & Mask", "LABEL": "Shadow mask", "DESCRIPTION": "RGB phosphor aperture-grille mask strength", "DEFAULT": 0.3, "MIN": 0, "MAX": 1 },
    { "NAME": "convergence", "TYPE": "float", "GROUP": "Signal", "LABEL": "Convergence", "DESCRIPTION": "Horizontal RGB beam misconvergence offset", "DEFAULT": 0.5, "MIN": 0, "MAX": 2 },
    { "NAME": "hum", "TYPE": "float", "GROUP": "Signal", "LABEL": "Hum bar", "DESCRIPTION": "Scrolling AC power hum band brightness", "DEFAULT": 0.25, "MIN": 0, "MAX": 1 },
    { "NAME": "flicker", "TYPE": "float", "GROUP": "Signal", "LABEL": "Flicker", "DESCRIPTION": "Subtle high-frequency screen brightness flicker", "DEFAULT": 0.2, "MIN": 0, "MAX": 1 },
    { "NAME": "vignette", "TYPE": "float", "GROUP": "Tube & Screen", "LABEL": "Vignette", "DESCRIPTION": "Corner darkening around the bezel", "DEFAULT": 0.5, "MIN": 0, "MAX": 1.5 }
  ]
}*/

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void main() {
  vec2 cc = isf_FragNormCoord - 0.5;
  vec2 uv = cc * (1.0 + dot(cc, cc) * curvature * 0.5) + 0.5;
  vec2 inside = step(vec2(0.0), uv) * step(uv, vec2(1.0));
  if (inside.x * inside.y < 0.5) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }

  float conv = convergence * 0.0015 * (1.0 + length(cc) * 3.0);
  vec3 col = vec3(IMG_NORM_PIXEL(inputImage, uv + vec2(conv, 0.0)).r,
                  IMG_NORM_PIXEL(inputImage, uv).g,
                  IMG_NORM_PIXEL(inputImage, uv - vec2(conv, 0.0)).b);
  vec2 px = 1.5 / RENDERSIZE;
  vec3 halo = IMG_NORM_PIXEL(inputImage, uv + vec2(px.x, 0.0)).rgb + IMG_NORM_PIXEL(inputImage, uv - vec2(px.x, 0.0)).rgb
            + IMG_NORM_PIXEL(inputImage, uv + vec2(0.0, px.y)).rgb + IMG_NORM_PIXEL(inputImage, uv - vec2(0.0, px.y)).rgb;
  col += halo * 0.05;

  float sl = 0.5 + 0.5 * cos(uv.y * RENDERSIZE.y / lineSize * 6.28318);
  col *= (1.0 - scanlines * (1.0 - sl) * 0.75) * (1.0 + scanlines * 0.3);

  float mx = mod(floor(gl_FragCoord.x), 3.0);
  vec3 grille = vec3(mx < 0.5 ? 1.0 : 0.45, (mx > 0.5 && mx < 1.5) ? 1.0 : 0.45, mx > 1.5 ? 1.0 : 0.45);
  col *= mix(vec3(1.0), grille, mask) * (1.0 + mask * 0.45);

  col *= 1.0 + hum * 0.12 * sin((uv.y + TIME * 0.15) * 6.28318);
  col *= 1.0 + flicker * (0.04 * sin(TIME * 377.0) + 0.12 * (hash(vec2(floor(TIME * 30.0), 3.0)) - 0.5));

  float vig = pow(16.0 * uv.x * uv.y * (1.0 - uv.x) * (1.0 - uv.y), vignette * 0.5);
  vec2 edge = smoothstep(vec2(0.0), vec2(0.008), uv) * smoothstep(vec2(0.0), vec2(0.008), 1.0 - uv);
  gl_FragColor = vec4(col * vig * edge.x * edge.y, 1.0);
}
