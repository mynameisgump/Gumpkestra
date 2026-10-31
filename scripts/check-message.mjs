import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';

const server = await createServer({ server: { host: '127.0.0.1', port: 5310 }, logLevel: 'error' });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 860 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://127.0.0.1:5310');
  await page.waitForFunction(() => window.app?.engine.frame > 3);
  const result = await page.evaluate(async () => {
    const { parseISF } = await import('/src/isf/isf.ts');
    const app = window.app, engine = app.engine, gl = engine.gl;
    engine.setHDR(false); engine.setResolution({ width: 768, height: 432 });
    engine.clear();
    const shader = parseISF('/*{"INPUTS":[]}*/\nvoid main(){gl_FragColor=vec4(0.02,0.015,0.01,1.0);}');
    engine.addLayer('black-test', shader);
    const clock = engine.colorOutput.mitch;
    const render = (offset) => {
      engine.render(clock.startedAt + offset, 0, app.audio);
      const data = new Uint8Array(768 * 432 * 4);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.readPixels(0, 0, 768, 432, gl.RGBA, gl.UNSIGNED_BYTE, data);
      return data;
    };
    const base = render(0);
    const diff = (a) => a.reduce((n, value, i) => n + (value !== base[i] ? 1 : 0), 0);
    const off = [299.99, 300.5, 301.5, 302.8, 599.99].map((t) => diff(render(t)));
    const on = [300.1, 301.1, 302.2, 600.1].map((t) => diff(render(t)));
    // Swapping presets must not restart the five-minute schedule.
    engine.clear(); engine.addLayer('second-test', shader);
    const afterSwitch = diff(render(600.1));
    render(300.1);
    const preview = engine.canvas.toDataURL();
    // Output-only text never becomes feedback input or a repeated transition ghost.
    gl.bindFramebuffer(gl.FRAMEBUFFER, engine.presented.fbo);
    const composite = new Uint8Array(base.length);
    gl.readPixels(0, 0, 768, 432, gl.RGBA, gl.UNSIGNED_BYTE, composite);
    engine.setHDR(true); const hdrFlash = diff(render(300.1));
    return { off, on, afterSwitch, unchangedComposite: diff(composite), hdrFlash, error: gl.getError(), preview };
  });
  assert.deepEqual(result.off, [0, 0, 0, 0, 0]);
  assert.ok(result.on.every((n) => n > 1000));
  assert.ok(result.afterSwitch > 1000 && result.hdrFlash > 1000);
  assert.equal(result.unchangedComposite, 0);
  assert.equal(result.error, 0);
  assert.deepEqual(errors, []);
  if (process.argv.includes('--shots')) await fs.writeFile('/tmp/gumpkestra-mitch-preview.png', Buffer.from(result.preview.split(',')[1], 'base64'));
  console.log('Passed: five-minute schedule, three text flashes, clean gaps, recurrence, preset changes, HDR rendering and untouched feedback input.');
} finally { await browser?.close(); await server.close(); }
