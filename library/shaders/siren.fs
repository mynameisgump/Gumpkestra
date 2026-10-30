/*{
  "DESCRIPTION": "Rotating warning beacon sweeping a hazy, dark room. Strobes on the beat.",
  "CREDIT": "Gumpkestra",
  "CATEGORIES": ["Generator", "Industrial"],
  "INPUTS": [
    { "NAME": "speed", "TYPE": "float", "DEFAULT": 0.6, "MIN": 0.0, "MAX": 3.0, "LABEL": "Spin (rev/s)" },
    { "NAME": "beams", "TYPE": "float", "DEFAULT": 2.0, "MIN": 1.0, "MAX": 6.0 },
    { "NAME": "width", "TYPE": "float", "DEFAULT": 0.3, "MIN": 0.05, "MAX": 1.0, "LABEL": "Beam width" },
    { "NAME": "haze", "TYPE": "float", "DEFAULT": 0.8, "MIN": 0.0, "MAX": 1.5 },
    { "NAME": "strobe", "TYPE": "float", "DEFAULT": 0.4, "MIN": 0.0, "MAX": 1.0, "LABEL": "Beat strobe" },
    { "NAME": "position", "TYPE": "point2D", "DEFAULT": [0.5, 0.8], "MIN": [0.0, 0.0], "MAX": [1.0, 1.0] },
    { "NAME": "lampColor", "TYPE": "color", "DEFAULT": [1.0, 0.07, 0.02, 1.0] }
  ]
}*/

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * vnoise(p); p = p * 2.03 + 1.7; a *= 0.5; }
  return v;
}

void main() {
  vec2 p = (isf_FragNormCoord - position) * vec2(RENDERSIZE.x / RENDERSIZE.y, 1.0);
  float spin = TIME * speed * 6.28318;
  float nb = floor(beams);
  float a = atan(p.y, p.x);
  float dist = length(p);

  float beam = pow(max(cos((a - spin) * nb), 0.0), 1.0 / (width * width));
  float fog = fbm(p * 2.5 + vec2(TIME * 0.15, -TIME * 0.05));
  float shaft = beam * (0.3 + fog * 1.2) * haze / (1.0 + dist * 2.5);
  float lamp = exp(-dist * 30.0) * 2.0 + exp(-dist * 6.0) * 0.3;
  float flash = pow(0.5 + 0.5 * cos(spin * nb), 12.0) * 0.25;
  float wall = 0.4 + fbm(p * 8.0) * 0.6;

  vec3 col = lampColor.rgb * (shaft + lamp + flash * wall + 0.02 * wall);
  col *= 1.0 - smoothstep(0.05, 0.0, abs(p.y - 0.04)) * step(abs(p.x), 0.06) * 0.8;
  col += vec3(1.0, 0.95, 0.9) * pow(AUDIO_BEAT, 3.0) * strobe * 0.7;
  gl_FragColor = vec4(col, 1.0);
}
