/*{
  "DESCRIPTION": "High-voltage Tesla and plasma coil lightning generator. Switch between a radial Plasma Globe with glass contact flares, an open-air Tesla Tower with metallic toroid and copper windings, and a Twin Electrodes spark gap. Branches split directly from each kinked bolt spine; beats trigger voltage surges and live audio drives singing-coil filament vibration.",
  "CREDIT": "Gumpkestra",
  "CATEGORIES": ["Generator", "Electric", "Audio"],
  "INPUTS": [
    { "NAME": "audio", "TYPE": "audio" },
    { "NAME": "mode", "TYPE": "long", "GROUP": "Coil", "LABEL": "Coil mode", "DESCRIPTION": "Plasma Globe (radial glass containment), Tesla Tower (toroid & open-air forks), or Twin Electrodes (arc bridge)", "DEFAULT": 0, "VALUES": [0, 1, 2], "LABELS": ["Plasma Globe", "Tesla Tower", "Twin Electrodes"] },
    { "NAME": "bolts", "TYPE": "float", "GROUP": "Coil", "LABEL": "Bolts", "DESCRIPTION": "Number of primary high-voltage arcs", "DEFAULT": 7, "MIN": 1, "MAX": 12 },
    { "NAME": "reach", "TYPE": "float", "GROUP": "Coil", "LABEL": "Reach", "DESCRIPTION": "Plasma globe radius, tower strike reach, or twin electrode half-gap", "DEFAULT": 0.42, "MIN": 0.14, "MAX": 0.85 },
    { "NAME": "origin", "TYPE": "point2D", "GROUP": "Coil", "LABEL": "Position", "DESCRIPTION": "Screen X/Y centre of the coil", "DEFAULT": [0.5, 0.5], "MIN": [0, 0], "MAX": [1, 1] },
    { "NAME": "electrode", "TYPE": "float", "GROUP": "Coil", "LABEL": "Electrode", "DESCRIPTION": "Visibility and size of the coil hardware and glass shell (0 = pure lightning)", "DEFAULT": 0.85, "MIN": 0, "MAX": 1.5 },
    { "NAME": "thickness", "TYPE": "float", "GROUP": "Arcs", "LABEL": "Thickness", "DESCRIPTION": "Core plasma filament width", "DEFAULT": 0.005, "MIN": 0.001, "MAX": 0.022 },
    { "NAME": "jagged", "TYPE": "float", "GROUP": "Arcs", "LABEL": "Jaggedness", "DESCRIPTION": "Sharp fractal kinks and high-frequency electrical crackle", "DEFAULT": 0.6, "MIN": 0, "MAX": 1.5, "MODS": [{ "SOURCE": "high", "AMOUNT": 0.25 }] },
    { "NAME": "branches", "TYPE": "float", "GROUP": "Arcs", "LABEL": "Branches", "DESCRIPTION": "Intensity and density of forked secondary streamers", "DEFAULT": 0.72, "MIN": 0, "MAX": 1, "MODS": [{ "SOURCE": "mid", "AMOUNT": 0.2 }] },
    { "NAME": "surge", "TYPE": "float", "GROUP": "Arcs", "LABEL": "Voltage surge", "DESCRIPTION": "High-voltage surge thickening arcs, extending reach and driving HDR core flare", "DEFAULT": 0.2, "MIN": 0, "MAX": 2, "MODS": [{ "SOURCE": "beat", "AMOUNT": 0.65 }] },
    { "NAME": "speed", "TYPE": "float", "GROUP": "Motion", "LABEL": "Flow speed", "DESCRIPTION": "Continuous plasma undulation and drift speed", "DEFAULT": 1, "MIN": 0, "MAX": 4 },
    { "NAME": "crackle", "TYPE": "float", "GROUP": "Motion", "LABEL": "Crackle / Restrike", "DESCRIPTION": "How sharply arcs snap, flicker and jump to new ionized breakdown paths", "DEFAULT": 0.55, "MIN": 0, "MAX": 1 },
    { "NAME": "spin", "TYPE": "float", "GROUP": "Motion", "LABEL": "Rotation", "DESCRIPTION": "Angular drift of radial discharge points or rotation of twin electrodes", "DEFAULT": 0.14, "MIN": -2, "MAX": 2 },
    { "NAME": "soundDrive", "TYPE": "float", "GROUP": "Audio", "LABEL": "Singing coil", "DESCRIPTION": "Modulates plasma filaments directly with the live audio waveform", "DEFAULT": 0.45, "MIN": 0, "MAX": 1 },
    { "NAME": "glow", "TYPE": "float", "GROUP": "Color & Glow", "LABEL": "Corona glow", "DESCRIPTION": "Ionized plasma sheath, ozone atmosphere and contact flare strength", "DEFAULT": 1.05, "MIN": 0, "MAX": 2.5 },
    { "NAME": "coreColor", "TYPE": "color", "GROUP": "Color & Glow", "LABEL": "Core colour", "DESCRIPTION": "Hot inner plasma filament colour", "DEFAULT": [0.78, 0.94, 1, 1] },
    { "NAME": "arcColor", "TYPE": "color", "GROUP": "Color & Glow", "LABEL": "Plasma colour", "DESCRIPTION": "Outer ionized corona and streamer colour", "DEFAULT": [0.44, 0.16, 1, 1] },
    { "NAME": "bgColor", "TYPE": "color", "GROUP": "Color & Glow", "LABEL": "Background", "DESCRIPTION": "Dark chamber backdrop when Fill background is enabled", "DEFAULT": [0.015, 0.01, 0.035, 1] },
    { "NAME": "fillBackground", "TYPE": "bool", "GROUP": "Color & Glow", "LABEL": "Fill background", "DESCRIPTION": "Fill dark background (turn off for transparent overlay onto layers below)", "DEFAULT": true }
  ]
}*/

