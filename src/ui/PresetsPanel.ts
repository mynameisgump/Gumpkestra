import type { App } from '../app';
import { TRANSITIONS, type Transition } from '../presetGroups';
import { h, select } from './dom';

/** The active performance group and its ordered preset list. */
export function PresetsPanel(root: HTMLElement, app: App, load: (name: string) => void) {
  const controls = h('div', { class: 'preset-group-controls' });
  const list = h('div', { class: 'preset-list' });
  const groups = app.presetGroups;
  let dot: HTMLElement | null = null;
  let shown = '';
  const updateDirty = () => dot?.classList.toggle('on', app.dirty);

  const render = () => {
    const group = groups.active;
    const custom = group.id !== 'all';
    const names = groups.names(app.library.presets);
    dot = null;
    const groupSelect = select(Object.fromEntries(groups.groups.map((g) => [g.id, g.name])), groups.activeId, (id) => {
      groups.activeId = id;
      groups.changed();
    });
    groupSelect.setAttribute('aria-label', 'Active preset group');
    const transitionSelect = select(TRANSITIONS, group.transition, (value: Transition) => {
      group.transition = value;
      groups.changed();
    });
    transitionSelect.setAttribute('aria-label', 'Preset transition');
    controls.replaceChildren(
      h('div', { class: 'preset-group-row' }, groupSelect,
        h('button', { title: 'Create preset group', onclick: () => {
          const name = prompt('New group name:')?.trim();
          if (name) groups.create(name);
        } }, '+ Group')),
      ...(custom ? [h('div', { class: 'preset-group-row' },
        h('button', { onclick: () => {
          const name = prompt('Rename group:', group.name)?.trim();
          if (name) { group.name = name; groups.changed(); }
        } }, 'Rename'),
        h('button', { onclick: () => {
          if (!confirm(`Delete group "${group.name}"? Presets will remain in the library.`)) return;
          groups.groups = groups.groups.filter((g) => g !== group);
          groups.activeId = 'all';
          groups.changed();
        } }, 'Delete group'))] : []),
      h('div', { class: 'preset-group-row' }, h('label', {}, 'Transition ', transitionSelect),
        h('label', {}, 'Seconds ', h('input', { type: 'number', min: 0.1, max: 10, step: 0.1,
          value: group.duration, disabled: group.transition === 'cut', 'aria-label': 'Transition seconds',
          onchange: (e: Event) => {
            const input = e.target as HTMLInputElement;
            const value = Number(input.value);
            if (Number.isFinite(value) && value >= 0.1 && value <= 10) { group.duration = value; groups.changed(); }
            else input.value = String(group.duration);
          } }))),
    );
    if (custom) {
      const available = [...app.library.presets.keys()].filter((n) => !group.presets.includes(n)).sort((a, b) => a.localeCompare(b));
      const add = h('select', { 'aria-label': 'Add preset to group', onchange: (e: Event) => {
        const value = (e.target as HTMLSelectElement).value;
        if (value && !group.presets.includes(value)) { group.presets.push(value); groups.changed(); }
      } }, h('option', { value: '' }, 'Add preset…'), ...available.map((n) => h('option', { value: n }, n)));
      add.disabled = !available.length;
      controls.append(add);
    }
    const row = (name: string, layers: number, current: boolean, saved = true) => {
      const rowDot = h('span', { class: 'dirty-dot', title: 'Unsaved changes' }, '●');
      if (current) dot = rowDot;
      const index = group.presets.indexOf(name);
      const move = (dir: number) => {
        // Move relative to visible neighbours, retaining temporarily missing entries.
        const neighbour = names[names.indexOf(name) + dir];
        const other = group.presets.indexOf(neighbour);
        if (other < 0) return;
        [group.presets[index], group.presets[other]] = [group.presets[other], group.presets[index]];
        groups.changed();
      };
      return h('div', { class: 'preset-row' },
        h('button', { class: `preset-item ${current ? 'current' : ''}`, onclick: () => saved && load(name) },
          h('span', { class: 'name' }, saved ? name : `${name} (unsaved)`), rowDot, h('span', { class: 'count' }, `${layers}`)),
        ...(custom && saved ? [
          h('button', { title: `Move ${name} up`, disabled: name === names[0], onclick: () => move(-1) }, '↑'),
          h('button', { title: `Move ${name} down`, disabled: name === names[names.length - 1], onclick: () => move(1) }, '↓'),
          h('button', { title: `Remove ${name} from group`, onclick: () => {
            group.presets = group.presets.filter((n) => n !== name); groups.changed();
          } }, '×'),
        ] : []));
    };
    list.replaceChildren(
      ...(!app.presetSaved ? [row(app.presetName, app.engine.layers.length, true, false)] : []),
      ...names.map((n) => row(n, app.library.presets.get(n)!.layers.length, n === app.presetName)),
      ...(!names.length ? [h('p', { class: 'hint' }, custom ? 'Add presets above to build your sequence.' : 'No saved presets.')] : []),
    );
    updateDirty();
    if (shown !== app.presetName) list.querySelector('.current')?.scrollIntoView({ block: 'nearest' });
    shown = app.presetName;
  };
  root.append(h('h2', {}, 'Presets ', h('span', { class: 'hint' }, '← → to step')), controls,
    h('p', { class: 'hint' }, 'Arrows loop through the active group. Settings saved in this browser.'), list);
  render();
  app.onChange(render);
  groups.onChange(render);
  app.library.onChange((kind) => kind === 'presets' && render());
  return { updateDirty };
}
