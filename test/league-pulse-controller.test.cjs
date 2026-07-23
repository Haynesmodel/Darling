const test = require('node:test');
const assert = require('node:assert/strict');
const esbuild = require('esbuild');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.join(__dirname, '..');
let temporaryDirectory;
let createFeatureController;

test.before(async () => {
  temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'darling-pulse-controller-'));
  const outfile = path.join(temporaryDirectory, 'controller.mjs');
  await esbuild.build({
    entryPoints: [path.join(root, 'src/features/league-pulse/league-pulse-controller.ts')],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    logLevel: 'silent',
    plugins: [{
      name: 'pulse-controller-test-stubs',
      setup(build) {
        build.onResolve({ filter: /\.css$/ }, () => ({ path: 'css', namespace: 'stub' }));
        build.onResolve({ filter: /^preact$/ }, () => ({ path: 'preact', namespace: 'stub' }));
        build.onResolve({ filter: /LeaguePulsePage$/ }, () => ({ path: 'page', namespace: 'stub' }));
        build.onResolve({ filter: /league-pulse-model$/ }, () => ({ path: 'model', namespace: 'stub' }));
        build.onLoad({ filter: /.*/, namespace: 'stub' }, args => {
          if (args.path === 'preact') {
            return {
              contents: [
                'export const h = (component, props) => ({ component, props });',
                'export const render = (value, root) => {',
                '  globalThis.__pulseControllerRenders.push({ value, root });',
                '};',
              ].join('\n'),
              loader: 'js',
            };
          }
          if (args.path === 'page') return { contents: 'export function LeaguePulsePage() {}', loader: 'js' };
          if (args.path === 'model') {
            return {
              contents: 'export const buildLeaguePulseModel = () => globalThis.__pulseControllerModel;',
              loader: 'js',
            };
          }
          return { contents: '', loader: 'css' };
        });
      },
    }],
  });
  ({ createFeatureController } = await import(`${pathToFileURL(outfile).href}?${Date.now()}`));
});

test.after(() => fs.rmSync(temporaryDirectory, { recursive: true, force: true }));

function contextFixture() {
  const rootElement = { id: 'leaguePulseRoot' };
  const calls = {
    headers: [],
    themes: [],
    routes: [],
    subscriptions: 0,
    unsubscriptions: 0,
    listener: null,
  };
  const context = {
    data: { diagnostics: { freshness: { status: 'current' } } },
    document: { getElementById: id => id === 'leaguePulseRoot' ? rootElement : null },
    window: {
      location: { pathname: '/Darling/' },
      fetch() { throw new Error('Pulse activation must not fetch'); },
    },
    freshness: {
      currentAssessment: () => ({ status: 'current' }),
      subscribe(listener) {
        calls.subscriptions += 1;
        calls.listener = listener;
        return () => { calls.unsubscriptions += 1; };
      },
    },
    header: { feature: (...args) => calls.headers.push(args) },
    theme: { league: value => calls.themes.push(value) },
    router: { update: value => calls.routes.push(value) },
  };
  return { calls, context, rootElement };
}

test('Pulse controller mount is idempotent and activation is history-safe without fetching', () => {
  globalThis.__pulseControllerRenders = [];
  globalThis.__pulseControllerModel = {
    hero: { title: 'Fixture Pulse' },
    state: { phase: 'regular-season' },
  };
  const { calls, context } = contextFixture();
  const controller = createFeatureController();
  controller.mount(context);
  controller.mount(context);
  assert.equal(calls.subscriptions, 2);
  assert.equal(calls.unsubscriptions, 1);

  const activation = new AbortController();
  controller.activate({ signal: activation.signal });
  assert.equal(globalThis.__pulseControllerRenders.length, 1);
  assert.deepEqual(calls.headers, [['League Pulse', null, 'Fixture Pulse']]);
  assert.deepEqual(calls.themes, ['regular']);
  assert.deepEqual(calls.routes, [{ tab: 'pulse' }]);
});

test('Pulse controller honors abort/deactivation and dispose unmounts cleanly', () => {
  globalThis.__pulseControllerRenders = [];
  globalThis.__pulseControllerModel = {
    hero: { title: 'Postseason Pulse' },
    state: { phase: 'postseason' },
  };
  const { calls, context, rootElement } = contextFixture();
  const controller = createFeatureController();
  controller.mount(context);

  const aborted = new AbortController();
  aborted.abort();
  controller.activate({ signal: aborted.signal });
  assert.equal(globalThis.__pulseControllerRenders.length, 0);

  const active = new AbortController();
  controller.activate({ signal: active.signal });
  assert.deepEqual(calls.themes, ['postseason']);
  const activeRenderCount = globalThis.__pulseControllerRenders.length;
  controller.deactivate();
  calls.listener();
  assert.equal(globalThis.__pulseControllerRenders.length, activeRenderCount);

  controller.dispose();
  assert.equal(calls.unsubscriptions, 1);
  assert.deepEqual(globalThis.__pulseControllerRenders.at(-1), { value: null, root: rootElement });
});
