/*{
  "DESCRIPTION": "Audio-reactive neon raindrop diamond ripples pulsing across a perspective grid floor. Supports spawning raindrops directly from live audio frequency bands and detected beats using a persistent drop simulator, alongside continuous time-driven rain. Ported from 'Neon Raindrops' by chronos on Shadertoy.",
  "CREDIT": "chronos (Shadertoy), ported & made audio-reactive for Gumpkestra",
  "CATEGORIES": ["Generator", "Audio"],
  "INPUTS": [
    { "NAME": "audioFFT", "TYPE": "audioFFT" },
    { "NAME": "dropTrigger", "TYPE": "long", "GROUP": "Raindrops", "LABEL": "Drop trigger", "DESCRIPTION": "What spawns raindrops: Audio + Auto (ambient + audio-triggered), Audio (Bands) (spawned purely by FFT bands & beats), Beats only (one ripple per beat), or Auto (Time) (original continuous loop)", "DEFAULT": 0, "VALUES": [0, 1, 2, 3], "LABELS": ["Audio + Auto", "Audio (Bands)", "Beats only", "Auto (Time)"] },
    { "NAME": "dropsCount", "TYPE": "float", "GROUP": "Raindrops", "LABEL": "Drop count", "DESCRIPTION": "Number of simultaneous neon raindrop slots", "DEFAULT": 7, "MIN": 1, "MAX": 16 },
    { "NAME": "speed", "TYPE": "float", "GROUP": "Raindrops", "LABEL": "Speed", "DESCRIPTION": "Drop expansion speed multiplier", "DEFAULT": 1.0, "MIN": 0.0, "MAX": 4.0 },
    { "NAME": "tailLength", "TYPE": "float", "GROUP": "Raindrops", "LABEL": "Pulse tail", "DESCRIPTION": "Trailing length of each diamond ripple", "DEFAULT": 0.5, "MIN": 0.05, "MAX": 1.5 },
    { "NAME": "gridSize", "TYPE": "float", "GROUP": "Raindrops", "LABEL": "Grid density", "DESCRIPTION": "Number of neon grid cells across the floor", "DEFAULT": 20.0, "MIN": 4.0, "MAX": 60.0 },
    { "NAME": "triggerThreshold", "TYPE": "float", "GROUP": "Audio Trigger", "LABEL": "Threshold", "DESCRIPTION": "Audio energy / transient threshold needed to spawn a raindrop (lower = more sensitive)", "DEFAULT": 0.26, "MIN": 0.04, "MAX": 0.95 },
    { "NAME": "triggerTransient", "TYPE": "float", "GROUP": "Audio Trigger", "LABEL": "Transient punch", "DESCRIPTION": "0 = spawn on sustained loudness, 1 = spawn only on sharp hits and note attacks", "DEFAULT": 0.65, "MIN": 0.0, "MAX": 1.0 },
    { "NAME": "triggerCooldown", "TYPE": "float", "GROUP": "Audio Trigger", "LABEL": "Retrigger delay", "DESCRIPTION": "Minimum seconds before the same drop slot can spawn again", "DEFAULT": 0.22, "MIN": 0.03, "MAX": 1.0 },
    { "NAME": "triggerBeatBoost", "TYPE": "float", "GROUP": "Audio Trigger", "LABEL": "Beat boost", "DESCRIPTION": "Intensity of beat-spawned raindrops (set to 0 to disable beat spawns in band modes)", "DEFAULT": 1.0, "MIN": 0.0, "MAX": 2.0 },
    { "NAME": "audioResponse", "TYPE": "float", "GROUP": "Audio FX", "LABEL": "Audio FX amount", "DESCRIPTION": "Master multiplier for audio-reactive visual FX (bass pulse, spectrum grid, sparkle, camera bounce, hue)", "DEFAULT": 0.85, "MIN": 0.0, "MAX": 2.0 },
    { "NAME": "bassPulse", "TYPE": "float", "GROUP": "Audio FX", "LABEL": "Bass pulse", "DESCRIPTION": "Bass boosts pulse intensity, lengthens ripple tails, and widens glowing grid lines", "DEFAULT": 0.7, "MIN": 0.0, "MAX": 2.0 },
    { "NAME": "spectrumGrid", "TYPE": "float", "GROUP": "Audio FX", "LABEL": "Spectrum grid", "DESCRIPTION": "Illuminate the neon grid and modulate drops with the live FFT spectrum", "DEFAULT": 0.65, "MIN": 0.0, "MAX": 2.0 },
    { "NAME": "highSparkle", "TYPE": "float", "GROUP": "Audio FX", "LABEL": "Treble sparkle", "DESCRIPTION": "Treble drives white-hot wavefront flashes and shimmering grid sparkle", "DEFAULT": 0.6, "MIN": 0.0, "MAX": 2.0 },
    { "NAME": "cameraBounce", "TYPE": "float", "GROUP": "Audio FX", "LABEL": "Camera bounce", "DESCRIPTION": "Bass and beats subtly punch camera zoom, height, and tilt", "DEFAULT": 0.35, "MIN": 0.0, "MAX": 1.5 },
    { "NAME": "hueAudio", "TYPE": "float", "GROUP": "Audio FX", "LABEL": "Audio hue shift", "DESCRIPTION": "Shift the neon colour palette with mid-band energy and beats", "DEFAULT": 0.25, "MIN": 0.0, "MAX": 1.0 },
    { "NAME": "topDown", "TYPE": "bool", "GROUP": "Camera", "LABEL": "Top-down view", "DESCRIPTION": "Flat orthographic top-down view of the ripple plane", "DEFAULT": false },
    { "NAME": "focal", "TYPE": "float", "GROUP": "Camera", "LABEL": "Focal length", "DESCRIPTION": "Camera perspective zoom", "DEFAULT": 1.0, "MIN": 0.35, "MAX": 3.0 },
    { "NAME": "cameraHeight", "TYPE": "float", "GROUP": "Camera", "LABEL": "Height", "DESCRIPTION": "Camera height above the grid floor", "DEFAULT": 1.0, "MIN": 0.15, "MAX": 3.0 },
    { "NAME": "cameraDist", "TYPE": "float", "GROUP": "Camera", "LABEL": "Distance", "DESCRIPTION": "Camera horizontal distance from center", "DEFAULT": 1.5, "MIN": 0.2, "MAX": 4.0 },
    { "NAME": "pitch", "TYPE": "float", "GROUP": "Camera", "LABEL": "Pitch", "DESCRIPTION": "Camera vertical tilt angle", "DEFAULT": -0.2, "MIN": -0.45, "MAX": 0.15 },
    { "NAME": "yaw", "TYPE": "float", "GROUP": "Camera", "LABEL": "Yaw", "DESCRIPTION": "Camera horizontal pan angle", "DEFAULT": 0.0, "MIN": -1.0, "MAX": 1.0 },
    { "NAME": "swayAmount", "TYPE": "float", "GROUP": "Camera", "LABEL": "Sway amount", "DESCRIPTION": "Amplitude of automatic circular camera sway", "DEFAULT": 0.05, "MIN": 0.0, "MAX": 0.3 },
    { "NAME": "swaySpeed", "TYPE": "float", "GROUP": "Camera", "LABEL": "Sway speed", "DESCRIPTION": "Speed of automatic camera sway", "DEFAULT": 1.0, "MIN": 0.0, "MAX": 4.0 },
    { "NAME": "hueShift", "TYPE": "float", "GROUP": "Color", "LABEL": "Hue shift", "DESCRIPTION": "Rotate the neon raindrop colour spectrum", "DEFAULT": 0.0, "MIN": 0.0, "MAX": 1.0 },
    { "NAME": "saturation", "TYPE": "float", "GROUP": "Color", "LABEL": "Saturation", "DESCRIPTION": "Chroma intensity of each neon pulse", "DEFAULT": 1.0, "MIN": 0.0, "MAX": 2.0 },
    { "NAME": "brightness", "TYPE": "float", "GROUP": "Color", "LABEL": "Brightness", "DESCRIPTION": "Overall brightness (values above 1 drive HDR highlights)", "DEFAULT": 1.0, "MIN": 0.0, "MAX": 3.0 },
    { "NAME": "transparentBg", "TYPE": "bool", "GROUP": "Color", "LABEL": "Transparent bg", "DESCRIPTION": "Make dark areas transparent so the neon grid can overlay layers below", "DEFAULT": false }
  ],
  "PASSES": [
    { "TARGET": "dropState", "PERSISTENT": true, "FLOAT": true, "WIDTH": 16, "HEIGHT": 2 },
    {  }
  ]
}*/

