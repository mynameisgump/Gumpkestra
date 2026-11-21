import { parseISF, type ParsedISF } from './isf/isf';
import { entryKey, LocalLibraryStore } from './localStore';
import { parseModel } from './model/load';
import type { MeshData } from './model/mesh';
import { fontFamily, isTextModel, parseTextModel, TEXT_FONTS } from './model/text';
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
type FileKind = 'models' | 'textures' | 'fonts';

interface StaticManifest {
  shaders: { name: string; source: string }[];
  presets: { name: string; source: string }[];
  models: string[];
  textures: string[];
  fonts: string[];
}

const FILE_EXTS: Record<FileKind, readonly string[]> = {
  models: ['.glb', '.gltf', '.obj', '.stl'],
  textures: ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.mp4', '.webm', '.mov'],
  fonts: ['.ttf', '.otf', '.woff', '.woff2'],
};

const safeName = (name: string) => {
  const clean = name.replace(/[^a-zA-Z0-9_\-. ]/g, '').trim();
  return clean.startsWith('.') || clean.includes('..') ? '' : clean;
};

function hasValidExt(kind: FileKind, name: string) {
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return false;
  return FILE_EXTS[kind].includes(name.slice(dot).toLowerCase());
}

function staticURL(rel: string) {
  const base = import.meta.env.BASE_URL || './';
  const joined = base.endsWith('/') ? `${base}${rel}` : `${base}/${rel}`;
  return new URL(joined, document.baseURI).toString();
}

async function api(kind: Kind, name = '', init?: RequestInit) {
  const res = await fetch(`/api/library/${kind}/${encodeURIComponent(name)}`, init);
  if (!res.ok) throw new Error((await res.json()).error ?? res.statusText);
  return res;
}

export class Library {
  /** 'server' uses Vite's dev middleware on disk; 'browser' uses bundled static files + IndexedDB. */
  readonly mode: 'server' | 'browser' = import.meta.env.DEV ? 'server' : 'browser';
  shaders = new Map<string, ShaderEntry>();
  presets = new Map<string, Preset>();
  /** File names (with extension) in library/models, library/textures and library/fonts. */
  files: Record<FileKind, string[]> = { models: [], textures: [], fonts: [] };
  /** Parsed meshes, shared by every layer showing the same model. */
  private meshes = new Map<string, Promise<MeshData>>();
  /** Library fonts registered in document.fonts, by file name. */
  private faces = new Map<string, Promise<FontFace>>();
  private listeners = new Set<(kind: Kind, name: string) => void>();

  /** Browser-mode storage overlay + bundled asset index + object URL cache for previews. */
  private store = new LocalLibraryStore();
  private bundledPresets = new Set<string>();
  private bundledFiles: Record<FileKind, Set<string>> = {
    models: new Set(),
    textures: new Set(),
    fonts: new Set(),
  };
  private objectURLs = new Map<string, string>();

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

  private setPreset(name: string, source: string) {
    try {
      this.presets.set(name, { ...JSON.parse(source), name });
    } catch {
      console.warn(`Preset ${name} is not valid JSON`);
    }
  }

  private setObjectURL(kind: FileKind, name: string, blob: Blob) {
    const key = entryKey(kind, name);
    const prev = this.objectURLs.get(key);
    if (prev) URL.revokeObjectURL(prev);
    this.objectURLs.set(key, URL.createObjectURL(blob));
  }

  private revokeObjectURL(kind: FileKind, name: string) {
    const key = entryKey(kind, name);
    const prev = this.objectURLs.get(key);
    if (prev) {
      URL.revokeObjectURL(prev);
      this.objectURLs.delete(key);
    }
  }

