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