/*
    Neon Raindrops by chronos
    --------------------------
    Created by adding layers of domain repeated cells of inverted pyramids falling down.
*/

const float PI = 3.14159265;

float sRGBencode(float C_linear) {
  return C_linear > 0.0031308
    ? (1.055 * pow(C_linear, 1.0 / 2.4) - 0.055)
    : (12.92 * C_linear);
}

vec3 sRGBencode(vec3 C_linear) {
  C_linear = clamp(C_linear, 0.0, 1.0);
  return vec3(
    sRGBencode(C_linear.x),
    sRGBencode(C_linear.y),
    sRGBencode(C_linear.z)
  );
}

float hash(vec3 uv) {
  uint x = floatBitsToUint(uv.x) | 1u; // 0 is a fixed point so we remove it
  uint y = floatBitsToUint(uv.y);
  uint z = floatBitsToUint(uv.z);

  y ^= y >> 13;
  y ^= y << 17;
  y ^= y >> 5;
  y *= 0x2545F491u;

  x ^= y;
  x ^= x >> 13;
  x ^= x << 17;
  x ^= x >> 5;
  x *= 0x4F6CDD1Du;

  z ^= x;
  z ^= z >> 13;
  z ^= z << 17;
  z ^= z >> 5;
  z *= 0x1D6C45F4u;

  // Shift down by 9 to use top 23 bits in mantissa; exponent & sign from 0.5 (0x3f000000)
  uint w = (z >> 9) | 0x3f000000u;

  // Re-normalize from [0.5, 1) to [0, 1)
  return 2.0 * uintBitsToFloat(w) - 1.0;
}

