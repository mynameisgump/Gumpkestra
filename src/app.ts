import type { AudioEngine } from './audio/AudioEngine';
import type { Library, Preset } from './library';
import type { Engine } from './render/Engine';
import type { Layer, LayerJSON } from './render/Layer';
import { h } from './ui/dom';

const AUTOSAVE_KEY = 'gumpkestra:session';

/** Shared state + actions. Panels subscribe to `onChange` and re-render. */
export class App {
  selected: Layer | null = null;
  presetName = 'untitled';
  /** Per-shader compile errors from the most recent (re)load. */
  errors = new Map<string, string>();
  private listeners = new Set<() => void>();

  constructor(readonly engine: Engine, readonly audio: AudioEngine, readonly library: Library) {}

  onChange(fn: () => void) {
    this.listeners.add(fn);
  }

  /** Structural change (layers added/removed/selected): re-render panels and autosave. */
  changed() {
    this.listeners.forEach((fn) => fn());
    this.touch();
  }

  /** Value change (slider drag etc.): autosave without re-rendering panels. */
  touch() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(this.snapshot()));
      } catch {
        /* storage unavailable — autosave is a convenience only */
      }
    }, 300);
  }

  private saveTimer?: ReturnType<typeof setTimeout>;

  select(layer: Layer | null) {
    this.selected = layer;
    this.changed();
  }

  /** Insert a library shader just above the selected layer (or on top). */
  addShader(name: string, json?: Partial<LayerJSON>, index?: number): Layer | null {
    const entry = this.library.shaders.get(name);
    if (!entry?.parsed) {
      toast(`${name}: ${entry?.error ?? 'not in library'}`, true);
      return null;
    }
    const at = index ?? (this.selected ? this.engine.layers.indexOf(this.selected) + 1 : this.engine.layers.length);
    try {
      const layer = this.engine.addLayer(name, entry.parsed, at);
      if (json) layer.applyJSON(json);
      this.errors.delete(name);
      if (index === undefined) this.select(layer);
      return layer;
    } catch (e) {
      this.errors.set(name, (e as Error).message);
      toast(`${name} failed to compile:\n${(e as Error).message}`, true);
      return null;
    }
  }

  removeLayer(layer: Layer) {
    const i = this.engine.layers.indexOf(layer);
    this.engine.removeLayer(layer);
    if (this.selected === layer) this.selected = this.engine.layers[Math.max(0, i - 1)] ?? null;
    this.changed();
  }

  moveLayer(layer: Layer, delta: number) {
    this.engine.moveLayer(layer, delta);
    this.changed();
  }

  /** Recompile every layer using `name`. Layers keep their old program if the new one fails. */
  reloadShader(name: string): string | null {
    const entry = this.library.shaders.get(name);
    let error = entry?.error ?? null;
    if (entry?.parsed) {
      for (const layer of this.engine.layers.filter((l) => l.shaderName === name)) {
        try {
          layer.setShader(entry.parsed);
        } catch (e) {
          error = (e as Error).message;
        }
      }
    }
    if (error) this.errors.set(name, error);
    else this.errors.delete(name);
    this.changed();
    return error;
  }

  snapshot(): Preset {
    return { name: this.presetName, layers: this.engine.layers.map((l) => l.toJSON()) };
  }

  loadPreset(preset: Preset) {
    this.engine.clear();
    this.selected = null;
    for (const json of preset.layers) this.addShader(json.shader, json, this.engine.layers.length);
    this.presetName = preset.name;
    this.selected = this.engine.layers[this.engine.layers.length - 1] ?? null;
    this.changed();
  }

  restoreSession(): boolean {
    try {
      const raw = localStorage.getItem(AUTOSAVE_KEY);
      if (!raw) return false;
      this.loadPreset(JSON.parse(raw));
      return this.engine.layers.length > 0;
    } catch {
      return false;
    }
  }
}

export function toast(message: string, isError = false) {
  const el = h('div', { class: `toast ${isError ? 'error' : ''}` }, message);
  document.body.append(el);
  setTimeout(() => el.classList.add('out'), isError ? 6000 : 2500);
  setTimeout(() => el.remove(), isError ? 6500 : 3000);
}
