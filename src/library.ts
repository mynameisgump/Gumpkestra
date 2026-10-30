import { parseISF, type ParsedISF } from './isf/isf';
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

type Kind = 'shaders' | 'presets';

async function api(kind: Kind, name = '', init?: RequestInit) {
  const res = await fetch(`/api/library/${kind}/${encodeURIComponent(name)}`, init);
  if (!res.ok) throw new Error((await res.json()).error ?? res.statusText);
  return res;
}

export class Library {
  shaders = new Map<string, ShaderEntry>();
  presets = new Map<string, Preset>();
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

  async savePreset(preset: Preset) {
    const { name, ...rest } = preset;
    await api('presets', name, { method: 'PUT', body: JSON.stringify(rest, null, 2) });
    this.presets.set(name, preset);
  }
}