// Golden-ratio spacing distributes any number of slots evenly across the log-FFT spectrum.
float slotBandU(float slotIndex) {
  return 0.03 + 0.77 * fract(slotIndex * 0.61803398875 + 0.07);
}

float sampleSlotBand(float slotIndex) {
  float u = slotBandU(slotIndex);
  float a = IMG_NORM_PIXEL(audioFFT, vec2(max(0.01, u - 0.018), 0.5)).r;
  float b = IMG_NORM_PIXEL(audioFFT, vec2(u, 0.5)).r;
  float c = IMG_NORM_PIXEL(audioFFT, vec2(min(0.99, u + 0.018), 0.5)).r;
  return (a + 2.0 * b + c) * 0.25;
}

// Pass 0: update the 16x2 persistent state buffer for audio-triggered raindrops.
// Row 0: (posX [0..1], posY [0..1], hue [0..1], cycle [0..1], 0 = inactive)
// Row 1: (strength*0.5 [0..1], prevBandEnergy [0..1], cooldown [0..1], prevBeatFrac [0..1])
vec4 updateDropState(ivec2 px) {
  int slot = clamp(px.x, 0, 15);
  int row = px.y;

  vec4 s0 = texelFetch(dropState, ivec2(slot, 0), 0);
  vec4 s1 = texelFetch(dropState, ivec2(slot, 1), 0);

  float dt = clamp(TIMEDELTA, 0.0, 0.1);
  float activeDrops = clamp(dropsCount, 1.0, 16.0);
  int maxDrops = max(1, int(ceil(activeDrops)));

  float speedOff = hash(vec3(float(slot), 1.0, 17.0));
  float dropSpeed = 0.25 * speed * mix(0.8, 1.2, speedOff);

  float cycle = s0.a;
  if (dropTrigger == 3) {
    // Pure Auto (Time) mode: clear stateful audio drops
    cycle = 0.0;
  } else if (cycle > 0.0 && dt > 0.0) {
    cycle += dt * dropSpeed;
    if (cycle >= 1.0) cycle = 0.0;
  }

  float cooldown = max(0.0, s1.b - dt);
  float bandEnergy = sampleSlotBand(float(slot));
  float prevEnergy = s1.g;
  float flux = max(0.0, bandEnergy - prevEnergy);
  float nextPrevEnergy = (dt > 0.0)
    ? mix(prevEnergy, bandEnergy, 1.0 - exp(-dt * 14.0))
    : prevEnergy;

  float curBeatFrac = fract(float(max(BEAT_COUNT, 0)) / 64.0);
  float beatDiff = abs(curBeatFrac - s1.a);
  bool beatChanged = (beatDiff > 0.005 && beatDiff < 0.995) && AUDIO_BEAT > 0.5;
  int beatSlot = max(BEAT_COUNT, 0) % maxDrops;

  bool shouldSpawn = false;
  float spawnStrength = 0.0;

  if (dt > 0.0 && slot < maxDrops && dropTrigger != 3) {
    if (dropTrigger == 2) {
      // Beats only: round-robin across all active drop slots
      if (beatChanged && slot == beatSlot) {
        shouldSpawn = true;
        spawnStrength = clamp((0.75 + AUDIO_BASS * 0.35) * max(triggerBeatBoost, 0.25), 0.3, 2.0);
      }
    } else {
      // Audio + Auto (0) or Audio (Bands) (1):
      // 1) Beat spawns into the round-robin beat slot
      if (beatChanged && triggerBeatBoost > 0.01 && slot == beatSlot) {
        shouldSpawn = true;
        spawnStrength = clamp((0.75 + AUDIO_BASS * 0.35) * triggerBeatBoost, 0.3, 2.0);
      }
      // 2) Per-slot FFT band energy / transient triggers when slot is free (or exited disc)
      if (!shouldSpawn && (cycle <= 0.0001 || cycle > 0.82) && cooldown <= 0.0001) {
        float triggerSig = mix(bandEnergy, flux * 3.8 + bandEnergy * 0.32, triggerTransient);
        if (triggerSig > triggerThreshold && bandEnergy > 0.05) {
          float over = (triggerSig - triggerThreshold) / max(1.0 - triggerThreshold, 0.1);
          shouldSpawn = true;
          spawnStrength = clamp(0.45 + over * 0.95, 0.35, 1.8);
        }
      }
    }
  }

  vec2 pos = s0.rg;
  float hue = s0.b;
  float strength = s1.r;

  if (shouldSpawn) {
    float seedT = floor(TIME * 60.0) + float(BEAT_COUNT) * 13.0 + float(slot) * 31.7;
    pos = vec2(
      hash(vec3(seedT, float(slot), 101.0)),
      hash(vec3(seedT, float(slot), 211.0))
    );
    hue = hash(vec3(seedT, float(slot), 307.0));
    cycle = 0.002;
    strength = clamp(spawnStrength * 0.5, 0.0, 1.0);
    cooldown = clamp(triggerCooldown, 0.02, 1.0);
  }

  if (row == 0) {
    return vec4(pos, hue, cycle);
  }
  return vec4(strength, nextPrevEnergy, cooldown, curBeatFrac);
}

