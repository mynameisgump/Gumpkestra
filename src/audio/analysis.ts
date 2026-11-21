// Pure DSP analysis for Gumpkestra's audio engine.
// Separated from Web Audio routing so it stays frame-rate independent and unit-testable.

export const TEX_WIDTH = 256;

export type BandName = 'level' | 'bass' | 'lowMid' | 'mid' | 'high';

export interface AudioFeatures {
  level: number;
  bass: number;
  lowMid: number;
  mid: number;
  high: number;
  /** 1 on a detected beat, decays towards 0. */
  beat: number;
  beatCount: number;
  /** True only on the frame a beat was detected. */
  onset: boolean;
}

export interface AudioSettings {
  /** Post-normalisation drive multiplier (0.1..8). */
  gain: number;
  /** Input noise floor in dBFS (-90..-20). Signals below this gate cleanly to 0. */
  noiseGate: number;
  /** Track loudness automatically so quiet and loud sources both use 0..1. */
  autoGain: boolean;
  /** Envelope release time in seconds for bands and spectrum texture (0.02..0.6). */
  release: number;
  /** Beat onset sensitivity (0 = strict, 1 = very sensitive). */
  beatSensitivity: number;
  /** Beat envelope decay time in seconds (0.03..0.6). */
  beatDecay: number;
}

export interface AudioDiagnostics {
  levelDb: number;
  refDb: number;
  flux: number;
  threshold: number;
}

export const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  gain: 1,
  noiseGate: -60,
  autoGain: true,
  release: 0.12,
  beatSensitivity: 0.55,
  beatDecay: 0.15,
};

export const BANDS: Record<Exclude<BandName, 'level'>, [number, number]> = {
  bass: [20, 150],
  lowMid: [150, 500],
  mid: [500, 2000],
  high: [2000, 10000],
};

const BAND_LIST: BandName[] = ['level', 'bass', 'lowMid', 'mid', 'high'];

export const MIN_DB = -100;
export const MAX_DB = -20;

