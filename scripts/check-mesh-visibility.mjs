// Check source mesh identity, UI controls, preset restoration, and rendered visibility.
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
const server = await createServer({ server: { host: '127.0.0.1', port: 5302 }, logLevel: 'error' });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 860 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://127.0.0.1:5302');
  await page.waitForFunction(() => window.app?.engine.frame > 3);
  const source = await page.evaluate(async () => {
    const { parseGLTF } = await import('/src/model/gltf.ts');
    const { parseOBJ, buildPrimitive } = await import('/src/model/mesh.ts');
    const positions = new Float32Array([-.5, -.5, 0, .5, -.5, 0, 0, .5, 0]);
    const data = btoa(String.fromCharCode(...new Uint8Array(positions.buffer)));
    const json = {
      asset: { version: '2.0' }, buffers: [{ uri: `data:application/octet-stream;base64,${data}`, byteLength: positions.byteLength }],
      bufferViews: [{ buffer: 0, byteLength: positions.byteLength }],
      accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3' }],
      materials: [{}, { pbrMetallicRoughness: { baseColorFactor: [0, 1, 0, 1] } }],
      meshes: [{ name: 'Shared mesh', primitives: [0, 1, 0].map((material) => ({ attributes: { POSITION: 0 }, material })) }],
      nodes: [{ name: 'Left', mesh: 0, translation: [-1, 0, 0] }, { name: 'Right', mesh: 0, translation: [1, 0, 0] }],
      scenes: [{ nodes: [0, 1] }], scene: 0,
    };
    const mesh = await parseGLTF('visibility.gltf', new TextEncoder().encode(JSON.stringify(json)).buffer);
    const obj = parseOBJ('parts.obj', 'v 0 0 0\nv 1 0 0\nv 0 1 0\no Body\nf 1 2 3\ng Trim\nf 1 2 3\no Other\nf 1 2 3');
    const app = window.app;
    const original = app.library.loadMesh.bind(app.library);
    app.library.loadMesh = (name) => name === mesh.name ? Promise.resolve(mesh) : original(name);
    app.loadPreset({ name: 'mesh-check', layers: [{ shader: '@model', model: mesh.name, params: { spinY: { value: 0, mods: [] } } }] });
    app.engine.setResolution({ width: 128, height: 128 });
    app.select(app.engine.layers[0]);
    return {
      groups: mesh.groups.map((g) => g.meshId), obj: obj.groups.map((g) => g.meshName),
      cube: [...new Set(buildPrimitive('@cube').groups.map((g) => g.meshId))],
    };
  });
  assert.deepEqual(source.groups, ['node:0', 'node:0', 'node:0', 'node:1', 'node:1', 'node:1']);
  assert.deepEqual(source.obj, ['Body', 'Body / Trim', 'Other']);
  assert.deepEqual(source.cube, ['model']);
  const checks = page.locator('.mesh-list input');
  await checks.first().waitFor();
  assert.equal(await checks.count(), 2, 'One checkbox per mesh instance, across all materials');
  const pixels = () => page.evaluate(async () => {
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const layer = window.app.selected, gl = window.app.engine.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, layer.output.fbo);
    const data = new Uint8Array(128 * 128 * 4);
    gl.readPixels(0, 0, 128, 128, gl.RGBA, gl.UNSIGNED_BYTE, data);
    const halves = [0, 0];
    for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) if (data[(y * 128 + x) * 4 + 3]) halves[x < 64 ? 0 : 1]++;
    return halves;
  });
  assert.ok(await page.locator('.mesh-visibility').evaluate((el) => el.scrollWidth <= el.clientWidth), 'Mesh controls fit the sidebar');
  const both = await pixels();
  assert.ok(both.every((n) => n > 0), 'Both meshes render initially');
  await checks.first().uncheck();
  const right = await pixels();
  assert.equal(right[0], 0, 'Hidden mesh contributes no pixels');
  assert.equal(right[1], both[1], 'Other mesh stays visible');
  const saved = await page.evaluate(() => window.app.selected.toJSON());
  assert.deepEqual(saved.hiddenMeshes, ['node:0']);
  await page.evaluate((layer) => {
    const app = window.app;
    app.loadPreset({ name: 'restored', layers: [layer] });
    app.select(app.engine.layers[0]);
  }, saved);
  await page.waitForFunction(() => window.app.selected.mesh && !window.app.selected.status);
  assert.deepEqual(await pixels(), right, 'Visibility survives asynchronous preset restoration');
  await page.getByRole('button', { name: 'Hide all', exact: true }).click();
  assert.deepEqual(await pixels(), [0, 0], 'All hidden produces a transparent layer');
  await page.getByRole('button', { name: 'Show all', exact: true }).click();
  assert.deepEqual(await pixels(), both);
  await checks.first().uncheck();
  await page.evaluate(() => window.app.setModel(window.app.selected, 'visibility.gltf'));
  assert.deepEqual(await pixels(), right, 'Reloading the same model preserves visibility');
  await page.evaluate(() => window.app.setModel(window.app.selected, '@cube'));
  assert.equal(await checks.count(), 1);
  assert.equal(await checks.first().isChecked(), true, 'Switching models resets visibility');
  assert.deepEqual(await page.evaluate(() => window.app.selected.toJSON().hiddenMeshes), []);
  assert.deepEqual(errors, []);
  console.log('Mesh visibility: loader identity, UI, GPU pixels, presets, reload and model switching passed.');
} finally {
  await browser?.close();
  await server.close();
}