vec3 evalPulse(
  vec2 uv,
  vec2 pos,
  float drop_cycle,
  float hueVal,
  float base_tail,
  float eff_tail,
  float whiteFlash,
  vec3 L,
  vec3 U,
  vec3 V
) {
  vec3 pulse_color = clamp(0.5 * L + saturation * (U * cos(hueVal) + V * sin(hueVal)), 0.0, 1.0);
  vec2 p = abs(uv - pos);
  float f = p.x + p.y - (base_tail + 2.0 * sqrt(2.0)) * drop_cycle;
  float pulse = max(1.0 - abs(f) / eff_tail, 0.0) * exp(-abs(f)) / (0.001 + 100.0 * abs(f));
  pulse_color = mix(pulse_color, vec3(1.0), whiteFlash * smoothstep(0.9, 0.95, pulse));
  pulse = mix(pulse, pulse * smoothstep(0.01, 0.0, f), 0.8);
  return pulse * pulse_color;
}

vec3 drops(vec2 uv) {
  vec3 color = vec3(0.0);
  float hash_cnt = 0.0;

  float ar = audioResponse;
  float bass = AUDIO_BASS * ar;
  float mid = AUDIO_MID * ar;
  float high = AUDIO_HIGH * ar;
  float audioHue = (mid * 0.25 + fract(float(BEAT_COUNT) * 0.137) * smoothstep(0.0, 0.01, ar)) * hueAudio;

  // GRID
  float grid_size = gridSize;
  vec2 g = cos(grid_size * (1.0 + uv) * PI);
  float gMax = max(g.x, g.y);
  float bassLine = clamp(bass * bassPulse * 0.045, 0.0, 0.08);
  float grid = smoothstep(0.98 - bassLine, 0.99 - bassLine * 0.5, gMax);
  float sparkleZ = (high * highSparkle > 0.001) ? floor(TIME * 24.0) * 0.01 : 0.0;
  float sparkleGain = (40.0 / 255.0) * (1.0 + high * highSparkle * 1.8);
  float gridNoise = hash(vec3(uv, sparkleZ));
  grid += (0.0001 / (1.5 + gMax) + grid * sparkleGain * gridNoise);

  // MASKS
  vec2 mask_uv = abs(uv);
  float square_mask = smoothstep(1.01, 1.0, max(mask_uv.x, mask_uv.y));
  float disc_mask = smoothstep(1.0, 0.66, length(uv));

  float activeDrops = clamp(dropsCount, 1.0, 16.0);
  int maxDrops = max(1, int(ceil(activeDrops)));
  float base_tail = max(tailLength, 0.01);
  float eff_tail = base_tail * (1.0 + bass * bassPulse * 0.65);
  float whiteFlash = clamp(0.1 + high * highSparkle * 0.45, 0.0, 0.85);

  vec3 L = normalize(vec3(1.0));
  vec3 U = normalize(vec3(2.0, -1.0, -1.0) / 3.0);
  vec3 V = cross(L, U);

  // 1) Continuous time-driven raindrops (Auto (Time) and Audio + Auto modes)
  if (dropTrigger == 3 || dropTrigger == 0) {
    float autoGain = (dropTrigger == 0) ? 0.72 : 1.0;
    for (int i = 0; i < 16; i++) {
      if (i >= maxDrops) break;
      float dropWeight = clamp(activeDrops - float(i), 0.0, 1.0);
      float anim_instance = float(i);

      float time_offset = hash(vec3(anim_instance, 1.0, hash_cnt++));
      float speed_offset = hash(vec3(anim_instance, 1.0, hash_cnt++));
      float drop_speed = 0.25 * speed * mix(0.8, 1.2, speed_offset);

      float t = drop_speed * TIME + time_offset;
      float drop_cycle = fract(t);
      float drop_instance = floor(t);

      float bandEnergy = IMG_NORM_PIXEL(audioFFT, vec2(slotBandU(anim_instance), 0.5)).r;
      float hue = 2.0 * PI * (hash(vec3(drop_instance, anim_instance, hash_cnt++)) + hueShift + audioHue);
      vec2 pos = vec2(
        -0.5 + hash(vec3(drop_instance, 1.0, hash_cnt++)),
        -0.5 + hash(vec3(drop_instance, 1.0, hash_cnt++))
      );

      float dropBoost = 1.0 + bass * bassPulse * 0.8 + bandEnergy * ar * spectrumGrid * 1.1;
      color += evalPulse(uv, pos, drop_cycle, hue, base_tail, eff_tail, whiteFlash, L, U, V)
             * grid * dropWeight * dropBoost * autoGain;
    }

    // In pure Auto (Time) mode, optionally add a stateless beat ripple
    if (dropTrigger == 3 && triggerBeatBoost > 0.001 && ar > 0.001 && AUDIO_BEAT > 0.005) {
      float bSeed = float(BEAT_COUNT);
      float bCycle = pow(clamp(1.0 - AUDIO_BEAT, 0.0, 1.0), 0.75);
      float bEnv = smoothstep(0.005, 0.08, AUDIO_BEAT) * (0.35 + 0.65 * AUDIO_BEAT);
      float bHue = 2.0 * PI * (hash(vec3(bSeed, 7.0, 31.0)) + hueShift + audioHue);
      vec2 bPos = vec2(
        -0.45 + 0.9 * hash(vec3(bSeed, 2.0, 41.0)),
        -0.45 + 0.9 * hash(vec3(bSeed, 3.0, 53.0))
      );
      color += evalPulse(uv, bPos, bCycle, bHue, base_tail, eff_tail, whiteFlash, L, U, V)
             * grid * bEnv * triggerBeatBoost * ar * 1.3;
    }
  }

  // 2) Stateful audio-triggered raindrops (Audio + Auto, Audio (Bands), and Beats only)
  if (dropTrigger != 3) {
    for (int i = 0; i < 16; i++) {
      if (i >= maxDrops) break;
      vec4 s0 = texelFetch(dropState, ivec2(i, 0), 0);
      float drop_cycle = s0.a;
      if (drop_cycle <= 0.0005) continue;

      vec4 s1 = texelFetch(dropState, ivec2(i, 1), 0);
      float strength = max(s1.r * 2.0, 0.25);
      float dropWeight = clamp(activeDrops - float(i), 0.0, 1.0);
      float bandEnergy = IMG_NORM_PIXEL(audioFFT, vec2(slotBandU(float(i)), 0.5)).r;
      float hue = 2.0 * PI * (s0.b + hueShift + audioHue);
      vec2 pos = s0.rg - 0.5;

      float dropBoost = strength * (1.0 + bass * bassPulse * 0.7 + bandEnergy * ar * spectrumGrid * 0.9);
      color += evalPulse(uv, pos, drop_cycle, hue, base_tail, eff_tail, whiteFlash, L, U, V)
             * grid * dropWeight * dropBoost;
    }
  }

  // Live FFT radial spectrum glow along the neon grid lines
  if (spectrumGrid > 0.001 && ar > 0.001) {
    float rNorm = clamp(length(uv), 0.0, 1.0);
    float fftBin = IMG_NORM_PIXEL(audioFFT, vec2(0.03 + rNorm * 0.78, 0.5)).r;
    float specHue = 2.0 * PI * (rNorm * 0.65 + hueShift + audioHue);
    vec3 specCol = clamp(0.5 * L + saturation * (U * cos(specHue) + V * sin(specHue)), 0.0, 1.0);
    color += pow(fftBin, 1.6) * specCol * grid * spectrumGrid * ar * 0.65;
  }

  color += 0.01 * (0.075 / (1.5 + gMax) + sparkleGain * gridNoise);

  color *= mix(0.0, 1.0, disc_mask);
  color *= square_mask;

  return color;
}

