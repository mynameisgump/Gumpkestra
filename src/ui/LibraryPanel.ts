import { toast, type App } from '../app';
import { BUILTIN_MODELS } from '../model/load';
import { DEFAULT_TEXT_MODEL, fontLabel, isTextModel, parseTextModel } from '../model/text';
import { BUILTIN_TEXTURES, isVideoTexture, thumbnailURL } from '../render/Textures';
import { h, isCollapsed, setCollapsed } from './dom';

const GENERATOR_TEMPLATE = `/*{
  "DESCRIPTION": "New generator",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "audioFFT", "TYPE": "audioFFT" },
    { "NAME": "intensity", "TYPE": "float", "DEFAULT": 0.5, "MIN": 0.0, "MAX": 1.0 },
    { "NAME": "tint", "TYPE": "color", "DEFAULT": [0.2, 1.0, 0.7, 1.0] }
  ]
}*/

// Built-ins: TIME, RENDERSIZE, AUDIO_LEVEL, AUDIO_BASS, AUDIO_MID, AUDIO_HIGH, AUDIO_BEAT, BEAT_COUNT
void main() {
  vec2 uv = isf_FragNormCoord;
  float fft = IMG_NORM_PIXEL(audioFFT, vec2(uv.x, 0.5)).r;
  float bar = step(uv.y, fft * intensity * 2.0);
  gl_FragColor = vec4(tint.rgb * bar, 1.0);
}
`;

const EFFECT_TEMPLATE = `/*{
  "DESCRIPTION": "New effect",
  "CATEGORIES": ["Effect"],
  "INPUTS": [
    { "NAME": "inputImage", "TYPE": "image" },
    { "NAME": "amount", "TYPE": "float", "DEFAULT": 0.5, "MIN": 0.0, "MAX": 1.0 }
  ]
}*/

void main() {
  vec2 uv = isf_FragNormCoord;
  vec4 src = IMG_NORM_PIXEL(inputImage, uv);
  gl_FragColor = vec4(mix(src.rgb, 1.0 - src.rgb, amount), 1.0);
}
`;

