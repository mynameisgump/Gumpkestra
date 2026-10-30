import type { App } from '../app';
import { h } from './dom';

/** Every preset in library/presets as a clickable list; the current one is highlighted. */
export function PresetsPanel(root: HTMLElement, app: App, load: (name: string) => void) {
  const list = h('div', { class: 'preset-list' });
  let dot: HTMLElement | null = null;
  let shown = '';

  const updateDirty = () => dot?.classList.toggle('on', app.dirty);

  const row = (name: string, layers: number, current: boolean, onclick?: () => void) => {
    const rowDot = h('span', { class: 'dirty-dot', title: 'Unsaved changes' }, '●');
    if (current) dot = rowDot;
    return h('button', { class: `preset-item ${current ? 'current' : ''}`, onclick },
      h('span', { class: 'name' }, name), rowDot, h('span', { class: 'count' }, `${layers}`));
  };

  const render = () => {
    dot = null;
    const names = [...app.library.presets.keys()].sort((a, b) => a.localeCompare(b));
    list.replaceChildren(
      ...(app.presetSaved ? [] : [row(`${app.presetName} (unsaved)`, app.engine.layers.length, true)]),
      ...names.map((n) => row(n, app.library.presets.get(n)!.layers.length, n === app.presetName, () => load(n))),
    );
    updateDirty();
    // Only when the preset changes, so the sidebar doesn't jump on every edit.
    if (shown !== app.presetName) list.querySelector('.current')?.scrollIntoView({ block: 'nearest' });
    shown = app.presetName;
  };

  root.append(
    h('h2', {}, 'Presets ', h('span', { class: 'hint' }, '[ ] to step')),
    list,
  );
  render();
  app.onChange(render);
  app.library.onChange((kind) => kind === 'presets' && render());
  return { updateDirty };
}
