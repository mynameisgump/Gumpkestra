// Regression check for performance groups, shortcuts, and canvas transitions.
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
const server = await createServer({ server: { host: '127.0.0.1', port: 5300 }, logLevel: 'error' });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: ['--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 860 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && /GL|shader/i.test(m.text())) errors.push(m.text()); });
  await page.goto('http://127.0.0.1:5300');
  await page.waitForFunction(() => window.app?.engine.frame > 3);
  const names = await page.evaluate(() => [...window.app.library.presets.keys()].slice(0, 3));
  assert.equal(names.length, 3, 'Need three library presets for navigation');
  page.once('dialog', (d) => d.accept('Live set'));
  await page.getByRole('button', { name: '+ Group', exact: true }).click();
  const add = page.getByLabel('Add preset to group');
  for (const name of names) await add.selectOption(name);
  await page.getByTitle(`Move ${names[2]} up`, { exact: true }).click();
  assert.ok(await page.locator('#presets-panel').evaluate((panel) => panel.scrollWidth <= panel.clientWidth), 'Group controls fit the sidebar');
  const ordered = [names[0], names[2], names[1]];
  assert.deepEqual(await page.evaluate(() => window.app.presetGroups.active.presets), ordered);
  await page.evaluate((n) => window.app.loadPreset(window.app.library.presets.get(n)), ordered[0]);
  await page.locator('#canvas').click();
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.evaluate(() => window.app.presetName), ordered[1]);
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  assert.equal(await page.evaluate(() => window.app.presetName), ordered[2], 'Backward wraps');
  await page.getByLabel('Transition seconds').focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.evaluate(() => window.app.presetName), ordered[2], 'Input keeps arrow keys');
  await page.getByTitle(`Remove ${ordered[1]} from group`, { exact: true }).click();
  await page.getByLabel('Preset transition', { exact: true }).selectOption('melt');
  await page.getByLabel('Transition seconds').fill('1.2');
  await page.getByLabel('Transition seconds').press('Tab');
  await page.reload();
  await page.waitForFunction(() => window.app?.engine.frame > 3);
  assert.deepEqual(await page.evaluate(() => {
    const g = window.app.presetGroups.active;
    return [g.name, g.presets, g.transition, g.duration];
  }), ['Live set', [ordered[0], ordered[2]], 'melt', 1.2]);
  // A rejected unsaved-changes prompt leaves the preset intact.
  await page.evaluate(() => { window.app.engine.layers[0].enabled = !window.app.engine.layers[0].enabled; });
  const before = await page.evaluate(() => window.app.presetName);
  page.once('dialog', (d) => d.dismiss());
  await page.locator('#canvas').click();
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.evaluate(() => window.app.presetName), before);
  // Solid colours make the GPU result deterministic. Read the presentation target,
  // which is also blitted to the canvas used by the recorder.
  const pixels = await page.evaluate(async () => {
    const { parseISF } = await import('/src/isf/isf.ts');
    const { app } = window;
    app.engine.setResolution({ width: 64, height: 64 });
    for (const [name, rgb] of [['test-red', '1.,0.,0.'], ['test-blue', '0.,0.,1.']]) {
      const source = `/*{"ISFVSN":"2","INPUTS":[]}*/\nvoid main(){gl_FragColor=vec4(${rgb},1.);}`;
      app.library.shaders.set(name, { name, source, parsed: parseISF(source), error: null });
    }
    const preset = (shader) => ({ name: shader, layers: [{ shader }] });
    const frame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const read = () => {
      const gl = app.engine.gl;
      gl.bindFramebuffer(gl.FRAMEBUFFER, app.engine.presented.fbo);
      const data = new Uint8Array(4);
      gl.readPixels(32, 32, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, data);
      return [...data];
    };
    const results = [];
    for (const style of ['fade', 'wipe', 'slide', 'dip', 'cut', 'rust', 'tear', 'shutters', 'melt']) {
      app.loadPreset(preset('test-red'));
      await frame();
      const red = read();
      app.presetGroups.active.transition = style;
      app.presetGroups.active.duration = 2;
      app.loadPreset(preset('test-blue'), true);
      await frame();
      const initial = read();
      if (app.engine.transition) app.engine.transition.start = performance.now() / 1000 - 1;
      await frame();
      const middle = read();
      const gl = app.engine.gl;
      const full = new Uint8Array(64 * 64 * 4);
      gl.readPixels(0, 0, 64, 64, gl.RGBA, gl.UNSIGNED_BYTE, full);
      let oldPixels = 0, newPixels = 0;
      for (let i = 0; i < full.length; i += 4) {
        if (full[i] > full[i + 2] + 30) oldPixels++;
        if (full[i + 2] > full[i] + 30) newPixels++;
      }
      const top = [...full.slice((60 * 64 + 32) * 4, (60 * 64 + 32) * 4 + 4)];
      const bottom = [...full.slice((3 * 64 + 32) * 4, (3 * 64 + 32) * 4 + 4)];
      if (app.engine.transition) app.engine.transition.start = performance.now() / 1000 - 3;
      await frame();
      results.push({ style, red, initial, middle, oldPixels, newPixels, top, bottom, end: read(), error: app.engine.gl.getError() });
    }
    // Interrupting a transition captures the composite currently on screen.
    app.presetGroups.active.transition = 'fade';
    app.loadPreset(preset('test-red'), true);
    await frame();
    app.loadPreset(preset('test-blue'), true, -1);
    await frame();
    app.engine.setResolution({ width: 80, height: 60 });
    await frame();
    return results;
  });
  for (const p of pixels) {
    assert.equal(p.error, 0, `${p.style}: no WebGL errors`);
    assert.ok(p.red[0] > 240 && p.red[2] < 10, `${p.style}: starts red`);
    assert.ok(p.end[0] < 10 && p.end[2] > 240, `${p.style}: ends blue`);
    if (p.style === 'fade') assert.ok(p.middle[0] > 60 && p.middle[2] > 60, 'Crossfade mixes images');
    if (p.style === 'dip') assert.ok(p.middle[0] < 30 && p.middle[2] < 30, 'Dip passes through black');
    if (['rust', 'tear', 'shutters', 'melt'].includes(p.style)) {
      assert.ok(p.oldPixels > 100 && p.newPixels > 100, `${p.style}: reveals both presets during transition`);
    }
    if (p.style === 'melt') {
      assert.ok(p.top[2] > 240 && p.bottom[0] > 240, 'Doom Melt falls downward, revealing the top first');
    }
    if (p.style === 'cut') assert.ok(p.initial[2] > 240, 'Cut is immediate');
  }
  assert.deepEqual(errors, []);
  console.log('Passed: group editing, ordering, persistence, keyboard scope, wraparound, unsaved protection, nine GPU transitions (including industrial effects and downward Doom Melt), interruption and resize.');
} finally {
  await browser?.close();
  await server.close();
}
