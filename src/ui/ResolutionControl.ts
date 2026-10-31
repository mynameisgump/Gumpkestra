import type { Engine } from '../render/Engine';
import { h } from './dom';

const STORAGE_KEY = 'gumpkestra:resolution';
const SCALES = [1, 0.75, 0.5, 0.35];
const SIZES = [[640, 360], [1280, 720], [1920, 1080], [2560, 1440], [3840, 2160]];

/** Output settings belong to the display, so switching presets keeps them intact. */
export function ResolutionControl(engine: Engine) {
  let custom = { width: 1920, height: 1080 };
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (saved) {
      if (SCALES.includes(saved.scale)) engine.scale = saved.scale;
      engine.setResolution(saved.fixed ?? null);
      if (engine.fixedResolution) custom = { ...engine.fixedResolution };
    }
  } catch { /* Missing, invalid or unavailable storage: use automatic sizing. */ }

  const save = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ scale: engine.scale, fixed: engine.fixedResolution }));
    } catch { /* Settings still work when storage is unavailable. */ }
  };
  const width = h('input', { type: 'number', min: 1, max: engine.maxResolution.width, step: 1, required: true, value: custom.width, 'aria-label': 'Output width' });
  const height = h('input', { type: 'number', min: 1, max: engine.maxResolution.height, step: 1, required: true, value: custom.height, 'aria-label': 'Output height' });
  const error = h('div', { class: 'resolution-error', role: 'alert' });
  const mode = h('select', { 'aria-label': 'Render resolution', title: 'Scale with the window or set exact output pixels' },
    ...SCALES.map((scale) => h('option', { value: `scale:${scale}` }, `Auto · ${scale * 100}%`)),
    ...SIZES.filter(([w, h]) => w <= engine.maxResolution.width && h <= engine.maxResolution.height)
      .map(([w, hgt]) => h('option', { value: `${w}x${hgt}` }, `${w}×${hgt}`)),
    h('option', { value: 'custom' }, 'Custom…'));
  const currentMode = () => {
    const fixed = engine.fixedResolution;
    if (!fixed) return `scale:${engine.scale}`;
    const value = `${fixed.width}x${fixed.height}`;
    return [...mode.options].some((o) => o.value === value) ? value : 'custom';
  };
  mode.value = currentMode();

  const pop = h('form', { class: 'resolution-pop', hidden: true },
    h('div', {}, 'Fixed output resolution'),
    h('div', { class: 'resolution-fields' }, width, '×', height, 'px'),
    error,
    h('div', { class: 'resolution-actions' },
      h('button', { type: 'button', onclick: () => close() }, 'Cancel'),
      h('button', { type: 'submit' }, 'Apply')));
  const close = () => { pop.hidden = true; mode.value = currentMode(); };
  const open = () => {
    const size = engine.fixedResolution ?? custom;
    width.value = String(size.width);
    height.value = String(size.height);
    error.textContent = '';
    pop.hidden = false;
    width.focus();
    width.select();
  };
  mode.addEventListener('change', () => {
    if (mode.value === 'custom') { open(); return; }
    if (mode.value.startsWith('scale:')) {
      engine.scale = Number(mode.value.slice(6));
      engine.setResolution(null);
    } else {
      const [w, h] = mode.value.split('x').map(Number);
      engine.setResolution({ width: w, height: h });
    }
    close();
    save();
  });
  pop.addEventListener('submit', (e) => {
    e.preventDefault();
    try {
      engine.setResolution({ width: Number(width.value), height: Number(height.value) });
      custom = { ...engine.fixedResolution! };
      close();
      save();
    } catch (e) { error.textContent = (e as Error).message; }
  });
  pop.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); close(); mode.focus(); }
  });
  // The edit button also reopens a custom size when Custom is already selected.
  return h('div', { class: 'resolution-control' }, h('label', {}, 'res ', mode),
    h('button', { type: 'button', title: 'Edit exact output width and height', 'aria-label': 'Edit custom resolution', onclick: open }, '…'), pop);
}
