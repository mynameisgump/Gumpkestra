export const TRANSITIONS = {
  cut: 'Cut', fade: 'Crossfade', wipe: 'Wipe', slide: 'Slide', dip: 'Dip to black',
  rust: 'Rust Dissolve', tear: 'Signal Tear', shutters: 'Steel Shutters', melt: 'Doom Melt', vhs: 'VHS Tracking',
};
export type Transition = keyof typeof TRANSITIONS;
/** Explicit shader IDs keep saved names independent of dropdown ordering. */
export const TRANSITION_IDS: Record<Transition, number> = {
  cut: -1, fade: 0, wipe: 1, slide: 2, dip: 3, rust: 4, tear: 5, shutters: 6, melt: 7, vhs: 8,
};
export interface PresetGroup { id: string; name: string; presets: string[]; transition: Transition; duration: number }
const KEY = 'gumpkestra:preset-groups';
const allGroup = (): PresetGroup => ({ id: 'all', name: 'All presets', presets: [], transition: 'fade', duration: 0.8 });

/** Browser-local performance sets; missing library entries are skipped, not forgotten. */
export class PresetGroups {
  groups: PresetGroup[] = [allGroup()];
  activeId = 'all';
  private listeners = new Set<() => void>();

  constructor() {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null');
      if (Array.isArray(saved?.groups)) {
        const ids = new Set<string>();
        const valid = saved.groups.filter((g: PresetGroup) => {
          if (!g || typeof g.id !== 'string' || ids.has(g.id) || typeof g.name !== 'string'
            || !Array.isArray(g.presets) || !g.presets.every((n) => typeof n === 'string')
            || !Object.hasOwn(TRANSITIONS, g.transition) || !Number.isFinite(g.duration) || g.duration < 0.1 || g.duration > 10) return false;
          ids.add(g.id);
          return true;
        }) as PresetGroup[];
        this.groups = [valid.find((g) => g.id === 'all') ?? allGroup(), ...valid.filter((g) => g.id !== 'all')];
        this.groups.forEach((g) => g.presets = [...new Set(g.presets)]);
        if (this.groups.some((g) => g.id === saved.activeId)) this.activeId = saved.activeId;
      }
    } catch { /* Use defaults if browser storage is unavailable or corrupt. */ }
  }

  get active() { return this.groups.find((g) => g.id === this.activeId)!; }
  names(available: Map<string, unknown>) {
    return this.activeId === 'all' ? [...available.keys()].sort((a, b) => a.localeCompare(b))
      : this.active.presets.filter((n) => available.has(n));
  }
  onChange(fn: () => void) { this.listeners.add(fn); }
  changed() {
    try { localStorage.setItem(KEY, JSON.stringify({ groups: this.groups, activeId: this.activeId })); } catch { /* best effort */ }
    this.listeners.forEach((fn) => fn());
  }
  create(name: string) {
    const group: PresetGroup = { id: crypto.randomUUID(), name, presets: [], transition: this.active.transition, duration: this.active.duration };
    this.groups.push(group);
    this.activeId = group.id;
    this.changed();
  }
}
