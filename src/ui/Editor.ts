import { toast, type App } from '../app';
import { h } from './dom';

/** Bottom-drawer GLSL editor. Recompiles live as you type; ⌘S writes the file to the library. */
export function Editor(root: HTMLElement, app: App) {
  let name: string | null = null;
  let saved = '';
  let timer: ReturnType<typeof setTimeout> | undefined;

  const title = h('span', { class: 'editor-title' });
  const status = h('span', { class: 'editor-status' });
  const gutter = h('pre', { class: 'gutter' });
  const code = h('textarea', { class: 'code', spellcheck: false, wrap: 'off' });
  const errors = h('div', { class: 'editor-errors' });

  const dirty = () => name !== null && code.value !== saved;

  const updateGutter = (errLine?: number) => {
    const n = code.value.split('\n').length;
    gutter.replaceChildren(...Array.from({ length: n }, (_, i) =>
      h('span', { class: i + 1 === errLine ? 'err' : '' }, `${i + 1}\n`)));
    gutter.scrollTop = code.scrollTop;
  };

  const jumpTo = (line: number) => {
    const lines = code.value.split('\n');
    const start = lines.slice(0, line - 1).reduce((a, l) => a + l.length + 1, 0);
    code.focus();
    code.setSelectionRange(start, start + (lines[line - 1]?.length ?? 0));
    code.scrollTop = Math.max(0, (line - 5) * 18);
  };

  const compile = () => {
    if (!name) return;
    app.library.preview(name, code.value);
    const err = app.reloadShader(name);
    const lineMatch = err?.match(/line (\d+)/);
    const firstLine = lineMatch ? Number(lineMatch[1]) : undefined;
    updateGutter(firstLine);
    errors.replaceChildren(...(err ?? '').split('\n').filter(Boolean).map((msg) => {
      const m = msg.match(/^line (\d+)/);
      return h('div', { class: 'error-line', onclick: () => m && jumpTo(Number(m[1])) }, msg);
    }));
    status.textContent = (err ? '✗ error' : '✓ compiled') + (dirty() ? ' · unsaved' : '');
    status.className = `editor-status ${err ? 'bad' : 'good'}`;
  };

  const save = async (asName?: string) => {
    if (!name) return;
    const target = asName ?? name;
    try {
      await app.library.saveShader(target, code.value);
      if (target !== name) {
        // Fork: restore the original in memory, point the selected layer at the copy.
        app.library.preview(name, saved);
        app.reloadShader(name);
        const layer = app.selected;
        if (layer?.shaderName === name) {
          const json = layer.toJSON();
          const idx = app.engine.layers.indexOf(layer);
          app.engine.removeLayer(layer);
          app.select(app.addShader(target, json, idx));
        }
        open(target);
      }
      saved = code.value;
      compile();
      toast(`Saved library/shaders/${target}.fs`);
    } catch (e) {
      toast((e as Error).message, true);
    }
  };

  const close = () => {
    if (dirty() && !confirm('Discard unsaved shader changes?')) return;
    if (name && dirty()) {
      app.library.preview(name, saved);
      app.reloadShader(name);
    }
    name = null;
    document.body.classList.remove('editor-open');
  };

  code.addEventListener('input', () => {
    updateGutter();
    clearTimeout(timer);
    timer = setTimeout(compile, 250);
  });
  code.addEventListener('scroll', () => (gutter.scrollTop = code.scrollTop));
  code.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      code.setRangeText('  ', code.selectionStart, code.selectionEnd, 'end');
      code.dispatchEvent(new Event('input'));
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault();
      save();
    }
  });

  root.append(
    h('div', { class: 'editor-bar' },
      title, status,
      h('span', { class: 'spacer' }),
      h('button', { onclick: () => save() }, 'Save ⌘S'),
      h('button', { onclick: () => { const n = prompt('Save a copy as:', `${name}-copy`)?.trim(); if (n) save(n); } }, 'Save as…'),
      h('button', { onclick: () => { code.value = saved; compile(); } }, 'Revert'),
      h('button', { onclick: close }, 'Close'),
    ),
    h('div', { class: 'editor-body' }, gutter, code),
    errors,
  );

  // Pick up edits made in an external editor, unless there are unsaved local changes.
  app.library.onChange((kind, changed) => {
    if (kind !== 'shaders' || changed !== name || dirty()) return;
    const entry = app.library.shaders.get(changed);
    if (entry && entry.source !== code.value) {
      code.value = saved = entry.source;
      compile();
    }
  });

  function open(shaderName: string) {
    if (name && name !== shaderName && dirty() && !confirm('Discard unsaved shader changes?')) return;
    const entry = app.library.shaders.get(shaderName);
    if (!entry) return;
    name = shaderName;
    code.value = saved = entry.source;
    title.textContent = `library/shaders/${shaderName}.fs`;
    document.body.classList.add('editor-open');
    compile();
  }

  return { open, close };
}
