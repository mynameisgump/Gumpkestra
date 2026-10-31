import type { Engine } from '../render/Engine';
import { h } from './dom';

const STORAGE_KEY = 'gumpkestra:hdr';

export function HDRControl(engine: Engine) {
  const output = engine.colorOutput;
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (saved) {
      engine.setHDR(saved.enabled === true);
      if (typeof saved.exposure === 'number' && Number.isFinite(saved.exposure)) output.exposure = Math.min(4, Math.max(-4, saved.exposure));
    }
  } catch { /* Use SDR defaults when preferences are unavailable. */ }
  const save = () => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ enabled: output.enabled, exposure: output.exposure })); }
    catch { /* Output controls still work without storage. */ }
  };
  const toggle = h('input', { type: 'checkbox', checked: output.enabled, disabled: !output.supported, 'aria-label': 'Enable HDR' });
  const amount = h('output', {}, `${output.exposure.toFixed(1)} EV`);
  const exposure = h('input', { type: 'range', min: -4, max: 4, step: 0.1, value: output.exposure, 'aria-label': 'HDR exposure' });
  const status = h('div', { class: 'hint', role: 'status' });
  const test = h('button', { type: 'button', 'aria-pressed': 'false', onclick: () => {
    output.brightnessTest = !output.brightnessTest;
    update();
  } }, 'Show brightness test');
  const explanation = h('div', { class: 'hint', hidden: true },
    'Left to right: 1×, 2× and 4× normal white. The middle and right patches should look brighter than the left. If all three look equal, the screen may be limiting HDR brightness. Exposure does not affect this test.');
  const update = () => {
    toggle.checked = output.enabled;
    status.textContent = output.status;
    exposure.disabled = !output.enabled;
    button.classList.toggle('on', output.enabled);
    button.title = output.status;
    if (!output.enabled || output.recordingSDR) output.brightnessTest = false;
    test.disabled = !output.enabled || output.recordingSDR;
    test.textContent = output.brightnessTest ? 'Hide brightness test' : 'Show brightness test';
    test.setAttribute('aria-pressed', String(output.brightnessTest));
    explanation.hidden = !output.brightnessTest;
  };
  toggle.addEventListener('change', () => { engine.setHDR(toggle.checked); update(); save(); });
  exposure.addEventListener('input', () => {
    output.exposure = Number(exposure.value);
    amount.textContent = `${output.exposure.toFixed(1)} EV`;
    save();
  });
  const pop = h('div', { class: 'hdr-pop', hidden: true },
    h('label', {}, toggle, ' HDR rendering'),
    status,
    h('label', { class: 'hdr-exposure' }, 'Exposure ', exposure, amount),
    test, explanation,
    h('div', { class: 'hint' }, 'Bright highlights are preserved between layers. Standard displays and recordings use softened highlights. Add a Glow layer for bloom.'));
  const button = h('button', { type: 'button', 'aria-label': 'HDR output settings', 'aria-expanded': 'false', onclick: () => {
    pop.hidden = !pop.hidden;
    if (pop.hidden) output.brightnessTest = false;
    button.setAttribute('aria-expanded', String(!pop.hidden));
    update();
  } }, 'HDR');
  const close = () => { pop.hidden = true; output.brightnessTest = false; button.setAttribute('aria-expanded', 'false'); };
  const el = h('div', { class: 'hdr-control' }, button, pop);
  document.addEventListener('pointerdown', (e) => { if (!el.contains(e.target as Node)) close(); });
  pop.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); button.focus(); } });
  update();
  return { el, update };
}
