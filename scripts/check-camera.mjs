// Exercise live camera texture through the UI, GPU pixels, mirroring, 3D models, tile sequences, presets, idle stop, and error recovery.
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';

const server = await createServer({ server: { host: '127.0.0.1', port: 5302 }, logLevel: 'error' });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--autoplay-policy=no-user-gesture-required',
      '--enable-unsafe-swiftshader',
    ],
  });
  const page = await browser.newPage({ viewport: { width: 1400, height: 860 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && /GL|shader|webgl/i.test(m.text())) errors.push(m.text()); });

  await page.goto('http://127.0.0.1:5302');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForFunction(() => window.app?.engine.frame > 3);

  // 1. Start empty and click Camera in Library panel → adds an image layer with @camera.
  await page.evaluate(() => window.app.newPreset());
  await page.locator('#library-panel [aria-label="Camera"]').click();
  await page.waitForFunction(() => {
    const cam = window.app.engine.textures.camera;
    return cam.status === 'active' && cam.width > 0 && cam.height > 0 && window.app.engine.textures.info('@camera');
  }, null, { timeout: 10000 });

  const initial = await page.evaluate(async () => {
    const app = window.app;
    const layer = app.selected;
    layer.params.fit.value = 2; // Stretch
    layer.params.pulse.value = 0;
    app.engine.setResolution({ width: 128, height: 96 });
    const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    await frame();
    const gl = app.engine.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, app.engine.presented.fbo);
    const buf = new Uint8Array(128 * 96 * 4);
    gl.readPixels(0, 0, 128, 96, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    let nonBlack = 0;
    for (let i = 0; i < buf.length; i += 4) if (buf[i] + buf[i + 1] + buf[i + 2] > 15) nonBlack++;
    return {
      shader: layer.shaderName,
      texValue: layer.params.tex.value,
      camWidth: app.engine.textures.camera.width,
      camHeight: app.engine.textures.camera.height,
      devices: app.engine.textures.camera.devices.length,
      nonBlack,
      glError: gl.getError(),
    };
  });
  assert.equal(initial.shader, 'image');
  assert.equal(initial.texValue, '@camera');
  assert.ok(initial.camWidth > 0 && initial.camHeight > 0, 'Camera reports frame dimensions');
  assert.ok(initial.devices >= 1, 'Enumerates at least one fake camera device');
  assert.ok(initial.nonBlack > 500, `Expected non-black GPU camera pixels, got ${initial.nonBlack}`);
  assert.equal(initial.glError, 0);

  // Verify UI controls and live status text.
  assert.equal(await page.locator('.camera-controls').count(), 1);
  assert.equal(await page.locator('#library-panel .tex-tile.camera-live').count(), 1);
  const statusText = await page.locator('.camera-status.live').textContent();
  assert.match(statusText ?? '', /Live · \d+×\d+/);

  // 2. Stop & Start buttons release and resume hardware tracks.
  await page.locator('.camera-controls button', { hasText: 'Stop' }).click();
  await page.waitForFunction(() => window.app.engine.textures.camera.status === 'idle' && window.app.engine.textures.camera.paused);
  const stoppedPx = await page.evaluate(async () => {
    const app = window.app;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const gl = app.engine.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, app.engine.presented.fbo);
    const data = new Uint8Array(4);
    gl.readPixels(64, 48, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, data);
    return { px: [...data], hasStream: !!app.engine.textures.camera.stream };
  });
  assert.deepEqual(stoppedPx.px, [0, 0, 0, 255], 'Stopped camera renders black');
  assert.equal(stoppedPx.hasStream, false, 'Stopped camera releases MediaStream');

  await page.locator('.camera-controls button', { hasText: 'Start' }).click();
  await page.waitForFunction(() => window.app.engine.textures.camera.status === 'active' && window.app.engine.textures.info('@camera'));

  // 3. Deterministic 4-quadrant orientation & horizontal mirroring test via synthetic MediaStream.
  // Canvas top-left = red, top-right = green, bottom-left = blue, bottom-right = yellow.
  await page.evaluate(() => {
    const c = Object.assign(document.createElement('canvas'), { width: 64, height: 64 });
    const ctx = c.getContext('2d');
    const draw = () => {
      ctx.fillStyle = '#ff0000'; ctx.fillRect(0, 0, 32, 32);
      ctx.fillStyle = '#00ff00'; ctx.fillRect(32, 0, 32, 32);
      ctx.fillStyle = '#0000ff'; ctx.fillRect(0, 32, 32, 32);
      ctx.fillStyle = '#ffff00'; ctx.fillRect(32, 32, 32, 32);
    };
    draw();
    window.__synthDraw = setInterval(draw, 33);
    window.__origGUM = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async () => c.captureStream(30);
    window.app.engine.textures.camera.stop(false);
    window.app.engine.textures.camera.activate();
  });
  await page.waitForFunction(() => {
    const cam = window.app.engine.textures.camera;
    return cam.status === 'active' && cam.width === 64 && cam.height === 64 && window.app.engine.textures.info('@camera');
  }, null, { timeout: 10000 });

  const readQuadrants = () => page.evaluate(async () => {
    const app = window.app;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r))));
    const gl = app.engine.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, app.engine.presented.fbo);
    const sample = (x, y) => {
      const d = new Uint8Array(4);
      gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, d);
      return [...d].slice(0, 3).map((v) => v > 180 ? 1 : 0);
    };
    // WebGL framebuffer origin is bottom-left: y=72 is top, y=24 is bottom.
    return {
      topLeft: sample(32, 72),
      topRight: sample(96, 72),
      bottomLeft: sample(32, 24),
      bottomRight: sample(96, 24),
      glError: gl.getError(),
    };
  });

  const unmirrored = await readQuadrants();
  assert.deepEqual(unmirrored, {
    topLeft: [1, 0, 0],     // red
    topRight: [0, 1, 0],    // green
    bottomLeft: [0, 0, 1],  // blue
    bottomRight: [1, 1, 0], // yellow
    glError: 0,
  }, 'Unmirrored camera is upright and matches source quadrants');

  // Toggle Mirror via UI checkbox.
  await page.locator('.camera-mirror input[type="checkbox"]').check();
  const mirrored = await readQuadrants();
  assert.deepEqual(mirrored, {
    topLeft: [0, 1, 0],     // green
    topRight: [1, 0, 0],    // red
    bottomLeft: [1, 1, 0],  // yellow
    bottomRight: [0, 0, 1], // blue
    glError: 0,
  }, 'Mirrored camera flips horizontally while staying upright');

  // Toggle Mirror back off and verify unmirrored resumes cleanly.
  await page.locator('.camera-mirror input[type="checkbox"]').uncheck();
  const unmirroredAgain = await readQuadrants();
  assert.deepEqual(unmirroredAgain, unmirrored, 'Toggling mirror off restores original orientation');

  // 4. Preset serialization & restoration.
  const presetOk = await page.evaluate(async () => {
    const app = window.app;
    const saved = app.selected.toJSON();
    app.loadPreset({ name: 'camera-preset', layers: [saved] });
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return {
      savedTex: saved.params.tex.value,
      restoredTex: app.engine.layers[0].params.tex.value,
      glError: app.engine.gl.getError(),
    };
  });
  assert.equal(presetOk.savedTex, '@camera');
  assert.equal(presetOk.restoredTex, '@camera');
  assert.equal(presetOk.glError, 0);

  // 5. 3D ModelLayer + TileSequence with @camera.
  const modelAndTiles = await page.evaluate(async () => {
    const app = window.app;
    // Tile sequence containing @camera
    const imgLayer = app.engine.layers[0];
    imgLayer.params.fit.value = 3;
    imgLayer.params.tex.tiles = ['@checker', '@camera'];
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const tileErr = app.engine.gl.getError();

    // 3D Model layer with @camera texture override
    app.newPreset();
    const model = app.addModel('@cube');
    await new Promise((r) => {
      const check = () => model.mesh ? r() : setTimeout(check, 20);
      check();
    });
    app.setTexture(model, 'texture', '@camera');
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const gl = app.engine.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, app.engine.presented.fbo);
    const center = new Uint8Array(4);
    gl.readPixels(64, 48, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, center);
    return { tileErr, modelCenter: [...center], modelErr: gl.getError() };
  });
  assert.equal(modelAndTiles.tileErr, 0, 'TileSequence with @camera has no GL errors');
  assert.equal(modelAndTiles.modelErr, 0, 'ModelLayer with @camera has no GL errors');
  assert.ok(modelAndTiles.modelCenter[0] + modelAndTiles.modelCenter[1] + modelAndTiles.modelCenter[2] > 20, 'ModelLayer renders @camera texture');

  // 6. Auto-stop on idle when no layer references @camera.
  await page.evaluate(() => {
    window.app.newPreset();
    for (let i = 0; i < 100; i++) window.app.engine.textures.camera.update();
  });
  const afterIdle = await page.evaluate(() => ({
    status: window.app.engine.textures.camera.status,
    hasStream: !!window.app.engine.textures.camera.stream,
  }));
  assert.equal(afterIdle.status, 'idle', 'Camera auto-stops when unused');
  assert.equal(afterIdle.hasStream, false, 'Camera stream is released after idle timeout');

  // 7. Permission denied error handling — no infinite retry loop, Retry recovers.
  await page.evaluate(() => {
    window.__gumCalls = 0;
    navigator.mediaDevices.getUserMedia = async () => {
      window.__gumCalls++;
      throw new DOMException('Permission denied', 'NotAllowedError');
    };
  });
  await page.locator('#library-panel [aria-label="Camera"]').click();
  await page.waitForFunction(() => window.app.engine.textures.camera.status === 'error');
  const errState = await page.evaluate(async () => {
    for (let i = 0; i < 15; i++) await new Promise((r) => requestAnimationFrame(r));
    return {
      calls: window.__gumCalls,
      error: window.app.engine.textures.camera.error,
    };
  });
  assert.equal(errState.calls, 1, 'Does not spam getUserMedia after permission error');
  assert.match(errState.error ?? '', /permission denied/i);
  assert.equal(await page.locator('.camera-controls button', { hasText: 'Retry' }).count(), 1);

  // Restore real fake camera and click Retry.
  await page.evaluate(() => {
    clearInterval(window.__synthDraw);
    navigator.mediaDevices.getUserMedia = window.__origGUM;
  });
  await page.locator('.camera-controls button', { hasText: 'Retry' }).click();
  await page.waitForFunction(() => window.app.engine.textures.camera.status === 'active' && window.app.engine.textures.info('@camera'), null, { timeout: 10000 });

  assert.deepEqual(errors, []);
  console.log('Passed: camera library tile, live GPU frames, orientation & horizontal mirror, stop/start, presets, tile sequence, 3D model, idle auto-stop, and permission error recovery.');
} finally {
  await browser?.close();
  await server.close();
}
