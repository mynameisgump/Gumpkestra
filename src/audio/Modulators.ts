// Mosh Pro-style modulators: any float parameter can have any number of
// modulators attached. Each produces a 0..1 signal, scaled by `amount`
// (−1..1, as a fraction of the parameter's range) and added to the base value.

import type { AudioFeatures } from './AudioEngine';

export const MOD_SOURCES = {
  level: 'Level',
  bass: 'Bass',
  lowMid: 'Low mid',
  mid: 'Mid',
  high: 'High',
  beat: 'Beat (decay)',
  lfoSine: 'LFO sine',
  lfoSaw: 'LFO saw',
  lfoSquare: 'LFO square',
  random: 'Random on beat',
  beatStep: 'Beat step (0→1 over N beats)',
} as const;

export type ModSource = keyof typeof MOD_SOURCES;

export interface Modulator {
  source: ModSource;
  amount: number;
  /** LFO rate in Hz, or beats per cycle for beatStep. */
  rate: number;
  /** Extra smoothing on top of the audio engine's own (seconds, 0 = none). */
  smooth: number;
  /** Runtime state, not saved. */
  _held?: number;
  _out?: number;
}

export const usesRate = (s: ModSource) => s.startsWith('lfo') || s === 'beatStep';

export function newModulator(source: ModSource = 'bass'): Modulator {
  return { source, amount: 0.5, rate: source === 'beatStep' ? 4 : 0.25, smooth: 0 };
}

function raw(m: Modulator, a: AudioFeatures, time: number): number {
  switch (m.source) {
    case 'lfoSine':
      return 0.5 + 0.5 * Math.sin(time * m.rate * Math.PI * 2);
    case 'lfoSaw':
      return (time * m.rate) % 1;
    case 'lfoSquare':
      return (time * m.rate) % 1 < 0.5 ? 1 : 0;
    case 'random':
      if (a.onset || m._held === undefined) m._held = Math.random();
      return m._held;
    case 'beatStep': {
      const n = Math.max(1, Math.round(m.rate));
      return (a.beatCount % n) / Math.max(1, n - 1);
    }
    default:
      return a[m.source];
  }
}

export function evalModulator(m: Modulator, a: AudioFeatures, time: number, dt: number): number {
  const v = raw(m, a, time);
  const prev = m._out ?? v;
  m._out = m.smooth > 0 ? prev + (v - prev) * (1 - Math.exp(-dt / m.smooth)) : v;
  return m._out;
}

export function serialiseModulator({ source, amount, rate, smooth }: Modulator): Modulator {
  return { source, amount, rate, smooth };
}
