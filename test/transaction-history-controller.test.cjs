const test = require('node:test');
const assert = require('node:assert/strict');
const esbuild = require('esbuild');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

let temporaryDirectory;
let createFeatureController;

test.before(async () => {
  const coverageBundles = path.join(process.cwd(), 'coverage', 'test-bundles');
  fs.mkdirSync(coverageBundles, { recursive: true });
  temporaryDirectory = fs.mkdtempSync(path.join(coverageBundles, 'transactions-controller-'));
  const outfile = path.join(temporaryDirectory, 'controller.mjs');
  await esbuild.build({
    entryPoints: [path.join(__dirname, '../src/features/transactions/transactions-controller.ts')],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    sourcemap: 'inline',
    sourcesContent: true,
    logLevel: 'silent',
    plugins: [{
      name: 'transactions-controller-test-stubs',
      setup(build) {
        build.onResolve({ filter: /\.css$/ }, () => ({ path: 'css', namespace: 'stub' }));
        build.onResolve({ filter: /^preact$/ }, () => ({ path: 'preact', namespace: 'stub' }));
        build.onResolve({ filter: /TransactionsPage$/ }, () => ({ path: 'page', namespace: 'stub' }));
        build.onResolve({ filter: /transactions-model$/ }, () => ({ path: 'model', namespace: 'stub' }));
        build.onResolve({ filter: /verified-json-fetch$/ }, () => ({ path: 'fetch', namespace: 'stub' }));
        build.onResolve(
          { filter: /generated\/transaction-history-validator$/ },
          () => ({ path: 'transaction-validator', namespace: 'stub' }),
        );
        build.onResolve(
          { filter: /generated\/asset-validators$/ },
          () => ({ path: 'asset-validator', namespace: 'stub' }),
        );
        build.onLoad({ filter: /.*/, namespace: 'stub' }, args => {
          if (args.path === 'preact') return {
            contents: [
              'export const h = (component, props, ...children) => ({ component, props: { ...(props || {}), children } });',
              'export const render = (value, root) => globalThis.__transactionRenders.push({ value, root });',
            ].join('\n'),
            loader: 'js',
          };
          if (args.path === 'page') return {
            contents: 'export default function TransactionsPage() {}',
            loader: 'js',
          };
          if (args.path === 'model') return {
            contents: `
              export function buildTransactionModel(asset, requested, options) {
                return {
                  asset,
                  favoriteOwner: options.favoriteOwner || null,
                  state: {
                    season: requested.transactionSeason || 2025,
                    view: requested.transactionId ? 'trades' : requested.transactionPlayer ? 'players' : requested.transactionView || 'overview',
                    owner: requested.transactionOwner || null,
                    player: requested.transactionPlayer || null,
                    transactionId: requested.transactionId || null,
                  },
                };
              }
            `,
            loader: 'js',
          };
          if (args.path === 'fetch') return {
            contents: `
              export const versionedAssetUrl = (assetPath, basePath, sha) =>
                basePath + assetPath + '?v=' + sha.replace(/^sha256:/, '');
              export const fetchVerifiedJson = descriptor => globalThis.__transactionFetch(descriptor);
            `,
            loader: 'js',
          };
          if (args.path === 'transaction-validator') return {
            contents: `
              export const isTransactionHistory = () => globalThis.__transactionValid !== false;
              export const getTransactionHistoryValidatorErrors = () => [{ instancePath: '/seasons', message: 'must be valid' }];
            `,
            loader: 'js',
          };
          if (args.path === 'asset-validator') return {
            contents: 'export const formatValidatorErrors = (name, errors) => name + ": " + errors[0].message;',
            loader: 'js',
          };
          return { contents: '', loader: 'css' };
        });
      },
    }],
  });
  ({ createFeatureController } = await import(`${pathToFileURL(outfile).href}?${Date.now()}`));
});

test.after(() => fs.rmSync(temporaryDirectory, { recursive: true, force: true }));

