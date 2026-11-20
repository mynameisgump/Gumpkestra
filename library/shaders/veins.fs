/*{
  "DESCRIPTION": "Living veins under translucent skin: layered vessels breathe, squirm, split and carry glowing lub-dub blood pulses. Bass swells the vessels, treble wakes the capillaries, and beats send pressure waves outward. Spread grows the network.",
  "CREDIT": "Gumpkestra",
  "CATEGORIES": ["Generator", "Biological"],
  "INPUTS": [
    { "NAME": "scale", "TYPE": "float", "GROUP": "Network", "LABEL": "Scale", "DESCRIPTION": "Zoom scale of the branching vessel network", "DEFAULT": 2.5, "MIN": 0.5, "MAX": 8 },
    { "NAME": "thickness", "TYPE": "float", "GROUP": "Network", "LABEL": "Thickness", "DESCRIPTION": "Width of main blood vessels", "DEFAULT": 0.05, "MIN": 0.005, "MAX": 0.2 },
    { "NAME": "capillaries", "TYPE": "float", "GROUP": "Network", "LABEL": "Capillaries", "DESCRIPTION": "Density of fine secondary capillary branches", "DEFAULT": 0.5, "MIN": 0, "MAX": 1 },
    { "NAME": "spread", "TYPE": "float", "GROUP": "Network", "LABEL": "Spread", "DESCRIPTION": "Growth reach of the network from the centre", "DEFAULT": 1, "MIN": 0, "MAX": 1 },
    { "NAME": "flow", "TYPE": "float", "GROUP": "Motion & Pulse", "LABEL": "Pulse speed", "DESCRIPTION": "Travel speed of blood pulses along vessels", "DEFAULT": 0.65, "MIN": 0, "MAX": 3 },
    { "NAME": "surge", "TYPE": "float", "GROUP": "Audio", "LABEL": "Beat surge", "DESCRIPTION": "Outward pressure wave strength on beats", "DEFAULT": 0.8, "MIN": 0, "MAX": 2 },
    { "NAME": "writhe", "TYPE": "float", "GROUP": "Motion & Pulse", "LABEL": "Writhe", "DESCRIPTION": "How far vessels bend and squirm", "DEFAULT": 0.35, "MIN": 0, "MAX": 1 },
    { "NAME": "motionSpeed", "TYPE": "float", "GROUP": "Motion & Pulse", "LABEL": "Motion speed", "DESCRIPTION": "Speed of vessel writhing motion (0 = still)", "DEFAULT": 0.8, "MIN": 0, "MAX": 3 },
    { "NAME": "pulse", "TYPE": "float", "GROUP": "Motion & Pulse", "LABEL": "Vessel pulse", "DESCRIPTION": "Vessel dilation strength as pulses pass", "DEFAULT": 0.65, "MIN": 0, "MAX": 1 },
    { "NAME": "audioResponse", "TYPE": "float", "GROUP": "Audio", "LABEL": "Audio response", "DESCRIPTION": "Bass vessel swelling and treble capillary activity", "DEFAULT": 0.6, "MIN": 0, "MAX": 1 },
    { "NAME": "skinColor", "TYPE": "color", "GROUP": "Color", "LABEL": "Skin colour", "DESCRIPTION": "Translucent skin background colour", "DEFAULT": [0.12, 0.07, 0.07, 1] },
    { "NAME": "veinColor", "TYPE": "color", "GROUP": "Color", "LABEL": "Vein colour", "DESCRIPTION": "Resting colour of vessels", "DEFAULT": [0.3, 0.03, 0.14, 1] },
    { "NAME": "bloodColor", "TYPE": "color", "GROUP": "Color", "LABEL": "Blood colour", "DESCRIPTION": "Glowing colour of travelling blood pulses", "DEFAULT": [1, 0.08, 0.04, 1] }
  ]
}*/

const mat2 ROT = mat2(0.8, 0.6, -0.6, 0.8);
const mat2 ROT_T = mat2(0.8, -0.6, 0.6, 0.8);

float hash3(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.x + p.y) * p.z);
}

