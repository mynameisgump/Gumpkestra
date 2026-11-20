// Verify parameter groupings, collapse/expand persistence, filtering, modulator badges, and tooltips.
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';

const shotDir = process.env.SHOT_DIR;
const server = await createServer({ server: { host: '127.0.0.1', port: 5306 }, logLevel: 'error' });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: ['--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://127.0.0.1:5306');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForFunction(() => window.app?.engine.frame > 3);

  // Unit-check pure grouping + label formatting helpers.
  const helperCheck = await page.evaluate(async () => {
    const { groupInputs, inputLabel } = await import('/src/ui/paramGroups.ts');
    const unannotatedLarge = groupInputs([
      { NAME: 'inputImage', TYPE: 'image' },
      { NAME: 'audioFFT', TYPE: 'audioFFT' },
      { NAME: 'texMap', TYPE: 'image' },
      { NAME: 'hueDrift', TYPE: 'float' },
      { NAME: 'block_size', TYPE: 'float' },
      { NAME: 'colorA', TYPE: 'color' },
      { NAME: 'pulseHit', TYPE: 'event' },
    ]);
    const unannotatedSmall = groupInputs([
      { NAME: 'amount', TYPE: 'float' },
      { NAME: 'tint', TYPE: 'color' },
    ]);
    return {
      largeTitles: unannotatedLarge.map((g) => g.title),
      smallTitles: unannotatedSmall.map((g) => g.title),
      labels: [
        inputLabel({ NAME: 'hueDrift', TYPE: 'float' }),
        inputLabel({ NAME: 'block_size', TYPE: 'float' }),
        inputLabel({ NAME: 'colorA', TYPE: 'color' }),
        inputLabel({ NAME: 'explicit', TYPE: 'float', LABEL: 'Custom Label' }),
      ],
    };
  });
  assert.deepEqual(helperCheck.largeTitles, ['Texture', 'Triggers', 'Parameters', 'Color']);
  assert.deepEqual(helperCheck.smallTitles, ['Parameters']);
  assert.deepEqual(helperCheck.labels, ['Hue drift', 'Block size', 'Color A', 'Custom Label']);

  // 1. Inspect a 3D model layer (relic preset has @model and veins).
  await page.evaluate(() => {
    const app = window.app;
    app.loadPreset(app.library.presets.get('relic'));
    const model = app.engine.layers.find((l) => l.shaderName === '@model');
    app.select(model);
  });
  await page.waitForSelector('.param-group[data-group="PSX / Retro"]');

  const modelGroups = await page.locator('#params-panel .param-group').evaluateAll((els) => els.map((e) => e.getAttribute('data-group')));
  assert.deepEqual(modelGroups, [
    'Model',
    'Compositing',
    'Animation',
    'Transform',
    'Motion',
    'Camera',
    'Deform',
    'Copies',
    'Texture',
    'Shading & Lighting',
    'PSX / Retro',
  ]);

  // Verify no horizontal overflow in the right panel.
  const overflow = await page.locator('#params-panel').evaluate((el) => el.scrollWidth > el.clientWidth);
  assert.equal(overflow, false, 'Params panel should not overflow horizontally');

  // Verify active modulator badge on Deform group (relic preset modulates writhe and inflate).
  const deformMods = await page.locator('.param-group[data-group="Deform"] .param-group-mods').textContent();
  assert.equal(deformMods, '∿ 2', 'Deform group should report 2 active modulators');

  // Adding a modulator updates the group badge live.
  await page.locator('.param-group[data-group="Camera"] .mod-add').first().click();
  const cameraModsAfterAdd = await page.locator('.param-group[data-group="Camera"] .param-group-mods').textContent();
  assert.equal(cameraModsAfterAdd, '∿ 1', 'Camera group badge should update live on add');

  // Collapsing a single group hides its body and persists.
  const deformHead = page.locator('.param-group[data-group="Deform"] .param-group-head');
  await deformHead.click();
  assert.equal(await deformHead.getAttribute('aria-expanded'), 'false');
  assert.equal(await page.locator('.param-group[data-group="Deform"] .param-group-body').count(), 0);

  // Filtering by uniform name or description finds properties inside collapsed groups without losing focus.
  const search = page.locator('.params-tools input[type="search"]');
  await search.click();
  await search.type('psx');
  const focused = await search.evaluate((el) => document.activeElement === el);
  assert.equal(focused, true, 'Filter input should retain focus while typing');
  const filteredGroups = await page.locator('#params-panel .param-group').evaluateAll((els) => els.map((e) => e.getAttribute('data-group')));
  assert.deepEqual(filteredGroups, ['PSX / Retro']);

  // Searching for a property inside the collapsed Deform group auto-expands it.
  await search.fill('writhe');
  assert.equal(await page.locator('.param-group[data-group="Deform"] .param-group-body').count(), 1);

  // Clearing filter restores collapsed state on Deform.
  await search.fill('');
  assert.equal(await page.locator('.param-group[data-group="Deform"] .param-group-body').count(), 0);

  if (shotDir) {
    // Re-expand Deform for a clean full-model screenshot
    await deformHead.click();
    await page.screenshot({ path: `${shotDir}/params-model.png` });
  }

  // Collapse all / Expand all button works.
  await page.getByRole('button', { name: 'Collapse all', exact: true }).click();
  assert.equal(await page.locator('#params-panel .param-group-body').count(), 0);
  await page.getByRole('button', { name: 'Expand all', exact: true }).click();
  assert.equal(await page.locator('#params-panel .param-group-body').count(), modelGroups.length);

  // 2. Inspect a multi-group shader (audio-orb) and verify tooltips.
  await page.evaluate(() => {
    const app = window.app;
    const layer = app.addShader('audio-orb');
    app.select(layer);
  });
  const orbGroups = await page.locator('#params-panel .param-group').evaluateAll((els) => els.map((e) => e.getAttribute('data-group')));
  assert.deepEqual(orbGroups, ['Compositing', 'Shape', 'Lumps', 'Spectrum Ripple', 'Surface & Color', 'Texture']);
  const radiusTitle = await page.locator('.param-group[data-group="Shape"] .lbl').first().getAttribute('title');
  assert.ok(radiusTitle?.includes('Base sphere radius') && radiusTitle?.includes('Uniform: radius'), `Expected description + uniform tooltip, got: ${radiusTitle}`);

  if (shotDir) {
    await page.screenshot({ path: `${shotDir}/params-audio-orb.png` });
  }

  // 3. Tiny shader (glow) hides filter bar and shows crisp groups.
  await page.evaluate(() => {
    const app = window.app;
    const layer = app.addShader('glow');
    app.select(layer);
  });
  const glowGroups = await page.locator('#params-panel .param-group').evaluateAll((els) => els.map((e) => e.getAttribute('data-group')));
  assert.deepEqual(glowGroups, ['Compositing', 'Bloom']);
  assert.equal(await page.locator('.params-tools').isVisible(), false, 'Tiny shaders hide filter bar');

  assert.deepEqual(errors, []);
  console.log('Param groups: explicit groups, fallback grouping, collapse/expand, live mod badges, filtering, tooltips and layout passed.');
} finally {
  await browser?.close();
  await server.close();
}
