import type { App } from '../app';
import { MOD_SOURCES, newModulator, usesRate, type ModSource, type Modulator } from '../audio/Modulators';
import type { ISFInput } from '../isf/isf';
import { isModelFile, MODEL_EXTENSIONS, BUILTIN_MODELS } from '../model/load';
import { BLEND_MODES, floatRange, type Layer, type ParamState } from '../render/Layer';
import { ModelLayer } from '../render/ModelLayer';
import { fmt, h, select, slider } from './dom';

const toHex = (c: number[]) => '#' + c.slice(0, 3).map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
const fromHex = (hex: string, a = 1) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).concat(a);

/** Parameters + modulators for the selected layer. Returns a per-frame function that animates live-value markers. */
export function ParamsPanel(root: HTMLElement, app: App, openEditor: (name: string) => void) {
  let liveMarkers: { el: HTMLElement; text: HTMLElement; layer: Layer; key: string; min: number; max: number }[] = [];

  const modRow = (state: ParamState, m: Modulator, rerender: () => void) =>
    h('div', { class: 'mod' },
      select(MOD_SOURCES, m.source, (v: ModSource) => {
        const wasRate = usesRate(m.source);
        m.source = v;
        if (usesRate(v) !== wasRate || v === 'beatStep') m.rate = newModulator(v).rate;
        app.touch();
        rerender();
      }),
      h('label', { title: 'Amount (fraction of the parameter range, negative inverts)' }, 'amt',
        slider({ min: -1, max: 1, step: 0.01, value: m.amount, oninput: (v) => { m.amount = v; app.touch(); } })),
      usesRate(m.source)
        ? h('label', { title: m.source === 'beatStep' ? 'Beats per cycle' : 'Rate (Hz)' }, m.source === 'beatStep' ? 'beats' : 'Hz',
          h('input', { type: 'number', min: 0, step: m.source === 'beatStep' ? 1 : 0.05, value: m.rate,
            onchange: (e: Event) => { m.rate = Number((e.target as HTMLInputElement).value); app.touch(); } }))
        : h('label', { title: 'Extra smoothing (seconds)' }, 'smooth',
          slider({ min: 0, max: 1, step: 0.01, value: m.smooth, oninput: (v) => { m.smooth = v; app.touch(); } })),
      h('button', { class: 'icon', title: 'Remove modulator', onclick: () => { state.mods.splice(state.mods.indexOf(m), 1); app.touch(); rerender(); } }, '✕'),
    );

  const floatRow = (layer: Layer, key: string, label: string, state: ParamState, min: number, max: number) => {
    const marker = h('div', { class: 'live-marker' });
    const valText = h('span', { class: 'val' }, fmt(state.value as number));
    const mods = h('div', { class: 'mods' });
    const renderMods = () => mods.replaceChildren(...state.mods.map((m) => modRow(state, m, renderMods)));
    renderMods();
    liveMarkers.push({ el: marker, text: valText, layer, key, min, max });
    return h('div', { class: 'param' },
      h('div', { class: 'row' },
        h('span', { class: 'lbl', title: key }, label),
        h('div', { class: 'slider-wrap' },
          slider({ min, max, value: state.value as number, oninput: (v) => { state.value = v; app.touch(); } }),
          marker),
        valText,
        h('button', {
          class: 'icon mod-add',
          title: 'Add modulator (audio / LFO)',
          onclick: () => { state.mods.push(newModulator()); app.touch(); renderMods(); },
        }, '∿'),
      ),
      mods,
    );
  };

  const inputRow = (layer: Layer, inp: ISFInput) => {
    const state = layer.params[inp.NAME];
    const label = inp.LABEL ?? inp.NAME;
    const row = (control: Node) => h('div', { class: 'param' }, h('div', { class: 'row' }, h('span', { class: 'lbl' }, label), control));
    switch (inp.TYPE) {
      case 'float': {
        const [min, max] = floatRange(inp);
        return floatRow(layer, inp.NAME, label, state, min, max);
      }
      case 'bool':
        return row(h('input', { type: 'checkbox', checked: !!state.value, onchange: (e: Event) => { state.value = (e.target as HTMLInputElement).checked; app.touch(); } }));
      case 'long': {
        const values = inp.VALUES ?? [0, 1, 2, 3];
        const labels = inp.LABELS ?? values.map(String);
        const opts = Object.fromEntries(values.map((v, i) => [String(v), labels[i] ?? String(v)]));
        return row(select(opts, String(state.value), (v) => { state.value = Number(v); app.touch(); }));
      }
      case 'color': {
        const c = state.value as number[];
        return row(h('input', { type: 'color', value: toHex(c), oninput: (e: Event) => { state.value = fromHex((e.target as HTMLInputElement).value, c[3] ?? 1); app.touch(); } }));
      }
      case 'point2D': {
        const p = state.value as number[];
        const min = (inp.MIN as number[]) ?? [0, 0];
        const max = (inp.MAX as number[]) ?? [1, 1];
        return row(h('div', { class: 'xy' },
          ...[0, 1].map((i) => slider({ min: min[i], max: max[i], value: p[i], oninput: (v) => { p[i] = v; app.touch(); } }))));
      }
      case 'event':
        return row(h('div', { class: 'btn-row' },
          h('button', { onclick: () => layer.trigger(inp.NAME) }, 'Trigger'),
          h('label', {}, h('input', { type: 'checkbox', checked: !!state.onBeat, onchange: (e: Event) => { state.onBeat = (e.target as HTMLInputElement).checked; app.touch(); } }), ' on beat'),
        ));
      default:
        return null;
    }
  };

  const modelRow = (layer: ModelLayer) => {
    const names = [...BUILTIN_MODELS, ...app.library.models];
    if (!names.includes(layer.modelName)) names.push(layer.modelName);
    const opts = Object.fromEntries(names.map((n) => [n, n.startsWith('@') ? `${n.slice(1)} (built-in)` : n]));
    const file = h('input', {
      type: 'file',
      accept: MODEL_EXTENSIONS.join(','),
      style: 'display:none',
      onchange: (e: Event) => {
        const f = (e.target as HTMLInputElement).files?.[0];
        if (f && isModelFile(f.name)) void app.importModel(f, layer);
      },
    }) as HTMLInputElement;
    const mesh = layer.mesh;
    return [
      h('div', { class: 'param' }, h('div', { class: 'row model-row' },
        h('span', { class: 'lbl' }, 'Model'),
        select(opts, layer.modelName, (v) => void app.setModel(layer, v)),
        h('button', { title: 'Import a .glb/.gltf/.obj/.stl into library/models', onclick: () => file.click() }, 'Load…'),
        file)),
      h('p', { class: 'hint' }, layer.status
        ?? (mesh ? `${(mesh.vertexCount / 3).toLocaleString()} triangles · ${mesh.textures.length} textures · ${mesh.rig.animations.length} animations` : '')),
    ];
  };

  const render = () => {
    liveMarkers = [];
    const layer = app.selected;
    if (!layer) {
      root.replaceChildren(h('h2', {}, 'Parameters'), h('p', { class: 'hint' }, 'Select a layer.'));
      return;
    }
    const meta = layer.parsed.meta;
    const isModel = layer instanceof ModelLayer;
    root.replaceChildren(...[
      h('h2', {}, layer.label,
        isModel ? null : h('button', { class: 'edit-btn', onclick: () => openEditor(layer.shaderName) }, '{ } Edit')),
      meta.DESCRIPTION ? h('p', { class: 'hint' }, meta.DESCRIPTION) : null,
      ...(isModel ? modelRow(layer) : []),
      h('div', { class: 'param' }, h('div', { class: 'row' },
        h('span', { class: 'lbl' }, 'Blend'),
        select([...BLEND_MODES], layer.blend, (v) => { layer.blend = v; app.touch(); }))),
      floatRow(layer, '__opacity', 'Opacity', layer.opacity, 0, 1),
      h('hr'),
      ...meta.INPUTS.map((inp) => inputRow(layer, inp)),
    ].filter((n) => n !== null) as HTMLElement[]);
  };

  app.onChange(render);
  render();

  return function tick() {
    for (const m of liveMarkers) {
      const v = m.layer.live[m.key];
      if (v === undefined) continue;
      m.el.style.left = `${((v - m.min) / (m.max - m.min || 1)) * 100}%`;
      m.text.textContent = fmt(v);
    }
  };
}