// 3D value noise returning vec3(value, d/dx, d/dy) analytically (no 2x2 dFdx block artifacts).
vec3 vnoise3d(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  vec2 du = 6.0 * f.xy * (1.0 - f.xy);

  float a = hash3(i);
  float b = hash3(i + vec3(1.0, 0.0, 0.0));
  float c = hash3(i + vec3(0.0, 1.0, 0.0));
  float d = hash3(i + vec3(1.0, 1.0, 0.0));
  float e = hash3(i + vec3(0.0, 0.0, 1.0));
  float f1 = hash3(i + vec3(1.0, 0.0, 1.0));
  float g = hash3(i + vec3(0.0, 1.0, 1.0));
  float h = hash3(i + vec3(1.0, 1.0, 1.0));

  float k0 = a;
  float k1 = b - a;
  float k2 = c - a;
  float k3 = e - a;
  float k4 = a - b - c + d;
  float k5 = a - c - e + g;
  float k6 = a - b - e + f1;
  float k7 = -a + b + c - d + e - f1 - g + h;

  float val = k0 + k1 * u.x + k2 * u.y + k3 * u.z
            + k4 * u.x * u.y + k5 * u.y * u.z + k6 * u.z * u.x
            + k7 * u.x * u.y * u.z;
  float dx = du.x * (k1 + k4 * u.y + k6 * u.z + k7 * u.y * u.z);
  float dy = du.y * (k2 + k5 * u.z + k4 * u.x + k7 * u.z * u.x);
  return vec3(val, dx, dy);
}

// Centered 2-octave scalar 3D FBM for smooth domain warping and dermal texture.
float fbm2(vec3 p) {
  float v = 0.5 * vnoise3d(p).x;
  p.xy = ROT * p.xy * 2.02 + vec2(3.3, 5.1);
  p.z = p.z * 1.4 + 2.7;
  v += 0.25 * vnoise3d(p).x;
  return (v - 0.375) * 3.0;
}

// Centered 3- and 4-octave 3D FBM returning vec3(value, gradX, gradY) for smooth tubular veins.
vec3 fbm3d(vec3 p) {
  float v = 0.0, a = 0.5, gScale = 1.0;
  vec2 g = vec2(0.0);
  mat2 jt = mat2(1.0, 0.0, 0.0, 1.0);
  for (int i = 0; i < 3; i++) {
    vec3 n = vnoise3d(p);
    v += a * n.x;
    g += (a * gScale) * (jt * n.yz);
    p.xy = ROT * p.xy * 2.03 + vec2(1.7, 9.2);
    p.z = p.z * 1.42 + 3.1;
    jt = jt * ROT_T;
    gScale *= 2.03;
    a *= 0.5;
  }
  return vec3((v - 0.4375) * 2.8, g * 2.8);
}

vec3 fbm4d(vec3 p) {
  float v = 0.0, a = 0.5, gScale = 1.0;
  vec2 g = vec2(0.0);
  mat2 jt = mat2(1.0, 0.0, 0.0, 1.0);
  for (int i = 0; i < 4; i++) {
    vec3 n = vnoise3d(p);
    v += a * n.x;
    // Dampen the highest octave's gradient contribution slightly so vessel width stays organic.
    float gw = (i == 3) ? 0.45 : 1.0;
    g += (a * gScale * gw) * (jt * n.yz);
    p.xy = ROT * p.xy * 2.02 + vec2(1.7, 9.2);
    p.z = p.z * 1.45 + 3.1;
    jt = jt * ROT_T;
    gScale *= 2.02;
    a *= 0.5;
  }
  return vec3((v - 0.46875) * 2.6, g * 2.6);
}

// Analytical distance to the zero contour in pattern units — silky smooth, zero blotches.
float tubeDist(vec3 fg, float floorGrad) {
  return abs(fg.x) / sqrt(dot(fg.yz, fg.yz) + floorGrad * floorGrad);
}

