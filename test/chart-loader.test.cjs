const test = require('node:test');
const assert = require('node:assert/strict');
const esbuild = require('esbuild');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

let directory;
let loader;

test.before(async () => {
  const root = path.join(process.cwd(), 'coverage', 'test-bundles');
  fs.mkdirSync(root, { recursive: true });
  directory = fs.mkdtempSync(path.join(root, 'chart-loader-'));
  const outfile = path.join(directory, 'chart-loader.mjs');
  await esbuild.build({
    entryPoints: [path.join(process.cwd(), 'src/charting/load-chart-runtime.ts')],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node24',
    sourcemap: 'inline',
    sourcesContent: true,
    logLevel: 'silent',
    external: ['./plot-charts.ts'],
  });
  loader = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
});

test.after(() => fs.rmSync(directory, { recursive: true, force: true }));

test('chart loader shares one successful promise for simultaneous callers', async () => {
  let calls = 0;
  const runtime = { renderChart() {} };
  loader.setChartRuntimeImporterForTests(async () => {
    calls += 1;
    await Promise.resolve();
    return runtime;
  });
  const first = loader.loadChartRuntime();
  const second = loader.loadChartRuntime();
  assert.equal(first, second);
  assert.equal(await first, runtime);
  assert.equal(await loader.loadChartRuntime(), runtime);
  assert.equal(calls, 1);
});

test('chart loader clears a rejected promise so Retry starts a new attempt', async () => {
  let calls = 0;
  const runtime = { renderChart() {} };
  loader.setChartRuntimeImporterForTests(async () => {
    calls += 1;
    if (calls === 1) throw new Error('chunk failed');
    return runtime;
  });
  await assert.rejects(loader.loadChartRuntime(), /chunk failed/);
  assert.equal(await loader.loadChartRuntime(), runtime);
  assert.equal(calls, 2);
  loader.resetChartRuntimeForTests();
});
