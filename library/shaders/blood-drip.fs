/*{
  "DESCRIPTION": "Blood runs down the screen. Beats pour new drips from the top; 'bleed' makes bright areas weep.",
  "CREDIT": "Gumpkestra",
  "CATEGORIES": ["Effect", "Biological", "Feedback"],
  "INPUTS": [
    { "NAME": "inputImage", "TYPE": "image" },
    { "NAME": "pour", "TYPE": "float", "DEFAULT": 0.5, "MIN": 0.0, "MAX": 1.0, "LABEL": "Beat pour" },
    { "NAME": "bleed", "TYPE": "float", "DEFAULT": 0.0, "MIN": 0.0, "MAX": 1.0, "LABEL": "Bleed from highlights" },
    { "NAME": "threshold", "TYPE": "float", "DEFAULT": 0.8, "MIN": 0.0, "MAX": 1.0 },
    { "NAME": "speed", "TYPE": "float", "DEFAULT": 0.4, "MIN": 0.0, "MAX": 1.0 },
    { "NAME": "columns", "TYPE": "float", "DEFAULT": 90.0, "MIN": 20.0, "MAX": 300.0, "LABEL": "Drip density" },
    { "NAME": "dry", "TYPE": "float", "DEFAULT": 0.15, "MIN": 0.0, "MAX": 1.0, "LABEL": "Dry speed" },
    { "NAME": "gloss", "TYPE": "float", "DEFAULT": 0.6, "MIN": 0.0, "MAX": 1.5 },
    { "NAME": "bloodColor", "TYPE": "color", "DEFAULT": [0.45, 0.0, 0.02, 1.0] }
  ],
  "PASSES": [
    { "TARGET": "blood", "PERSISTENT": true, "FLOAT": true },
    {}
  ]
}*/

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void main() {
  vec2 uv = isf_FragNormCoord;
  if (PASSINDEX == 0) {
    float col = floor(uv.x * columns);
    float profile = smoothstep(0.5, 0.15, abs(fract(uv.x * columns) - 0.5));
    // Each column flows at its own speed, which changes every so often: drips stall and start.
    float colSpeed = pow(hash(vec2(col, floor(TIME * 0.7 + hash(vec2(col, 1.0)) * 10.0))), 3.0);
    float v = colSpeed * speed * TIMEDELTA * 0.8;
    float here = IMG_NORM_PIXEL(blood, uv).r;
    float above = IMG_NORM_PIXEL(blood, uv + vec2(0.0, v)).r;
    float b = max(here * (1.0 - dry * TIMEDELTA * 0.5), above * 0.997);

    float spawn = step(1.0 - pour * 0.5, hash(vec2(col, float(BEAT_COUNT)))) * smoothstep(0.96, 1.0, uv.y) * step(0.5, AUDIO_BEAT);
    float lum = dot(IMG_NORM_PIXEL(inputImage, uv).rgb, vec3(0.299, 0.587, 0.114));
    float weep = step(threshold, lum) * step(1.0 - bleed * 0.1, hash(vec2(col, floor(TIME * 4.0))));
    b = max(b, max(spawn, weep) * profile);
    gl_FragColor = vec4(b, 0.0, 0.0, 1.0);
    return;
  }

  vec2 px = 2.0 / RENDERSIZE;
  float b = IMG_NORM_PIXEL(blood, uv).r;
  float bx = IMG_NORM_PIXEL(blood, uv + vec2(px.x, 0.0)).r;
  float by = IMG_NORM_PIXEL(blood, uv + vec2(0.0, px.y)).r;
  vec3 n = normalize(vec3((b - bx) * 4.0, (b - by) * 4.0, 1.0));
  float spec = pow(max(dot(n, normalize(vec3(-0.5, 0.6, 0.6))), 0.0), 30.0) * gloss;
  float a = smoothstep(0.05, 0.35, b);
  vec3 src = IMG_NORM_PIXEL(inputImage, uv).rgb;
  vec3 col = mix(src, bloodColor.rgb * (0.6 + 0.8 * b), a * 0.95) + spec * a;
  gl_FragColor = vec4(col, 1.0);
}
