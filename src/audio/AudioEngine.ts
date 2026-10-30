// Audio input + analysis. Produces two kinds of output each frame:
//  1. Scalar features (bands, level, beat) used by modulators and built-in uniforms.
//  2. 256-wide spectrum / waveform arrays uploaded as textures for ISF `audioFFT` / `audio` inputs.

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

const BANDS: Record<Exclude<BandName, 'level'>, [number, number]> = {
  bass: [20, 150],
  lowMid: [150, 500],
  mid: [500, 2000],
  high: [2000, 10000],
};

const MIN_DB = -100;
const MAX_DB = -20;

/** Envelope follower with separate attack / release time constants (seconds). */
function follow(current: number, target: number, dt: number, attack: number, release: number) {
  const tau = target > current ? attack : release;
  return current + (target - current) * (1 - Math.exp(-dt / tau));
}

export class AudioEngine {
  readonly ctx = new AudioContext();
  readonly analyser = this.ctx.createAnalyser();
  /** Audio routed here ends up in recordings. */
  readonly recordDest = this.ctx.createMediaStreamDestination();
  private monitor = this.ctx.createGain();

  private freqDb: Float32Array<ArrayBuffer>;
  private mag: Float32Array;
  private prevMag: Float32Array;
  private wave: Float32Array<ArrayBuffer>;
  private fluxHistory: number[] = [];
  private lastBeatTime = -1;
  private peaks: Record<BandName, number> = { level: 1e-3, bass: 1e-3, lowMid: 1e-3, mid: 1e-3, high: 1e-3 };

  /** RGBA8 rows ready for texture upload. */
  readonly fftTex = new Uint8Array(TEX_WIDTH * 4);
  readonly waveTex = new Uint8Array(TEX_WIDTH * 4);

  readonly features: AudioFeatures = {
    level: 0, bass: 0, lowMid: 0, mid: 0, high: 0, beat: 0, beatCount: 0, onset: false,
  };

  /** Tunables exposed in the UI. */
  settings = {
    gain: 1,
    beatSensitivity: 1.5,
    beatDecay: 0.15,
    release: 0.12,
  };

  private source: AudioNode | null = null;
  private mediaEl: HTMLAudioElement | null = null;
  private stream: MediaStream | null = null;
  sourceLabel = 'none';

  constructor() {
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.5;
    this.analyser.minDecibels = MIN_DB;
    this.analyser.maxDecibels = MAX_DB;
    const bins = this.analyser.frequencyBinCount;
    this.freqDb = new Float32Array(bins);
    this.mag = new Float32Array(bins);
    this.prevMag = new Float32Array(bins);
    this.wave = new Float32Array(this.analyser.fftSize);
    this.monitor.connect(this.ctx.destination);
  }

  get mediaElement() {
    return this.mediaEl;
  }

  private detach() {
    this.source?.disconnect();
    this.source = null;
    this.mediaEl?.pause();
    this.mediaEl = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }

  async useFile(file: File) {
    this.detach();
    await this.ctx.resume();
    const el = new Audio(URL.createObjectURL(file));
    el.loop = true;
    const src = this.ctx.createMediaElementSource(el);
    src.connect(this.analyser);
    src.connect(this.monitor);
    src.connect(this.recordDest);
    this.source = src;
    this.mediaEl = el;
    this.sourceLabel = file.name;
    await el.play();
  }

  async listInputDevices() {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((d) => d.kind === 'audioinput');
  }

  /** Live input. Not monitored to avoid feedback; use a loopback device (e.g. BlackHole) for DAW audio. */
  async useInput(deviceId?: string) {
    this.detach();
    await this.ctx.resume();
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
    this.attachStream(stream, stream.getAudioTracks()[0]?.label || 'input');
  }

  /** Capture audio from a browser tab or the system (Chrome asks for a screen share). */
  async useDisplayCapture() {
    this.detach();
    await this.ctx.resume();
    const stream = await navigator.mediaDevices.getDisplayMedia({ audio: true, video: true });
    stream.getVideoTracks().forEach((t) => t.stop());
    if (!stream.getAudioTracks().length) throw new Error('No audio shared — tick "share audio" in the picker.');
    this.attachStream(stream, 'tab / system audio');
  }

  private attachStream(stream: MediaStream, label: string) {
    const src = this.ctx.createMediaStreamSource(stream);
    src.connect(this.analyser);
    src.connect(this.recordDest);
    this.source = src;
    this.stream = stream;
    this.sourceLabel = label;
  }

