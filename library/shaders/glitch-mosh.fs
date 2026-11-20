/*{
  "DESCRIPTION": "Block displacement + datamosh smear. Blocks re-randomise on every beat; 'smear' holds blocks from previous frames.",
  "CREDIT": "Gumpkestra",
  "CATEGORIES": ["Effect", "Glitch"],
  "INPUTS": [
    { "NAME": "inputImage", "TYPE": "image" },
    { "NAME": "blockSize", "TYPE": "float", "GROUP": "Blocks", "LABEL": "Block size", "DESCRIPTION": "Size of glitch displacement blocks", "DEFAULT": 0.06, "MIN": 0.01, "MAX": 0.3 },
    { "NAME": "amount", "TYPE": "float", "GROUP": "Blocks", "LABEL": "Displace", "DESCRIPTION": "Strength of block UV displacement", "DEFAULT": 0.15, "MIN": 0, "MAX": 1 },
    { "NAME": "smear", "TYPE": "float", "GROUP": "Smear", "LABEL": "Smear", "DESCRIPTION": "Datamosh retention of blocks from previous frames", "DEFAULT": 0.2, "MIN": 0, "MAX": 1 },
    { "NAME": "flow", "TYPE": "float", "GROUP": "Smear", "LABEL": "Smear flow", "DESCRIPTION": "Drift speed of held datamosh smear trails", "DEFAULT": 0.004, "MIN": 0, "MAX": 0.03 },
    { "NAME": "colorGlitch", "TYPE": "float", "GROUP": "Color", "LABEL": "Colour glitch", "DESCRIPTION": "Per-block RGB channel offset and tint corruption", "DEFAULT": 0.3, "MIN": 0, "MAX": 1 },
    { "NAME": "jitter", "TYPE": "float", "GROUP": "Blocks", "LABEL": "Reseed / sec", "DESCRIPTION": "Random block re-seed rate per second (0 = beats only)", "DEFAULT": 0, "MIN": 0, "MAX": 30 }
  ],
  "PASSES": [
    { "TARGET": "mosh", "PERSISTENT": true },
    {  }
  ]
}*/

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
  vec2 uv = isf_FragNormCoord;
  if (PASSINDEX == 1) {
    gl_FragColor = IMG_NORM_PIXEL(mosh, uv);
    return;
  }
  float aspect = RENDERSIZE.x / RENDERSIZE.y;
  vec2 block = floor(uv * vec2(aspect, 1.0) / blockSize);
  float seed = float(BEAT_COUNT) * 13.7 + floor(TIME * jitter);

  float pick = hash(block + seed);
  vec2 off = (vec2(hash(block + seed + 1.3), hash(block + seed + 7.1)) - 0.5) * blockSize * 4.0;
  off *= step(1.0 - amount, pick);

  vec4 cur = IMG_NORM_PIXEL(inputImage, fract(uv + off));
  if (colorGlitch > 0.0 && pick > 1.0 - amount * colorGlitch) {
    cur.rgb = cur.gbr;
  }

  // Datamosh: held blocks keep the previous frame, dragged along a per-block motion vector.
  vec2 motion = (vec2(hash(block + seed + 3.3), hash(block + seed + 5.9)) - 0.5) * flow;
  vec4 prev = IMG_NORM_PIXEL(mosh, uv - motion);
  float hold = step(1.0 - smear, hash(block * 1.7 + seed + 9.2));
  gl_FragColor = vec4(mix(cur.rgb, prev.rgb, hold), 1.0);
}
