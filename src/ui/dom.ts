export type Child = Node | string | number | null | undefined | false;
type Props = Record<string, unknown> & { class?: string; style?: string };

/** Minimal hyperscript: h('div', { class: 'x', onclick: fn }, child, ...). */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props = {}, ...children: Child[]) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined) continue;
    if (k === 'class') el.className = v as string;
    else if (k === 'style') el.setAttribute('style', v as string);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
    else if (k.startsWith('data-') || k.startsWith('aria-')) el.setAttribute(k, String(v));
    else (el as unknown as Record<string, unknown>)[k] = v;
  }
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : String(c));
  }
  return el;
}

export function slider(opts: { min: number; max: number; value: number; step?: number; oninput: (v: number) => void }) {
  return h('input', {
    type: 'range',
    min: opts.min,
    max: opts.max,
    step: opts.step ?? (opts.max - opts.min) / 1000,
    value: opts.value,
    oninput: (e: Event) => opts.oninput(Number((e.target as HTMLInputElement).value)),
  });
}

export function select<T extends string>(options: Record<T, string> | T[], value: T, onchange: (v: T) => void) {
  const entries: [string, string][] = Array.isArray(options) ? options.map((o) => [o, o]) : Object.entries(options);
  return h(
    'select',
    { onchange: (e: Event) => onchange((e.target as HTMLSelectElement).value as T) },
    ...entries.map(([v, label]) => h('option', { value: v, selected: v === value }, label)),
  );
}

export const fmt = (v: number) => (Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2));

// Remembered open/closed state for collapsible panels and sections. Per browser and best-effort:
// if storage is unavailable everything just starts expanded.
const COLLAPSED_KEY = 'gumpkestra:collapsed';
let collapsed: Set<string> | null = null;

export function isCollapsed(id: string) {
  if (!collapsed) {
    try {
      collapsed = new Set(JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? '[]') as string[]);
    } catch {
      collapsed = new Set();
    }
  }
  return collapsed.has(id);
}

export function setCollapsed(id: string, value: boolean) {
  isCollapsed(id);
  if (value) collapsed!.add(id);
  else collapsed!.delete(id);
  try {
    localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...collapsed!]));
  } catch {
    /* storage unavailable: state lasts until reload */
  }
}

/** Make a panel fold away when its heading is clicked. */
export function collapsiblePanel(panel: HTMLElement, id: string) {
  const heading = panel.querySelector('h2');
  if (!heading) return;
  heading.classList.add('collapsible');
  heading.title = 'Click to collapse / expand';
  panel.classList.toggle('collapsed', isCollapsed(id));
  heading.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('button, input, select')) return;
    const value = !panel.classList.contains('collapsed');
    panel.classList.toggle('collapsed', value);
    setCollapsed(id, value);
  });
}

export type NumberField = HTMLInputElement & { show(v: number): void };

/**
 * A value readout you can click and type an exact number into: Enter or clicking away applies it
 * (clamped to min..max), Esc cancels. `get` is the value to edit; `show` updates the readout (e.g.
 * with a live, modulated value) whenever it isn't being edited.
 */
export function numberField(opts: { min: number; max: number; get: () => number; set: (v: number) => void }): NumberField {
  const el = h('input', { type: 'text', inputMode: 'decimal', spellcheck: false, class: 'num-field', title: 'Click to type a value' }) as NumberField;
  let cancelled = false;
  el.show = (v) => { if (document.activeElement !== el) el.value = fmt(v); };
  el.show(opts.get());
  el.addEventListener('focus', () => {
    cancelled = false;
    el.value = String(Number(opts.get().toFixed(4)));
    el.select();
  });
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') el.blur();
    else if (e.key === 'Escape') { cancelled = true; el.blur(); }
  });
  el.addEventListener('blur', () => {
    const v = Number.parseFloat(el.value);
    if (!cancelled && Number.isFinite(v)) opts.set(Math.min(opts.max, Math.max(opts.min, v)));
    el.value = fmt(opts.get());
  });
  return el;
}

const CAMERA_SVG = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>';

/** Live muted video preview when the camera is running, or a crisp camera icon otherwise. */
export function cameraPreview(
  camera: { stream: MediaStream | null; status: string; settings: { mirror: boolean } },
  cls: string,
): HTMLElement {
  if (camera.stream) {
    const video = h('video', {
      class: `${cls} camera-preview${camera.settings.mirror ? ' mirrored' : ''}`,
      muted: true,
      autoplay: true,
      playsInline: true,
    }) as HTMLVideoElement;
    video.srcObject = camera.stream;
    void video.play().catch(() => {});
    return video;
  }
  const icon = h('span', { class: `${cls} camera-icon${camera.status === 'error' ? ' is-error' : ''}` });
  icon.innerHTML = CAMERA_SVG;
  return icon;
}
