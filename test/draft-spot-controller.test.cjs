const test = require('node:test');
const assert = require('node:assert/strict');
const esbuild = require('esbuild');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.join(__dirname, '..');
let temporaryDirectory;
let controller;

test.before(async () => {
  temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'darling-draft-controller-'));
  const outfile = path.join(temporaryDirectory, 'controller.mjs');
  await esbuild.build({
    entryPoints: [path.join(root, 'src/features/draft-spot/draft-spot-controller.ts')],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    sourcemap: 'inline',
    sourcesContent: true,
    logLevel: 'silent',
    plugins: [{
      name: 'draft-controller-test-stubs',
      setup(build) {
        build.onResolve({ filter: /^preact$/ }, () => ({ path: 'preact', namespace: 'stub' }));
        build.onResolve({ filter: /DraftSpotPage$/ }, () => ({ path: 'page', namespace: 'stub' }));
        build.onResolve({ filter: /asset-validators$/ }, () => ({ path: 'validators', namespace: 'stub' }));
        build.onResolve({ filter: /verified-json-fetch$/ }, () => ({ path: 'fetch', namespace: 'stub' }));
        build.onLoad({ filter: /.*/, namespace: 'stub' }, args => {
          if (args.path === 'preact') return {
            contents: [
              'export const h = (component, props, ...children) => ({ component, props: { ...(props || {}), children: children.length === 1 ? children[0] : children } });',
              'export const render = (value, root) => globalThis.__draftControllerRenders.push({ value, root });',
            ].join('\n'),
            loader: 'js',
          };
          if (args.path === 'page') return { contents: 'export default function DraftSpotPage() {}', loader: 'js' };
          if (args.path === 'validators') return {
            contents: [
              'export const isDraftSpot = value => globalThis.__draftControllerValid(value);',
              'export const formatValidatorErrors = () => "fixture validation failed";',
              'export const getValidatorErrors = () => [];',
            ].join('\n'),
            loader: 'js',
          };
          if (args.path === 'fetch') return {
            contents: [
              'export const versionedAssetUrl = (path, base, sha) => `${base}${path}?v=${sha}`;',
              'export const fetchVerifiedJson = (descriptor, options) => globalThis.__draftControllerFetch(descriptor, options);',
            ].join('\n'),
            loader: 'js',
          };
          return { contents: '', loader: 'js' };
        });
      },
    }],
  });
  ({ mountDraftSpot, unmountDraftSpot } = await import(`${pathToFileURL(outfile).href}?${Date.now()}`));
});

test.after(() => fs.rmSync(temporaryDirectory, { recursive: true, force: true }));

let mountDraftSpot;
let unmountDraftSpot;

function fixture({ sha = 'one', asset = { rows: [{ season: 2024 }], source_sha256: 'source' }, valid = true } = {}) {
  const mount = { id: `draftSpotRoot-${sha}` };
  globalThis.document = { baseURI: 'https://example.test/Darling/' };
  globalThis.__draftControllerRenders = [];
  globalThis.__draftControllerValid = () => valid;
  globalThis.__draftControllerFetch = () => Promise.resolve({ value: asset });
  return {
    mount,
    options: {
      mount,
      assetPath: 'assets/DraftSpot.json',
      assetSha256: `sha256:${sha.repeat(64 / sha.length)}`,
      assetBytes: 123,
      sourceHash: 'source',
      dataVersion: 'fixture',
      state: { mode: 'league' },
    },
  };
}

test('Draft Spot controller renders loading and verified data, then reuses its cache', async () => {
  const state = fixture();
  await mountDraftSpot(state.options);
  assert.equal(globalThis.__draftControllerRenders[0].value.props.class, 'status-banner status-loading');
  assert.equal(globalThis.__draftControllerRenders.at(-1).value.component.name, 'DraftSpotPage');
  await mountDraftSpot(state.options);
  assert.equal(globalThis.__draftControllerRenders.at(-1).value.component.name, 'DraftSpotPage');
  unmountDraftSpot();
  assert.deepEqual(globalThis.__draftControllerRenders.at(-1), { value: null, root: state.mount });
  unmountDraftSpot();
});

test('Draft Spot controller reports empty, invalid, and stale loads', async () => {
  const empty = fixture({ sha: 'two', asset: { rows: [], source_sha256: 'source' } });
  await mountDraftSpot(empty.options);
  assert.match(globalThis.__draftControllerRenders.at(-1).value.props.children, /no seasons contain draft-pick data/);

  const invalid = fixture({ sha: 'three', valid: false });
  await mountDraftSpot(invalid.options);
  assert.equal(globalThis.__draftControllerRenders.at(-1).value.props.class, 'status-banner status-error');
  assert.match(globalThis.__draftControllerRenders.at(-1).value.props.children, /fixture validation failed/);

  const mismatch = fixture({ sha: 'four', asset: { rows: [{ season: 2024 }], source_sha256: 'other' } });
  await mountDraftSpot(mismatch.options);
  assert.match(globalThis.__draftControllerRenders.at(-1).value.props.children, /older SeasonSummary snapshot/);

  let resolve;
  const stale = fixture({ sha: 'five' });
  globalThis.__draftControllerFetch = () => new Promise(done => { resolve = done; });
  const pending = mountDraftSpot(stale.options);
  unmountDraftSpot();
  resolve({ value: stale.options.state ? { rows: [{ season: 2024 }], source_sha256: 'source' } : {} });
  await pending;
  assert.deepEqual(globalThis.__draftControllerRenders.at(-1), { value: null, root: stale.mount });
});
