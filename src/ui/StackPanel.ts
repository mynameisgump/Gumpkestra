import type { App } from '../app';
import { ModelLayer } from '../render/ModelLayer';
import { h } from './dom';

export function StackPanel(root: HTMLElement, app: App) {
  const list = h('ol', { class: 'stack' });
  root.append(
    h('h2', {}, 'Stack ', h('span', { class: 'hint' }, 'processed top → bottom · drag to reorder')),
    list,
  );

  // Drag to reorder: `dragging` is the layer's index; the drop slot is before/after the row under
  // the pointer, depending on which half of it the pointer is in.
  let dragging = -1;
  let dropSlot = -1;
  const clearMarks = () => list.querySelectorAll('.drop-before, .drop-after').forEach((el) => el.classList.remove('drop-before', 'drop-after'));
  const onDragOver = (e: DragEvent, i: number, row: HTMLElement) => {
    if (dragging < 0) return;
    e.preventDefault();
    e.dataTransfer!.dropEffect = 'move';
    const r = row.getBoundingClientRect();
    const after = e.clientY > r.top + r.height / 2;
    dropSlot = i + (after ? 1 : 0);
    clearMarks();
    row.classList.add(after ? 'drop-after' : 'drop-before');
  };
  const onDrop = (e: DragEvent) => {
    if (dragging < 0) return;
    e.preventDefault();
    const layer = app.engine.layers[dragging];
    // Removing the dragged row first shifts every later slot up by one.
    const to = dropSlot > dragging ? dropSlot - 1 : dropSlot;
    if (layer && dropSlot >= 0 && to !== dragging) app.moveLayer(layer, to - dragging);
  };
  list.addEventListener('dragover', (e) => {
    // Below the last row: drop at the end.
    if (e.target === list && dragging >= 0) {
      e.preventDefault();
      dropSlot = app.engine.layers.length;
      clearMarks();
      list.lastElementChild?.classList.add('drop-after');
    }
  });
  list.addEventListener('drop', onDrop);

  const render = () => {
    const { layers } = app.engine;
    list.replaceChildren(
      ...layers.map((layer, i) => {
        const error = app.errors.get(layer.shaderName) ?? layer.status;
        const tag = layer instanceof ModelLayer ? '3d' : layer.parsed.isFilter ? 'fx' : 'gen';
        const row: HTMLElement = h('li', {
          class: `stack-row ${layer === app.selected ? 'selected' : ''} ${layer.enabled ? '' : 'disabled'}`,
          draggable: true,
          onclick: () => app.select(layer),
          ondragstart: (e: DragEvent) => {
            dragging = i;
            dropSlot = -1;
            e.dataTransfer!.effectAllowed = 'move';
            e.dataTransfer!.setData('text/plain', layer.label);
            row.classList.add('dragging');
          },
          ondragover: (e: DragEvent) => onDragOver(e, i, row),
          ondragend: () => { dragging = -1; clearMarks(); row.classList.remove('dragging'); },
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
            h('button', { title: 'Duplicate (⌘D)', onclick: (e: Event) => { e.stopPropagation(); app.duplicateLayer(layer); } }, '⧉'),
            h('button', { title: 'Remove', onclick: (e: Event) => { e.stopPropagation(); app.removeLayer(layer); } }, '✕'),
          ),
        );
        return row;
      }),
    );
    if (!layers.length) list.append(h('li', { class: 'empty' }, 'Empty — add a generator from the library.'));
  };

  app.onChange(render);
  render();
}
