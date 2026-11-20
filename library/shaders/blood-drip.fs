/*{
  "DESCRIPTION": "Blood runs down the screen. Beats pour new drips from the top; 'bleed' makes bright areas weep.",
  "CREDIT": "Gumpkestra",
  "CATEGORIES": ["Effect", "Biological", "Feedback"],
  "INPUTS": [
    { "NAME": "inputImage", "TYPE": "image" },
    { "NAME": "pour", "TYPE": "float", "GROUP": "Sources", "LABEL": "Beat pour", "DESCRIPTION": "Amount of new drips spawned along the top edge on beats", "DEFAULT": 0.5, "MIN": 0, "MAX": 1 },
    { "NAME": "bleed", "TYPE": "float", "GROUP": "Sources", "LABEL": "Bleed highlights", "DESCRIPTION": "Rate at which bright areas weep blood", "DEFAULT": 0, "MIN": 0, "MAX": 1 },
    { "NAME": "threshold", "TYPE": "float", "GROUP": "Sources", "LABEL": "Threshold", "DESCRIPTION": "Minimum brightness required to bleed", "DEFAULT": 0.8, "MIN": 0, "MAX": 1 },
    { "NAME": "speed", "TYPE": "float", "GROUP": "Flow", "LABEL": "Speed", "DESCRIPTION": "Downward drip flow speed", "DEFAULT": 0.4, "MIN": 0, "MAX": 1 },
    { "NAME": "columns", "TYPE": "float", "GROUP": "Flow", "LABEL": "Drip density", "DESCRIPTION": "Number of vertical drip columns across the screen", "DEFAULT": 90, "MIN": 20, "MAX": 300 },
    { "NAME": "dry", "TYPE": "float", "GROUP": "Flow", "LABEL": "Dry speed", "DESCRIPTION": "How quickly trails fade and dry out", "DEFAULT": 0.15, "MIN": 0, "MAX": 1 },
    { "NAME": "gloss", "TYPE": "float", "GROUP": "Surface", "LABEL": "Gloss", "DESCRIPTION": "Wet specular shine along drip edges", "DEFAULT": 0.6, "MIN": 0, "MAX": 1.5 },
    { "NAME": "bloodColor", "TYPE": "color", "GROUP": "Surface", "LABEL": "Blood colour", "DESCRIPTION": "Tint of the liquid drips", "DEFAULT": [0.45, 0, 0.02, 1] }
  ],
  "PASSES": [
    { "TARGET": "blood", "PERSISTENT": true, "FLOAT": true },
    {  }
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
