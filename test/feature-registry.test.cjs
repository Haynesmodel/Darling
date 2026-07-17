const test = require('node:test');
const assert = require('node:assert/strict');
const esbuild = require('esbuild');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadRegistry() {
  const source = fs.readFileSync(path.join(process.cwd(), 'src/app/feature-registry.ts'), 'utf8');
  const output = await esbuild.transform(source, { loader: 'ts', format: 'esm', target: 'es2022' });
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'darling-registry-'));
  const file = path.join(directory, 'feature-registry.mjs');
  fs.writeFileSync(file, output.code);
  return import(`${pathToFileURL(file).href}?v=${Date.now()}`);
}

function controller(id, hooks = {}) {
  return { id, mount: hooks.mount || (() => {}), activate: hooks.activate || (() => {}), dispose: hooks.dispose };
}

test('feature registry shares imports and mounts a controller once', async () => {
  const { FeatureRegistry } = await loadRegistry();
  let loads = 0;
  let mounts = 0;
  let resolve;
  const pending = new Promise(done => { resolve = done; });
  const registry = new FeatureRegistry({ history: async () => { loads += 1; await pending; return { createFeatureController: () => controller('history', { mount: () => { mounts += 1; } }) }; } });
  const first = registry.load('history');
  const second = registry.load('history');
  assert.equal(loads, 1);
  resolve();
  const [a, b] = await Promise.all([first, second]);
  assert.equal(a, b);
  await registry.mount('history', a, {});
  await registry.mount('history', a, {});
  assert.equal(mounts, 1);
  registry.recordActivation('history');
  const diagnostics = registry.diagnostics();
  assert.equal(diagnostics.history.state, 'ready');
  assert.equal(diagnostics.history.activationCount, 1);
  assert.equal(Object.isFrozen(diagnostics.history), true);
});

test('feature registry contains failures and supports a controlled retry', async () => {
  const { FeatureRegistry } = await loadRegistry();
  let attempts = 0;
  const registry = new FeatureRegistry({
    trophy: async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('temporary chunk failure');
      return { createFeatureController: () => controller('trophy') };
    },
  });
  await assert.rejects(registry.load('trophy'), /temporary chunk failure/);
  assert.equal(registry.diagnostics().trophy.state, 'error');
  const loaded = await registry.retry('trophy');
  assert.equal(loaded.id, 'trophy');
  assert.equal(attempts, 2);
});

test('feature registry rejects malformed modules and disposes cached controllers', async () => {
  const { FeatureRegistry } = await loadRegistry();
  const malformed = new FeatureRegistry({ rivalry: async () => ({ createFeatureController: () => controller('history') }) });
  await assert.rejects(malformed.load('rivalry'), /Malformed rivalry feature controller/);
  let disposals = 0;
  const registry = new FeatureRegistry({ draft: async () => ({ createFeatureController: () => controller('draft', { dispose: () => { disposals += 1; } }) }) });
  await registry.load('draft');
  await registry.dispose();
  assert.equal(disposals, 1);
  assert.equal(registry.diagnostics().draft.state, 'idle');
});