const float PI = 3.14159265;
const float TAU = 6.28318530;

float hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}

float hash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

// Piecewise-linear 1D noise in [-1, 1]: crisp angular segments instead of soft sine curves.
float lnoise(float x) {
  float i = floor(x);
  float f = fract(x);
  return mix(hash11(i), hash11(i + 1.0), f) * 2.0 - 1.0;
}

// Smooth 1D value noise in [-1, 1] for organic low-frequency plasma buoyancy.
float snoise(float x) {
  float i = floor(x);
  float f = fract(x);
  float u = f * f * (3.0 - 2.0 * f);
  return mix(hash11(i), hash11(i + 1.0), u) * 2.0 - 1.0;
}

// 2D value noise and 3-octave FBM for faint ionized ozone atmosphere.
float vnoise2(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
    mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float fbm2(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 m = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 3; i++) {
    v += a * vnoise2(p);
    p = m * p * 2.05 + vec2(1.7, 9.2);
    a *= 0.5;
  }
  return v;
}

vec2 rot2(vec2 v, float a) {
  float c = cos(a), s = sin(a);
  return vec2(c * v.x - s * v.y, s * v.x + c * v.y);
}

float sdSegment(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-5), 0.0, 1.0);
  return length(pa - ba * h);
}

float sdBox(vec2 p, vec2 b) {
  vec2 d = abs(p) - b;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}

// Multi-octave lateral displacement along a bolt segment t in [0, 1].
// Combines smooth thermal buoyancy, piecewise-linear lightning kinks, and singing-coil audio wave.
float boltDisp(
  float t,
  float seed,
  float flowT,
  float snapSeed,
  float jagAmt,
  float amp,
  float freeTip,
  float bow,
  float waveAmt
) {
  float tc = clamp(t, 0.0, 1.0);
  // Anchored envelope is 0 at both ends; free-air envelope is 0 at electrode and whips out toward tip.
  float envAnchor = sin(tc * PI);
  float envFree = sqrt(tc) * (0.35 + 0.65 * tc);
  float env = mix(envAnchor, envFree, freeTip);

  // Smooth large-scale plasma bend + thermal bow.
  float n1 = snoise(tc * 2.4 - flowT * 1.15 + seed * 17.3) * 0.52;

  // Piecewise-linear high-voltage kinks that either flow smoothly (low crackle) or snap to new paths.
  float snapMix = crackle * 0.9;
  float jShift = mix(flowT * 2.1, snapSeed * 11.73, snapMix);
  float n2 = lnoise(tc * 6.2 - flowT * 1.8 + jShift + seed * 31.7) * 0.34;
  float n3 = lnoise(tc * 13.5 + flowT * 2.7 + snapSeed * 23.1 * snapMix + seed * 53.1) * 0.19;
  float n4 = lnoise(tc * 28.0 - flowT * 4.1 + snapSeed * 41.9 * snapMix + seed * 89.3) * 0.10;
  float n5 = lnoise(tc * 56.0 + snapSeed * 73.7 * snapMix + seed * 127.7) * 0.045;

  float disp = (n1 + (n2 + n3 + n4 + n5) * (0.35 + jagAmt * 1.25)) * amp;
  disp += bow * envAnchor;

  // Singing Tesla coil: live audio waveform vibrates the ionized channel.
  if (waveAmt > 0.001) {
    float w = textureLod(audio, vec2(clamp(tc * 0.84 + 0.08, 0.0, 1.0), 0.5), 0.0).r - 0.5;
    disp += w * waveAmt * 0.22;
  }

  return disp * env;
}