export function LibraryPanel(root: HTMLElement, app: App, openEditor: (name: string) => void) {
  let filter = '';
  const list = h('div', { class: 'lib-list' });

  const createShader = async (kind: 'generator' | 'effect') => {
    const name = prompt(`Name for the new ${kind}:`)?.trim();
    if (!name) return;
    if (app.library.shaders.has(name)) return toast(`"${name}" already exists`, true);
    try {
      await app.library.saveShader(name, kind === 'generator' ? GENERATOR_TEMPLATE : EFFECT_TEMPLATE);
      app.addShader(name);
      openEditor(name);
    } catch (e) {
      toast((e as Error).message, true);
    }
  };

  const deleteModel = (name: string) => {
    const layers = app.modelLayers(name).length;
    const presets = [...app.library.presets.values()].filter((p) => p.layers.some((l) => l.model === name)).map((p) => p.name);
    const warnings = [
      layers && `${layers} layer${layers > 1 ? 's' : ''} showing it will be removed.`,
      presets.length && `Still used by preset${presets.length > 1 ? 's' : ''}: ${presets.join(', ')}.`,
    ].filter(Boolean);
    if (!confirm([`Delete library/models/${name}? This removes the file from disk.`, ...warnings].join('\n\n'))) return;
    void app.deleteModel(name);
  };

  const deleteTexture = (name: string) => {
    const slots = app.textureUses(name).length;
    const presets = [...app.library.presets.values()]
      .filter((p) => p.layers.some((l) => Object.values(l.params ?? {}).some((s) => s.value === name)))
      .map((p) => p.name);
    const warnings = [
      slots && `${slots} texture slot${slots > 1 ? 's' : ''} showing it will go back to ${slots > 1 ? 'their' : 'its'} default.`,
      presets.length && `Still used by preset${presets.length > 1 ? 's' : ''}: ${presets.join(', ')}.`,
    ].filter(Boolean);
    if (!confirm([`Delete library/textures/${name}? This removes the file from disk.`, ...warnings].join('\n\n'))) return;
    void app.deleteTexture(name);
  };

  const deleteFont = (name: string) => {
    const layers = app.fontLayers(name).length;
    const presets = [...app.library.presets.values()]
      .filter((p) => p.layers.some((l) => l.model && isTextModel(l.model) && parseTextModel(l.model).font === name))
      .map((p) => p.name);
    const warnings = [
      layers && `${layers} 3D text layer${layers > 1 ? 's' : ''} using it will go back to the default font.`,
      presets.length && `Still used by preset${presets.length > 1 ? 's' : ''}: ${presets.join(', ')}.`,
    ].filter(Boolean);
    if (!confirm([`Delete library/fonts/${name}? This removes the file from disk.`, ...warnings].join('\n\n'))) return;
    void app.deleteFont(name);
  };

  const render = () => {
    const entries = [...app.library.shaders.values()]
      .filter((s) => s.name.toLowerCase().includes(filter))
      .sort((a, b) => a.name.localeCompare(b.name));
    const item = (s: (typeof entries)[number]) =>
      h('button', {
        class: `lib-item ${s.error || app.errors.has(s.name) ? 'has-error' : ''}`,
        title: s.error ?? app.errors.get(s.name) ?? s.parsed?.meta.DESCRIPTION ?? '',
        onclick: () => app.addShader(s.name),
      }, s.name);
    const gens = entries.filter((s) => s.parsed && !s.parsed.isFilter);
    const fx = entries.filter((s) => s.parsed?.isFilter);
    const broken = entries.filter((s) => !s.parsed);
    const modelLabel = (m: string) => (isTextModel(m) ? '3D text' : m.startsWith('@') ? m.slice(1) : m);
    const models = [...BUILTIN_MODELS, DEFAULT_TEXT_MODEL, ...app.library.models].filter((m) => modelLabel(m).toLowerCase().includes(filter));
    const modelItem = (m: string) => {
      const item = h('button', {
        class: 'lib-item model',
        title: isTextModel(m) ? 'Extruded 3D text: set the text and font in the layer settings' : m.startsWith('@') ? 'Built-in shape' : `library/models/${m}`,
        onclick: () => app.addModel(m),
      }, modelLabel(m));
      if (m.startsWith('@')) return item;
      return h('div', { class: 'lib-row' }, item,
        h('button', { class: 'lib-del', title: `Delete library/models/${m}`, onclick: () => deleteModel(m) }, '✕'));
    };
    const textures = [...Object.keys(BUILTIN_TEXTURES), ...app.library.textures].filter((t) => t.toLowerCase().includes(filter));
    // Textures are a grid of thumbnails (name on hover) to keep the list short.
    const textureItem = (t: string) => {
      const src = thumbnailURL(t);
      const target = app.textureInputs(app.selected)[0];
      const name = t.startsWith('@') ? `${BUILTIN_TEXTURES[t].label} (built-in)` : t;
      return h('div', { class: 'tex-tile' },
        h('button', {
          class: 'tex-pick',
          title: `${name}\n${target ? `Click: set ${app.selected!.label} · ${target.LABEL ?? target.NAME}` : 'Click: add as an image layer'}`,
          onclick: () => app.useTexture(t),
        }, src ? h('img', { src, alt: name, loading: 'lazy' }) : h('span', { class: 'thumb' }, isVideoTexture(t) ? '🎞' : '')),
        t.startsWith('@') ? null : h('button', { class: 'lib-del', title: `Delete library/textures/${t}`, onclick: () => deleteTexture(t) }, '✕'));
    };
    const fonts = app.library.fonts.filter((f) => f.toLowerCase().includes(filter));
    const fontItem = (f: string) => h('div', { class: 'lib-row' },
      h('button', {
        class: 'lib-item font',
        title: `library/fonts/${f}\nClick: use on the selected 3D text layer, or add a 3D text layer`,
        onclick: () => app.useFont(f),
      }, fontLabel(f)),
      h('button', { class: 'lib-del', title: `Delete library/fonts/${f}`, onclick: () => deleteFont(f) }, '✕'));
    /** A heading that folds its items away (remembered). Everything shows while filtering. */
    const section = (id: string, title: string, items: Node[], cls = 'lib-section'): (HTMLElement | null)[] => {
      const key = `lib:${id}`;
      const closed = !filter && isCollapsed(key);
      return [
        h('h3', { class: `section-head ${closed ? 'closed' : ''}`, onclick: () => { setCollapsed(key, !isCollapsed(key)); render(); } },
          `${title} · ${items.length}`),
        closed ? null : h('div', { class: cls }, ...items),
      ];
    };
    list.replaceChildren(...[
      ...section('generators', 'Generators', gens.map(item)),
      ...section('effects', 'Effects', fx.map(item)),
      ...section('models', '3D models', models.map(modelItem)),
      ...section('textures', 'Textures', textures.map(textureItem), 'tex-grid'),
      ...section('fonts', 'Fonts', fonts.map(fontItem)),
      ...(broken.length ? section('broken', 'Broken', broken.map(item)) : []),
    ].filter((n): n is HTMLElement => !!n));
  };

  root.append(
    h('h2', {}, 'Library'),
    h('input', {
      type: 'search',
      placeholder: 'Filter library…',
      oninput: (e: Event) => { filter = (e.target as HTMLInputElement).value.toLowerCase(); render(); },
    }),
    h('div', { class: 'btn-row' },
      h('button', { onclick: () => createShader('generator') }, '+ Generator'),
      h('button', { onclick: () => createShader('effect') }, '+ Effect'),
    ),
    list,
    h('p', { class: 'hint' }, 'Click to add above the selected layer. Shaders live in library/shaders/*.fs (ISF) and hot-reload when edited in any editor. Drop a .glb/.obj/.stl on the canvas to add a 3D model, an image/video to add a texture, or a .ttf/.otf/.woff font for 3D text. Clicking a texture puts it on the selected layer if it has a texture slot, otherwise adds an image layer.'),
  );
  render();
  app.library.onChange((kind) => kind !== 'presets' && render());
  app.onChange(render);
}