// Web Audio AnalyserNode applies a Blackman window (a0=0.42, a1=0.5, a2=0.08) with 1/N FFT scaling.
// One-sided Parseval power factor: (a0^2 + 0.5*a1^2 + 0.5*a2^2) / 2 ≈ 0.1523.
const BLACKMAN_POWER_NORM = 0.1523;
const DYNAMIC_RANGE_DB = 36;
const GATE_KNEE_DB = 4;
const BAND_ATTACK = 0.008;
const FFT_ATTACK = 0.012;
const FLUX_BANDS = 36;
const FLUX_MIN_HZ = 40;
const FLUX_MAX_HZ = 8000;
const FLUX_LOG_SCALE = 24;
const FLUX_BASE_ATTACK = 0.055;
const FLUX_BASE_RELEASE = 0.09;
const FLUX_WINDOW_SEC = 1.2;
const FLUX_WARMUP_SEC = 0.35;
const MIN_FLUX_SPREAD = 0.03;
const MIN_BEAT_INTERVAL = 0.22;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Envelope follower with separate attack / release time constants (seconds). */
export function follow(current: number, target: number, dt: number, attack: number, release: number): number {
  if (dt <= 0) return current;
  const tau = target > current ? attack : release;
  if (tau <= 0) return target;
  return current + (target - current) * (1 - Math.exp(-dt / tau));
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function medianOfSorted(sorted: number[], n: number): number {
  if (n <= 0) return 0;
  const mid = n >> 1;
  return n % 2 === 1 ? sorted[mid] : 0.5 * (sorted[mid - 1] + sorted[mid]);
}

/** Validate and clamp a partial settings object (e.g. from localStorage). */
export function sanitiseAudioSettings(raw: unknown): AudioSettings {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const num = (k: keyof AudioSettings, lo: number, hi: number, fallback: number) => {
    const v = src[k];
    return typeof v === 'number' && Number.isFinite(v) ? clamp(v, lo, hi) : fallback;
  };
  return {
    gain: num('gain', 0.1, 8, DEFAULT_AUDIO_SETTINGS.gain),
    noiseGate: num('noiseGate', -90, -20, DEFAULT_AUDIO_SETTINGS.noiseGate),
    autoGain: typeof src.autoGain === 'boolean' ? src.autoGain : DEFAULT_AUDIO_SETTINGS.autoGain,
    release: num('release', 0.02, 0.6, DEFAULT_AUDIO_SETTINGS.release),
    beatSensitivity: num('beatSensitivity', 0, 1, DEFAULT_AUDIO_SETTINGS.beatSensitivity),
    beatDecay: num('beatDecay', 0.03, 0.6, DEFAULT_AUDIO_SETTINGS.beatDecay),
  };
}

interface FluxSample {
  time: number;
  value: number;
}

export class AudioAnalyzer {
  private rawMag: Float32Array;
  private fluxCur = new Float32Array(FLUX_BANDS);
  private fluxBase = new Float32Array(FLUX_BANDS);
  private fluxInit = false;
  private fluxHistory: FluxSample[] = [];
  private sortScratch: number[] = [];
  private devScratch: number[] = [];
  private lastBeatTime = -Infinity;
  private lastTime = -Infinity;

  private hasRef = false;
  private refDb = -24;
  private hasFluxRef = false;
  private fluxRefDb = -24;
  private bandCeilDb: Record<BandName, number> = {
    level: -24, bass: -24, lowMid: -24, mid: -24, high: -24,
  };
  private fftSmooth = new Float32Array(TEX_WIDTH);

  /** RGBA8 rows ready for texture upload. */
  readonly fftTex = new Uint8Array(TEX_WIDTH * 4);
  readonly waveTex = new Uint8Array(TEX_WIDTH * 4);

  readonly features: AudioFeatures = {
    level: 0, bass: 0, lowMid: 0, mid: 0, high: 0, beat: 0, beatCount: 0, onset: false,
  };

  readonly diagnostics: AudioDiagnostics = {
    levelDb: -160,
    refDb: -24,
    flux: 0,
    threshold: MIN_FLUX_SPREAD,
  };

  constructor(bins: number) {
    this.rawMag = new Float32Array(bins);
    // Initialise alpha channel once; RGB is updated every frame.
    for (let x = 0; x < TEX_WIDTH; x++) {
      this.fftTex[x * 4 + 3] = 255;
      this.waveTex[x * 4] = 128;
      this.waveTex[x * 4 + 1] = 128;
      this.waveTex[x * 4 + 2] = 128;
      this.waveTex[x * 4 + 3] = 255;
    }
  }

  /** Clear adaptive tracking state (e.g. when switching audio sources). */
  reset() {
    this.rawMag.fill(0);
    this.fluxCur.fill(0);
    this.fluxBase.fill(0);
    this.fluxInit = false;
    this.fluxHistory.length = 0;
    this.lastBeatTime = -Infinity;
    this.lastTime = -Infinity;
    this.hasRef = false;
    this.refDb = -24;
    this.hasFluxRef = false;
    this.fluxRefDb = -24;
    for (const b of BAND_LIST) this.bandCeilDb[b] = -24;
    this.fftSmooth.fill(0);
    this.features.onset = false;
  }

  private ensureBins(bins: number) {
    if (this.rawMag.length === bins) return;
    this.rawMag = new Float32Array(bins);
    this.fluxInit = false;
  }

  private bandDb(lo: number, hi: number, hz: number): number {
    const a = Math.max(1, Math.ceil(lo / hz));
    const b = Math.min(this.rawMag.length - 1, Math.max(a, Math.ceil(hi / hz) - 1));
    let power = 0;
    for (let i = a; i <= b; i++) power += this.rawMag[i] * this.rawMag[i];
    const octaves = Math.log2(hi / lo);
    const rms = Math.sqrt(power / (BLACKMAN_POWER_NORM * octaves));
    return rms > 1e-8 ? 20 * Math.log10(rms) : -160;
  }

  update(
    freqDb: Float32Array,
    wave: Float32Array,
    sampleRate: number,
    rawDt: number,
    time: number,
    settings: AudioSettings,
  ) {
    const dt = Math.max(0, rawDt);
    const f = this.features;
    this.ensureBins(freqDb.length);

    const fftSize = freqDb.length * 2;
    const hz = sampleRate / fftSize;
    const { gain, noiseGate, autoGain, release, beatSensitivity, beatDecay } = settings;
    const gainDb = 20 * Math.log10(Math.max(1e-3, gain));

    // Un-gained linear magnitudes from raw AnalyserNode dBFS bins.
    for (let i = 0; i < freqDb.length; i++) {
      const db = freqDb[i];
      this.rawMag[i] = Number.isFinite(db) && db > -140 ? Math.pow(10, db / 20) : 0;
    }

    // Time-domain RMS level in dBFS.
    let rmsSq = 0;
    for (let i = 0; i < wave.length; i++) rmsSq += wave[i] * wave[i];
    const rms = wave.length > 0 ? Math.sqrt(rmsSq / wave.length) : 0;
    const levelDb = rms > 1e-8 ? 20 * Math.log10(rms) : -160;

    // Per-octave RMS energy in dBFS for each frequency band.
    const bandDbs: Record<BandName, number> = {
      level: levelDb,
      bass: this.bandDb(BANDS.bass[0], BANDS.bass[1], hz),
      lowMid: this.bandDb(BANDS.lowMid[0], BANDS.lowMid[1], hz),
      mid: this.bandDb(BANDS.mid[0], BANDS.mid[1], hz),
      high: this.bandDb(BANDS.high[0], BANDS.high[1], hz),
    };

    // Adaptive reference ceiling (pre-gain, floored above the noise gate so silence never pumps).
    const peakDb = Math.max(bandDbs.level, bandDbs.bass, bandDbs.lowMid, bandDbs.mid, bandDbs.high);
    const minRefDb = Math.min(-6, noiseGate + 24);
    if (!this.hasRef) {
      if (peakDb > noiseGate) {
        this.refDb = Math.max(minRefDb, peakDb);
        for (const b of BAND_LIST) {
          this.bandCeilDb[b] = clamp(bandDbs[b], Math.max(noiseGate + 20, this.refDb - 14), this.refDb + 4);
        }
        this.hasRef = true;
      } else {
        this.refDb = minRefDb;
      }
    } else if (peakDb > this.refDb) {
      this.refDb = follow(this.refDb, peakDb, dt, 0.04, 0.04);
    } else {
      const decayRate = peakDb > noiseGate ? 1.5 : 1.0; // dB per second
      this.refDb = Math.max(minRefDb, this.refDb - decayRate * dt);
    }

    const minBandCeil = Math.max(noiseGate + 20, this.refDb - 14);
    const maxBandCeil = this.refDb + 4;
    for (const b of BAND_LIST) {
      const db = bandDbs[b];
      if (db > this.bandCeilDb[b]) {
        this.bandCeilDb[b] = follow(this.bandCeilDb[b], db, dt, 0.04, 0.04);
      } else {
        this.bandCeilDb[b] -= 1.2 * dt;
      }
      this.bandCeilDb[b] = clamp(this.bandCeilDb[b], minBandCeil, maxBandCeil);

      // Map perceptual dB -> 0..1 with soft noise gate and post-normalisation gain.
      const ceilDb = autoGain ? this.bandCeilDb[b] : (b === 'level' ? -6 : -10);
      const floorDb = Math.max(noiseGate, ceilDb - DYNAMIC_RANGE_DB);
      const span = Math.max(12, ceilDb - floorDb);
      const gate = smoothstep(noiseGate, noiseGate + GATE_KNEE_DB, db);
      const norm = clamp((db + gainDb - floorDb) / span, 0, 1);
      const target = gate * Math.pow(norm, 1.35);
      f[b] = follow(f[b], target, dt, BAND_ATTACK, release);
    }

    // Dedicated loudness ceiling for onset flux, tracking down near the noise gate so quiet
    // sources (mic pickup, low system volume) get the same onset scale as full-scale digital audio.
    const minFluxRefDb = Math.min(-6, noiseGate + GATE_KNEE_DB);
    if (!this.hasFluxRef) {
      if (peakDb > noiseGate) {
        this.fluxRefDb = Math.max(minFluxRefDb, peakDb);
        this.hasFluxRef = true;
      } else {
        this.fluxRefDb = minFluxRefDb;
      }
    } else if (peakDb > this.fluxRefDb) {
      this.fluxRefDb = follow(this.fluxRefDb, peakDb, dt, 0.04, 0.04);
    } else {
      const decayRate = peakDb > noiseGate ? 2.5 : 1.5;
      this.fluxRefDb = Math.max(minFluxRefDb, this.fluxRefDb - decayRate * dt);
    }

    // Beat / onset detection: loudness-normalised 36-band log-frequency SuperFlux + median/MAD threshold.
    // Constant-Q log sub-bands (25 Hz..8 kHz) give equal sensitivity to narrowband tones and broadband
    // hits across bass, low-mid, mid, and high, while 3-band max baseline suppresses vibrato/sweeps.
    const nyquistBin = this.rawMag.length - 1;
    const normRefDb = clamp(
      autoGain ? this.fluxRefDb - Math.max(0, gainDb * 0.25) : -10 - gainDb,
      -120,
      12,
    );
    const invFluxRef = Math.pow(10, -normRefDb / 20);
    const ratio = FLUX_MAX_HZ / FLUX_MIN_HZ;
    for (let k = 0; k < FLUX_BANDS; k++) {
      const f0 = FLUX_MIN_HZ * Math.pow(ratio, k / FLUX_BANDS);
      const f1 = FLUX_MIN_HZ * Math.pow(ratio, (k + 1) / FLUX_BANDS);
      const a = Math.max(1, Math.min(nyquistBin, Math.floor(f0 / hz)));
      const b = Math.min(nyquistBin, Math.max(a, Math.floor(f1 / hz)));
      let power = 0;
      for (let i = a; i <= b; i++) power += this.rawMag[i] * this.rawMag[i];
      const subMag = Math.sqrt(power / BLACKMAN_POWER_NORM);
      this.fluxCur[k] = Math.log1p(FLUX_LOG_SCALE * subMag * invFluxRef);
    }

    let rawFlux = 0;
    if (!this.fluxInit) {
      this.fluxBase.set(this.fluxCur);
      this.fluxInit = true;
    } else {
      // Group log sub-bands into 4 musical ranges (bass, lowMid, mid, high) using RMS per range.
      let bassSq = 0, bassN = 0;
      let lowMidSq = 0, lowMidN = 0;
      let midSq = 0, midN = 0;
      let highSq = 0, highN = 0;
      for (let k = 0; k < FLUX_BANDS; k++) {
        const base = Math.max(
          k > 0 ? this.fluxBase[k - 1] : 0,
          this.fluxBase[k],
          k + 1 < FLUX_BANDS ? this.fluxBase[k + 1] : 0,
        );
        const diff = this.fluxCur[k] - base;
        const d2 = diff > 0 ? diff * diff : 0;
        const fc = FLUX_MIN_HZ * Math.pow(ratio, (k + 0.5) / FLUX_BANDS);
        if (fc < 160) { bassSq += d2; bassN++; }
        else if (fc < 500) { lowMidSq += d2; lowMidN++; }
        else if (fc < 2500) { midSq += d2; midN++; }
        else { highSq += d2; highN++; }
      }
      for (let k = 0; k < FLUX_BANDS; k++) {
        this.fluxBase[k] = follow(this.fluxBase[k], this.fluxCur[k], dt, FLUX_BASE_ATTACK, FLUX_BASE_RELEASE);
      }
      const fBass = Math.sqrt(bassSq / Math.max(1, bassN));
      const fLowMid = Math.sqrt(lowMidSq / Math.max(1, lowMidN));
      const fMid = Math.sqrt(midSq / Math.max(1, midN));
      const fHigh = Math.sqrt(highSq / Math.max(1, highN));
      const weightedAvg = (1.0 * fBass + 0.80 * fLowMid + 0.70 * fMid + 0.30 * fHigh) / 2.80;
      const dominant = Math.max(1.0 * fBass, 0.85 * fLowMid, 0.75 * fMid, 0.35 * fHigh);
      rawFlux = 0.5 * weightedAvg + 0.5 * dominant;
    }

    const fluxGate = smoothstep(noiseGate, noiseGate + GATE_KNEE_DB, peakDb);
    const flux = fluxGate * rawFlux;

    if (time < this.lastTime) {
      this.fluxHistory.length = 0;
      this.lastBeatTime = -Infinity;
    }
    this.lastTime = time;

    const hist = this.fluxHistory;
    hist.push({ time, value: flux });
    while (hist.length > 1 && time - hist[0].time > FLUX_WINDOW_SEC) hist.shift();

    const n = hist.length;
    const sorted = this.sortScratch;
    sorted.length = n;
    for (let i = 0; i < n; i++) sorted[i] = hist[i].value;
    sorted.sort((a, b) => a - b);
    const median = medianOfSorted(sorted, n);

    const devs = this.devScratch;
    devs.length = n;
    for (let i = 0; i < n; i++) devs[i] = Math.abs(sorted[i] - median);
    devs.sort((a, b) => a - b);
    const mad = medianOfSorted(devs, n);
    // 90%-trimmed mean deviation handles sparse beats (where >50% of frames are silent so MAD=0)
    // while still ignoring massive outlier drops.
    const trimCount = Math.max(1, Math.floor(n * 0.9));
    let trimSum = 0;
    for (let i = 0; i < trimCount; i++) trimSum += devs[i];
    const trimmedMeanDev = trimSum / trimCount;

    const sens = clamp(beatSensitivity, 0, 1);
    const spread = Math.max(1.4826 * mad, trimmedMeanDev, MIN_FLUX_SPREAD);
    // Higher beatSensitivity (0..1) -> lower threshold multiplier (6.0..1.0).
    // Also require a minimum ratio above median flux so steady broadband noise doesn't chatter.
    const mult = 6.0 - sens * 5.0;
    const medianRatio = 1.8 + (1 - sens) * 2.6;
    const threshold = Math.max(median + mult * spread, median * medianRatio);

    const spanSec = n > 1 ? time - hist[0].time : 0;
    const active = Math.max(f.level, f.bass, f.lowMid, f.mid) > 0.08 || peakDb > noiseGate + 6;
    f.onset =
      spanSec >= FLUX_WARMUP_SEC &&
      flux > threshold &&
      active &&
      time - this.lastBeatTime > MIN_BEAT_INTERVAL;

    if (f.onset) {
      this.lastBeatTime = time;
      f.beatCount++;
      f.beat = 1;
    } else if (dt > 0) {
      f.beat *= Math.exp(-dt / Math.max(1e-3, beatDecay));
    }

    this.diagnostics.levelDb = levelDb;
    this.diagnostics.refDb = this.refDb;
    this.diagnostics.flux = flux;
    this.diagnostics.threshold = threshold;

    this.writeTextures(freqDb, wave, hz, dt, gain, gainDb, noiseGate, release);
  }

  private writeTextures(
    freqDb: Float32Array,
    wave: Float32Array,
    hz: number,
    dt: number,
    gain: number,
    gainDb: number,
    noiseGate: number,
    release: number,
  ) {
    // Spectrum: log-frequency mapping (20Hz..16kHz) with dt-based attack/release smoothing.
    const nyquistBin = freqDb.length - 1;
    for (let x = 0; x < TEX_WIDTH; x++) {
      const f0 = 20 * Math.pow(800, x / TEX_WIDTH);
      const f1 = 20 * Math.pow(800, (x + 1) / TEX_WIDTH);
      const a = Math.min(nyquistBin, Math.floor(f0 / hz));
      const b = Math.min(nyquistBin, Math.max(a, Math.floor(f1 / hz)));
      let db = -Infinity;
      for (let i = a; i <= b; i++) db = Math.max(db, freqDb[i]);
      const gate = Number.isFinite(db) ? smoothstep(noiseGate - 10, noiseGate, db) : 0;
      const v = gate * clamp((db + gainDb - MIN_DB) / (MAX_DB - MIN_DB), 0, 1);
      const target = Number.isFinite(v) ? v : 0;
      const sm = follow(this.fftSmooth[x], target, dt, FFT_ATTACK, release);
      this.fftSmooth[x] = sm;
      const byte = Math.round(clamp(sm, 0, 1) * 255);
      this.fftTex[x * 4] = byte;
      this.fftTex[x * 4 + 1] = byte;
      this.fftTex[x * 4 + 2] = byte;
    }

    // Waveform: centred on 0.5 per the ISF audio convention.
    if (wave.length > 0) {
      const step = wave.length / TEX_WIDTH;
      for (let x = 0; x < TEX_WIDTH; x++) {
        const s = wave[Math.floor(x * step)] * gain;
        const byte = Math.round(clamp((s * 0.5 + 0.5) * 255, 0, 255));
        this.waveTex[x * 4] = byte;
        this.waveTex[x * 4 + 1] = byte;
        this.waveTex[x * 4 + 2] = byte;
      }
    }
  }
}
