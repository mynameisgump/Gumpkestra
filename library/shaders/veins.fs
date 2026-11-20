/*{
  "DESCRIPTION": "Living veins under translucent skin: branching vessels writhe, dilate and carry glowing blood pulses. Bass swells the vessels, treble wakes the capillaries, and beats send pressure waves outward. Spread grows the network.",
  "CREDIT": "Gumpkestra",
  "CATEGORIES": ["Generator", "Biological"],
  "INPUTS": [
    { "NAME": "scale", "TYPE": "float", "GROUP": "Network", "LABEL": "Scale", "DESCRIPTION": "Zoom scale of the branching vessel network", "DEFAULT": 2.5, "MIN": 0.5, "MAX": 8 },
    { "NAME": "thickness", "TYPE": "float", "GROUP": "Network", "LABEL": "Thickness", "DESCRIPTION": "Width of main blood vessels", "DEFAULT": 0.05, "MIN": 0.005, "MAX": 0.2 },
    { "NAME": "capillaries", "TYPE": "float", "GROUP": "Network", "LABEL": "Capillaries", "DESCRIPTION": "Density of fine secondary capillary branches", "DEFAULT": 0.5, "MIN": 0, "MAX": 1 },
    { "NAME": "spread", "TYPE": "float", "GROUP": "Network", "LABEL": "Spread", "DESCRIPTION": "Growth reach of the network from the centre", "DEFAULT": 1, "MIN": 0, "MAX": 1 },
    { "NAME": "flow", "TYPE": "float", "GROUP": "Motion & Pulse", "LABEL": "Pulse speed", "DESCRIPTION": "Travel speed of blood pulses along vessels", "DEFAULT": 0.6, "MIN": 0, "MAX": 3 },
    { "NAME": "surge", "TYPE": "float", "GROUP": "Audio", "LABEL": "Beat surge", "DESCRIPTION": "Outward pressure wave strength on beats", "DEFAULT": 0.8, "MIN": 0, "MAX": 2 },
    { "NAME": "writhe", "TYPE": "float", "GROUP": "Motion & Pulse", "LABEL": "Writhe", "DESCRIPTION": "How far vessels bend and squirm", "DEFAULT": 0.2, "MIN": 0, "MAX": 1 },
    { "NAME": "motionSpeed", "TYPE": "float", "GROUP": "Motion & Pulse", "LABEL": "Motion speed", "DESCRIPTION": "Speed of vessel writhing motion (0 = still)", "DEFAULT": 0.65, "MIN": 0, "MAX": 3 },
    { "NAME": "pulse", "TYPE": "float", "GROUP": "Motion & Pulse", "LABEL": "Vessel pulse", "DESCRIPTION": "Vessel dilation strength as pulses pass", "DEFAULT": 0.55, "MIN": 0, "MAX": 1 },
    { "NAME": "audioResponse", "TYPE": "float", "GROUP": "Audio", "LABEL": "Audio response", "DESCRIPTION": "Bass vessel swelling and treble capillary activity", "DEFAULT": 0.6, "MIN": 0, "MAX": 1 },
    { "NAME": "skinColor", "TYPE": "color", "GROUP": "Color", "LABEL": "Skin colour", "DESCRIPTION": "Translucent skin background colour", "DEFAULT": [0.12, 0.07, 0.07, 1] },
    { "NAME": "veinColor", "TYPE": "color", "GROUP": "Color", "LABEL": "Vein colour", "DESCRIPTION": "Resting colour of vessels", "DEFAULT": [0.3, 0.03, 0.14, 1] },
    { "NAME": "bloodColor", "TYPE": "color", "GROUP": "Color", "LABEL": "Blood colour", "DESCRIPTION": "Glowing colour of travelling blood pulses", "DEFAULT": [1, 0.08, 0.04, 1] }
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
  vec2 uv = (isf_FragNormCoord - 0.5) * vec2(RENDERSIZE.x / RENDERSIZE.y, 1.0);
  float r = length(uv);
  float t = TIME * motionSpeed;
  vec2 p = uv * scale;
  // Two moving noise fields bend the vessels locally instead of sliding the whole image.
  vec2 warp = vec2(fbm(p * 1.2 + vec2(t * 0.28, -t * 0.17)),
                   fbm(p * 1.2 + vec2(-t * 0.19, t * 0.23) + 5.0)) - 0.47;
  p += warp * writhe * (2.8 + AUDIO_BASS * audioResponse);
  p += writhe * 0.18 * sin(p.yx * 2.4 + vec2(t, -t * 0.8));

  // Large vessels and finer tributaries evolve at different rates.
  float big = fbm(p) * 2.0 - 1.0;
  float small = fbm(p * 3.0 + 7.0 + warp.yx * writhe * 2.0) * 2.0 - 1.0;

  // Distorted travel coordinates break up the old concentric rings into blood packets.
  float path = r * 12.0 + fbm(p * 1.8) * 5.0;
  float phase = path - TIME * flow * 6.0;
  float wave = pow(0.5 + 0.5 * sin(phase), 8.0);
  float echo = pow(0.5 + 0.5 * sin(phase + 1.2), 12.0) * 0.35;
  float front = (1.0 - AUDIO_BEAT) * 1.2;
  float ring = exp(-abs(r + big * 0.12 - front) * 10.0) * AUDIO_BEAT;
  float pressure = pulse * (wave + echo) + AUDIO_BASS * audioResponse * 0.55;
  float th = thickness * max(0.12, 1.3 - r) * (1.0 + pressure * 0.9 + ring * surge * 0.5);
  // Pixel-width smoothing keeps the finest capillaries from flickering at low resolutions.
  float aa = max(fwidth(big), 0.001);
  float bigLine = 1.0 - smoothstep(th * 0.3, th + aa, abs(big));
  float capillaryActivity = capillaries * (0.65 + 0.35 * sin(phase * 0.7 + small * 8.0));
  capillaryActivity = clamp(capillaryActivity + capillaries * AUDIO_HIGH * audioResponse * 0.6, 0.0, 1.0);
  float smallLine = (1.0 - smoothstep(0.0, th * 0.4 + max(fwidth(small), 0.001), abs(small))) * capillaryActivity;
  float grow = (1.0 - smoothstep(spread * 1.2 - 0.15, spread * 1.2, r + fbm(p * 1.5) * 0.3)) * smoothstep(0.0, 0.05, spread);
  float veins = max(bigLine, smallLine * 0.7) * grow;
  float halo = (1.0 - smoothstep(0.0, th * 5.0 + aa, abs(big))) * grow * 0.35;

  float blood = veins * (0.12 + (wave + echo) * 0.85 + ring * surge * 1.5);
  float core = (1.0 - smoothstep(0.0, th * 0.4 + aa * 0.5, abs(big))) * grow;

  vec3 col = skinColor.rgb * (0.6 + fbm(p * 4.0) * 0.6);
  col += veinColor.rgb * halo;
  col = mix(col, veinColor.rgb, veins);
  col += bloodColor.rgb * blood;
  col += bloodColor.rgb * (core * wave * 0.3 + halo * pressure * 0.25);
  gl_FragColor = vec4(col, 1.0);
}
