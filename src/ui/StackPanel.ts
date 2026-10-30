import type { App } from '../app';
import { ModelLayer } from '../render/ModelLayer';
import { h } from './dom';

export function StackPanel(root: HTMLElement, app: App) {
  const list = h('ol', { class: 'stack' });
  root.append(
    h('h2', {}, 'Stack ', h('span', { class: 'hint' }, 'processed top → bottom')),
    list,
  );

  const render = () => {
    const { layers } = app.engine;
    list.replaceChildren(
      ...layers.map((layer, i) => {
        const error = app.errors.get(layer.shaderName) ?? layer.status;
        const tag = layer instanceof ModelLayer ? '3d' : layer.parsed.isFilter ? 'fx' : 'gen';
        return h('li', {
          class: `stack-row ${layer === app.selected ? 'selected' : ''} ${layer.enabled ? '' : 'disabled'}`,
          onclick: () => app.select(layer),
        },
          h('input', {
            type: 'checkbox',
            checked: layer.enabled,
            title: 'Enable',
            onclick: (e: Event) => e.stopPropagation(),
            onchange: (e: Event) => { layer.enabled = (e.target as HTMLInputElement).checked; app.changed(); },
          }),
          h('span', { class: `tag ${tag}` }, tag.toUpperCase()),
          h('span', { class: 'name', title: error ?? '' }, layer.label, error ? (error === 'loading…' ? ' …' : ' ⚠') : ''),
          h('span', { class: 'row-actions' },
            h('button', { title: 'Move up', disabled: i === 0, onclick: (e: Event) => { e.stopPropagation(); app.moveLayer(layer, -1); } }, '↑'),
            h('button', { title: 'Move down', disabled: i === layers.length - 1, onclick: (e: Event) => { e.stopPropagation(); app.moveLayer(layer, 1); } }, '↓'),
            h('button', { title: 'Remove', onclick: (e: Event) => { e.stopPropagation(); app.removeLayer(layer); } }, '✕'),
          ),
        );
      }),
    );
    if (!layers.length) list.append(h('li', { class: 'empty' }, 'Empty — add a generator from the library.'));
  };

  app.onChange(render);
  render();
}
