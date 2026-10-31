import './styles.css';
import { App, toast } from './app';
import { AudioEngine } from './audio/AudioEngine';
import { Library } from './library';
import { Engine } from './render/Engine';
import { AudioPanel } from './ui/AudioPanel';
import { collapsiblePanel, h } from './ui/dom';
import { Editor } from './ui/Editor';
import { LibraryPanel } from './ui/LibraryPanel';
import { ParamsPanel } from './ui/ParamsPanel';
import { PresetPicker } from './ui/PresetPicker';
import { PresetsPanel } from './ui/PresetsPanel';
import { StackPanel } from './ui/StackPanel';
import { ResolutionControl } from './ui/ResolutionControl';
import { HDRControl } from './ui/HDRControl';

const $ = (id: string) => document.getElementById(id)!;

async function main() {
  const canvas = $('canvas') as HTMLCanvasElement;
  const engine = new Engine(canvas);
  const audio = new AudioEngine();
  const library = new Library();
  await library.load();
  const app = new App(engine, audio, library);
  // Exposed for poking around in devtools.
  Object.assign(window, { app });

  const editor = Editor($('editor-panel'), app);
  const drawMeters = AudioPanel($('audio-panel'), app);
  LibraryPanel($('library-panel'), app, editor.open);
  StackPanel($('stack-panel'), app);
  const tickParams = ParamsPanel($('params-panel'), app, editor.open);
  const topbar = Topbar(app);
  const presetsPanel = PresetsPanel($('presets-panel'), app, topbar.load);
  for (const id of ['audio-panel', 'presets-panel', 'library-panel']) collapsiblePanel($(id), id);

  engine.textures.fetchBlob = (name) => library.fetchFile('textures', name);
  library.onChange((kind, name) => {
    if (kind === 'shaders') app.reloadShader(name);
    else if (kind === 'models') app.reloadModel(name);
    else if (kind === 'fonts') app.reloadFont(name);
    else if (kind === 'textures') {
      engine.textures.invalidate(name);
      app.changed();
    } else topbar.refresh();
  });

  if (!app.restoreSession()) {
    const preset = library.presets.get('default');
    if (preset) app.loadPreset(preset);
  }

  // Render loop
  let last = performance.now();
  let fpsFrames = 0;
  let fpsTime = 0;
  const fpsEl = $('fps');
  const loop = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const time = now / 1000;
    audio.update(dt, time);
    app.presetTimer.tick(time);
    engine.render(time, dt, audio);
    if (!document.body.classList.contains('perform')) {
      drawMeters();
      tickParams();
    }
    fpsFrames++;
    fpsTime += dt;
    if (fpsTime > 0.5) {
      fpsEl.textContent = `${Math.round(fpsFrames / fpsTime)} fps · ${engine.width}×${engine.height}`;
      fpsFrames = fpsTime = 0;
      // Slider drags don't trigger a structural change, so poll for unsaved edits here.
      topbar.updateDirty();
      presetsPanel.updateDirty();
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

  // Keyboard
  window.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 's' && !e.defaultPrevented) {
      e.preventDefault();
      void topbar.save();
      return;
    }
    const t = e.target as HTMLElement;
    if ((e.metaKey || e.ctrlKey) && e.key === 'd' && !t.matches('textarea')) {
      e.preventDefault();
      if (app.selected) app.duplicateLayer(app.selected);
      return;
    }
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || t.closest('input, textarea, select, [contenteditable]')) return;
    if (['ArrowLeft', 'ArrowRight', '[', ']'].includes(e.key)) {
      e.preventDefault();
      if (!e.repeat) topbar.step(e.key === 'ArrowLeft' || e.key === '[' ? -1 : 1);
      return;
    }
    if (e.key === 'p') {
      e.preventDefault();
      topbar.openPicker();
    }
    if (e.key === 'h') document.body.classList.toggle('perform');
    if (e.key === 'f') $('stage').requestFullscreen?.();
    if (e.key === ' ' && audio.mediaElement) {
      e.preventDefault();
      const el = audio.mediaElement;
      if (el.paused) el.play();
      else el.pause();
    }
  });
}