  private bandEnergy(lo: number, hi: number) {
    const hz = this.ctx.sampleRate / this.analyser.fftSize;
    const a = Math.max(1, Math.floor(lo / hz));
    const b = Math.min(this.mag.length - 1, Math.ceil(hi / hz));
    let sum = 0;
    for (let i = a; i <= b; i++) sum += this.mag[i];
    return sum / (b - a + 1);
  }

  /** Normalise against a slowly-decaying running peak so quiet and loud material both use 0..1. */
  private normalise(band: BandName, energy: number, dt: number) {
    const decayed = this.peaks[band] * Math.exp(-dt / 6);
    this.peaks[band] = Math.max(energy, decayed, 1e-3);
    return Math.min(1, energy / this.peaks[band]);
  }

  update(dt: number, time: number) {
    const f = this.features;
    const { gain, beatSensitivity, beatDecay, release } = this.settings;
    this.analyser.getFloatFrequencyData(this.freqDb);
    this.analyser.getFloatTimeDomainData(this.wave);

    this.prevMag.set(this.mag);
    for (let i = 0; i < this.mag.length; i++) {
      const db = this.freqDb[i];
      this.mag[i] = Number.isFinite(db) ? Math.pow(10, db / 20) * gain : 0;
    }

    // Bands
    for (const [name, [lo, hi]] of Object.entries(BANDS) as [Exclude<BandName, 'level'>, [number, number]][]) {
      const n = this.normalise(name, this.bandEnergy(lo, hi), dt);
      f[name] = follow(f[name], n, dt, 0.015, release);
    }
    let rms = 0;
    for (let i = 0; i < this.wave.length; i++) rms += this.wave[i] * this.wave[i];
    rms = Math.sqrt(rms / this.wave.length) * gain;
    f.level = follow(f.level, this.normalise('level', rms, dt), dt, 0.015, release);

    // Beat: spectral flux in the low end against an adaptive threshold.
    const hz = this.ctx.sampleRate / this.analyser.fftSize;
    const maxBin = Math.ceil(160 / hz);
    let flux = 0;
    for (let i = 1; i <= maxBin; i++) flux += Math.max(0, this.mag[i] - this.prevMag[i]);
    const hist = this.fluxHistory;
    hist.push(flux);
    if (hist.length > 60) hist.shift();
    const mean = hist.reduce((a, b) => a + b, 0) / hist.length;
    const std = Math.sqrt(hist.reduce((a, b) => a + (b - mean) ** 2, 0) / hist.length);
    f.onset =
      hist.length > 20 &&
      flux > mean + beatSensitivity * std &&
      f.bass > 0.3 &&
      time - this.lastBeatTime > 0.18;
    if (f.onset) {
      this.lastBeatTime = time;
      f.beatCount++;
      f.beat = 1;
    } else {
      f.beat *= Math.exp(-dt / beatDecay);
    }

    this.writeTextures();
  }

  private writeTextures() {
    // Spectrum: log-frequency mapping (20Hz..16kHz) so bass isn't squashed into a few pixels.
    const hz = this.ctx.sampleRate / this.analyser.fftSize;
    const nyquistBin = this.freqDb.length - 1;
    for (let x = 0; x < TEX_WIDTH; x++) {
      const f0 = 20 * Math.pow(800, x / TEX_WIDTH);
      const f1 = 20 * Math.pow(800, (x + 1) / TEX_WIDTH);
      const a = Math.min(nyquistBin, Math.floor(f0 / hz));
      const b = Math.min(nyquistBin, Math.max(a, Math.floor(f1 / hz)));
      let db = -Infinity;
      for (let i = a; i <= b; i++) db = Math.max(db, this.freqDb[i]);
      db += 20 * Math.log10(this.settings.gain);
      const v = Math.max(0, Math.min(1, (db - MIN_DB) / (MAX_DB - MIN_DB)));
      const byte = Number.isFinite(v) ? v * 255 : 0;
      this.fftTex.fill(byte, x * 4, x * 4 + 3);
      this.fftTex[x * 4 + 3] = 255;
    }
    // Waveform: centred on 0.5 per the ISF audio convention.
    const step = this.wave.length / TEX_WIDTH;
    for (let x = 0; x < TEX_WIDTH; x++) {
      const s = this.wave[Math.floor(x * step)] * this.settings.gain;
      const byte = Math.max(0, Math.min(255, (s * 0.5 + 0.5) * 255));
      this.waveTex.fill(byte, x * 4, x * 4 + 3);
      this.waveTex[x * 4 + 3] = 255;
    }
  }
}
