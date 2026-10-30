import { toast, type App } from '../app';
import { BUILTIN_MODELS } from '../model/load';
import { BUILTIN_TEXTURES, isVideoTexture, thumbnailURL } from '../render/Textures';
import { h } from './dom';

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
    const models = [...BUILTIN_MODELS, ...app.library.models].filter((m) => m.toLowerCase().includes(filter));
    const modelItem = (m: string) => {
      const item = h('button', { class: 'lib-item model', title: m.startsWith('@') ? 'Built-in shape' : `library/models/${m}`, onclick: () => app.addModel(m) },
        m.startsWith('@') ? m.slice(1) : m);
      if (m.startsWith('@')) return item;
      return h('div', { class: 'lib-row' }, item,
        h('button', { class: 'lib-del', title: `Delete library/models/${m}`, onclick: () => deleteModel(m) }, '✕'));
    };
    const textures = [...Object.keys(BUILTIN_TEXTURES), ...app.library.textures].filter((t) => t.toLowerCase().includes(filter));
    const textureItem = (t: string) => {
      const src = thumbnailURL(t);
      const target = app.textureInputs(app.selected)[0];
      const item = h('button', {
        class: 'lib-item texture',
        title: target ? `Set ${app.selected!.label} · ${target.LABEL ?? target.NAME}` : 'Add as an image layer',
        onclick: () => app.useTexture(t),
      },
      src ? h('img', { src, alt: '', loading: 'lazy' }) : h('span', { class: 'thumb' }, isVideoTexture(t) ? '🎞' : ''),
      t.startsWith('@') ? BUILTIN_TEXTURES[t].label.toLowerCase() : t);
      if (t.startsWith('@')) return item;
      return h('div', { class: 'lib-row' }, item,
        h('button', { class: 'lib-del', title: `Delete library/textures/${t}`, onclick: () => deleteTexture(t) }, '✕'));
    };
    list.replaceChildren(
      h('h3', {}, `Generators · ${gens.length}`), ...gens.map(item),
      h('h3', {}, `Effects · ${fx.length}`), ...fx.map(item),
      h('h3', {}, `3D models · ${models.length}`), ...models.map(modelItem),
      h('h3', {}, `Textures · ${textures.length}`), ...textures.map(textureItem),
      ...(broken.length ? [h('h3', {}, 'Broken'), ...broken.map(item)] : []),
    );
  };

  root.append(
    h('h2', {}, 'Library'),
    h('input', {
      type: 'search',
      placeholder: 'Filter shaders…',
      oninput: (e: Event) => { filter = (e.target as HTMLInputElement).value.toLowerCase(); render(); },
    }),
    h('div', { class: 'btn-row' },
      h('button', { onclick: () => createShader('generator') }, '+ Generator'),
      h('button', { onclick: () => createShader('effect') }, '+ Effect'),
    ),
    list,
    h('p', { class: 'hint' }, 'Click to add above the selected layer. Shaders live in library/shaders/*.fs (ISF) and hot-reload when edited in any editor. Drop a .glb/.obj/.stl on the canvas to add a 3D model, or an image/video to add a texture. Clicking a texture puts it on the selected layer if it has a texture slot, otherwise adds an image layer.'),
  );
  render();
  app.library.onChange((kind) => kind !== 'presets' && render());
  app.onChange(render);
}