// Evaluates a single lightning filament from A to B with slope-corrected Euclidean distance
// so steep zigzag kinks keep crisp, unbroken width.
void addArc(
  vec2 p,
  vec2 A,
  vec2 B,
  float seed,
  float flowT,
  float snapSeed,
  float jagAmt,
  float amp,
  float freeTip,
  float bow,
  float waveAmt,
  float baseW,
  float bright,
  float tipFade,
  float px,
  inout float accCore,
  inout float accSheath,
  inout float accHalo
) {
  vec2 ba = B - A;
  float len = length(ba);
  if (len < 1e-4) return;
  vec2 dir = ba / len;
  vec2 perp = vec2(-dir.y, dir.x);
  vec2 rel = p - A;
  float t = dot(rel, dir) / len;
  float y = dot(rel, perp);

  // Fast coarse reject well outside maximum possible halo reach (zero box clipping).
  float haloR = baseW * 13.0 + 0.026;
  float maxHaloD = haloR * 4.6;
  float maxReach = amp * (1.25 + jagAmt * 1.15) + abs(bow) + maxHaloD;
  if (abs(y) > maxReach || t * len < -maxHaloD || (t - 1.0) * len > maxHaloD) return;

  float tc = clamp(t, 0.0, 1.0);
  float eps = 0.011;
  float tA = max(tc - eps, 0.0);
  float tB = min(tc + eps, 1.0);
  float d0 = boltDisp(tc, seed, flowT, snapSeed, jagAmt, amp, freeTip, bow, waveAmt);
  float dA = boltDisp(tA, seed, flowT, snapSeed, jagAmt, amp, freeTip, bow, waveAmt);
  float dB = boltDisp(tB, seed, flowT, snapSeed, jagAmt, amp, freeTip, bow, waveAmt);

  float slope = (dB - dA) / max((tB - tA) * len, 1e-4);
  float dx = t < 0.0 ? (-t * len) : (t > 1.0 ? (t - 1.0) * len : 0.0);
  float rawPerp = abs(y - d0);

  // Slope-correct tightly near the filament core so steep kinks never thin out,
  // and smoothly relax to true Euclidean distance in the far halo to eliminate perpendicular streak bands.
  float nearCore = exp(-rawPerp / max(baseW * 5.0, 0.02)) * (1.0 - smoothstep(0.0, 0.025, dx));
  float slopeNorm = mix(1.0, sqrt(1.0 + slope * slope), nearCore);
  float dist = length(vec2(dx, rawPerp / slopeNorm));

  // Taper width and intensity smoothly along free-air tips and branches.
  float taper = mix(1.0, 1.0 - 0.62 * tc, tipFade);
  float tipMask = mix(1.0, 1.0 - smoothstep(0.72, 1.0, tc) * 0.85, tipFade);
  float w = max(baseW * taper, px * 1.15);

  // High-frequency localized plasma hot-spots along the filament (faded out in the far halo).
  float beadRaw = 0.84 + 0.26 * (0.5 + 0.5 * lnoise(tc * 11.0 - flowT * 5.0 + snapSeed * 9.7 + seed * 19.0));
  float bead = mix(1.0, beadRaw, nearCore);
  float b = bright * tipMask * bead;

  // 3-tier electrical discharge profile: incandescent needle + Lorentzian plasma sheath + smooth ozone corona.
  float core = exp(-pow(dist / w, 1.85));
  float sw = w * 2.35;
  float sheath = pow(sw / (dist + sw), 2.25) * smoothstep(maxHaloD, maxHaloD * 0.35, dist);
  float halo = max(0.0, exp(-dist / haloR) - exp(-maxHaloD / haloR));

  accCore += core * b;
  accSheath += sheath * b * 0.9;
  accHalo += halo * b * 0.38;
}

