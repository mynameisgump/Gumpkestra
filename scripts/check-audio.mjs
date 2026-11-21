// Verify AudioAnalyzer DSP invariants (noise gate, gain vs auto-gain, dynamic contrast,
// per-octave band balance, 60 vs 120 fps invariance, outlier-resilient beat detection)
// plus AudioEngine configuration and AudioPanel UI + persistence.
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';

const server = await createServer({ server: { host: '127.0.0.1', port: 5311 }, logLevel: 'error' });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 1400, height: 860 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://127.0.0.1:5311');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForFunction(() => window.app?.engine.frame > 3);

  const dsp = await page.evaluate(async () => {
    const { AudioAnalyzer, DEFAULT_AUDIO_SETTINGS, sanitiseAudioSettings } = await import('/src/audio/analysis.ts');
    const SR = 48000;
    const BINS = 1024;
    const HZ = SR / (BINS * 2);
    const WAVE_LEN = 2048;

    // Build a synthetic Blackman-consistent spectrum + waveform for a set of tones.
    // One-sided Parseval factor is 0.1523, so a tone of RMS amplitude `rms` puts power `0.1523 * rms^2` into its bin.
    const makeFrame = (tones, floorDb = -160) => {
      const freqDb = new Float32Array(BINS).fill(floorDb);
      const wave = new Float32Array(WAVE_LEN);
      let totalRmsSq = 0;
      for (const { hz, db } of tones) {
        const rms = Math.pow(10, db / 20);
        totalRmsSq += rms * rms;
        const bin = Math.max(1, Math.min(BINS - 1, Math.round(hz / HZ)));
        const binMag = Math.sqrt(0.1523) * rms;
        freqDb[bin] = 20 * Math.log10(binMag);
      }
      if (totalRmsSq > 0) {
        const peak = Math.sqrt(2 * totalRmsSq);
        for (let i = 0; i < WAVE_LEN; i++) wave[i] = peak * Math.sin((2 * Math.PI * 100 * i) / SR);
      }
      return { freqDb, wave };
    };

    // 1. Noise gate suppresses -70 dBFS hiss even after 10 s and with gain = 4.
    const gateTest = (() => {
      const an = new AudioAnalyzer(BINS);
      const settings = { ...DEFAULT_AUDIO_SETTINGS, gain: 4, noiseGate: -60, autoGain: true };
      const quiet = makeFrame([{ hz: 80, db: -70 }, { hz: 4000, db: -70 }]);
      for (let i = 0; i < 600; i++) an.update(quiet.freqDb, quiet.wave, SR, 1 / 60, i / 60, settings);
      const gated = { level: an.features.level, bass: an.features.bass, high: an.features.high, beats: an.features.beatCount };
      // Lowering noiseGate below -70 lets the signal through cleanly.
      const openSettings = { ...settings, noiseGate: -80 };
      for (let i = 600; i < 660; i++) an.update(quiet.freqDb, quiet.wave, SR, 1 / 60, i / 60, openSettings);
      const opened = { level: an.features.level, bass: an.features.bass, high: an.features.high };
      return { gated, opened };
    })();

    // 2. Post-normalisation gain stays effective with autoGain = true.
    const gainTest = (() => {
      const runWithGain = (gain) => {
        const an = new AudioAnalyzer(BINS);
        const settings = { ...DEFAULT_AUDIO_SETTINGS, gain, autoGain: true };
        // Pulse between -10 dB and -22 dB so refDb anchors around -10 dB and we read the -22 dB mid-level.
        const loud = makeFrame([{ hz: 80, db: -10 }]);
        const mid = makeFrame([{ hz: 80, db: -22 }]);
        for (let i = 0; i < 120; i++) an.update(loud.freqDb, loud.wave, SR, 1 / 60, i / 60, settings);
        for (let i = 120; i < 180; i++) an.update(mid.freqDb, mid.wave, SR, 1 / 60, i / 60, settings);
        return { level: an.features.level, bass: an.features.bass };
      };
      return { low: runWithGain(0.5), unity: runWithGain(1), high: runWithGain(2.5) };
    })();

    // 3. Dynamic contrast: breakdown (-28 dB) stays calmer than drop (-10 dB).
    const contrastTest = (() => {
      const an = new AudioAnalyzer(BINS);
      const settings = { ...DEFAULT_AUDIO_SETTINGS, autoGain: true };
      const drop = makeFrame([{ hz: 80, db: -10 }, { hz: 1000, db: -12 }]);
      const breakdown = makeFrame([{ hz: 80, db: -28 }, { hz: 1000, db: -30 }]);
      for (let i = 0; i < 120; i++) an.update(drop.freqDb, drop.wave, SR, 1 / 60, i / 60, settings);
      const dropLevel = an.features.level;
      for (let i = 120; i < 240; i++) an.update(breakdown.freqDb, breakdown.wave, SR, 1 / 60, i / 60, settings);
      const breakLevel = an.features.level;
      return { dropLevel, breakLevel };
    })();

    // 4. Per-octave balance: equal-dB tones in bass (80 Hz) and high (4000 Hz) match closely (no wide-band dilution).
    const balanceTest = (() => {
      const runTone = (hz) => {
        const an = new AudioAnalyzer(BINS);
        const settings = { ...DEFAULT_AUDIO_SETTINGS, autoGain: false };
        const frame = makeFrame([{ hz, db: -16 }]);
        for (let i = 0; i < 60; i++) an.update(frame.freqDb, frame.wave, SR, 1 / 60, i / 60, settings);
        return { bass: an.features.bass, high: an.features.high };
      };
      return { bassTone: runTone(80).bass, highTone: runTone(4000).high };
    })();

    // 5. Frame-rate invariance (60 vs 120 fps) for envelopes, fftTex, and 120 BPM beat detection.
    const fpsTest = (() => {
      const runBeats = (fps, outlierAtSec = -1, sens = DEFAULT_AUDIO_SETTINGS.beatSensitivity) => {
        const an = new AudioAnalyzer(BINS);
        const settings = { ...DEFAULT_AUDIO_SETTINGS, beatSensitivity: sens };
        const dt = 1 / fps;
        const totalSec = 5.0;
        const steps = Math.round(totalSec * fps);
        const beatTimes = [];
        for (let i = 0; i < steps; i++) {
          const t = i * dt;
          // Kick every 0.5 s starting at 0.5 s, decaying over ~90 ms.
          const phase = t % 0.5;
          const isKick = t >= 0.5 && phase < 0.09;
          const isOutlier = outlierAtSec > 0 && Math.abs(t - outlierAtSec) < 0.09;
          const kickDb = isOutlier ? -2 : isKick ? -14 - phase * 180 : -40;
          const frame = makeFrame([{ hz: 70, db: kickDb }, { hz: 200, db: kickDb - 8 }]);
          an.update(frame.freqDb, frame.wave, SR, dt, t, settings);
          if (an.features.onset) beatTimes.push(Number(t.toFixed(3)));
        }
        return { count: an.features.beatCount, beatTimes, fftLow: an.fftTex[40 * 4] };
      };
      const fps60 = runBeats(60);
      const fps120 = runBeats(120);
      const withOutlier = runBeats(60, 2.0);
      // Envelope decay check at 60 vs 120 fps.
      const decayAt = (fps) => {
        const an = new AudioAnalyzer(BINS);
        const settings = { ...DEFAULT_AUDIO_SETTINGS, autoGain: false, release: 0.15 };
        const dt = 1 / fps;
        const hit = makeFrame([{ hz: 80, db: -10 }]);
        const quiet = makeFrame([]);
        for (let i = 0; i < Math.round(0.2 * fps); i++) an.update(hit.freqDb, hit.wave, SR, dt, i * dt, settings);
        for (let i = 0; i < Math.round(0.15 * fps); i++) an.update(quiet.freqDb, quiet.wave, SR, dt, 0.2 + i * dt, settings);
        return { bass: an.features.bass, fft: an.fftTex[30 * 4] };
      };
      return { fps60, fps120, withOutlier, decay60: decayAt(60), decay120: decayAt(120) };
    })();

    // 6. Sensitivity direction: higher beatSensitivity catches subtle hits that lower sensitivity ignores.
    const sensTest = (() => {
      const runSubtle = (beatSensitivity) => {
        const an = new AudioAnalyzer(BINS);
        const settings = { ...DEFAULT_AUDIO_SETTINGS, beatSensitivity };
        const dt = 1 / 60;
        for (let i = 0; i < 300; i++) {
          const t = i * dt;
          const phase = t % 0.5;
          // Modest +5 dB bump over a steady -24 dB bass pad.
          const db = t >= 0.5 && phase < 0.06 ? -19 : -24;
          const frame = makeFrame([{ hz: 75, db }]);
          an.update(frame.freqDb, frame.wave, SR, dt, t, settings);
        }
        return an.features.beatCount;
      };
      return { strict: runSubtle(0.1), sensitive: runSubtle(0.95) };
    })();

    // 7. Edge cases: -Infinity, dt=0, backward time, corrupt settings.
    const edgeTest = (() => {
      const an = new AudioAnalyzer(BINS);
      const inf = new Float32Array(BINS).fill(-Infinity);
      const zeroWave = new Float32Array(WAVE_LEN);
      an.update(inf, zeroWave, SR, 0, 0, DEFAULT_AUDIO_SETTINGS);
      an.update(inf, zeroWave, SR, 1 / 60, 1, DEFAULT_AUDIO_SETTINGS);
      an.update(inf, zeroWave, SR, 1 / 60, 0.5, DEFAULT_AUDIO_SETTINGS); // backward time jump
      const allFinite = Object.values(an.features).every((v) => typeof v === 'boolean' || Number.isFinite(v));
      const clean = sanitiseAudioSettings({ gain: 99, noiseGate: 'bad', autoGain: false, release: -1, beatSensitivity: 2, beatDecay: NaN });
      return { allFinite, clean };
    })();

    return { gateTest, gainTest, contrastTest, balanceTest, fpsTest, sensTest, edgeTest };
  });

  // Assert noise gate
  assert.equal(dsp.gateTest.gated.level, 0, 'Gated silence level should be 0');
  assert.equal(dsp.gateTest.gated.bass, 0, 'Gated silence bass should be 0');
  assert.equal(dsp.gateTest.gated.high, 0, 'Gated silence high should be 0');
  assert.equal(dsp.gateTest.gated.beats, 0, 'Gated silence should fire 0 beats');
  assert.ok(dsp.gateTest.opened.level > 0.2 && dsp.gateTest.opened.bass > 0.2, `Lowering gate should let -70 dB through: ${JSON.stringify(dsp.gateTest.opened)}`);

  // Assert post-normalisation gain effectiveness
  assert.ok(dsp.gainTest.low.bass < dsp.gainTest.unity.bass && dsp.gainTest.unity.bass < dsp.gainTest.high.bass,
    `Gain should scale bands monotonically with autoGain on: ${JSON.stringify(dsp.gainTest)}`);

  // Assert macro dynamic contrast
  assert.ok(dsp.contrastTest.dropLevel > 0.8 && dsp.contrastTest.breakLevel < dsp.contrastTest.dropLevel * 0.65,
    `Breakdown should stay clearly calmer than drop: ${JSON.stringify(dsp.contrastTest)}`);

  // Assert per-octave band balance (within 20% for equal-dB tones in bass vs high)
  assert.ok(Math.abs(dsp.balanceTest.bassTone - dsp.balanceTest.highTone) < 0.15,
    `Bass and high equal-dB tones should be balanced: ${JSON.stringify(dsp.balanceTest)}`);

  // Assert 60 vs 120 fps invariance
  assert.ok(dsp.fpsTest.fps60.count >= 8 && dsp.fpsTest.fps60.count <= 10, `Expected ~9 beats at 60 fps, got ${dsp.fpsTest.fps60.count}`);
  assert.equal(dsp.fpsTest.fps120.count, dsp.fpsTest.fps60.count,
    `Beat count should match across 60 and 120 fps (${dsp.fpsTest.fps60.count} vs ${dsp.fpsTest.fps120.count})`);
  assert.ok(Math.abs(dsp.fpsTest.decay60.bass - dsp.fpsTest.decay120.bass) < 0.02,
    `Envelope decay should be frame-rate invariant: ${JSON.stringify([dsp.fpsTest.decay60, dsp.fpsTest.decay120])}`);
  assert.ok(Math.abs(dsp.fpsTest.decay60.fft - dsp.fpsTest.decay120.fft) <= 4,
    `FFT texture decay should be frame-rate invariant: ${JSON.stringify([dsp.fpsTest.decay60, dsp.fpsTest.decay120])}`);

  // Assert outlier kick does not mask subsequent normal kicks
  const beatsAfterOutlier = dsp.fpsTest.withOutlier.beatTimes.filter((t) => t > 2.3);
  assert.ok(beatsAfterOutlier.length >= 4, `Normal kicks after outlier drop must still trigger, got: ${JSON.stringify(beatsAfterOutlier)}`);

  // Assert beatSensitivity direction (higher = more sensitive)
  assert.ok(dsp.sensTest.sensitive > dsp.sensTest.strict,
    `Higher beatSensitivity should catch more subtle hits: ${JSON.stringify(dsp.sensTest)}`);

  // Assert edge safety & settings sanitisation
  assert.equal(dsp.edgeTest.allFinite, true);
  assert.deepEqual(dsp.edgeTest.clean, {
    gain: 8,
    noiseGate: -60,
    autoGain: false,
    release: 0.02,
    beatSensitivity: 1,
    beatDecay: 0.15,
  });

  // Live browser engine + UI + persistence check
  const smoothing = await page.evaluate(() => window.app.audio.analyser.smoothingTimeConstant);
  assert.equal(smoothing, 0, 'AnalyserNode smoothingTimeConstant must be 0');

  const overflow = await page.locator('#audio-panel').evaluate((el) => el.scrollWidth > el.clientWidth);
  assert.equal(overflow, false, 'Audio panel must not overflow horizontally');

  // Toggle Auto-gain off and adjust Noise gate, then reload and verify persistence.
  await page.getByLabel('Auto-gain').uncheck();
  await page.getByLabel('Noise gate').fill('-48');
  await page.getByLabel('Noise gate').dispatchEvent('input');
  await page.reload();
  await page.waitForFunction(() => window.app?.engine.frame > 3);
  const persisted = await page.evaluate(() => window.app.audio.settings);
  assert.equal(persisted.autoGain, false, 'autoGain should persist across reload');
  assert.equal(persisted.noiseGate, -48, 'noiseGate should persist across reload');

  // Exercise live Web Audio input path with Chromium's fake mic device.
  await page.evaluate(async () => {
    window.app.audio.settings.autoGain = true;
    window.app.audio.settings.noiseGate = -60;
    await window.app.audio.useInput();
  });
  await page.waitForTimeout(800);
  const live = await page.evaluate(() => ({ ...window.app.audio.features }));
  assert.ok(Number.isFinite(live.level) && live.level > 0, `Expected non-zero live level from fake mic, got ${JSON.stringify(live)}`);

  assert.deepEqual(errors, []);
  console.log('Audio DSP: noise gate, gain/auto-gain, dynamic contrast, per-octave balance, 60/120 fps invariance, outlier-resilient beats, UI & persistence passed.');
} finally {
  await browser?.close();
  await server.close();
}