function fixture(hash, favoriteOwner = 'Joe') {
  const focusTarget = {
    hasAttribute: () => true,
    focusCalls: 0,
    focus() { this.focusCalls += 1; },
  };
  const root = { querySelector: () => focusTarget };
  const calls = { headers: [], themes: [], routes: [] };
  const context = {
    data: {
      dataVersion: `data-${hash}`,
      manifest: {
        assets: {
          TransactionHistory: {
            path: 'assets/TransactionHistory.json',
            sha256: `sha256:${hash}`,
            bytes: 100,
          },
        },
      },
    },
    document: {
      baseURI: 'https://example.test/Darling/',
      getElementById: id => id === 'transactionHistoryRoot' ? root : null,
    },
    window: { location: { pathname: '/Darling/' } },
    router: { update: value => calls.routes.push(value) },
    header: { feature: (...args) => calls.headers.push(args) },
    theme: { owner: value => calls.themes.push(value) },
    ownerPreference: { getSnapshot: () => ({ owner: favoriteOwner }) },
  };
  return { calls, context, focusTarget, root };
}

function activation(route = {}) {
  const controller = new AbortController();
  return {
    controller,
    input: { signal: controller.signal, route, reason: 'route' },
  };
}

test.beforeEach(() => {
  globalThis.__transactionRenders = [];
  globalThis.__transactionValid = true;
});

test('verified history fetches once per version and exposes the favorite-owner shortcut', async () => {
  let fetches = 0;
  globalThis.__transactionFetch = async () => {
    fetches += 1;
    return { value: { seasons: [] } };
  };
  const first = fixture('cache-one');
  const controller = createFeatureController();
  controller.mount(first.context);
  await controller.activate(activation({ transactionView: 'owners' }).input);
  await new Promise(resolve => setImmediate(resolve));
  const pageRender = globalThis.__transactionRenders.find(row => row.value?.component?.name === 'TransactionsPage');
  assert.equal(pageRender.value.props.model.favoriteOwner, 'Joe');
  assert.equal(fetches, 1);
  assert.equal(first.calls.routes.at(-1).tab, 'transactions');

  const second = fixture('cache-one');
  const secondController = createFeatureController();
  secondController.mount(second.context);
  await secondController.activate(activation().input);
  assert.equal(fetches, 1);
});

test('failed and invalid requests are evicted so Retry performs a new fetch', async () => {
  let fetches = 0;
  globalThis.__transactionFetch = async () => {
    fetches += 1;
    if (fetches === 1) throw new Error('offline');
    return { value: { seasons: [] } };
  };
  const state = fixture('retry-http');
  const controller = createFeatureController();
  controller.mount(state.context);
  await assert.rejects(controller.activate(activation().input), /offline/);
  await controller.activate(activation().input);
  assert.equal(fetches, 2);

  globalThis.__transactionValid = false;
  globalThis.__transactionFetch = async () => ({ value: {} });
  const invalid = fixture('retry-schema');
  const invalidController = createFeatureController();
  invalidController.mount(invalid.context);
  await assert.rejects(invalidController.activate(activation().input), /TransactionHistory: must be valid/);
});

test('a stale activation cannot repaint, focus, route, title, or theme after fetch completion', async () => {
  let resolveFetch;
  globalThis.__transactionFetch = () => new Promise(resolve => { resolveFetch = resolve; });
  const state = fixture('stale');
  const controller = createFeatureController();
  controller.mount(state.context);
  const active = activation({ transactionId: 'trade-1' });
  const pending = controller.activate(active.input);
  active.controller.abort();
  controller.deactivate();
  resolveFetch({ value: { seasons: [] } });
  await pending;
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(globalThis.__transactionRenders.filter(row => row.value?.component?.name === 'TransactionsPage').length, 0);
  assert.deepEqual(state.calls.routes, []);
  assert.deepEqual(state.calls.headers, []);
  assert.deepEqual(state.calls.themes, []);
  assert.equal(state.focusTarget.focusCalls, 0);
});

test('mount failures are explicit and dispose unmounts the feature root', () => {
  const state = fixture('dispose');
  const missing = createFeatureController();
  assert.throws(
    () => missing.mount({ ...state.context, document: { ...state.context.document, getElementById: () => null } }),
    /Transactions mount/,
  );
  const controller = createFeatureController();
  controller.mount(state.context);
  controller.dispose();
  assert.deepEqual(globalThis.__transactionRenders.at(-1), { value: null, root: state.root });
});