void main() {
  vec2 uv = (isf_FragNormCoord - 0.5) * vec2(RENDERSIZE.x / RENDERSIZE.y, 1.0);
  float r = length(uv);
  float t = TIME * motionSpeed;
  float flowT = TIME * flow;
  float flowOn = smoothstep(0.0, 0.08, flow);
  float bassBoost = AUDIO_BASS * audioResponse;
  float highBoost = AUDIO_HIGH * audioResponse;

  // Continuous lub-dub heartbeat rhythm that swells the membrane and sends blood outward.
  float beatCycle = fract(flowT * 0.45);
  float lub = exp(-pow((beatCycle - 0.12) * 9.0, 2.0));
  float dub = exp(-pow((beatCycle - 0.28) * 11.0, 2.0)) * 0.65;
  float heart = (lub + dub) * pulse * flowOn;

  // Living tissue breath + heartbeat expansion around the centre.
  float breath = 1.0 - (0.028 * sin(t * 1.15) * smoothstep(0.0, 0.05, motionSpeed)
                      + (heart * 0.045 + bassBoost * 0.075) * exp(-r * 1.5));
  vec2 p = uv * scale * breath;

  // Two-stage 3D domain warp bends and twists vessels organically instead of sliding flat noise.
  float wAmp = (0.26 + writhe * 1.5) * (1.0 + bassBoost * 0.65);
  vec2 w1 = vec2(
    fbm2(vec3(p * 0.8 + vec2(t * 0.22, -t * 0.16), t * 0.36)),
    fbm2(vec3(p * 0.8 + vec2(-t * 0.18, t * 0.24) + 5.2, t * 0.36 + 3.7))
  );
  vec2 w2 = vec2(
    fbm2(vec3(p * 1.35 + w1 * 0.75 + vec2(-t * 0.15, t * 0.21), t * 0.5 + 1.9)),
    fbm2(vec3(p * 1.35 + w1 * 0.75 + vec2(t * 0.2, t * 0.14) + 8.4, t * 0.5 + 6.1))
  );
  vec2 warp = (w1 * 0.62 + w2 * 0.52) * wAmp;
  vec2 pw = p + warp;
  pw += (0.05 + writhe * 0.2) * sin(pw.yx * 2.5 + vec2(t * 1.55, -t * 1.2));

  // Three depth layers: deep subsurface veins, primary/secondary surface vessels, fine capillaries.
  float deep = fbm2(vec3(p * 0.62 + w1 * (0.25 + writhe * 0.65), t * 0.24 + 9.4));
  vec3 bigF = fbm4d(vec3(pw, t * 0.4));
  vec3 brF = fbm3d(vec3(pw * 1.7 + vec2(4.1, -2.8) + w2 * (0.35 + writhe * 0.85), t * 0.56 + 4.3));
  vec3 smF = fbm3d(vec3(pw * 3.35 + vec2(7.3, 2.9) + w2.yx * (0.55 + writhe * 1.2), t * 0.88 + 11.2));

  // Travelling blood boluses along organic distorted paths + faster tributary micro-pulses.
  float path = r * 10.0 + (w2.x + deep) * 2.2 + bigF.x * 1.8;
  float phase = path - flowT * 5.4;
  float bolus1 = pow(0.5 + 0.5 * sin(phase), 4.5);
  float bolus2 = pow(0.5 + 0.5 * sin(phase + 1.15), 7.0) * 0.5;
  float wave = clamp(bolus1 + bolus2, 0.0, 1.35) * flowOn;
  float subBolus = pow(0.5 + 0.5 * sin(path * 1.8 - flowT * 8.4 + brF.x * 3.0), 5.0) * flowOn;

  // Outward pressure fronts: continuous heartbeat ripple + explosive beat surge.
  float heartFront = beatCycle * 1.45;
  float heartRing = exp(-abs(r + bigF.x * 0.1 - heartFront) * 9.0) * (1.0 - beatCycle) * pulse * flowOn * 0.6;
  float front = (1.0 - AUDIO_BEAT) * 1.35;
  float ring = exp(-abs(r + bigF.x * 0.14 - front) * 8.5) * AUDIO_BEAT;

  // Peristaltic dilation: vessels visibly swell as blood boluses and beats rush through.
  float pressure = pulse * (wave * 0.85 + heartRing) + bassBoost * 0.7;
  float taper = max(0.2, 1.3 - r * 0.85);
  float th = thickness * 0.62 * taper * (1.0 + pressure * 1.1 + ring * surge * 0.75);
  float aa = scale / max(RENDERSIZE.y, 1.0) * 1.8;

  float growEdge = r + (w1.x * 0.16 + deep * 0.14);
  float grow = (1.0 - smoothstep(spread * 1.25 - 0.18, spread * 1.25, growEdge)) * smoothstep(0.0, 0.05, spread);

  // Soft out-of-focus venous network beneath the skin.
  float deepMask = (1.0 - smoothstep(0.0, th * 6.0 + 0.08, abs(deep))) * grow;

  // Primary vessels with smooth analytical tubular cross-section.
  float dBig = tubeDist(bigF, 0.9);
  float bigLine = (1.0 - smoothstep(th * 0.55, th * 1.15 + aa, dBig)) * grow;
  float bigTube = sqrt(max(0.0, 1.0 - clamp(dBig / max(th * 1.15, 0.001), 0.0, 1.0)));
  float bigCore = (1.0 - smoothstep(0.0, th * 0.42 + aa * 0.6, dBig)) * grow;

  // Secondary branching arteries that dilate independently on sub-pulses.
  float thBr = th * (0.58 + subBolus * pulse * 0.48);
  float dBr = tubeDist(brF, 1.0);
  float brLine = (1.0 - smoothstep(thBr * 0.5, thBr * 1.1 + aa * 1.3, dBr)) * grow * 0.88;
  float brTube = sqrt(max(0.0, 1.0 - clamp(dBr / max(thBr * 1.1, 0.001), 0.0, 1.0)));
  float brCore = (1.0 - smoothstep(0.0, thBr * 0.4 + aa * 0.8, dBr)) * grow * 0.72;

  // Capillaries wake up in propagating waves behind pulses and treble hits.
  float dSm = tubeDist(smF, 1.2);
  float capPulse = 0.42 + 0.58 * clamp(subBolus + wave * 0.55 + heartRing + ring * surge, 0.0, 1.0);
  float capAct = clamp(capillaries * capPulse + capillaries * highBoost * 0.75, 0.0, 1.0);
  float smallLine = (1.0 - smoothstep(0.0, th * 0.34 + aa * 2.2, dSm)) * capAct * grow;

  float veins = max(max(bigLine, brLine), smallLine * 0.72);
  float tube = max(bigTube * bigLine, brTube * brLine * 0.85);
  float halo = ((1.0 - smoothstep(0.0, th * 4.8 + aa * 2.0, dBig)) * 0.42
              + (1.0 - smoothstep(0.0, thBr * 3.8 + aa * 2.0, dBr)) * 0.22) * grow;

  // Translucent skin with breathing dermal relief and warm subsurface flush.
  float dermal = 0.5 + 0.5 * fbm2(vec3(pw * 3.1, t * 0.32 + 14.0));
  float skinShade = 0.56 + dermal * 0.62 + (heart * 0.14 + bassBoost * 0.18) * exp(-r * 1.4);
  vec3 col = skinColor.rgb * skinShade;

  // Deep subsurface vessels and warm scatter bloom through surrounding tissue.
  col = mix(col, veinColor.rgb * 0.72, deepMask * 0.48);
  col += veinColor.rgb * halo * (0.65 + pressure * 0.5);
  col += bloodColor.rgb * halo * (wave * 0.24 + heartRing * 0.28 + ring * surge * 0.45);

  // Surface vessels with darker wall edges and taut tubular ridge shading.
  vec3 vesselBody = veinColor.rgb * (0.52 + tube * 0.88);
  col = mix(col, vesselBody, veins);

  // Luminous blood packets surging along trunks, branches and capillaries.
  float mainFlow = bigLine * (0.14 + wave * 0.95 + heartRing * 0.75 + ring * surge * 1.6);
  float brFlow = brLine * (0.10 + subBolus * 0.85 + wave * 0.35 + ring * surge * 1.25);
  float capFlow = smallLine * (0.18 + subBolus * 0.75 + highBoost * 0.85 + ring * surge * 1.1);
  col += bloodColor.rgb * (mainFlow + brFlow * 0.85 + capFlow * 0.65);

  // Hot lumen highlight along pulsing vessel ridges.
  vec3 coreTint = mix(bloodColor.rgb, vec3(1.0, 0.78, 0.68), 0.35);
  col += coreTint * (bigCore * (wave * 0.5 + ring * surge * 0.6) + brCore * subBolus * 0.35);

  gl_FragColor = vec4(col, 1.0);
}
