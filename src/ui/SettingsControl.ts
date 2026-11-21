import type { Engine } from '../render/Engine';
import { h } from './dom';

const STORAGE_KEY = 'gumpkestra:settings';

/** Optional app-level settings persisted in this browser across reloads and preset changes. */
export function SettingsControl(engine: Engine) {
  const { mitch } = engine.colorOutput;
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (saved) mitch.enabled = saved.mitchFlash === true;
  } catch { /* Use defaults when preferences are unavailable. */ }

  const save = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ mitchFlash: mitch.enabled }));
    } catch { /* Settings still work without storage. */ }
  };

  const mitchToggle = h('input', { type: 'checkbox', checked: mitch.enabled });
  const update = () => {
    mitchToggle.checked = mitch.enabled;
  };
  mitchToggle.addEventListener('change', () => {
    mitch.enabled = mitchToggle.checked;
    update();
    save();
  });

  const pop = h('div', { class: 'settings-pop', hidden: true },
    h('label', {}, mitchToggle, ' Show "mitch was here" popup'),
    h('div', { class: 'hint' }, 'Flashes three times in distressed red lettering every five minutes. Off by default.'));

  const button = h('button', {
    type: 'button',
    title: 'Settings',
    'aria-label': 'Settings',
    'aria-expanded': 'false',
    onclick: () => {
      pop.hidden = !pop.hidden;
      button.setAttribute('aria-expanded', String(!pop.hidden));
      if (!pop.hidden) update();
    },
  }, 'Settings');

  const close = () => {
    pop.hidden = true;
    button.setAttribute('aria-expanded', 'false');
  };

  const el = h('div', { class: 'settings-control' }, button, pop);
  document.addEventListener('pointerdown', (e) => { if (!el.contains(e.target as Node)) close(); });
  pop.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); button.focus(); } });
  update();
  return { el, update };
}
