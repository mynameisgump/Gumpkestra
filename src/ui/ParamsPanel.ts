import type { App } from '../app';
import { MOD_SOURCES, newModulator, usesRate, type ModSource, type Modulator } from '../audio/Modulators';
import type { ISFInput } from '../isf/isf';
import { isModelFile, MODEL_EXTENSIONS, BUILTIN_MODELS } from '../model/load';
import { BLEND_MODES, floatRange, type Layer, type ParamState } from '../render/Layer';
import { MODEL_TEXTURE, ModelLayer } from '../render/ModelLayer';
import { DEFAULT_TEXT_MODEL, FONT_EXTENSIONS, fontLabel, isFontFile, isTextModel, parseTextModel, TEXT_FONTS, textModelName } from '../model/text';
import { BUILTIN_TEXTURES, INPUT_IMAGE, isTextureFile, isVideoTexture, TEXTURE_EXTENSIONS, thumbnailURL } from '../render/Textures';
import { h, isCollapsed, numberField, select, setCollapsed, slider, type NumberField } from './dom';
import { groupInputs, inputLabel, inputTooltip, matchesFilter } from './paramGroups';

const toHex = (c: number[]) => '#' + c.slice(0, 3).map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
const fromHex = (hex: string, a = 1) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).concat(a);