  async load() {
    if (this.mode === 'browser') {
      await this.loadStatic();
      return;
    }

    const [shaders, presets] = await Promise.all([
      api('shaders').then((r) => r.json() as Promise<{ name: string; source: string }[]>),
      api('presets').then((r) => r.json() as Promise<{ name: string; source: string }[]>),
      this.refreshFiles('models'),
      this.refreshFiles('textures'),
      this.refreshFiles('fonts'),
    ]);
    for (const s of shaders) this.setShader(s.name, s.source);
    for (const p of presets) this.setPreset(p.name, p.source);

    // Files edited outside the app (VS Code etc.) hot-reload through here.
    import.meta.hot?.on('library-changed', async ({ kind, name }: { kind: Kind; name: string }) => {
      if (kind === 'models' || kind === 'textures' || kind === 'fonts') {
        if (kind === 'models') this.meshes.delete(name);
        if (kind === 'fonts') this.forgetFont(name);
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

  private async loadStatic() {
    const [manifestRes, stored] = await Promise.all([
      fetch(staticURL('library/manifest.json')),
      this.store.getAll(),
    ]);
    if (!manifestRes.ok) throw new Error(`Failed to load static library manifest (${manifestRes.status})`);
    const manifest = (await manifestRes.json()) as StaticManifest;

    for (const s of manifest.shaders ?? []) this.setShader(s.name, s.source);
    this.bundledPresets.clear();
    for (const p of manifest.presets ?? []) {
      this.bundledPresets.add(p.name);
      this.setPreset(p.name, p.source);
    }

    const fileSets: Record<FileKind, Set<string>> = {
      models: new Set(manifest.models ?? []),
      textures: new Set(manifest.textures ?? []),
      fonts: new Set(manifest.fonts ?? []),
    };
    this.bundledFiles = {
      models: new Set(fileSets.models),
      textures: new Set(fileSets.textures),
      fonts: new Set(fileSets.fonts),
    };

    for (const entry of stored) {
      if (entry.kind === 'shaders') {
        if (entry.deleted) this.shaders.delete(entry.name);
        else if (typeof entry.text === 'string') this.setShader(entry.name, entry.text);
      } else if (entry.kind === 'presets') {
        if (entry.deleted) this.presets.delete(entry.name);
        else if (typeof entry.text === 'string') this.setPreset(entry.name, entry.text);
      } else {
        if (entry.deleted) {
          fileSets[entry.kind].delete(entry.name);
        } else if (entry.blob) {
          fileSets[entry.kind].add(entry.name);
          if (entry.kind === 'textures') this.setObjectURL(entry.kind, entry.name, entry.blob);
        }
      }
    }

    for (const kind of ['models', 'textures', 'fonts'] as const) {
      this.files[kind] = [...fileSets[kind]].sort((a, b) => a.localeCompare(b));
    }
  }

  /** Update a shader in memory only (live editing before save). */
  preview(name: string, source: string) {
    return this.setShader(name, source);
  }

  async saveShader(name: string, source: string) {
    if (this.mode === 'browser') {
      const clean = safeName(name);
      if (!clean) throw new Error('missing name');
      await this.store.put({ kind: 'shaders', name: clean, text: source });
      return this.setShader(clean, source);
    }
    await api('shaders', name, { method: 'PUT', body: source });
    return this.setShader(name, source);
  }

  get models() {
    return this.files.models;
  }

  get textures() {
    return this.files.textures;
  }

  get fonts() {
    return this.files.fonts;
  }

  /** URL for previewing a library binary (image thumbnail, looping video, etc.) in DOM elements. */
  fileURL(kind: FileKind, name: string): string | null {
    if (this.mode === 'server') return `/api/library/${kind}/${encodeURIComponent(name)}`;
    const obj = this.objectURLs.get(entryKey(kind, name));
    if (obj) return obj;
    if (this.files[kind].includes(name) && this.bundledFiles[kind].has(name)) {
      return staticURL(`library/${kind}/${encodeURIComponent(name)}`);
    }
    return null;
  }

  private async refreshFiles(kind: FileKind) {
    const items = (await (await api(kind)).json()) as { name: string }[];
    this.files[kind] = items.map((m) => m.name).sort((a, b) => a.localeCompare(b));
  }

  async fetchFile(kind: FileKind, name: string): Promise<Blob> {
    if (this.mode === 'browser') {
      const stored = await this.store.get(kind, name);
      if (stored?.deleted) throw new Error(`${name} was deleted from the library`);
      if (stored?.blob) return stored.blob;
      const res = await fetch(staticURL(`library/${kind}/${encodeURIComponent(name)}`));
      if (!res.ok) throw new Error(`${name} not found (${res.status})`);
      return res.blob();
    }
    return (await api(kind, name)).blob();
  }

  /** Load + parse a library model (or a built-in "@primitive"), cached. */
  loadMesh(name: string): Promise<MeshData> {
    let mesh = this.meshes.get(name);
    if (!mesh) {
      const font = isTextModel(name) ? parseTextModel(name).font : null;
      mesh = font && !(font in TEXT_FONTS)
        ? this.loadFont(font).then(() => parseModel(name))
        : name.startsWith('@')
          ? parseModel(name)
          : this.fetchFile('models', name).then((b) => b.arrayBuffer()).then((buf) => parseModel(name, buf));
      mesh.catch(() => this.meshes.delete(name));
      this.meshes.set(name, mesh);
    }
    return mesh;
  }

  /** Register a library font in document.fonts so canvas text can use it, cached. */
  loadFont(name: string): Promise<FontFace> {
    let face = this.faces.get(name);
    if (!face) {
      face = this.fetchFile('fonts', name)
        .catch(() => { throw new Error(`font ${name} isn't in library/fonts`); })
        .then((b) => b.arrayBuffer())
        .then((buf) => new FontFace(fontFamily(name), buf).load()
          .catch(() => { throw new Error(`font ${name} couldn't be read`); }))
        .then((f) => { document.fonts.add(f); return f; });
      face.catch(() => this.faces.delete(name));
      this.faces.set(name, face);
    }
    return face;
  }

  /** Drop a font (changed or deleted on disk) and the text meshes built with it. */
  private forgetFont(name: string) {
    this.faces.get(name)?.then((f) => document.fonts.delete(f), () => {});
    this.faces.delete(name);
    for (const key of this.meshes.keys()) {
      if (isTextModel(key) && parseTextModel(key).font === name) this.meshes.delete(key);
    }
  }

  /** Copy a dropped/opened file into library/models, library/textures or library/fonts. Returns its library name. */
  async importFile(kind: FileKind, file: File): Promise<string> {
    let name: string;
    if (this.mode === 'browser') {
      name = safeName(file.name);
      if (!name) throw new Error('missing name');
      if (!hasValidExt(kind, name)) throw new Error(`unsupported file type (${FILE_EXTS[kind].join(', ')})`);
      const blob = new Blob([await file.arrayBuffer()], { type: file.type || 'application/octet-stream' });
      await this.store.put({ kind, name, blob });
      if (kind === 'textures') this.setObjectURL(kind, name, blob);
    } else {
      const res = await api(kind, file.name, { method: 'PUT', body: await file.arrayBuffer() });
      ({ name } = (await res.json()) as { name: string });
    }
    if (kind === 'models') this.meshes.delete(name);
    if (kind === 'fonts') this.forgetFont(name);
    if (!this.files[kind].includes(name)) this.files[kind] = [...this.files[kind], name].sort((a, b) => a.localeCompare(b));
    this.emit(kind, name);
    return name;
  }

  /** Delete a file from library/models, library/textures or library/fonts. */
  async deleteFile(kind: FileKind, name: string) {
    if (this.mode === 'browser') {
      if (this.bundledFiles[kind].has(name)) {
        await this.store.put({ kind, name, deleted: true });
      } else {
        await this.store.remove(kind, name);
      }
      this.revokeObjectURL(kind, name);
    } else {
      await api(kind, name, { method: 'DELETE' });
    }
    if (kind === 'models') this.meshes.delete(name);
    if (kind === 'fonts') this.forgetFont(name);
    this.files[kind] = this.files[kind].filter((n) => n !== name);
    this.emit(kind, name);
  }

  async savePreset(preset: Preset) {
    const { name, ...rest } = preset;
    const body = JSON.stringify(rest, null, 2);
    if (this.mode === 'browser') {
      const clean = safeName(name);
      if (!clean) throw new Error('missing name');
      await this.store.put({ kind: 'presets', name: clean, text: body });
      this.presets.set(clean, { ...preset, name: clean });
      this.emit('presets', clean);
      return;
    }
    await api('presets', name, { method: 'PUT', body });
    this.presets.set(name, preset);
    this.emit('presets', name);
  }

  /** Delete a preset from library/presets (or tombstone it in browser storage). */
  async deletePreset(name: string) {
    if (this.mode === 'browser') {
      if (this.bundledPresets.has(name)) {
        await this.store.put({ kind: 'presets', name, deleted: true });
      } else {
        await this.store.remove('presets', name);
      }
    } else {
      await api('presets', name, { method: 'DELETE' });
    }
    this.presets.delete(name);
    this.emit('presets', name);
  }
}
