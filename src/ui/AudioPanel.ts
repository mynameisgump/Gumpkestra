import { toast, type App } from '../app';
import { isModelFile } from '../model/load';
import { isFontFile } from '../model/text';
import { isTextureFile } from '../render/Textures';
import { h, numberField, slider } from './dom';

const METER_BANDS = ['level', 'bass', 'lowMid', 'mid', 'high', 'beat'] as const;

/** Source selection, analysis tuning and live meters. Returns a per-frame draw function. */
export function AudioPanel(root: HTMLElement, app: App) {
  const { audio } = app;
  const sourceLabel = h('div', { class: 'source-label' }, 'No audio source');
  const playerSlot = h('div', { class: 'player-slot' });
  const fileInput = h('input', {
    type: 'file',
    accept: 'audio/*,video/*',
    hidden: true,
    onchange: () => fileInput.files?.[0] && useFile(fileInput.files[0]),
  });
  const deviceSelect = h('select', { class: 'device-select', title: 'Microphone or line input', onchange: () => useInput() }) as HTMLSelectElement;
  /** Placeholder value, so even "Default input" is a change that starts it. */
  const NO_INPUT = '-';
  /** The input device in use ('' = default), or null while the source is a file or tab. */
  let activeInput: string | null = null;

  const refreshSource = () => {
    deviceSelect.value = activeInput ?? NO_INPUT;
    sourceLabel.textContent = audio.sourceLabel === 'none' ? 'No audio source' : `▶ ${audio.sourceLabel}`;
    playerSlot.replaceChildren();
    const el = audio.mediaElement;
    if (el) {
      el.controls = true;
      playerSlot.append(el);
    }
  };

  const run = (fn: () => Promise<void>) => async () => {
    try {
      await fn();
    } catch (e) {
      toast((e as Error).message, true);
    }
    // Also on failure, so the input picker snaps back to what's really playing.
    refreshSource();
  };

  const useFile = (file: File) => run(async () => { await audio.useFile(file); activeInput = null; })();

  const useInput = run(async () => {
    const id = deviceSelect.value;
    await audio.useInput(id || undefined);
    activeInput = id;
    // Device names are only visible once mic permission is granted.
    await listDevices();
  });

  const listDevices = async () => {
    const devices = await audio.listInputDevices();
    deviceSelect.replaceChildren(
      h('option', { value: NO_INPUT, disabled: true }, 'Use an input…'),
      h('option', { value: '' }, 'Default input'),
      ...devices.map((d) => h('option', { value: d.deviceId }, d.label || `Input ${d.deviceId.slice(0, 6)}`)),
    );
    deviceSelect.value = activeInput ?? NO_INPUT;
  };

  const settingRow = (label: string, key: keyof typeof audio.settings, min: number, max: number) => {
    const sl = slider({ min, max, value: audio.settings[key], oninput: (v) => { audio.settings[key] = v; val.show(v); } }) as HTMLInputElement;
    const val = numberField({ min, max, get: () => audio.settings[key], set: (v) => { audio.settings[key] = v; sl.value = String(v); } });
    val.classList.add('val');
    return h('div', { class: 'row' }, h('span', { class: 'lbl' }, label), sl, val);
  };

  const meter = h('canvas', { class: 'meter', width: 480, height: 150 });
  const mctx = meter.getContext('2d')!;

  root.append(
    h('h2', {}, 'Audio'),
    h('div', { class: 'btn-row' },
      h('button', { onclick: () => fileInput.click(), title: 'Or drag a file onto the canvas' }, 'Open file…'),
      h('button', { onclick: run(async () => { await audio.useDisplayCapture(); activeInput = null; }), title: 'Capture a browser tab or system audio' }, 'Tab audio'),
    ),
    h('div', { class: 'btn-row' }, deviceSelect),
    fileInput,
    sourceLabel,
    playerSlot,
    meter,
    settingRow('Gain', 'gain', 0.1, 8),
    settingRow('Release', 'release', 0.02, 0.6),
    settingRow('Beat sens.', 'beatSensitivity', 0.5, 3.5),
    settingRow('Beat decay', 'beatDecay', 0.03, 0.6),
  );

  listDevices().catch(() => {});
  navigator.mediaDevices?.addEventListener?.('devicechange', () => listDevices().catch(() => {}));

  // Drag & drop onto the stage: 3D models, images/videos and fonts go to the library, anything else is treated as audio.
  const stage = document.getElementById('stage')!;
  stage.addEventListener('dragover', (e) => { e.preventDefault(); stage.classList.add('dragging'); });
  stage.addEventListener('dragleave', () => stage.classList.remove('dragging'));
  stage.addEventListener('drop', (e) => {
    e.preventDefault();
    stage.classList.remove('dragging');
    for (const file of e.dataTransfer?.files ?? []) {
      if (isModelFile(file.name)) void app.importModel(file);
      else if (isTextureFile(file.name)) void app.importTexture(file);
      else if (isFontFile(file.name)) void app.importFont(file);
      else useFile(file);
    }
  });

  return function draw() {
    const { width: W, height: H } = meter;
    mctx.clearRect(0, 0, W, H);
    // Spectrum backdrop
    const fft = audio.fftTex;
    mctx.fillStyle = 'rgba(120, 255, 200, 0.18)';
    for (let x = 0; x < 256; x++) {
      const v = fft[x * 4] / 255;
      mctx.fillRect((x / 256) * W, H - v * H, W / 256 + 0.5, v * H);
    }
    // Feature bars
    const bw = W / METER_BANDS.length;
    METER_BANDS.forEach((b, i) => {
      const v = audio.features[b];
      mctx.fillStyle = b === 'beat' ? `rgba(255, 80, 140, ${0.4 + v * 0.6})` : 'rgba(180, 255, 80, 0.85)';
      mctx.fillRect(i * bw + 6, H - v * (H - 22), bw - 12, v * (H - 22));
      mctx.fillStyle = 'rgba(255,255,255,0.6)';
      mctx.font = '18px ui-monospace, monospace';
      mctx.fillText(b === 'lowMid' ? 'lmid' : b, i * bw + 8, 18);
    });
  };
}
