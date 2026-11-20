import type { ISFInput } from '../isf/isf';

export interface InputGroup {
  id: string;
  title: string;
  inputs: ISFInput[];
}

/** Inputs that render a control row in the parameters panel. */
export function isVisibleInput(inp: ISFInput): boolean {
  if (inp.TYPE === 'audio' || inp.TYPE === 'audioFFT') return false;
  if (inp.TYPE === 'image' && inp.NAME === 'inputImage') return false;
  return true;
}

/** Human-readable label for an input: explicit LABEL, or formatted camelCase/snake_case NAME. */
export function inputLabel(inp: ISFInput): string {
  if (inp.LABEL) return inp.LABEL;
  const words = inp.NAME
    .replace(/_/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return inp.NAME;
  return words
    .map((w, i) => (/^[A-Z]+$/.test(w) ? w : i === 0 ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w.toLowerCase()))
    .join(' ');
}

/** Tooltip text combining optional description with the underlying GLSL uniform name. */
export function inputTooltip(inp: ISFInput): string {
  return inp.DESCRIPTION ? `${inp.DESCRIPTION}\nUniform: ${inp.NAME}` : `Uniform: ${inp.NAME}`;
}

export function groupSlug(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'group';
}

/**
 * Partition visible ISF inputs into named groups.
 * - If any input sets `GROUP`, inputs are grouped by `GROUP` (or "General" if omitted) in first-seen order.
 * - Otherwise (third-party / unannotated ISF shaders), shaders with 5+ inputs are automatically grouped
 *   by role (Texture, Triggers, Parameters, Color) when multiple roles are present.
 */
export function groupInputs(inputs: ISFInput[]): InputGroup[] {
  const visible = inputs.filter(isVisibleInput);
  if (!visible.length) return [];

  if (visible.some((inp) => !!inp.GROUP?.trim())) {
    const byTitle = new Map<string, ISFInput[]>();
    for (const inp of visible) {
      const title = inp.GROUP?.trim() || 'General';
      let bucket = byTitle.get(title);
      if (!bucket) {
        bucket = [];
        byTitle.set(title, bucket);
      }
      bucket.push(inp);
    }
    return [...byTitle.entries()].map(([title, list]) => ({ id: groupSlug(title), title, inputs: list }));
  }

  if (visible.length <= 4) {
    return [{ id: 'parameters', title: 'Parameters', inputs: visible }];
  }

  const buckets = new Map<string, ISFInput[]>([
    ['Texture', []],
    ['Triggers', []],
    ['Parameters', []],
    ['Color', []],
  ]);
  for (const inp of visible) {
    if (inp.TYPE === 'image') buckets.get('Texture')!.push(inp);
    else if (inp.TYPE === 'event') buckets.get('Triggers')!.push(inp);
    else if (inp.TYPE === 'color') buckets.get('Color')!.push(inp);
    else buckets.get('Parameters')!.push(inp);
  }
  const nonEmpty = [...buckets.entries()].filter(([, list]) => list.length > 0);
  if (nonEmpty.length === 1) {
    return [{ id: 'parameters', title: 'Parameters', inputs: nonEmpty[0][1] }];
  }
  return nonEmpty.map(([title, list]) => ({ id: groupSlug(title), title, inputs: list }));
}

export function matchesFilter(query: string, ...fields: (string | undefined)[]): boolean {
  if (!query) return true;
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return fields.some((f) => !!f && f.toLowerCase().includes(q));
}