function Topbar(app: App) {
  const hdr = HDRControl(app.engine);
  const names = () => app.presetGroups.names(app.library.presets);
  const confirmDiscard = () => !app.dirty || confirm(`Discard unsaved changes to "${app.presetName}"?`);

  // `load` is defined below; the wrapper defers the lookup until a tile is clicked.
  const picker = PresetPicker(app, (name) => load(name));
  const dirtyDot = h('span', { class: 'dirty-dot', title: 'Unsaved changes' }, '●');
  const saveBtn = h('button', { title: 'Save over the current preset (⌘S)', onclick: () => save() }, 'Save') as HTMLButtonElement;

  const updateDirty = () => {
    hdr.update();
    const dirty = app.dirty;
    dirtyDot.classList.toggle('on', dirty);
    saveBtn.disabled = app.presetSaved && !dirty;
  };

  const refresh = () => {
    picker.refresh();
    updateDirty();
  };

  const load = (name: string, direction: 1 | -1 = 1) => {
    const p = app.library.presets.get(name);
    if (p && name !== app.presetName && confirmDiscard()) app.loadPreset(p, true, direction);
    refresh();
  };

  /** Load the previous/next preset, wrapping around. From an unsaved stack, next is the first. */
  const step = (dir: 1 | -1) => {
    const list = names();
    if (!list.length) return;
    const i = list.indexOf(app.presetName);
    load(list[i < 0 ? (dir > 0 ? 0 : list.length - 1) : (i + dir + list.length) % list.length], dir);
  };

  const newPreset = () => {
    if (confirmDiscard()) app.newPreset();
  };

  const saveAs = async () => {
    const name = prompt('Save preset as:', app.presetSaved ? `${app.presetName} copy` : app.presetName)?.trim();
    if (!name) return;
    if (name !== app.presetName && app.library.presets.has(name) && !confirm(`Overwrite preset "${name}"?`)) return;
    await write(name);
  };

  /** Overwrite the current preset; a new, never-saved one asks for a name first. */
  const save = () => (app.presetSaved ? write(app.presetName) : saveAs());

  const write = async (name: string) => {
    try {
      await app.savePreset(name);
      toast(`Saved library/presets/${name}.json`);
    } catch (e) {
      toast((e as Error).message, true);
    }
  };

  app.onChange(refresh);
  refresh();

  // Recording: canvas video + whatever audio source is active.
  let recorder: MediaRecorder | null = null;
  const recBtn = h('button', { class: 'rec' }, '● Rec');
  recBtn.addEventListener('click', () => {
    if (recorder) {
      recorder.stop();
      return;
    }
    let stream: MediaStream | undefined;
    try {
      // MediaRecorder's WebM path is SDR. Present the tone-mapped image during
      // recording rather than promising HDR metadata the encoder cannot preserve.
      app.engine.colorOutput.recordingSDR = true;
      app.engine.colorOutput.configure(app.engine.width, app.engine.height);
      stream = app.engine.canvas.captureStream(60);
      for (const track of app.audio.recordDest.stream.getAudioTracks()) stream.addTrack(track);
      const mimeType = ['video/webm;codecs=vp9,opus', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m));
      const chunks: Blob[] = [];
      recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 16_000_000 });
      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = () => {
        const url = URL.createObjectURL(new Blob(chunks, { type: 'video/webm' }));
        h('a', { href: url, download: `gumpkestra-${Date.now()}.webm` }).click();
        recorder = null;
        app.engine.colorOutput.recordingSDR = false;
        stream?.getVideoTracks().forEach((t) => t.stop());
        recBtn.classList.remove('on');
        recBtn.textContent = '● Rec';
      };
      recorder.start(250);
      recBtn.classList.add('on');
      recBtn.textContent = '■ Stop';
    } catch (e) {
      recorder = null;
      app.engine.colorOutput.recordingSDR = false;
      stream?.getVideoTracks().forEach((t) => t.stop());
      toast(`Recording could not start: ${(e as Error).message}`, true);
    }
  });

  $('topbar').append(
    h('div', { class: 'brand' }, 'GUMPKESTRA'),
    h('div', { class: 'preset-nav' },
      h('button', { title: 'Previous in active group (← or [)', onclick: () => step(-1) }, '◀'),
      picker.el,
      dirtyDot,
      h('button', { title: 'Next in active group (→ or ])', onclick: () => step(1) }, '▶')),
    h('button', { title: 'Start a new, empty preset', onclick: newPreset }, 'New'),
    saveBtn,
    h('button', { title: 'Save under a new name', onclick: () => saveAs() }, 'Save as…'),
    h('span', { class: 'spacer' }),
    ResolutionControl(app.engine),
    hdr.el,
    recBtn,
    h('button', { onclick: () => $('stage').requestFullscreen?.(), title: 'F' }, 'Fullscreen'),
    h('button', { onclick: () => document.body.classList.toggle('perform'), title: 'H' }, 'Hide UI'),
    h('span', { id: 'fps' }),
  );
  return { refresh, updateDirty, load, step, save, openPicker: picker.open };
}

main().catch((e) => {
  console.error(e);
  document.body.append(h('pre', { class: 'fatal' }, String(e?.stack ?? e)));
});
