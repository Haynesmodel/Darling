const test = require('node:test');
const assert = require('node:assert/strict');
const esbuild = require('esbuild');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

let directory;
let component;

test.before(async () => {
  const root = path.join(process.cwd(), 'coverage', 'test-bundles');
  fs.mkdirSync(root, { recursive: true });
  directory = fs.mkdtempSync(path.join(root, 'deferred-chart-'));
  const outfile = path.join(directory, 'deferred-chart.mjs');
  await esbuild.build({
    entryPoints: [path.join(process.cwd(), 'src/components/charts/DeferredChartCore.tsx')],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node24',
    jsx: 'automatic',
    jsxImportSource: 'preact',
    sourcemap: 'inline',
    sourcesContent: true,
    logLevel: 'silent',
  });
  component = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
});

test.after(() => fs.rmSync(directory, { recursive: true, force: true }));

test('deferred chart uses the shared retrying chart loader', () => {
  const source = fs.readFileSync(path.join(process.cwd(), 'src/components/charts/DeferredChartCore.tsx'), 'utf8');
  assert.match(source, /import \{ loadChartRuntime \} from '\.\.\/\.\.\/charting\/load-chart-runtime';/);
  assert.doesNotMatch(source, /import\('\.\.\/\.\.\/charting\/plot-charts\.ts'\)/);
});

test('deferred chart uses the exact expanded viewport observer contract', () => {
  assert.deepEqual(component.CHART_INTERSECTION_OPTIONS, {
    root: null,
    rootMargin: '600px 0px',
    threshold: 0,
  });
});

test('deferred chart availability requires activation, connection, and an open disclosure', () => {
  const details = { open: false };
  const host = { isConnected: true, closest: selector => selector === 'details' ? details : null };
  assert.equal(component.isChartHostAvailable(host, true), false);
  details.open = true;
  assert.equal(component.isChartHostAvailable(host, true), true);
  assert.equal(component.isChartHostAvailable(host, false), false);
  host.isConnected = false;
  assert.equal(component.isChartHostAvailable(host, true), false);
  host.isConnected = true;
  host.closest = () => null;
  assert.equal(component.isChartHostAvailable(host, true), true);
});

test('deferred chart failure guidance names the chart and explains recovery', () => {
  assert.match(component.chartErrorMessage('Lead Trend'), /Lead Trend chart failed/);
  assert.match(component.chartErrorMessage('Lead Trend'), /Retry or reload/);
});
