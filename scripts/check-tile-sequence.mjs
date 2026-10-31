// Exercise texture sequencing through the UI, preset serialization, and real GPU pixels.
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
const server = await createServer({ server: { host: '127.0.0.1', port: 5301 }, logLevel: 'error' });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 860 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && /GL|shader/i.test(m.text())) errors.push(m.text()); });
  await page.goto('http://127.0.0.1:5301');
  await page.waitForFunction(() => window.app?.engine.frame > 3);
  await page.evaluate(async () => {
    const app = window.app;
    const blobs = new Map();
    for (const [name, color] of [['red.png', '#ff0000'], ['green.png', '#00ff00'], ['blue.png', '#0000ff']]) {
      const c = Object.assign(document.createElement('canvas'), { width: 16, height: 16 });
      const ctx = c.getContext('2d'); ctx.fillStyle = color; ctx.fillRect(0, 0, 16, 16);
      blobs.set(name, await new Promise((r) => c.toBlob(r)));
    }
    const fetch = app.engine.textures.fetchBlob;
    app.engine.textures.fetchBlob = (name) => blobs.has(name) ? Promise.resolve(blobs.get(name)) : fetch(name);
    app.library.textures.push(...blobs.keys());
    const p = (value) => ({ value, mods: [] });
    app.loadPreset({ name: 'sequence-test', layers: [{ shader: 'image', params: { tex: p('red.png'), fit: p(3), zoom: p(0.25), pulse: p(0) } }] });
    app.engine.setResolution({ width: 96, height: 96 });
    app.select(app.engine.layers[0]);
  });
  const add = page.getByLabel('Add to sequence');
  await add.selectOption('green.png');
  await add.selectOption('blue.png');
  assert.equal(await page.locator('.tile-sequence-row').count(), 3);
  await page.getByTitle('Move tile 3 up', { exact: true }).click();
  assert.deepEqual(await page.evaluate(() => window.app.selected.params.tex.tiles), ['blue.png', 'green.png']);
  await page.getByTitle('Move tile 2 down', { exact: true }).click();
  await page.waitForFunction(() => ['red.png', 'green.png', 'blue.png'].every((n) => window.app.engine.textures.info(n)));
  const result = await page.evaluate(async () => {
    const app = window.app;
    const layer = app.selected;
    const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const read = () => {
      const gl = app.engine.gl;
      gl.bindFramebuffer(gl.FRAMEBUFFER, app.engine.presented.fbo);
      return [6, 30, 54, 78].map((x) => {
        const data = new Uint8Array(4); gl.readPixels(x, 6, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, data); return [...data];
      });
    };
    await frame(); const tiled = read();
    layer.params.offset.value = [-3, 0]; await frame(); const wrapped = read();
    const saved = layer.toJSON();
    app.loadPreset({ name: 'restored-sequence', layers: [saved] });
    await frame(); const restored = read();
    app.engine.layers[0].params.fit.value = 1;
    await frame(); const cover = read();
    app.engine.layers[0].params.fit.value = 3;
    app.engine.layers[0].params.tex.tiles = [];
    await frame(); const single = read();
    return { tiled, wrapped, restored, cover, single, error: app.engine.gl.getError() };
  });
  const red = [255, 0, 0, 255], green = [0, 255, 0, 255], blue = [0, 0, 255, 255];
  assert.deepEqual(result.tiled, [blue, red, green, blue], 'Ordered tiles wrap at negative coordinates');
  assert.deepEqual(result.wrapped, result.tiled, 'An entire sequence scrolls seamlessly');
  assert.deepEqual(result.restored, result.tiled, 'Preset restores tile sequence');
  assert.deepEqual(result.cover, [red, red, red, red], 'Cover keeps the primary texture');
  assert.deepEqual(result.single, result.cover, 'Removing extra tiles restores single-texture behavior');
  await page.evaluate(() => {
    window.app.select(window.app.engine.layers[0]);
    window.app.selected.params.tex.tiles = ['green.png', 'blue.png'];
    window.app.changed();
  });
  await page.getByTitle('Remove tile 2', { exact: true }).click();
  assert.deepEqual(await page.evaluate(() => window.app.selected.params.tex.tiles), ['blue.png']);
  assert.equal(await page.evaluate(() => window.app.textureUses('blue.png').length), 1, 'Library tracks additional tiles');
  assert.equal(result.error, 0);
  assert.deepEqual(errors, []);
  console.log('Passed: add/reorder tile UI, GPU sequence order, negative coordinates, scroll wrap, preset restoration, cover and single-texture compatibility.');
} finally { await browser?.close(); await server.close(); }
