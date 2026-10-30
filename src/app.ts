import type { AudioEngine } from './audio/AudioEngine';
import type { Library, Preset } from './library';
import type { Engine } from './render/Engine';
import type { Layer, LayerJSON } from './render/Layer';
import { MODEL_SHADER, ModelLayer } from './render/ModelLayer';
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
        localStorage.setItem(AUTOSAVE_KEY, JSON.stringify({ ...this.snapshot(), baseline: this.baseline }));
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
    if (name === MODEL_SHADER) return this.addModel(json?.model ?? '@knot', json, index);
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

  /** Insert a 3D model layer. The mesh loads asynchronously; the layer renders nothing until then. */
  addModel(model: string, json?: Partial<LayerJSON>, index?: number): ModelLayer {
    const at = index ?? (this.selected ? this.engine.layers.indexOf(this.selected) + 1 : this.engine.layers.length);
    const layer = this.engine.insertLayer(new ModelLayer(this.engine.gl, model), at);
    if (json) layer.applyJSON(json);
    if (index === undefined) this.select(layer);
    void this.setModel(layer, model);
    return layer;
  }

  async setModel(layer: ModelLayer, model: string) {
    layer.modelName = model;
    layer.status = 'loading…';
    this.changed();
    try {
      const mesh = await this.library.loadMesh(model);
      // The layer may have been removed, or switched to another model, while loading.
      if (layer.modelName !== model || !this.engine.layers.includes(layer)) return;
      layer.setMesh(mesh);
      layer.status = null;
    } catch (e) {
      layer.status = (e as Error).message;
      toast(`${model}: ${layer.status}`, true);
    }
    this.changed();
  }

  /** Copy a model file into the library, then show it on `target` (or a new layer). */
  async importModel(file: File, target?: ModelLayer) {
    try {
      const name = await this.library.importFile('models', file);
      if (target) await this.setModel(target, name);
      else this.addModel(name);
      toast(`Imported ${name} into library/models`);
    } catch (e) {
      toast(`${file.name}: ${(e as Error).message}`, true);
    }
  }

  /** Layers currently showing a library model. */
  modelLayers(name: string) {
    return this.engine.layers.filter((l): l is ModelLayer => l instanceof ModelLayer && l.modelName === name);
  }

  /** Delete a model file from the library, removing the layers that show it first so they don't error on reload. */
  async deleteModel(name: string) {
    for (const layer of this.modelLayers(name)) this.removeLayer(layer);
    try {
      await this.library.deleteFile('models', name);
      toast(`Deleted ${name} from library/models`);
    } catch (e) {
      toast(`${name}: ${(e as Error).message}`, true);
    }
  }

  /** Image inputs on a layer that can take a texture (everything except a filter's inputImage). */
  textureInputs(layer: Layer | null) {
    return layer ? layer.inputs.filter((i) => i.TYPE === 'image' && i.NAME !== 'inputImage') : [];
  }

  setTexture(layer: Layer, input: string, texture: string) {
    layer.params[input].value = texture;
    this.changed();
  }

  /**
   * Use a texture: put it on the selected layer's first texture input if it has
   * one, otherwise add an `image` layer showing it.
   */
  useTexture(texture: string) {
    const [input] = this.textureInputs(this.selected);
    if (this.selected && input) {
      this.setTexture(this.selected, input.NAME, texture);
      toast(`${this.selected.label} · ${input.LABEL ?? input.NAME} → ${texture}`);
    } else {
      this.addShader('image', { params: { tex: { value: texture, mods: [] } } });
    }
  }

  /** Copy an image/video into library/textures, then use it (on `layer.input` if given). */
  async importTexture(file: File, layer?: Layer, input?: string) {
    try {
      const name = await this.library.importFile('textures', file);
      this.engine.textures.invalidate(name);
      if (layer && input) this.setTexture(layer, input, name);
      else this.useTexture(name);
    } catch (e) {
      toast(`${file.name}: ${(e as Error).message}`, true);
    }
  }

  /** A model file changed on disk (e.g. re-exported from Blender): reload layers showing it. */
  reloadModel(name: string) {
    for (const layer of this.engine.layers) {
      if (layer instanceof ModelLayer && layer.modelName === name) void this.setModel(layer, name);
    }
    this.changed();
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

  /** The layers as last loaded or saved, to tell whether there are unsaved changes. */
  private baseline = '[]';

  private layersJSON() {
    return JSON.stringify(this.engine.layers.map((l) => l.toJSON()));
  }

  get dirty() {
    return this.layersJSON() !== this.baseline;
  }

  /** Whether the current preset exists in library/presets (vs a new, never-saved one). */
  get presetSaved() {
    return this.library.presets.has(this.presetName);
  }

  loadPreset(preset: Preset) {
    this.engine.clear();
    this.selected = null;
    for (const json of preset.layers) this.addShader(json.shader, json, this.engine.layers.length);
    this.presetName = preset.name;
    this.selected = this.engine.layers[this.engine.layers.length - 1] ?? null;
    this.baseline = this.layersJSON();
    this.changed();
  }

  /** Start over with an empty, unsaved stack. */
  newPreset() {
    this.loadPreset({ name: 'untitled', layers: [] });
  }

  async savePreset(name: string) {
    const preset = { ...this.snapshot(), name };
    await this.library.savePreset(preset);
    this.presetName = name;
    this.baseline = JSON.stringify(preset.layers);
    this.changed();
  }

  restoreSession(): boolean {
    try {
      const raw = localStorage.getItem(AUTOSAVE_KEY);
      if (!raw) return false;
      const session = JSON.parse(raw) as Preset & { baseline?: string };
      this.loadPreset(session);
      if (typeof session.baseline === 'string') this.baseline = session.baseline;
      this.changed();
      // An intentionally empty session (after New) restores as empty; one whose layers all failed doesn't.
      return this.engine.layers.length > 0 || session.layers.length === 0;
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
