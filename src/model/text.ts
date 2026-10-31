import { SoupBuilder, staticRig, type MeshData } from './mesh';

// 3D text is a built-in model named "@text:<font>/<text>", so presets and the model picker treat it
// like any other model. <font> is a built-in font key or a file in library/fonts ("Creepster.ttf"). The text is drawn to a canvas, traced with marching squares and extruded:
// caps and side walls share the same interpolated contour points, so the mesh is watertight, and the
// walls get smoothed normals so curves don't look faceted.

export const TEXT_PREFIX = '@text:';

export const TEXT_FONTS: Record<string, { label: string; css: (px: number) => string }> = {
  sans: { label: 'Heavy sans', css: (px) => `900 ${px}px "Arial Black", "Helvetica Neue", Arial, sans-serif` },
  serif: { label: 'Serif', css: (px) => `bold ${px}px Georgia, "Times New Roman", serif` },
  mono: { label: 'Mono', css: (px) => `bold ${px}px "Courier New", Courier, monospace` },
  impact: { label: 'Impact', css: (px) => `${px}px Impact, Haettenschweiler, "Arial Narrow Bold", sans-serif` },
};

export const FONT_EXTENSIONS = ['.ttf', '.otf', '.woff', '.woff2'];
export const isFontFile = (name: string) => FONT_EXTENSIONS.some((ext) => name.toLowerCase().endsWith(ext));

/** CSS family a library font is registered under (see Library.loadFont). */
export const fontFamily = (file: string) => `gump-font-${file.replace(/[^a-zA-Z0-9]/g, '-')}`;
/** Picker label for a font key. */
export const fontLabel = (font: string) => TEXT_FONTS[font]?.label ?? font.replace(/\.[^.]+$/, '');
const fontCSS = (font: string, px: number) => TEXT_FONTS[font]?.css(px) ?? `${px}px "${fontFamily(font)}"`;

export const isTextModel = (name: string) => name.startsWith(TEXT_PREFIX);
export const textModelName = (font: string, text: string) => `${TEXT_PREFIX}${font}/${text}`;
export const DEFAULT_TEXT_MODEL = textModelName('sans', 'GUMP');

export function parseTextModel(name: string) {
  const rest = name.slice(TEXT_PREFIX.length);
  const slash = rest.indexOf('/');
  const font = slash < 0 ? 'sans' : rest.slice(0, slash);
  return { font: font in TEXT_FONTS || isFontFile(font) ? font : 'sans', text: slash < 0 ? rest : rest.slice(slash + 1) };
}

/** Glyph raster height in px: enough for smooth curves once the contour is interpolated. */
const SIZE = 96;
/** Long strings are drawn smaller so the raster (and triangle count) stays bounded. */
const MAX_WIDTH = 1600;
/** Extrusion depth, as a fraction of the font size. */
const DEPTH = 0.3;
const THRESHOLD = 0.5;

