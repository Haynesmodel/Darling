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
  temporaryDirectory = fs.mkdtempSync(path.join(coverageBundles, 'owner-controller-'));
  const outfile = path.join(temporaryDirectory, 'controller.mjs');
  await esbuild.build({
    entryPoints: [path.join(__dirname, '../src/features/owner-hub/owner-hub-controller.ts')],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    sourcemap: 'inline',
    sourcesContent: true,
    logLevel: 'silent',
    plugins: [{
      name: 'owner-controller-test-stubs',
      setup(build) {
        build.onResolve({ filter: /\.css$/ }, () => ({ path: 'css', namespace: 'stub' }));
        build.onResolve({ filter: /^preact$/ }, () => ({ path: 'preact', namespace: 'stub' }));
        build.onResolve({ filter: /OwnerHubPage$/ }, () => ({ path: 'page', namespace: 'stub' }));
        build.onResolve({ filter: /owner-hub-model$/ }, () => ({ path: 'model', namespace: 'stub' }));
        build.onLoad({ filter: /.*/, namespace: 'stub' }, args => {
          if (args.path === 'preact') return {
            contents: [
              'export const h = (component, props) => ({ component, props });',
              'export const render = (value, root) => globalThis.__ownerControllerRenders.push({ value, root });',
            ].join('\n'),
            loader: 'js',
          };
          if (args.path === 'page') return { contents: 'export function OwnerHubPage() {}', loader: 'js' };
          if (args.path === 'model') return {
            contents: 'export const buildOwnerHubModel = (_data, options) => ({ owner: options.owner });',
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

function fixture({ owner = 'Joe', root = true } = {}) {
  const rootElement = { id: 'ownerHubRoot' };
  const heading = { textContent: '' };
  const calls = { headers: [], themes: [], routes: [], sets: [], unsubscribe: 0 };
  let listener;
  const context = {
    data: {},
    document: {
      getElementById(id) {
        if (id === 'ownerHubRoot') return root ? rootElement : null;
        if (id === 'page-owner-title') return heading;
        return null;
      },
    },
    window: { location: { pathname: '/Darling/' } },
    selectors: { seasonAggregates: () => [] },
    header: { feature: (...args) => calls.headers.push(args) },
    theme: {
      owner: value => calls.themes.push(['owner', value]),
      league: () => calls.themes.push(['league']),
    },
    router: { update: value => calls.routes.push(value) },
    ownerPreference: {
      validOwners: () => ['Joe', 'Joel'],
      getSnapshot: () => ({ owner, persisted: true, revision: 0 }),
      set(value) {
        calls.sets.push(value);
        return { accepted: true, persisted: true, snapshot: { owner: value, persisted: true, revision: 1 } };
      },
      subscribe(next) {
        listener = next;
        return () => { calls.unsubscribe += 1; };
      },
    },
  };
  return { calls, context, heading, listener: snapshot => listener(snapshot), rootElement };
}

test('Owner Hub controller rejects a missing root and ignores aborted activation', () => {
  const missing = createFeatureController();
  assert.throws(() => missing.mount(fixture({ root: false }).context), /Owner Hub root missing/);

  globalThis.__ownerControllerRenders = [];
  const { context } = fixture();
  const controller = createFeatureController();
  controller.mount(context);
  const aborted = new AbortController();
  aborted.abort();
  controller.activate({ signal: aborted.signal, route: { owner: null }, reason: 'route' });
  assert.equal(globalThis.__ownerControllerRenders.length, 0);
});

test('Owner Hub controller follows preferences, previews, saves, clears, and disposes', () => {
  globalThis.__ownerControllerRenders = [];
  const state = fixture();
  const controller = createFeatureController();
  controller.mount(state.context);
  const active = new AbortController();
  controller.activate({ signal: active.signal, route: { owner: null }, reason: 'route' });
  let props = globalThis.__ownerControllerRenders.at(-1).value.props;
  assert.equal(props.selectedOwner, 'Joe');
  assert.equal(state.heading.textContent, 'Joe Owner Hub');

  props.onPreview('Missing');
  assert.equal(globalThis.__ownerControllerRenders.at(-1).value.props.selectedOwner, 'Joe');
  props.onPreview('Joel');
  props = globalThis.__ownerControllerRenders.at(-1).value.props;
  assert.equal(props.selectedOwner, 'Joel');
  props.onSave();
  props = globalThis.__ownerControllerRenders.at(-1).value.props;
  assert.match(props.message, /now My Team/);
  props.onClear();
  assert.deepEqual(state.calls.sets, ['Joel', null]);

  controller.deactivate();
  const count = globalThis.__ownerControllerRenders.length;
  state.listener({ owner: 'Joe', persisted: true, revision: 2 });
  assert.equal(globalThis.__ownerControllerRenders.length, count);
  controller.dispose();
  assert.equal(state.calls.unsubscribe, 1);
  assert.deepEqual(globalThis.__ownerControllerRenders.at(-1), { value: null, root: state.rootElement });
});

test('Owner Hub controller surfaces invalid routes and session-only saves', () => {
  globalThis.__ownerControllerRenders = [];
  const state = fixture({ owner: null });
  state.context.ownerPreference.set = value => ({
    accepted: true,
    persisted: false,
    snapshot: { owner: value, persisted: false, revision: 1 },
  });
  const controller = createFeatureController();
  controller.mount(state.context);
  const active = new AbortController();
  controller.activate({
    signal: active.signal,
    route: { owner: 'Unknown' },
    reason: 'route',
  });
  let props = globalThis.__ownerControllerRenders.at(-1).value.props;
  assert.equal(props.selectedOwner, null);
  assert.equal(props.invalidOwner, 'Unknown');
  assert.deepEqual(state.calls.themes.at(-1), ['league']);
  props.onSave();

  controller.activate({
    signal: active.signal,
    route: { owner: 'Joe' },
    reason: 'route',
  });
  props = globalThis.__ownerControllerRenders.at(-1).value.props;
  props.onSave();
  assert.match(globalThis.__ownerControllerRenders.at(-1).value.props.message, /browser storage is unavailable/);
});
