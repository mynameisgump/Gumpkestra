import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';

const server = await createServer({ server: { host: '127.0.0.1', port: 5309 }, logLevel: 'error' });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 860 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://127.0.0.1:5309');
  await page.waitForFunction(() => window.app?.engine.frame > 3);
  const timing = await page.evaluate(async () => {
    const { PresetTimer } = await import('/src/presetTimer.ts');
    const names = ['A', 'B', 'C'], loads = [], events = [];
    let transition = 0;
    const fake = {
      dirty: false, presetName: 'A',
      presetGroups: { active: { holdSeconds: 3 }, names: () => names, onChange: (fn) => events.push(fn) },
      library: { presets: new Map(names.map((name) => [name, { name }])), onChange() {} },
      engine: { transitionRemaining: () => transition },
      loadPreset(preset, animate, direction) { this.presetName = preset.name; loads.push([preset.name, animate, direction]); transition = 1.5; timer.reset(); },
    };
    const timer = new PresetTimer(fake);
    timer.start(0); timer.tick(2.99); const before = loads.length;
    timer.tick(3); const after = { name: fake.presetName, remaining: timer.remaining };
    timer.tick(7.49); const waiting = loads.length;
    timer.tick(7.5); timer.tick(12); const wrapped = fake.presetName;
    fake.presetName = 'B'; transition = 2; timer.reset(); timer.tick(20); timer.tick(24.9);
    const manualWait = loads.length;
    timer.tick(25); const manual = fake.presetName;
    fake.dirty = true; timer.tick(25.3); const edits = { running: timer.running, message: timer.message };
    timer.start(30); const blocked = !timer.running;
    fake.dirty = false; transition = 0; timer.start(100); const count = loads.length;
    timer.tick(10000); const catchup = loads.length - count;
    timer.stop(); timer.tick(20000); const stopped = loads.length;
    names.splice(1); timer.start(20000); const single = !timer.running;
    names.push('B'); fake.presetGroups.active.holdSeconds = 7; events.forEach((fn) => fn());
    timer.start(30000); const groupHold = timer.remaining;
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    timer.tick(40000);
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    transition = 0; timer.tick(50000); const resumedHold = timer.remaining;
    delete document.hidden; timer.stop();
    return { before, after, waiting, wrapped, manualWait, manual, edits, blocked, catchup, stopped, count, single, groupHold, resumedHold, loads };
  });
  assert.equal(timing.before, 0);
  assert.deepEqual(timing.after, { name: 'B', remaining: 4.5 });
  assert.equal(timing.waiting, 1);
  assert.equal(timing.wrapped, 'A');
  assert.equal(timing.manualWait, 3);
  assert.equal(timing.manual, 'C');
  assert.equal(timing.edits.running, false);
  assert.match(timing.edits.message, /unsaved/);
  assert.ok(timing.blocked && timing.single);
  assert.equal(timing.catchup, 1);
  assert.equal(timing.stopped, timing.count + 1);
  assert.equal(timing.groupHold, 8.5);
  assert.equal(timing.resumedHold, 7);
  assert.ok(timing.loads.every(([, animate, direction]) => animate && direction === 1));
  await page.evaluate(async () => {
    const app = window.app;
    const { parseISF } = await import('/src/isf/isf.ts');
    app.engine.setResolution({ width: 64, height: 64 });
    for (const [name, rgb] of [['timer-red', '1.,0.,0.'], ['timer-blue', '0.,0.,1.']]) {
      const source = `/*{"INPUTS":[]}*/\nvoid main(){gl_FragColor=vec4(${rgb},1.);}`;
      app.library.shaders.set(name, { name, source, parsed: parseISF(source) });
      app.library.presets.set(name, { name, layers: [{ shader: name }] });
    }
    app.presetGroups.create('Timer test');
    Object.assign(app.presetGroups.active, { presets: ['timer-red', 'timer-blue'], duration: 0.5 });
    app.presetGroups.changed();
    app.loadPreset(app.library.presets.get('timer-red'));
  });
  assert.equal(await page.getByLabel('Auto transition hold seconds').inputValue(), '30');
  await page.getByLabel('Auto transition hold seconds').fill('1');
  await page.getByLabel('Auto transition hold seconds').press('Tab');
  await page.getByRole('button', { name: 'Start auto', exact: true }).click();
  await page.waitForFunction(() => window.app.presetName === 'timer-blue', null, { timeout: 8000 });
  assert.equal(await page.evaluate(() => window.app.engine.transition?.style), 'fade');
  await page.getByRole('button', { name: 'Stop auto', exact: true }).click();
  assert.equal(await page.evaluate(() => window.app.presetTimer.running), false);
  await page.getByRole('button', { name: 'Start auto', exact: true }).click();
  await page.evaluate(() => { window.app.selected.opacity.value = 0.5; });
  await page.waitForFunction(() => !window.app.presetTimer.running);
  await page.getByLabel('Auto transition status').filter({ hasText: /unsaved/ }).waitFor();
  assert.match(await page.getByLabel('Auto transition status').innerText(), /unsaved/);
  assert.ok(await page.locator('#presets-panel').evaluate((p) => p.scrollWidth <= p.clientWidth));
  await page.getByLabel('Auto transition hold seconds').fill('7');
  await page.getByLabel('Auto transition hold seconds').press('Tab');
  await page.reload();
  await page.waitForFunction(() => window.app?.engine.frame > 3);
  assert.equal(await page.getByLabel('Auto transition hold seconds').inputValue(), '7');
  assert.equal(await page.evaluate(() => window.app.presetTimer.running), false);
  // Old groups have no hold field; invalid values must recover without losing groups.
  const migration = await page.evaluate(async () => {
    const { PresetGroups } = await import('/src/presetGroups.ts');
    const group = window.app.presetGroups.active;
    const key = 'gumpkestra:preset-groups', saved = localStorage.getItem(key);
    const result = [];
    for (const holdSeconds of [undefined, -1, '5', 4000, 12]) {
      localStorage.setItem(key, JSON.stringify({ groups: [{ ...group, holdSeconds }], activeId: group.id }));
      result.push(new PresetGroups().active.holdSeconds);
    }
    localStorage.setItem(key, saved);
    return result;
  });
  assert.deepEqual(migration, [30, 30, 30, 30, 12]);
  assert.deepEqual(errors, []);
  console.log('Passed: automatic navigation, wraparound, transition spacing, manual reset, edit protection, no catch-up skips, hidden-tab reset, group timing, UI, persistence and migration.');
} finally { await browser?.close(); await server.close(); }