/** A library font must already be in document.fonts (Library.loadMesh loads it first). */
export function buildTextMesh(name: string): MeshData {
  const { font, text } = parseTextModel(name);
  if (!text.trim()) throw new Error('type some text');
  const css = (px: number) => fontCSS(font, px);

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.font = css(SIZE);
  const px = Math.max(16, Math.min(SIZE, Math.floor((SIZE * MAX_WIDTH) / Math.max(1, ctx.measureText(text).width))));
  ctx.font = css(px);
  const pad = Math.ceil(px * 0.2);
  const W = Math.ceil(ctx.measureText(text).width) + pad * 2;
  const H = Math.ceil(px * 1.3) + pad * 2;
  canvas.width = W;
  canvas.height = H;
  // Resizing resets the context state.
  ctx.font = css(px);
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff';
  ctx.fillText(text, pad, H / 2);
  const rgba = ctx.getImageData(0, 0, W, H).data;
  const a = new Float32Array(W * H);
  for (let i = 0; i < a.length; i++) a[i] = rgba[i * 4 + 3] / 255;
  const at = (x: number, y: number) => a[y * W + x];
  const inside = (x: number, y: number) => at(x, y) > THRESHOLD;

  // Image px → model units (y up, centred, 1 unit = font size).
  const X = (x: number) => (x - W / 2) / px;
  const Y = (y: number) => (H / 2 - y) / px;
  const zf = DEPTH / 2, zb = -DEPTH / 2;

  // Contour points sit on grid edges. Each edge has one id and is always interpolated in the same
  // direction, so neighbouring cells (and the walls) get bit-identical points.
  const edgePts = new Map<number, [number, number]>();
  const hEdge = (x: number, y: number) => edgePoint(y * W + x, x, y, x + 1, y);
  const vEdge = (x: number, y: number) => edgePoint(W * H + y * W + x, x, y, x, y + 1);
  function edgePoint(id: number, x0: number, y0: number, x1: number, y1: number) {
    let p = edgePts.get(id);
    if (!p) {
      const v0 = at(x0, y0), v1 = at(x1, y1);
      const t = (THRESHOLD - v0) / (v1 - v0);
      p = [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t];
      edgePts.set(id, p);
    }
    return { id, p };
  }

  const cap: number[] = [], capN: number[] = [], capUV: number[] = [];
  const tri = (p: [number, number], q: [number, number], r: [number, number]) => {
    for (const [z, nz] of [[zf, 1], [zb, -1]]) {
      for (const [x, y] of [p, q, r]) {
        cap.push(X(x), Y(y), z);
        capN.push(0, 0, nz);
        capUV.push((x - pad) / px, (H - y) / px);
      }
    }
  };

  const wallSegs: [number, number][] = [];
  for (let y = 0; y < H - 1; y++) {
    let run = -1;
    for (let x = 0; x < W; x++) {
      const full = x < W - 1 && inside(x, y) && inside(x + 1, y) && inside(x, y + 1) && inside(x + 1, y + 1);
      // Fully inside cells merge into one quad per horizontal run.
      if (full) { if (run < 0) run = x; continue; }
      if (run >= 0) {
        tri([run, y], [x, y], [x, y + 1]);
        tri([run, y], [x, y + 1], [run, y + 1]);
        run = -1;
      }
      if (x === W - 1) continue;
      // Partial cell: walk its corners and crossed edges in order to get a convex polygon.
      const corners: [number, number][] = [[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1]];
      const ins = corners.map(([cx, cy]) => inside(cx, cy));
      if (!ins.some(Boolean)) continue;
      const edges = [hEdge(x, y), vEdge(x + 1, y), hEdge(x, y + 1), vEdge(x, y)];
      const poly: { p: [number, number]; edge?: number }[] = [];
      for (let i = 0; i < 4; i++) {
        if (ins[i]) poly.push({ p: corners[i] });
        if (ins[i] !== ins[(i + 1) % 4]) poly.push({ p: edges[i].p, edge: edges[i].id });
      }
      for (let i = 1; i + 1 < poly.length; i++) tri(poly[0].p, poly[i].p, poly[i + 1].p);
      // Polygon sides between two crossings are the outline: those become walls.
      for (let i = 0; i < poly.length; i++) {
        const s = poly[i], e = poly[(i + 1) % poly.length];
        if (s.edge !== undefined && e.edge !== undefined) wallSegs.push([s.edge, e.edge]);
      }
    }
  }

  // Walls: contour point v has front vertex 2v and back vertex 2v+1; normals are averaged over
  // the segments that meet there.
  const wallPos: number[] = [], wallN: number[] = [], wallUV: number[] = [], wallIdx: number[] = [];
  const vertexOf = new Map<number, number>();
  const vert = (edge: number) => {
    let v = vertexOf.get(edge);
    if (v === undefined) {
      const [x, y] = edgePts.get(edge)!;
      v = wallPos.length / 6;
      wallPos.push(X(x), Y(y), zf, X(x), Y(y), zb);
      wallN.push(0, 0, 0, 0, 0, 0);
      wallUV.push((x + y) / px, 0, (x + y) / px, DEPTH);
      vertexOf.set(edge, v);
    }
    return v;
  };
  for (const [s, e] of wallSegs) {
    const [x0, y0] = edgePts.get(s)!, [x1, y1] = edgePts.get(e)!;
    let nx = y1 - y0, ny = -(x1 - x0);
    const len = Math.hypot(nx, ny) || 1;
    nx /= len; ny /= len;
    // Point the normal away from the glyph.
    const sx = Math.round((x0 + x1) / 2 + nx * 0.75), sy = Math.round((y0 + y1) / 2 + ny * 0.75);
    if (sx >= 0 && sy >= 0 && sx < W && sy < H && inside(sx, sy)) { nx = -nx; ny = -ny; }
    const a0 = vert(s), a1 = vert(e);
    for (const v of [a0, a1]) for (const k of [v * 6, v * 6 + 3]) { wallN[k] += nx; wallN[k + 1] -= ny; }
    const f0 = a0 * 2, b0 = a0 * 2 + 1, f1 = a1 * 2, b1 = a1 * 2 + 1;
    wallIdx.push(f0, f1, b1, f0, b1, b0);
  }
  for (let k = 0; k < wallN.length; k += 3) {
    const l = Math.hypot(wallN[k], wallN[k + 1]) || 1;
    wallN[k] /= l; wallN[k + 1] /= l;
  }

  const b = new SoupBuilder();
  b.add({ positions: cap, normals: capN, uvs: capUV });
  b.add({ positions: wallPos, normals: wallN, uvs: wallUV, indices: wallIdx });
  return b.build(name, staticRig());
}