void main() {
  if (PASSINDEX == 0) {
    gl_FragColor = updateDropState(ivec2(gl_FragCoord.xy));
    return;
  }

  // BASIC SETUP
  vec2 uv = (2.0 * isf_FragNormCoord * RENDERSIZE - RENDERSIZE) / max(RENDERSIZE.y, 1.0);
  float camEnergy = (AUDIO_BASS * 0.65 + AUDIO_BEAT * 0.55) * audioResponse * cameraBounce;
  float effFocal = max(0.25, focal * (1.0 + camEnergy * 0.14));
  float effHeight = max(0.1, cameraHeight * (1.0 - camEnergy * 0.12));
  float effPitch = pitch - camEnergy * 0.035;

  vec2 m = cos(vec2(TIME * swaySpeed, TIME * swaySpeed - PI * 0.5)) * swayAmount + vec2(yaw, effPitch);
  vec3 color = vec3(0.0);

  if (topDown) {
    color = drops(uv / (1.0 + camEnergy * 0.08));
  } else {
    // CAMERA SETUP
    vec3 ro = vec3(0.0, effHeight, cameraDist);
    vec3 rd = vec3(uv, -effFocal);

    float angle = m.y * PI;
    float c = cos(angle), s = sin(angle);
    mat2 R = mat2(c, s, -s, c);
    rd.yz = R * rd.yz;

    angle = m.x * PI;
    c = cos(angle);
    s = sin(angle);
    R = mat2(c, s, -s, c);
    rd.xz = R * rd.xz;

    // Solve (ro + rd * t).y = 0 to intersect floor
    if (rd.y < -1e-5) {
      float t = -ro.y / rd.y;
      vec3 ray_hit_pos = ro + t * rd;
      color = drops(0.25 * ray_hit_pos.xz);
    } else {
      gl_FragColor = transparentBg ? vec4(0.0) : vec4(0.0, 0.0, 0.0, 1.0);
      return;
    }
  }

  color = sqrt(tanh(color * color));
  color = sRGBencode(color) * brightness;

  if (transparentBg) {
    float alpha = clamp(max(color.r, max(color.g, color.b)), 0.0, 1.0);
    gl_FragColor = vec4(color / max(alpha, 1e-4), alpha);
  } else {
    gl_FragColor = vec4(color, 1.0);
  }
}
