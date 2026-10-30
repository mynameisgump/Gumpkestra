import './styles.css';
import { App, toast } from './app';
import { AudioEngine } from './audio/AudioEngine';
import { Library } from './library';
import { Engine } from './render/Engine';
import { AudioPanel } from './ui/AudioPanel';
import { h } from './ui/dom';
import { Editor } from './ui/Editor';
import { LibraryPanel } from './ui/LibraryPanel';
import { ParamsPanel } from './ui/ParamsPanel';
import { StackPanel } from './ui/StackPanel';

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
  Topbar(app);

  library.onChange((kind, name) => {
    if (kind === 'shaders') app.reloadShader(name);
    else if (kind === 'models') app.reloadModel(name);
    else Topbar.refreshPresets?.();
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
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

  // Keyboard
  window.addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement;
    if (t.matches('input, textarea, select')) return;
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
  const presetSelect = h('select', { title: 'Presets in library/presets/' });
  const refreshPresets = () => {
    presetSelect.replaceChildren(
      h('option', { value: '' }, 'Load preset…'),
      ...[...app.library.presets.keys()].sort().map((n) => h('option', { value: n }, n)),
    );
  };
  presetSelect.addEventListener('change', () => {
    const p = app.library.presets.get(presetSelect.value);
    if (p) app.loadPreset(p);
    presetSelect.value = '';
  });
  Topbar.refreshPresets = refreshPresets;
  refreshPresets();

  const savePreset = async () => {
    const name = prompt('Preset name:', app.presetName)?.trim();
    if (!name) return;
    app.presetName = name;
    try {
      await app.library.savePreset(app.snapshot());
      refreshPresets();
      toast(`Saved library/presets/${name}.json`);
    } catch (e) {
      toast((e as Error).message, true);
    }
  };

  // Recording: canvas video + whatever audio source is active.
  let recorder: MediaRecorder | null = null;
  const recBtn = h('button', { class: 'rec' }, '● Rec');
  recBtn.addEventListener('click', () => {
    if (recorder) {
      recorder.stop();
      return;
    }
    const stream = app.engine.canvas.captureStream(60);
    app.audio.recordDest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
    const mimeType = ['video/webm;codecs=vp9,opus', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m));
    const chunks: Blob[] = [];
    recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 16_000_000 });
    recorder.ondataavailable = (e) => chunks.push(e.data);
    recorder.onstop = () => {
      const url = URL.createObjectURL(new Blob(chunks, { type: 'video/webm' }));
      h('a', { href: url, download: `gumpkestra-${Date.now()}.webm` }).click();
      recorder = null;
      recBtn.classList.remove('on');
      recBtn.textContent = '● Rec';
    };
    recorder.start(250);
    recBtn.classList.add('on');
    recBtn.textContent = '■ Stop';
  });

  $('topbar').append(
    h('div', { class: 'brand' }, 'GUMPKESTRA'),
    presetSelect,
    h('button', { onclick: savePreset }, 'Save preset…'),
    h('span', { class: 'spacer' }),
    h('label', { class: 'res', title: 'Render resolution' }, 'res ',
      h('select', { onchange: (e: Event) => (app.engine.scale = Number((e.target as HTMLSelectElement).value)) },
        ...[1, 0.75, 0.5, 0.35].map((s) => h('option', { value: s, selected: s === app.engine.scale }, `${s * 100}%`)))),
    recBtn,
    h('button', { onclick: () => $('stage').requestFullscreen?.(), title: 'F' }, 'Fullscreen'),
    h('button', { onclick: () => document.body.classList.toggle('perform'), title: 'H' }, 'Hide UI'),
    h('span', { id: 'fps' }),
  );
}
Topbar.refreshPresets = undefined as undefined | (() => void);

main().catch((e) => {
  console.error(e);
  document.body.append(h('pre', { class: 'fatal' }, String(e?.stack ?? e)));
});