void main() {
  float aspect = RENDERSIZE.x / max(RENDERSIZE.y, 1.0);
  vec2 p = (isf_FragNormCoord - origin) * vec2(aspect, 1.0);
  float px = 1.0 / max(RENDERSIZE.y, 1.0);

  float flowT = TIME * speed;
  float beatSeed = float(BEAT_COUNT) * 3.17;
  float surgeAmp = surge;
  float activeBolts = clamp(bolts, 1.0, 12.0);
  int numBolts = int(ceil(activeBolts));

  // Restrike heartbeat: arcs buzz continuously and violently snap/flicker as crackle increases.
  float buzz = 0.9 + 0.1 * sin(TIME * 62.83) * (0.35 + 0.65 * crackle);
  float masterBright = (0.95 + surgeAmp * 0.55) * buzz;

  float accCore = 0.0;
  float accSheath = 0.0;
  float accHalo = 0.0;
  float accHotspot = 0.0;
  float accGlassFlash = 0.0;

  // Mode-specific electrode geometry metrics.
  float elecScale = max(electrode, 0.0);
  float rCenter = (mode == 0) ? (0.068 * (0.25 + 0.75 * elecScale)) : 0.0;
  float globeR = reach * (1.0 + surgeAmp * 0.055);
  float toroidW = 0.13 * elecScale;
  float toroidR = 0.042 * elecScale;
  float twinR = 0.056 * elecScale;

  // Twin electrode positions (mode == 2).
  vec2 twinAxis = rot2(vec2(1.0, 0.0), TIME * spin);
  vec2 twinPerp = vec2(-twinAxis.y, twinAxis.x);
  vec2 twinE1 = -twinAxis * reach;
  vec2 twinE2 = twinAxis * reach;

  // Primary lightning bolts + truly connected forked branches.
  for (int i = 0; i < 12; i++) {
    if (i >= numBolts) break;
    float fi = float(i);
    float fracWeight = clamp(activeBolts - fi, 0.0, 1.0);
    float seed = fi * 1.6180339 + 0.37;

    // Each bolt has its own asynchronous restrike clock so they snap independently like real arcs.
    float restrikeRate = 5.0 + 18.0 * crackle + hash11(seed * 9.1) * 6.0;
    float restrikeEpoch = floor(TIME * restrikeRate + seed * 27.3) + beatSeed;
    float snapPhase = fract(TIME * restrikeRate + seed * 27.3);

    // Subtle electrical flicker envelope per bolt: flashes bright right on a restrike.
    float strikePulse = mix(1.0, 0.62 + 0.58 * exp(-snapPhase * 3.8), crackle * 0.85);
    float aliveChance = hash11(restrikeEpoch * 1.91 + seed * 5.7);
    float boltLife = mix(1.0, smoothstep(0.06, 0.32, aliveChance), crackle * 0.55);

    // Occasional "dominant" high-current streamer (like touching a plasma globe or main breakdown leader).
    float domPick = mod(floor(TIME * 0.45 * max(speed, 0.25) + float(BEAT_COUNT) * 0.5), max(1.0, floor(activeBolts)));
    float isDom = (i == int(domPick)) ? 1.0 : 0.0;

    vec2 A = vec2(0.0);
    vec2 B = vec2(0.0);
    float freeTip = 0.0;
    float bow = 0.0;
    float amp = 0.12;
    float tipFade = 0.0;

    if (mode == 0) {
      // PLASMA GLOBE: central high-voltage sphere shooting radial tendrils to outer glass wall.
      float baseAng = (fi / activeBolts) * TAU + TIME * spin;
      float wander = snoise(flowT * 0.38 + seed * 11.3) * (1.75 / activeBolts);
      float hop = (hash11(floor(restrikeEpoch * 0.25) + seed * 13.1) - 0.5) * 0.55 * crackle;
      // Subtle upward convection bias toward the top of the glass sphere.
      float ang = baseAng + wander + hop;
      vec2 radial = vec2(cos(ang), sin(ang));
      radial = normalize(radial + vec2(0.0, 0.16 * sin(flowT * 0.5 + seed * 4.0)));

      float startR = max(rCenter * 0.88, 0.006);
      A = radial * startR;
      B = radial * globeR;
      freeTip = 0.0;
      bow = snoise(flowT * 0.7 + seed * 5.3) * 0.045;
      amp = globeR * (0.16 + 0.08 * isDom);
      tipFade = 0.05;

      // Glowing ionization hotspot where the plasma tendril presses against the glass wall.
      float dTip = length(p - B);
      float spotSize = 0.014 + 0.007 * isDom + surgeAmp * 0.006;
      float spot = exp(-dTip / spotSize) * (0.58 + 0.28 * isDom) * strikePulse * boltLife * fracWeight;
      accHotspot += spot;
      accGlassFlash += exp(-dTip / (spotSize * 4.5)) * strikePulse * boltLife * fracWeight;
    } else if (mode == 1) {
      // TESLA TOWER: metallic toroid launching high-voltage branching lightning into open air.
      // Distribute strikes across upper/side breakout fan with occasional lower side discharges.
      float fan = (fi + 0.5) / activeBolts;
      float baseAng = mix(-0.32, PI + 0.32, fan) + TIME * spin * 0.35;
      float angJitter = snoise(flowT * 0.6 + seed * 9.7) * 0.34
                      + (hash11(restrikeEpoch * 0.5 + seed * 17.3) - 0.5) * 0.65 * crackle;
      float ang = baseAng + angJitter;
      vec2 dir = vec2(cos(ang), sin(ang));

      // Launch from perimeter of the metallic toroid (or centre if electrode == 0).
      vec2 torStart = vec2(clamp(dir.x * (toroidW + toroidR), -toroidW - toroidR, toroidW + toroidR),
                           dir.y * toroidR * 0.92);
      A = torStart;
      float boltLen = reach * (0.68 + 0.62 * hash11(floor(restrikeEpoch * 0.5) + seed * 7.9) + 0.22 * isDom);
      boltLen *= (1.0 + surgeAmp * 0.38);
      B = A + dir * boltLen;
      freeTip = 1.0;
      bow = (hash11(restrikeEpoch + seed * 3.1) - 0.5) * 0.08;
      amp = boltLen * (0.19 + 0.07 * isDom);
      tipFade = 0.82;

      // Crisp breakout spark right on the toroid rim.
      float dRoot = length(p - A);
      accHotspot += exp(-dRoot / (0.012 + surgeAmp * 0.007)) * 0.45 * strikePulse * boltLife * fracWeight;
    } else {
      // TWIN ELECTRODES: braided Jacob's-ladder plasma arcs leaping directly between E1 and E2.
      float spreadIdx = (fi / max(activeBolts - 1.0, 1.0)) * 2.0 - 1.0;
      float launchAng1 = spreadIdx * 0.52 + snoise(flowT * 0.8 + seed * 4.3) * 0.32;
      float launchAng2 = -spreadIdx * 0.52 + snoise(flowT * 0.8 + seed * 8.1) * 0.32;
      A = twinE1 + rot2(twinAxis, launchAng1) * (twinR * 0.98);
      B = twinE2 - rot2(twinAxis, launchAng2) * (twinR * 0.98);
      freeTip = 0.0;

      // Rising convective Jacob's-ladder bow that climbs and snaps back.
      float climb = fract(flowT * 0.28 + fi / activeBolts);
      float bowSign = (mod(fi, 2.0) < 0.5 ? 1.0 : -1.0);
      bow = (spreadIdx * 0.14 + bowSign * climb * 0.16) * reach * (1.0 + surgeAmp * 0.25);
      amp = reach * (0.20 + 0.08 * isDom);
      tipFade = 0.0;

      // Hot cathode/anode attachment sparks on the facing surfaces of both spheres.
      accHotspot += (exp(-length(p - A) / (0.013 + surgeAmp * 0.006))
                   + exp(-length(p - B) / (0.013 + surgeAmp * 0.006))) * 0.35 * strikePulse * boltLife * fracWeight;
    }

    float boltW = thickness * (0.78 + 0.45 * isDom + surgeAmp * 0.35);
    float boltBright = masterBright * (0.75 + 0.48 * isDom) * strikePulse * boltLife * fracWeight;

    // Render primary bolt.
    addArc(
      p, A, B, seed, flowT, restrikeEpoch, jagged, amp, freeTip, bow, soundDrive,
      boltW, boltBright, tipFade, px,
      accCore, accSheath, accHalo
    );

    // Forked secondary branches anchored directly onto the displaced primary bolt spine!
    if (branches > 0.01) {
      vec2 ba = B - A;
      float len = length(ba);
      vec2 dir = ba / max(len, 1e-4);
      vec2 perp = vec2(-dir.y, dir.x);

      for (int k = 0; k < 2; k++) {
        float fk = float(k);
        float bSeed = seed * 3.7 + fk * 11.13 + 2.5;
        float bShow = hash11(floor(restrikeEpoch * 0.5) + bSeed * 4.3);
        float branchGate = smoothstep(1.0 - branches, 1.0 - branches * 0.35 + 0.01, bShow);
        if (branchGate < 0.01) continue;

        float tFork = (k == 0 ? 0.30 : 0.58) + 0.18 * hash11(floor(restrikeEpoch * 0.5) + bSeed * 2.1);
        float spineOffset = boltDisp(tFork, seed, flowT, restrikeEpoch, jagged, amp, freeTip, bow, soundDrive);
        vec2 forkStart = A + dir * (tFork * len) + perp * spineOffset;

        float side = (hash11(floor(restrikeEpoch * 0.5) + bSeed * 9.7) > 0.5 ? 1.0 : -1.0) * (k == 0 ? 1.0 : -1.0);
        float forkAng = side * (0.42 + 0.52 * hash11(bSeed * 6.3 + restrikeEpoch * 0.25));
        float forkLen = len * (0.28 + 0.28 * hash11(bSeed * 8.1)) * (1.0 - tFork * 0.35) * (0.7 + 0.55 * branches);

        vec2 forkDir = rot2(dir, forkAng);
        vec2 forkEnd = forkStart + forkDir * forkLen;
        // In Plasma Globe mode, gently keep branches inside the containment sphere.
        if (mode == 0 && length(forkEnd) > globeR * 0.99) {
          forkEnd = normalize(forkEnd) * (globeR * 0.99);
        }

        addArc(
          p, forkStart, forkEnd, bSeed, flowT * 1.25, restrikeEpoch + fk * 5.3,
          jagged * 1.15, forkLen * 0.22, 1.0, 0.0, soundDrive * 0.5,
          boltW * 0.58, boltBright * (0.45 + 0.4 * branches) * branchGate, 0.95, px,
          accCore, accSheath, accHalo
        );
      }
    }
  }

  // Simmering organic St. Elmo's fire corona noise (2D FBM -> zero radial pinwheel spokes!).
  float rOrig = length(p);
  float coronaTick = floor(TIME * (8.0 + 16.0 * crackle));
  float coronaField = fbm2(p * 18.0 + vec2(flowT * 1.4, -flowT * 1.1) + coronaTick * 0.37 * crackle);
  float coronaBuzz = 0.65 + 0.55 * coronaField;
  float coronaSpikes = pow(clamp(coronaField * 1.35, 0.0, 1.0), 2.5);

  // Electrode hardware shading (dark reflective metal + Fresnel plasma rim + glass globe).
  vec3 hardwareCol = vec3(0.0);
  float hardwareMask = 0.0;
  float solidMask = 0.0;
  float flashLevel = clamp(0.65 + surgeAmp * 0.75 + AUDIO_BEAT * 0.35, 0.4, 2.2);

  if (mode == 0 && elecScale > 0.01) {
    // Central plasma globe inner electrode sphere (obsidian glass/chrome core with bright plasma rim).
    float dSphere = rOrig - rCenter;
    float sphereCover = 1.0 - smoothstep(-px * 1.5, px * 1.5, dSphere);
    if (sphereCover > 0.0) {
      vec2 spN = p / max(rCenter, 1e-4);
      float nz = sqrt(max(0.0, 1.0 - clamp(dot(spN, spN), 0.0, 1.0)));
      vec3 N = vec3(spN, nz);
      float fres = pow(1.0 - nz, 2.2);
      float spec = pow(max(dot(N, normalize(vec3(-0.45, 0.62, 0.65))), 0.0), 34.0);
      vec3 metal = vec3(0.025, 0.018, 0.045) * (0.4 + 0.6 * nz)
                 + arcColor.rgb * (0.22 + fres * 1.55) * flashLevel
                 + coreColor.rgb * (fres * 0.85 + spec * 0.9) * flashLevel;
      hardwareCol = mix(hardwareCol, metal, sphereCover);
      hardwareMask = max(hardwareMask, sphereCover);
      solidMask = max(solidMask, sphereCover);
    }
    // Tight St. Elmo's plasma corona strictly outside the central sphere surface.
    float outSphere = smoothstep(-px * 1.5, px * 2.5, dSphere);
    float rootDist = max(dSphere, 0.0);
    accSheath += exp(-rootDist / (0.014 + 0.012 * coronaSpikes)) * (0.72 + 0.45 * surgeAmp) * coronaBuzz * outSphere;
    accHalo += exp(-rootDist / (0.095 + surgeAmp * 0.04)) * 0.5 * glow * outSphere;

    // Subtle glass containment shell rim & upper-left specular reflection.
    float dRim = abs(rOrig - globeR);
    float glassRim = exp(-dRim / (0.007 + px * 2.0)) * (0.26 + accGlassFlash * 0.62);
    float innerFres = smoothstep(globeR * 0.7, globeR, rOrig) * step(rOrig, globeR + 0.008);
    float glassSpec = exp(-pow((rOrig - globeR * 0.94) / 0.022, 2.0))
                    * smoothstep(0.55, 0.92, dot(normalize(p + 1e-5), normalize(vec2(-0.55, 0.82))));
    accSheath += glassRim * 0.42 * min(elecScale, 1.0);
    accHalo += innerFres * 0.14 * min(elecScale, 1.0);
    hardwareCol += mix(arcColor.rgb, vec3(0.9, 0.95, 1.0), 0.72) * glassSpec * 0.28 * min(elecScale, 1.0);
    hardwareMask = max(hardwareMask, glassSpec * 0.25 * min(elecScale, 1.0));
  } else if (mode == 1 && elecScale > 0.01) {
    // TESLA TOWER: copper secondary column + insulator collar + metallic spun-aluminum toroid top-load.
    // Copper secondary coil column below toroid.
    vec2 colP = p - vec2(0.0, -toroidR - 0.38 * elecScale);
    float colW = toroidW * 0.50;
    float dCol = sdBox(colP, vec2(colW, 0.38 * elecScale));
    float colCover = 1.0 - smoothstep(-px * 1.5, px * 1.5, dCol);
    if (colCover > 0.0) {
      float cx = clamp(colP.x / max(colW, 1e-4), -1.0, 1.0);
      float cz = sqrt(max(0.0, 1.0 - cx * cx));
      float windings = 0.68 + 0.32 * sin(p.y * 300.0 / max(elecScale, 0.35));
      float topLight = exp(-max(0.0, -p.y - toroidR) * 3.4);
      vec3 copper = vec3(0.32, 0.125, 0.045) * windings * (0.16 + 0.68 * cz);
      // Blue-violet strobe reflection from the overhead lightning.
      copper += mix(arcColor.rgb, coreColor.rgb, 0.35) * (pow(1.0 - cz, 2.0) * 0.85 + cz * topLight * 0.5) * flashLevel;
      hardwareCol = mix(hardwareCol, copper, colCover);
      hardwareMask = max(hardwareMask, colCover);
      solidMask = max(solidMask, colCover);
    }

    // Dark ceramic insulator collar between secondary coil and toroid.
    vec2 neckP = p - vec2(0.0, -toroidR * 1.15);
    float dNeck = sdBox(neckP, vec2(colW * 1.16, toroidR * 0.34));
    float neckCover = 1.0 - smoothstep(-px * 1.5, px * 1.5, dNeck);
    if (neckCover > 0.0) {
      float nx = clamp(neckP.x / max(colW * 1.16, 1e-4), -1.0, 1.0);
      float nz = sqrt(max(0.0, 1.0 - nx * nx));
      vec3 ceramic = vec3(0.03, 0.03, 0.045) * (0.4 + 0.6 * nz) + arcColor.rgb * pow(1.0 - nz, 2.2) * 0.55 * flashLevel;
      hardwareCol = mix(hardwareCol, ceramic, neckCover);
      hardwareMask = max(hardwareMask, neckCover);
      solidMask = max(solidMask, neckCover);
    }

    // Spun-aluminum toroid top-load.
    float dTor = sdSegment(p, vec2(-toroidW, 0.0), vec2(toroidW, 0.0)) - toroidR;
    float torCover = 1.0 - smoothstep(-px * 1.5, px * 1.5, dTor);
    if (torCover > 0.0) {
      vec2 closest = vec2(clamp(p.x, -toroidW, toroidW), 0.0);
      vec2 tn = (p - closest) / max(toroidR, 1e-4);
      float tz = sqrt(max(0.0, 1.0 - clamp(dot(tn, tn), 0.0, 1.0)));
      vec3 N = normalize(vec3(tn.x * 0.55, tn.y, tz));
      float fres = pow(1.0 - max(N.z, 0.0), 2.1);
      float topRim = smoothstep(-0.15, 0.9, N.y);
      float spec = pow(max(dot(N, normalize(vec3(-0.22, 0.72, 0.65))), 0.0), 26.0);
      vec3 steel = vec3(0.04, 0.045, 0.065) * (0.45 + 0.65 * tz)
                 + arcColor.rgb * (fres * 1.05 + topRim * 0.42) * flashLevel
                 + coreColor.rgb * (spec * 0.95 + fres * topRim * 0.72) * flashLevel;
      hardwareCol = mix(hardwareCol, steel, torCover);
      hardwareMask = max(hardwareMask, torCover);
      solidMask = max(solidMask, torCover);
    }

    // Crackling St. Elmo's brush corona strictly outside the toroid surface.
    float outTor = smoothstep(-px * 1.5, px * 2.5, dTor);
    float torOut = max(dTor, 0.0);
    accSheath += exp(-torOut / (0.013 + 0.011 * coronaSpikes)) * (0.62 + 0.42 * surgeAmp) * coronaBuzz * outTor;
    accHalo += exp(-torOut / (0.085 + surgeAmp * 0.04)) * 0.45 * glow * outTor;
  } else if (mode == 2 && elecScale > 0.01) {
    // TWIN ELECTRODES: two opposed metallic spark-gap spheres with live arc reflection.
    for (int e = 0; e < 2; e++) {
      vec2 ec = (e == 0) ? twinE1 : twinE2;
      vec2 towardOther = (e == 0) ? twinAxis : -twinAxis;
      vec2 ep = p - ec;
      float er = length(ep);
      float dE = er - twinR;
      float eCover = 1.0 - smoothstep(-px * 1.5, px * 1.5, dE);
      if (eCover > 0.0) {
        vec2 en = ep / max(twinR, 1e-4);
        float ez = sqrt(max(0.0, 1.0 - clamp(dot(en, en), 0.0, 1.0)));
        vec3 N = vec3(en, ez);
        float fres = pow(1.0 - ez, 2.2);
        float faceArc = max(dot(en, towardOther), 0.0);
        float spec = pow(max(dot(N, normalize(vec3(towardOther * 0.65, 0.75))), 0.0), 22.0);
        vec3 metal = vec3(0.03, 0.032, 0.048) * (0.35 + 0.65 * ez)
                   + arcColor.rgb * (fres * 1.05 + faceArc * 0.65) * flashLevel
                   + coreColor.rgb * (spec * 0.95 + pow(faceArc, 3.2) * 0.72) * flashLevel;
        hardwareCol = mix(hardwareCol, metal, eCover);
        hardwareMask = max(hardwareMask, eCover);
        solidMask = max(solidMask, eCover);
      }
      float outE = smoothstep(-px * 1.5, px * 2.5, dE);
      float eOut = max(dE, 0.0);
      accSheath += exp(-eOut / (0.012 + 0.008 * coronaSpikes)) * 0.52 * coronaBuzz * outE;
      accHalo += exp(-eOut / (0.075 + surgeAmp * 0.035)) * 0.42 * glow * outE;
    }
  } else if (mode != 2) {
    // Pure floating lightning (electrode == 0) in radial/tower modes: small glowing ionization pinch at origin.
    accSheath += exp(-rOrig / (0.018 + surgeAmp * 0.012)) * 0.85 * buzz;
    accHalo += exp(-rOrig / 0.08) * 0.4 * glow;
  }

  // Keep solid metallic electrodes crisp and legible under bright corona/halo bloom,
  // while letting hot arc cores and surface strike sparks gleam cleanly at the rim.
  float metalHaloMask = mix(1.0, 0.24, solidMask);
  float metalSpotMask = mix(1.0, 0.45, solidMask);

  // Combine 3-tier ionized plasma radiance (HDR-friendly incandescent core!).
  vec3 hotCore = mix(coreColor.rgb, vec3(1.0, 0.99, 1.0), 0.72);
  vec3 innerSheath = mix(arcColor.rgb, coreColor.rgb, 0.52);
  // Plasma contact hotspots glow hotter with a subtle magenta-violet ionization shift.
  vec3 hotspotTint = mix(mix(arcColor.rgb, vec3(1.0, 0.28, 0.82), 0.35), vec3(1.0), 0.52);

  vec3 plasma = hotCore * accCore * (1.3 + surgeAmp * 0.75) * mix(1.0, 0.6, solidMask)
              + innerSheath * accSheath * (0.72 + glow * 0.42) * metalHaloMask
              + arcColor.rgb * accHalo * (0.52 * glow) * metalHaloMask
              + hotspotTint * accHotspot * (0.85 + glow * 0.55) * metalSpotMask;

  // Subtle ionized ozone mist in the dark chamber, illuminated by live discharge energy.
  float ozone = fbm2(p * 3.4 + vec2(flowT * 0.14, -flowT * 0.22));
  float chamberFalloff = exp(-rOrig * (1.35 / max(reach, 0.2)));
  vec3 ambientOzone = arcColor.rgb * ozone * chamberFalloff * (0.14 + surgeAmp * 0.12) * glow;

  if (fillBackground) {
    float vig = 1.0 - smoothstep(0.25, 1.45, rOrig) * 0.55;
    vec3 bg = bgColor.rgb * vig + ambientOzone;
    vec3 col = mix(bg, hardwareCol, hardwareMask);
    // Lightning arcs and corona blaze over both chamber and electrodes.
    col += plasma;
    gl_FragColor = vec4(col, 1.0);
  } else {
    // Transparent overlay mode: straight alpha preserving full HDR plasma brightness.
    vec3 emissive = plasma + ambientOzone * 0.32;
    float ePeak = max(emissive.r, max(emissive.g, emissive.b));
    float alpha = clamp(max(hardwareMask, ePeak), 0.0, 1.0);
    vec3 outCol = mix(emissive / max(alpha, 1e-4), hardwareCol + emissive, hardwareMask);
    gl_FragColor = vec4(outCol, alpha);
  }
}
