// Verify HDR with actual GPU pixels; physical display luminance needs a real HDR screen.
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';

const server = await createServer({ server: { host: '127.0.0.1', port: 5306 }, logLevel: 'error' });
const native = process.argv.includes('--native');
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--enable-unsafe-swiftshader', ...(native ? ['--enable-blink-features=WebGLToneMapping'] : [])] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://127.0.0.1:5306');
  await page.waitForFunction(() => window.app?.engine.frame > 3);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForFunction(() => window.app?.engine.frame > 3);
  await page.getByRole('button', { name: 'HDR output settings' }).click();
  await page.getByRole('checkbox', { name: 'Enable HDR', exact: true }).check();
  await page.getByRole('button', { name: 'Show brightness test', exact: true }).click();
  assert.equal(await page.evaluate(() => window.app.engine.colorOutput.brightnessTest), true);
  await page.getByRole('button', { name: 'HDR output settings' }).click();
  assert.equal(await page.evaluate(() => window.app.engine.colorOutput.brightnessTest), false, 'Closing settings restores the scene');
  await page.getByRole('button', { name: 'HDR output settings' }).click();
  const result = await page.evaluate(async () => {
    const { parseISF } = await import('/src/isf/isf.ts');
    const app = window.app, engine = app.engine, gl = engine.gl;
    const source = parseISF('/*{"INPUTS":[{"NAME":"power","TYPE":"float","DEFAULT":4,"MIN":0,"MAX":16}]}*/\nvoid main(){gl_FragColor=vec4(power,power*0.5,0.25,1.0);}');
    const read = (target, float = false, x = 0, y = 0) => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, target?.fbo ?? null);
      const data = float ? new Float32Array(4) : new Uint8Array(4);
      gl.readPixels(x, y, 1, 1, gl.RGBA, float ? gl.FLOAT : gl.UNSIGNED_BYTE, data);
      return [...data];
    };
    engine.clear(); engine.setResolution({ width: 64, height: 64 });
    const layer = engine.addLayer('hdr-test', source);
    const render = () => engine.render(10, 0, app.audio);
    render();
    const hdrLayer = read(layer.output, true), hdrComposite = read(engine.presented, true);
    const mapped4 = read(null);
    engine.colorOutput.brightnessTest = true; render();
    const sdrReferences = [10, 32, 53].map((x) => read(null, false, x, 32));
    engine.colorOutput.brightnessTest = false;
    layer.params.power.value = 2; render(); const mapped2 = read(null);
    engine.colorOutput.exposure = -2; render(); const darker = read(null);
    engine.colorOutput.exposure = 0;
    const top = engine.addLayer('hdr-add', source); top.blend = 'add'; render();
    const additive = read(engine.presented, true);
    top.blend = 'screen'; render(); const screen = read(engine.presented, true);
    // Multipass buffers must not silently clip even when the file omits FLOAT.
    const multipass = parseISF('/*{"INPUTS":[{"NAME":"inputImage","TYPE":"image"}],"PASSES":[{"TARGET":"history","PERSISTENT":true},{}]}*/\nvoid main(){gl_FragColor=PASSINDEX==0?IMG_THIS_PIXEL(inputImage):IMG_THIS_PIXEL(history);}');
    const fx = engine.addLayer('hdr-pass', multipass); render();
    const multipassPixel = read(fx.output, true);
    const start = performance.now() / 1000;
    engine.beginTransition('fade', 1, 1);
    top.params.power.value = 8;
    engine.render(start + 0.5, 0, app.audio);
    const transition = read(engine.presented, true);
    engine.setResolution({ width: 80, height: 48 }); render();
    const resized = engine.presented.float && engine.layers.every((l) => l.output.float);
    engine.colorOutput.recordingSDR = true; render();
    const recording = { native: engine.colorOutput.nativeActive, pixel: read(null), status: engine.colorOutput.status };
    engine.colorOutput.recordingSDR = false;
    engine.setHDR(false); render();
    const sdr = { float: layer.output.float, pixel: read(layer.output) };
    // Unsupported hardware must stay on the old SDR path.
    const { Engine } = await import('/src/render/Engine.ts');
    const canvas = document.createElement('canvas'), fallbackGL = canvas.getContext('webgl2');
    const getExtension = fallbackGL.getExtension.bind(fallbackGL);
    fallbackGL.getExtension = (name) => name === 'EXT_color_buffer_float' ? null : getExtension(name);
    const fallback = new Engine(canvas); fallback.setHDR(true);
    return { hdrLayer, hdrComposite, mapped4, mapped2, sdrReferences, darker, additive, screen, multipassPixel, transition, resized, recording, sdr,
      unsupported: !fallback.colorOutput.supported && !fallback.colorOutput.enabled, error: gl.getError() };
  });
  assert.deepEqual(result.hdrLayer, [4, 2, 0.25, 1]);
  assert.deepEqual(result.hdrComposite, result.hdrLayer);
  assert.deepEqual(result.sdrReferences, Array(3).fill([255, 255, 255, 255]), 'SDR reference patches must not fake an HDR difference');
  assert.ok(result.mapped4[0] > result.mapped2[0] && result.mapped4[0] < 255, 'Highlights retain distinct intensities');
  assert.ok(result.darker[0] < result.mapped2[0], 'Exposure changes presentation');
  assert.equal(result.additive[0], 6);
  assert.ok(result.screen[0] >= 4, 'Screen blending preserves HDR energy');
  assert.deepEqual(result.multipassPixel, result.screen);
  assert.ok(result.transition[0] > 4 && result.transition[0] < 8, 'Transition retains HDR values');
  assert.ok(result.resized && result.unsupported);
  assert.equal(result.recording.native, false);
  assert.ok(result.recording.pixel[1] > 0 && result.recording.pixel[1] < 255, 'SDR recording preserves highlight colour');
  assert.equal(result.sdr.float, false);
  assert.equal(result.sdr.pixel[0], 255);
  assert.equal(result.error, 0);
  await page.getByRole('checkbox', { name: 'Enable HDR', exact: true }).uncheck();
  await page.getByRole('checkbox', { name: 'Enable HDR', exact: true }).check();
  await page.getByRole('slider', { name: 'HDR exposure', exact: true }).evaluate((el) => { el.value = '1.5'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.reload();
  await page.waitForFunction(() => window.app?.engine.frame > 3);
  assert.deepEqual(await page.evaluate(() => ({ enabled: window.app.engine.colorOutput.enabled, exposure: window.app.engine.colorOutput.exposure })), { enabled: true, exposure: 1.5 });
  await page.evaluate(() => window.app.loadPreset(window.app.library.presets.get('relic')));
  await page.waitForFunction(() => window.app.engine.layers.some((l) => l.shaderName === '@model' && !l.status));
  const model = await page.evaluate(() => {
    const engine = window.app.engine, gl = engine.gl;
    engine.render(10, 0, window.app.audio);
    const layer = engine.layers.find((l) => l.shaderName === '@model');
    gl.bindFramebuffer(gl.FRAMEBUFFER, layer.msaa.fbo);
    return { outputFloat: layer.output.float, resolvedFloat: layer.resolved.float, complete: gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE, error: gl.getError(), hdr: engine.colorOutput.enabled };
  });
  assert.ok(model.outputFloat && model.resolvedFloat && model.complete && model.hdr);
  assert.equal(model.error, 0);
  await page.getByRole('button', { name: '● Rec', exact: true }).click();
  await page.waitForFunction(() => window.app.engine.colorOutput.recordingSDR);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '■ Stop', exact: true }).click();
  await download;
  assert.equal(await page.evaluate(() => window.app.engine.colorOutput.recordingSDR), false);
  const originalRecorder = await page.evaluateHandle(() => window.MediaRecorder);
  await page.evaluate(() => {
    window.MediaRecorder = class {
      static isTypeSupported() { return true; }
      constructor() { throw new Error('simulated encoder failure'); }
    };
  });
  await page.getByRole('button', { name: '● Rec', exact: true }).click();
  assert.equal(await page.evaluate(() => window.app.engine.colorOutput.recordingSDR), false, 'Encoder failure restores display mode');
  await page.evaluate((original) => { window.MediaRecorder = original; }, originalRecorder);
  assert.deepEqual(errors, []);
  console.log('Passed: HDR layer/composite/multipass/transition pixels, exposure, highlight mapping, blending, resizing, SDR recording, hardware fallback, preferences, and HDR model targets.');
  if (native) {
    const hdrPage = await browser.newPage();
    // Emulate display capability to test the native float output path in headless
    // Chrome. This does not measure physical screen luminance.
    await hdrPage.addInitScript(() => {
      const original = window.matchMedia.bind(window);
      window.matchMedia = (query) => {
        const media = original(query);
        if (query === '(dynamic-range: high)') Object.defineProperty(media, 'matches', { value: true });
        return media;
      };
    });
    await hdrPage.goto('http://127.0.0.1:5306');
    await hdrPage.waitForFunction(() => window.app?.engine.frame > 3);
    const result = await hdrPage.evaluate(async () => {
      const { parseISF } = await import('/src/isf/isf.ts');
      const engine = window.app.engine, gl = engine.gl;
      engine.clear(); engine.setResolution({ width: 32, height: 32 }); engine.setHDR(true);
      engine.colorOutput.exposure = 0;
      engine.addLayer('native-test', parseISF('/*{"INPUTS":[]}*/\nvoid main(){gl_FragColor=vec4(4.0,2.0,0.25,1.0);}'));
      const render = () => engine.render(1, 0, window.app.audio);
      render();
      const active = engine.colorOutput.nativeActive;
      if (!active) return { active };
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      const pixel = new Float32Array(4); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.FLOAT, pixel);
      engine.colorOutput.brightnessTest = true;
      engine.colorOutput.exposure = -4; render();
      const references = [5, 16, 27].map((x) => {
        const data = new Float32Array(4); gl.readPixels(x, 16, 1, 1, gl.RGBA, gl.FLOAT, data); return data[0];
      });
      engine.colorOutput.brightnessTest = false; engine.colorOutput.exposure = 0;
      engine.colorOutput.recordingSDR = true; render();
      const recording = !engine.colorOutput.nativeActive && gl.drawingBufferFormat === gl.RGBA8;
      engine.colorOutput.recordingSDR = false; render(); const resumed = engine.colorOutput.nativeActive;
      engine.setHDR(false); render(); const disabled = !engine.colorOutput.nativeActive && gl.drawingBufferFormat === gl.RGBA8;
      return { active, pixel: [...pixel], references, recording, resumed, disabled, error: gl.getError() };
    });
    assert.ok(result.active, 'Experimental native HDR API must be available for --native');
    assert.ok(Math.abs(result.pixel[0] - 4) < 0.01 && Math.abs(result.pixel[1] - 2) < 0.01, 'Native drawing buffer preserves values above white');
    assert.ok(Math.abs(result.references[0] - 1) < 0.01 && result.references[1] > 1.3 && result.references[2] > 1.8, 'Reference patches bypass exposure and preserve HDR brightness steps');
    assert.ok(result.recording && result.resumed && result.disabled);
    assert.equal(result.error, 0);
    console.log('Passed: experimental native HDR float output, recording switch, resume and disable. Physical display luminance not tested.');
  }
} finally { await browser?.close(); await server.close(); }