/** Parameters + modulators for the selected layer. Returns a per-frame function that animates live-value markers. */
export function ParamsPanel(root: HTMLElement, app: App, openEditor: (name: string) => void) {
  /** The texture slot whose thumbnail grid is open, if any. */
  let openGrid: { layer: Layer; input: string } | null = null;
  let liveMarkers: { el: HTMLElement; text: NumberField; layer: Layer; key: string; min: number; max: number }[] = [];
  let filter = '';
  let lastLayer: Layer | null = null;
  let currentGroupKeys: string[] = [];

  const headerSlot = h('div', { class: 'params-head' });
  const filterInput = h('input', {
    type: 'search',
    placeholder: 'Filter properties…',
    'aria-label': 'Filter properties',
    oninput: (e: Event) => {
      filter = (e.target as HTMLInputElement).value;
      renderBody();
    },
  }) as HTMLInputElement;
  const toggleAllBtn = h('button', {
    type: 'button',
    title: 'Collapse or expand all property groups',
    onclick: () => {
      if (!currentGroupKeys.length) return;
      const allClosed = currentGroupKeys.every((k) => isCollapsed(k));
      for (const k of currentGroupKeys) setCollapsed(k, !allClosed);
      renderBody();
    },
  }, 'Collapse all') as HTMLButtonElement;
  const toolsBar = h('div', { class: 'params-tools' }, filterInput, toggleAllBtn);
  const bodySlot = h('div', { class: 'params-body' });

  root.replaceChildren(headerSlot, toolsBar, bodySlot);

  /**
   * Modulator amount as a "sensitivity" slider. Amount is a fraction of the parameter's range per unit
   * of signal; up to ±MAX_SENS lets quiet bands still swing a parameter end to end. The slider is
   * squared so its middle half keeps fine control over the old ±1 range.
   */
  const MAX_SENS = 4;
  /** One full-width control line in a modulator block: name, control, value readout. */
  const modCtl = (name: string, title: string, control: Node, val?: Node) =>
    h('label', { class: 'mod-ctl', title }, h('span', {}, name), control, val ?? h('span'));

  const sensitivity = (m: Modulator) => {
    const pos = (a: number) => Math.sign(a) * Math.sqrt(Math.min(Math.abs(a), MAX_SENS) / MAX_SENS);
    const sl = slider({ min: -1, max: 1, step: 0.005, value: pos(m.amount), oninput: (s) => {
      m.amount = Math.round(s * Math.abs(s) * MAX_SENS * 100) / 100;
      val.show(m.amount);
      app.touch();
    } }) as HTMLInputElement;
    const val = numberField({ min: -MAX_SENS, max: MAX_SENS, get: () => m.amount, set: (v) => { m.amount = v; sl.value = String(pos(v)); app.touch(); } });
    val.classList.add('mod-val');
    return modCtl('sens', 'Sensitivity: how far the signal pushes the parameter (1 = its full range at full signal; negative inverts)', sl, val);
  };

  const smoothCtl = (m: Modulator) => {
    const sl = slider({ min: 0, max: 1, step: 0.01, value: m.smooth, oninput: (v) => { m.smooth = v; val.show(v); app.touch(); } }) as HTMLInputElement;
    const val = numberField({ min: 0, max: 1, get: () => m.smooth, set: (v) => { m.smooth = v; sl.value = String(v); app.touch(); } });
    val.classList.add('mod-val');
    return modCtl('smooth', 'Extra smoothing (seconds)', sl, val);
  };

  const modRow = (state: ParamState, m: Modulator, rerender: () => void, onModChange?: () => void) => {
    return h('div', { class: 'mod' },
      h('div', { class: 'mod-head' },
        select(MOD_SOURCES, m.source, (v: ModSource) => {
          const wasRate = usesRate(m.source);
          m.source = v;
          if (usesRate(v) !== wasRate || v === 'beatStep') m.rate = newModulator(v).rate;
          app.touch();
          rerender();
        }),
        h('button', {
          class: 'icon',
          title: 'Remove modulator',
          onclick: () => {
            state.mods.splice(state.mods.indexOf(m), 1);
            app.touch();
            rerender();
            onModChange?.();
          },
        }, '✕')),
      sensitivity(m),
      usesRate(m.source)
        ? modCtl(m.source === 'beatStep' ? 'beats' : 'Hz', m.source === 'beatStep' ? 'Beats per cycle' : 'Rate (Hz)',
          h('input', { type: 'number', min: 0, step: m.source === 'beatStep' ? 1 : 0.05, value: m.rate,
            onchange: (e: Event) => { m.rate = Number((e.target as HTMLInputElement).value); app.touch(); } }))
        : smoothCtl(m),
    );
  };

  const labelEl = (text: string, title?: string, hasTip = false) =>
    h('span', { class: `lbl ${hasTip ? 'has-tip' : ''}`, title }, text);

  const floatRow = (
    layer: Layer,
    key: string,
    label: string,
    state: ParamState,
    min: number,
    max: number,
    title?: string,
    hasTip = false,
    onModChange?: () => void,
  ) => {
    const marker = h('div', { class: 'live-marker' });
    const mods = h('div', { class: 'mods' });
    const renderMods = () => mods.replaceChildren(...state.mods.map((m) => modRow(state, m, renderMods, onModChange)));
    renderMods();
    const sl = slider({ min, max, value: state.value as number, oninput: (v) => { state.value = v; app.touch(); } }) as HTMLInputElement;
    const valText = numberField({ min, max, get: () => state.value as number, set: (v) => { state.value = v; sl.value = String(v); app.touch(); } });
    valText.classList.add('val');
    liveMarkers.push({ el: marker, text: valText, layer, key, min, max });
    return h('div', { class: 'param' },
      h('div', { class: 'row' },
        labelEl(label, title ?? key, hasTip),
        h('div', { class: 'slider-wrap' }, sl, marker),
        valText,
        h('button', {
          class: 'icon mod-add',
          title: 'Add modulator (audio / LFO)',
          onclick: () => { state.mods.push(newModulator()); app.touch(); renderMods(); onModChange?.(); },
        }, '∿'),
      ),
      mods,
    );
  };

  const inputRow = (layer: Layer, inp: ISFInput, onModChange?: () => void) => {
    const state = layer.params[inp.NAME];
    const label = inputLabel(inp);
    const tip = inputTooltip(inp);
    const hasTip = !!inp.DESCRIPTION;
    const row = (control: Node) =>
      h('div', { class: 'param' }, h('div', { class: 'row row-span' }, labelEl(label, tip, hasTip), control));
    switch (inp.TYPE) {
      case 'float': {
        const [min, max] = floatRange(inp);
        return floatRow(layer, inp.NAME, label, state, min, max, tip, hasTip, onModChange);
      }
      case 'bool':
        return row(h('input', { type: 'checkbox', checked: !!state.value, onchange: (e: Event) => { state.value = (e.target as HTMLInputElement).checked; app.touch(); } }));
      case 'long': {
        const values = inp.VALUES ?? [0, 1, 2, 3];
        const labels = inp.LABELS ?? values.map(String);
        const opts = Object.fromEntries(values.map((v, i) => [String(v), labels[i] ?? String(v)]));
        return row(select(opts, String(state.value), (v) => { state.value = Number(v); app.touch(); renderBody(); }));
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
      case 'image': {
        if (inp.NAME === 'inputImage') return null;
        const open = openGrid?.layer === layer && openGrid.input === inp.NAME;
        return h('div', { class: 'param' }, h('div', { class: 'row texture-row' },
          labelEl(label, tip, hasTip),
          texturePicker(layer, inp.NAME, open)),
          open ? textureGrid(layer, inp.NAME) : null,
          inp.TILE_SEQUENCE && layer.params.fit?.value === 3 ? tileSequence(layer, inp.NAME) : null);
      }
      case 'event':
        return row(h('div', { class: 'btn-row' },
          h('button', { onclick: () => layer.trigger(inp.NAME) }, 'Trigger'),
          h('label', {}, h('input', {
            type: 'checkbox',
            checked: !!state.onBeat,
            onchange: (e: Event) => { state.onBeat = (e.target as HTMLInputElement).checked; app.touch(); onModChange?.(); },
          }), ' on beat'),
        ));
      default:
        return null;
    }
  };

  /** Every value a texture slot can take, with display names: specials, built-ins, library/textures. */
  const textureOptions = (layer: Layer, value: string) => {
    const opts: Record<string, string> = {};
    if (layer instanceof ModelLayer) opts[MODEL_TEXTURE] = 'Model’s own';
    opts[INPUT_IMAGE] = 'Layers below';
    for (const [k, v] of Object.entries(BUILTIN_TEXTURES)) opts[k] = v.label;
    for (const t of app.library.textures) opts[t] = t;
    if (!(value in opts)) opts[value] = `${value} (missing)`;
    return opts;
  };

  /** A preview of a texture value: image thumbnail, looping muted video, or an icon for the specials. */
  const preview = (value: string, cls: string) => {
    const src = thumbnailURL(value);
    if (src) return h('img', { class: cls, src, alt: '', loading: 'lazy' });
    if (isVideoTexture(value) && app.library.textures.includes(value)) {
      return h('video', { class: cls, src: `/api/library/textures/${encodeURIComponent(value)}`, muted: true, autoplay: true, loop: true, playsInline: true });
    }
    return h('span', { class: cls }, value === INPUT_IMAGE ? '↓' : value === MODEL_TEXTURE ? '◆' : isVideoTexture(value) ? '🎞' : '?');
  };

  const toggleGrid = (layer: Layer, input: string) => {
    openGrid = openGrid?.layer === layer && openGrid.input === input ? null : { layer, input };
    renderBody();
  };

  /** Click-to-pick grid of every texture, shown under the slot. */
  const textureGrid = (layer: Layer, input: string) => {
    const value = String(layer.params[input].value);
    return h('div', { class: 'texture-grid' },
      ...Object.entries(textureOptions(layer, value)).map(([key, name]) => h('button', {
        class: `texture-tile ${key === value ? 'current' : ''}`,
        title: name,
        onclick: () => { openGrid = null; app.setTexture(layer, input, key); },
      }, preview(key, 'tile-preview'), h('span', { class: 'cap' }, name))));
  };

  /** The primary texture remains compatible with existing presets and texture imports. */
  const tileSequence = (layer: Layer, input: string) => {
    const state = layer.params[input];
    const names = [String(state.value), ...(state.tiles ?? [])];
    const max = app.engine.gl.getParameter(app.engine.gl.MAX_ARRAY_TEXTURE_LAYERS) as number;
    const apply = (next: string[]) => {
      state.value = next[0]; state.tiles = next.slice(1);
      app.touch(); renderBody();
    };
    const move = (i: number, step: number) => {
      const next = [...names];
      [next[i], next[i + step]] = [next[i + step], next[i]];
      apply(next);
    };
    return h('div', { class: 'tile-sequence' },
      h('p', { class: 'hint' }, 'Tile sequence · repeats across columns and rows in this order. All tiles use the first texture’s shape.'),
      ...names.map((name, i) => h('div', { class: 'tile-sequence-row' },
        h('span', {}, String(i + 1)), preview(name, 'thumb'),
        select(textureOptions(layer, name), name, (value) => { const next = [...names]; next[i] = value; apply(next); }),
        h('button', { title: `Move tile ${i + 1} up`, disabled: i === 0, onclick: () => move(i, -1) }, '↑'),
        h('button', { title: `Move tile ${i + 1} down`, disabled: i === names.length - 1, onclick: () => move(i, 1) }, '↓'),
        h('button', { title: `Remove tile ${i + 1}`, disabled: names.length === 1, onclick: () => apply(names.filter((_, j) => j !== i)) }, '✕'))),
      h('label', {}, h('span', { class: 'hint' }, 'Add to sequence'),
        select({ '': 'Add texture…', ...textureOptions(layer, names[0]) }, '', (value) => {
          if (value && names.length < max) apply([...names, value]);
        })),
      names.length >= max ? h('p', { class: 'hint' }, `This device supports ${max} tiles.`) : null);
  };

  /** Current texture (click to open the thumbnail grid) + Load… for one image input. */
  const texturePicker = (layer: Layer, input: string, open: boolean) => {
    const value = String(layer.params[input].value);
    const name = textureOptions(layer, value)[value];
    const file = h('input', {
      type: 'file',
      accept: TEXTURE_EXTENSIONS.join(','),
      style: 'display:none',
      onchange: (e: Event) => {
        const f = (e.target as HTMLInputElement).files?.[0];
        if (f && isTextureFile(f.name)) void app.importTexture(f, layer, input);
      },
    });
    return h('div', { class: 'texture-picker' },
      h('button', { class: `texture-current ${open ? 'open' : ''}`, title: 'Choose a texture', onclick: () => toggleGrid(layer, input) },
        preview(value, 'thumb'), h('span', { class: 'cap' }, name)),
      h('button', { title: 'Import an image or video into library/textures', onclick: () => (file as HTMLInputElement).click() }, 'Load…'),
      file);
  };

  /** Text + font for a 3D text model; applied on Enter / leaving the box. */
  const textRows = (layer: ModelLayer) => {
    const { font, text } = parseTextModel(layer.modelName);
    const apply = (f: string, t: string) => { if (textModelName(f, t) !== layer.modelName) void app.setModel(layer, textModelName(f, t)); };
    const input = h('input', {
      type: 'text', value: text, class: 'text-model-input', placeholder: 'Type some text',
      onchange: (e: Event) => apply(font, (e.target as HTMLInputElement).value),
      onkeydown: (e: KeyboardEvent) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); },
    });
    // Built-in fonts, then library/fonts (plus the current one if its file is missing).
    const fonts = [...Object.keys(TEXT_FONTS), ...app.library.fonts];
    if (!fonts.includes(font)) fonts.push(font);
    const opts = Object.fromEntries(fonts.map((f) => [f, f in TEXT_FONTS ? fontLabel(f) : `${fontLabel(f)} (${f.slice(f.lastIndexOf('.') + 1)})`]));
    const file = h('input', {
      type: 'file',
      accept: FONT_EXTENSIONS.join(','),
      style: 'display:none',
      onchange: (e: Event) => {
        const f = (e.target as HTMLInputElement).files?.[0];
        if (f && isFontFile(f.name)) void app.importFont(f, layer);
      },
    }) as HTMLInputElement;
    return [
      h('div', { class: 'param' }, h('div', { class: 'row model-row' }, labelEl('Text', 'Text extruded into 3D geometry', true), input)),
      h('div', { class: 'param' }, h('div', { class: 'row model-row' }, labelEl('Font', 'Typeface used for 3D text', true),
        select(opts, font, (f) => apply(f, (input as HTMLInputElement).value)),
        h('button', { title: 'Import a .ttf/.otf/.woff/.woff2 into library/fonts', onclick: () => file.click() }, 'Load…'),
        file)),
    ];
  };

  const meshVisibility = (layer: ModelLayer) => {
    const meshes = [...new Map(layer.mesh?.groups.map((g) => [g.meshId, g.meshName])).entries()];
    if (!meshes.length) return null;
    const visible = meshes.filter(([id]) => !layer.hiddenMeshes.has(id)).length;
    const all = (show: boolean) => {
      layer.hiddenMeshes = new Set(show ? [] : meshes.map(([id]) => id));
      app.touch(); renderBody();
    };
    return h('fieldset', { class: 'mesh-visibility' },
      h('legend', {}, `Visible meshes · ${visible}/${meshes.length}`),
      h('div', { class: 'btn-row' },
        h('button', { disabled: visible === meshes.length, onclick: () => all(true) }, 'Show all'),
        h('button', { disabled: visible === 0, onclick: () => all(false) }, 'Hide all')),
      h('div', { class: 'mesh-list' }, ...meshes.map(([id, name], i) =>
        h('label', { title: name },
          h('input', { type: 'checkbox', checked: !layer.hiddenMeshes.has(id), onchange: (e: Event) => {
            if ((e.target as HTMLInputElement).checked) layer.hiddenMeshes.delete(id);
            else layer.hiddenMeshes.add(id);
            app.touch(); renderBody();
          } }),
          h('span', {}, name),
          h('span', { class: 'hint', 'aria-hidden': 'true' }, String(i + 1))))));
  };

  const modelRows = (layer: ModelLayer) => {
    const isText = isTextModel(layer.modelName);
    // 3D text is one entry; picking it keeps the current text if there is one.
    const textOption = isText ? layer.modelName : DEFAULT_TEXT_MODEL;
    const names = [...BUILTIN_MODELS, textOption, ...app.library.models];
    if (!names.includes(layer.modelName)) names.push(layer.modelName);
    const opts = Object.fromEntries(names.map((n) => [n, isTextModel(n) ? '3D text (built-in)' : n.startsWith('@') ? `${n.slice(1)} (built-in)` : n]));
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
        labelEl('Model', '3D mesh file or built-in shape', true),
        select(opts, layer.modelName, (v) => void app.setModel(layer, v)),
        h('button', { title: 'Import a .glb/.gltf/.obj/.stl into library/models', onclick: () => file.click() }, 'Load…'),
        file)),
      ...(isText ? textRows(layer) : []),
      layer.status ? null : meshVisibility(layer),
      h('p', { class: 'hint' }, layer.status
        ?? (mesh ? `${(mesh.vertexCount / 3).toLocaleString()} triangles · ${mesh.textures.length} textures · ${mesh.rig.animations.length} animations` : '')),
    ].filter((n) => n !== null) as HTMLElement[];
  };

  /** A collapsible group card with optional active-modulator badge and item count. */
  const paramGroup = (opts: {
    key: string;
    title: string;
    count?: number;
    getModCount: () => number;
    renderContent: (onModChange: () => void) => (HTMLElement | null)[];
  }) => {
    const filtering = !!filter.trim();
    const closed = !filtering && isCollapsed(opts.key);
    const modBadge = h('span', { class: 'param-group-mods' });
    const updateBadge = () => {
      const n = opts.getModCount();
      modBadge.textContent = n > 0 ? `∿ ${n}` : '';
      modBadge.title = n > 0 ? `${n} active modulator${n > 1 ? 's' : ''} / beat trigger${n > 1 ? 's' : ''}` : '';
      modBadge.style.display = n > 0 ? '' : 'none';
    };
    updateBadge();

    const head = h('button', {
      type: 'button',
      class: 'param-group-head',
      'aria-expanded': String(!closed),
      onclick: () => {
        if (filtering) return;
        setCollapsed(opts.key, !isCollapsed(opts.key));
        renderBody();
      },
    },
      h('span', { class: 'param-group-title' }, opts.title),
      modBadge,
      opts.count !== undefined ? h('span', { class: 'param-group-count' }, String(opts.count)) : null,
    );

    const children = closed ? [] : opts.renderContent(updateBadge).filter((n): n is HTMLElement => n !== null);
    return h('section', { class: `param-group ${closed ? 'collapsed' : ''}`, 'data-group': opts.title },
      head,
      closed ? null : h('div', { class: 'param-group-body' }, ...children),
    );
  };

  const renderBody = () => {
    liveMarkers = [];
    const layer = app.selected;
    if (!layer) {
      currentGroupKeys = [];
      toolsBar.style.display = 'none';
      bodySlot.replaceChildren(h('p', { class: 'hint' }, 'Select a layer.'));
      return;
    }

    const meta = layer.parsed.meta;
    const isModel = layer instanceof ModelLayer;
    const inputGroups = groupInputs(meta.INPUTS);
    const totalInputs = inputGroups.reduce((sum, g) => sum + g.inputs.length, 0);
    const q = filter.trim();

    const sections: HTMLElement[] = [];
    const keys: string[] = [];

    // 1. Model section (for 3D layers)
    if (isModel) {
      const key = `param:${layer.shaderName}:__model`;
      keys.push(key);
      if (matchesFilter(q, 'Model', 'Mesh', 'Visible meshes', '3D text', 'Text', 'Font', layer.modelName)) {
        sections.push(paramGroup({
          key,
          title: 'Model',
          getModCount: () => 0,
          renderContent: () => modelRows(layer),
        }));
      }
    }

    // 2. Compositing section (Blend + Opacity)
    {
      const key = `param:${layer.shaderName}:__compositing`;
      keys.push(key);
      const groupHit = matchesFilter(q, 'Compositing', 'Layer');
      const showBlend = groupHit || matchesFilter(q, 'Blend', 'blend mode', 'compositing');
      const showOpacity = groupHit || matchesFilter(q, 'Opacity', 'alpha', 'transparency');
      const compCount = (showBlend ? 1 : 0) + (showOpacity ? 1 : 0);
      if (compCount > 0) {
        sections.push(paramGroup({
          key,
          title: 'Compositing',
          count: compCount,
          getModCount: () => layer.opacity.mods.length,
          renderContent: (onModChange) => [
            showBlend
              ? h('div', { class: 'param' }, h('div', { class: 'row row-span' },
                labelEl('Blend', 'How this layer composites over layers below', true),
                select([...BLEND_MODES], layer.blend, (v) => { layer.blend = v; app.touch(); })))
              : null,
            showOpacity
              ? floatRow(layer, '__opacity', 'Opacity', layer.opacity, 0, 1, 'Overall layer visibility (0 = hidden, 1 = full)', true, onModChange)
              : null,
          ],
        }));
      }
    }

    // 3. Shader / Model input groups
    for (const group of inputGroups) {
      const key = `param:${layer.shaderName}:${group.id}`;
      keys.push(key);
      const groupMatch = matchesFilter(q, group.title);
      const matched = groupMatch
        ? group.inputs
        : group.inputs.filter((inp) => matchesFilter(q, inputLabel(inp), inp.NAME, inp.DESCRIPTION));
      if (!matched.length) continue;

      sections.push(paramGroup({
        key,
        title: group.title,
        count: matched.length,
        getModCount: () => matched.reduce((sum, inp) => {
          const st = layer.params[inp.NAME];
          if (!st) return sum;
          return sum + st.mods.length + (inp.TYPE === 'event' && st.onBeat ? 1 : 0);
        }, 0),
        renderContent: (onModChange) => matched.map((inp) => inputRow(layer, inp, onModChange)),
      }));
    }

    currentGroupKeys = keys;
    const showTools = keys.length >= 3 || totalInputs >= 6;
    toolsBar.style.display = showTools ? '' : 'none';
    const allClosed = keys.length > 0 && keys.every((k) => isCollapsed(k));
    toggleAllBtn.textContent = allClosed ? 'Expand all' : 'Collapse all';
    toggleAllBtn.disabled = !!q;

    if (!sections.length) {
      bodySlot.replaceChildren(h('p', { class: 'hint' }, `No properties matching “${q}”.`));
    } else {
      bodySlot.replaceChildren(...sections);
    }
  };

  const render = () => {
    const layer = app.selected;
    if (layer !== lastLayer) {
      lastLayer = layer;
      filter = '';
      filterInput.value = '';
    }
    if (openGrid && openGrid.layer !== layer) openGrid = null;

    if (!layer) {
      headerSlot.replaceChildren(h('h2', {}, 'Parameters'));
    } else {
      const meta = layer.parsed.meta;
      const isModel = layer instanceof ModelLayer;
      headerSlot.replaceChildren(...([
        h('h2', {}, layer.label,
          isModel ? null : h('button', { class: 'edit-btn', onclick: () => openEditor(layer.shaderName) }, '{ } Edit')),
        meta.DESCRIPTION ? h('p', { class: 'hint' }, meta.DESCRIPTION) : null,
      ].filter((n) => n !== null) as HTMLElement[]));
    }
    renderBody();
  };

  app.onChange(render);
  render();

  return function tick() {
    for (const m of liveMarkers) {
      const v = m.layer.live[m.key];
      if (v === undefined) continue;
      m.el.style.left = `${((v - m.min) / (m.max - m.min || 1)) * 100}%`;
      m.text.show(v);
    }
  };
}
