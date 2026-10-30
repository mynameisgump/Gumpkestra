// Compiles every shader in library/shaders in a real browser and reports errors.
//   npm run check-shaders               → compile check only
//   npm run check-shaders -- --shots    → also screenshot each preset into ./shots
// Uses the locally installed Google Chrome (override with CHROME_PATH).
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import fs from 'node:fs/promises';

const shots = process.argv.includes('--shots');
const executablePath = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const server = await createServer({ server: { port: 5299 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({
  executablePath,
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required', '--enable-unsafe-swiftshader'],
});

let failed = false;
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 860 } });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && pageErrors.push(m.text()));
  await page.goto('http://localhost:5299/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForFunction(() => window.app?.engine?.frame > 5, null, { timeout: 15000 });

  const results = await page.evaluate(() => {
    const { app } = window;
    const out = [];
    for (const [name, entry] of app.library.shaders) {
      if (!entry.parsed) { out.push({ name, error: entry.error }); continue; }
      const before = app.engine.layers.length;
      const layer = app.addShader(name, undefined, before);
      out.push({ name, error: layer ? null : app.errors.get(name) ?? 'failed' });
      if (layer) app.engine.removeLayer(layer);
    }
    return out;
  });
  for (const r of results) {
    console.log(`${r.error ? '✗' : '✓'} ${r.name}${r.error ? `\n    ${r.error.replace(/\n/g, '\n    ')}` : ''}`);
    if (r.error) failed = true;
  }

  if (shots) {
    await fs.mkdir('shots', { recursive: true });
    // Fake mic (a beeping tone) so the audio path is exercised.
    await page.evaluate(() => window.app.audio.useInput());
    const presets = await page.evaluate(() => [...window.app.library.presets.keys()]);
    for (const name of presets) {
      await page.evaluate((n) => window.app.loadPreset(window.app.library.presets.get(n)), name);
      await page.waitForTimeout(1500);
      const errs = await page.evaluate(() => [...window.app.errors.entries()]);
      if (errs.length) { failed = true; console.log(`✗ preset ${name}:`, errs); }
      await page.screenshot({ path: `shots/${name}.png` });
      console.log(`📷 shots/${name}.png`);
    }
    const stats = await page.evaluate(() => ({ features: window.app.audio.features, fps: document.getElementById('fps').textContent }));
    console.log('audio features:', JSON.stringify(stats.features), '·', stats.fps);
  }

  const gl = pageErrors.filter((e) => /GL|shader|webgl/i.test(e));
  if (pageErrors.length) console.log('page errors:\n  ' + pageErrors.join('\n  '));
  if (gl.length) failed = true;
} finally {
  await browser.close();
  await server.close();
}
process.exit(failed ? 1 : 0);
