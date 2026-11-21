import type { App } from '../app';
import { h } from './dom';

/**
 * The current preset's name as a button that opens a grid of every preset:
 * click one, or type to filter and press Enter. Arrow keys move around the grid.
 */
export function PresetPicker(app: App, load: (name: string) => void) {
  const label = h('span', { class: 'label' });
  const button = h('button', { class: 'preset-name', title: 'Browse presets (P)', onclick: () => (pop.hidden ? open() : close()) }, label);
  const filter = h('input', { type: 'search', placeholder: 'Filter presets… (Enter loads the first match)' }) as HTMLInputElement;
  const grid = h('div', { class: 'preset-grid' });
  const pop = h('div', { class: 'preset-pop', hidden: true }, filter, grid);
  const el = h('div', { class: 'preset-picker' }, button, pop);

  const tiles = () => [...grid.querySelectorAll<HTMLButtonElement>('.preset-tile')];

  const render = () => {
    const q = filter.value.trim().toLowerCase();
    const names = [...app.library.presets.keys()].filter((n) => n.toLowerCase().includes(q)).sort((a, b) => a.localeCompare(b));
    grid.replaceChildren(
      ...names.map((n) => h('div', { class: 'preset-tile-wrap' },
        h('button', {
          class: `preset-tile ${n === app.presetName ? 'current' : ''}`,
          onclick: () => { close(); load(n); },
        }, h('span', { class: 'name' }, n), h('span', { class: 'count' }, `${app.library.presets.get(n)!.layers.length} layers`)),
        h('button', {
          class: 'lib-del',
          title: `Delete preset ${n}`,
          'aria-label': `Delete preset ${n}`,
          onclick: (e: Event) => {
            e.stopPropagation();
            void app.deletePreset(n);
          },
        }, '✕'))),
    );
    if (!names.length) grid.append(h('p', { class: 'hint' }, 'No presets match.'));
  };

  const open = () => {
    filter.value = '';
    render();
    pop.hidden = false;
    filter.focus();
  };

  const close = () => {
    pop.hidden = true;
    // Otherwise focus stays in the hidden filter box and swallows the global shortcuts.
    if (pop.contains(document.activeElement)) (document.activeElement as HTMLElement).blur();
  };

  filter.addEventListener('input', render);
  pop.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    // Keep keys typed in here away from the global shortcuts (H, F, [ ], …).
    e.stopPropagation();
    const all = tiles();
    const i = all.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'Escape') {
      close();
    } else if (e.key === 'Enter' && e.target === filter) {
      all[0]?.click();
    } else if (e.key.startsWith('Arrow') && (i >= 0 || e.key === 'ArrowDown')) {
      e.preventDefault();
      const cols = getComputedStyle(grid).gridTemplateColumns.split(' ').length;
      const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -cols, ArrowDown: cols }[e.key] ?? 0;
      if (i < 0) all[0]?.focus();
      else if (i + step < 0) filter.focus();
      else all[Math.min(all.length - 1, i + step)]?.focus();
    } else if (e.key.length === 1 && e.target !== filter) {
      filter.focus();
    }
  });
  document.addEventListener('mousedown', (e) => {
    if (!pop.hidden && !el.contains(e.target as Node)) close();
  });

  const refresh = () => {
    label.textContent = app.presetSaved ? app.presetName : `${app.presetName} (unsaved)`;
    if (!pop.hidden) render();
  };

  return { el, open, refresh };
}
