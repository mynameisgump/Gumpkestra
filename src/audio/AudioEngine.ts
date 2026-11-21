// Audio input + analysis. Produces two kinds of output each frame:
//  1. Scalar features (bands, level, beat) used by modulators and built-in uniforms.
//  2. 256-wide spectrum / waveform arrays uploaded as textures for ISF `audioFFT` / `audio` inputs.

import {
  AudioAnalyzer,
  MAX_DB,
  MIN_DB,
  sanitiseAudioSettings,
  TEX_WIDTH,
  type AudioDiagnostics,
  type AudioFeatures,
  type AudioSettings,
  type BandName,
} from './analysis';

export { TEX_WIDTH, type AudioDiagnostics, type AudioFeatures, type AudioSettings, type BandName };

const SETTINGS_KEY = 'gumpkestra:audio-settings';

function loadSettings(): AudioSettings {
  try {
    return sanitiseAudioSettings(JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? 'null'));
  } catch {
    return sanitiseAudioSettings(null);
  }
}

export class AudioEngine {
  readonly ctx = new AudioContext();
  readonly analyser = this.ctx.createAnalyser();
  /** Audio routed here ends up in recordings. */
  readonly recordDest = this.ctx.createMediaStreamDestination();
  private monitor = this.ctx.createGain();

  private freqDb: Float32Array<ArrayBuffer>;
  private wave: Float32Array<ArrayBuffer>;
  private analyzer: AudioAnalyzer;

  /** RGBA8 rows ready for texture upload. */
  readonly fftTex: Uint8Array;
  readonly waveTex: Uint8Array;
  readonly features: AudioFeatures;
  readonly diagnostics: AudioDiagnostics;

  /** Tunables exposed in the UI and persisted in this browser. */
  settings: AudioSettings = loadSettings();

  private source: AudioNode | null = null;
  private mediaEl: HTMLAudioElement | null = null;
  private objectUrl: string | null = null;
  private stream: MediaStream | null = null;
  sourceLabel = 'none';

  constructor() {
    this.analyser.fftSize = 2048;
    // All temporal smoothing is done in AudioAnalyzer using dt so reactivity
    // stays frame-rate independent and transients are not smeared before flux analysis.
    this.analyser.smoothingTimeConstant = 0;
    this.analyser.minDecibels = MIN_DB;
    this.analyser.maxDecibels = MAX_DB;
    const bins = this.analyser.frequencyBinCount;
    this.freqDb = new Float32Array(bins);
    this.wave = new Float32Array(this.analyser.fftSize);
    this.analyzer = new AudioAnalyzer(bins);
    this.fftTex = this.analyzer.fftTex;
    this.waveTex = this.analyzer.waveTex;
    this.features = this.analyzer.features;
    this.diagnostics = this.analyzer.diagnostics;
    this.monitor.connect(this.ctx.destination);
  }

  get mediaElement() {
    return this.mediaEl;
  }

  saveSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
    } catch {
      /* storage unavailable — settings still apply for this session */
    }
  }

  private detach() {
    this.source?.disconnect();
    this.source = null;
    this.mediaEl?.pause();
    this.mediaEl = null;
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.analyzer.reset();
  }

  async useFile(file: File) {
    this.detach();
    await this.ctx.resume();
    const url = URL.createObjectURL(file);
    const el = new Audio(url);
    el.loop = true;
    const src = this.ctx.createMediaElementSource(el);
    src.connect(this.analyser);
    src.connect(this.monitor);
    src.connect(this.recordDest);
    this.source = src;
    this.mediaEl = el;
    this.objectUrl = url;
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

  update(dt: number, time: number) {
    this.analyser.getFloatFrequencyData(this.freqDb);
    this.analyser.getFloatTimeDomainData(this.wave);
    this.analyzer.update(this.freqDb, this.wave, this.ctx.sampleRate, dt, time, this.settings);
  }
}
