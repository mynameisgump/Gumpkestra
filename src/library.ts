import { parseISF, type ParsedISF } from './isf/isf';
import { parseModel } from './model/load';
import type { MeshData } from './model/mesh';
import type { LayerJSON } from './render/Layer';

export interface ShaderEntry {
  name: string;
  source: string;
  parsed: ParsedISF | null;
  error: string | null;
}

export interface Preset {
  name: string;
  layers: LayerJSON[];
}

type Kind = 'shaders' | 'presets' | FileKind;
/** Binary kinds, listed by file name (with extension). */
type FileKind = 'models' | 'textures';

async function api(kind: Kind, name = '', init?: RequestInit) {
  const res = await fetch(`/api/library/${kind}/${encodeURIComponent(name)}`, init);
  if (!res.ok) throw new Error((await res.json()).error ?? res.statusText);
  return res;
}

export class Library {
  shaders = new Map<string, ShaderEntry>();
  presets = new Map<string, Preset>();
  /** File names (with extension) in library/models and library/textures. */
  files: Record<FileKind, string[]> = { models: [], textures: [] };
  /** Parsed meshes, shared by every layer showing the same model. */
  private meshes = new Map<string, Promise<MeshData>>();
  private listeners = new Set<(kind: Kind, name: string) => void>();

  onChange(fn: (kind: Kind, name: string) => void) {
    this.listeners.add(fn);
  }

  private emit(kind: Kind, name: string) {
    this.listeners.forEach((fn) => fn(kind, name));
  }

  private setShader(name: string, source: string) {
    let parsed: ParsedISF | null = null;
    let error: string | null = null;
    try {
      parsed = parseISF(source);
    } catch (e) {
      error = (e as Error).message;
    }
    const entry = { name, source, parsed, error };
    this.shaders.set(name, entry);
    return entry;
  }

  async load() {
    const [shaders, presets] = await Promise.all([
      api('shaders').then((r) => r.json() as Promise<{ name: string; source: string }[]>),
      api('presets').then((r) => r.json() as Promise<{ name: string; source: string }[]>),
      this.refreshFiles('models'),
      this.refreshFiles('textures'),
    ]);
    for (const s of shaders) this.setShader(s.name, s.source);
    for (const p of presets) {
      try {
        this.presets.set(p.name, { ...JSON.parse(p.source), name: p.name });
      } catch {
        console.warn(`Preset ${p.name} is not valid JSON`);
      }
    }

    // Files edited outside the app (VS Code etc.) hot-reload through here.
    import.meta.hot?.on('library-changed', async ({ kind, name }: { kind: Kind; name: string }) => {
      if (kind === 'models' || kind === 'textures') {
        if (kind === 'models') this.meshes.delete(name);
        await this.refreshFiles(kind).catch(() => {});
        this.emit(kind, name);
        return;
      }
      try {
        const text = await (await api(kind, name)).text();
        if (kind === 'shaders') this.setShader(name, text);
        else this.presets.set(name, { ...JSON.parse(text), name });
      } catch {
        if (kind === 'shaders') this.shaders.delete(name);
        else this.presets.delete(name);
      }
      this.emit(kind, name);
    });
  }

  /** Update a shader in memory only (live editing before save). */
  preview(name: string, source: string) {
    return this.setShader(name, source);
  }

  async saveShader(name: string, source: string) {
    await api('shaders', name, { method: 'PUT', body: source });
    return this.setShader(name, source);
  }

  get models() {
    return this.files.models;
  }

  get textures() {
    return this.files.textures;
  }

  private async refreshFiles(kind: FileKind) {
    const items = (await (await api(kind)).json()) as { name: string }[];
    this.files[kind] = items.map((m) => m.name).sort((a, b) => a.localeCompare(b));
  }

  async fetchFile(kind: FileKind, name: string): Promise<Blob> {
    return (await api(kind, name)).blob();
  }

  /** Load + parse a library model (or a built-in "@primitive"), cached. */
  loadMesh(name: string): Promise<MeshData> {
    let mesh = this.meshes.get(name);
    if (!mesh) {
      mesh = name.startsWith('@')
        ? parseModel(name)
        : api('models', name).then((r) => r.arrayBuffer()).then((buf) => parseModel(name, buf));
      mesh.catch(() => this.meshes.delete(name));
      this.meshes.set(name, mesh);
    }
    return mesh;
  }

  /** Copy a dropped/opened file into library/models or library/textures. Returns its library name. */
  async importFile(kind: FileKind, file: File): Promise<string> {
    const res = await api(kind, file.name, { method: 'PUT', body: await file.arrayBuffer() });
    const { name } = (await res.json()) as { name: string };
    if (kind === 'models') this.meshes.delete(name);
    if (!this.files[kind].includes(name)) this.files[kind] = [...this.files[kind], name].sort((a, b) => a.localeCompare(b));
    this.emit(kind, name);
    return name;
  }

  /** Delete a file from library/models or library/textures. */
  async deleteFile(kind: FileKind, name: string) {
    await api(kind, name, { method: 'DELETE' });
    if (kind === 'models') this.meshes.delete(name);
    this.files[kind] = this.files[kind].filter((n) => n !== name);
    this.emit(kind, name);
  }

  async savePreset(preset: Preset) {
    const { name, ...rest } = preset;
    await api('presets', name, { method: 'PUT', body: JSON.stringify(rest, null, 2) });
    this.presets.set(name, preset);
  }
}
