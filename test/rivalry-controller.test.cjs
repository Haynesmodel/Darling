const test = require('node:test');
const assert = require('node:assert/strict');
const esbuild = require('esbuild');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

let directory;
let createFeatureController;

test.before(async () => {
  const bundles = path.join(process.cwd(), 'coverage', 'test-bundles');
  fs.mkdirSync(bundles, { recursive: true });
  directory = fs.mkdtempSync(path.join(bundles, 'rivalry-controller-'));
  const outfile = path.join(directory, 'rivalry-controller.mjs');
  await esbuild.build({
    entryPoints: [path.join(process.cwd(), 'src/features/rivalry/rivalry-controller.ts')],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node24',
    sourcemap: 'inline',
    sourcesContent: true,
    logLevel: 'silent',
    plugins: [{
      name: 'rivalry-controller-stubs',
      setup(build) {
        build.onResolve({ filter: /\.css$/ }, () => ({ path: 'css', namespace: 'stub' }));
        build.onResolve({ filter: /^preact$/ }, () => ({ path: 'preact', namespace: 'stub' }));
        build.onResolve({ filter: /RivalryPage$/ }, () => ({ path: 'page', namespace: 'stub' }));
        build.onResolve({ filter: /rivalry-model$/ }, () => ({ path: 'model', namespace: 'stub' }));
        build.onResolve({ filter: /section-disclosure$/ }, () => ({ path: 'disclosure', namespace: 'stub' }));
        build.onResolve({ filter: /rivalry-tables$/ }, () => ({ path: 'tables', namespace: 'stub' }));
        build.onResolve({ filter: /share-card-feature-adapters$/ }, () => ({ path: 'share', namespace: 'stub' }));
        build.onLoad({ filter: /.*/, namespace: 'stub' }, args => {
          if (args.path === 'preact') return { loader: 'js', contents: `
            export const h = (component, props) => ({ component, props });
            export const render = (value, root) => { root.rendered = value; globalThis.__rivalryVNode = value; };
          ` };
          if (args.path === 'page') return { loader: 'js', contents: 'export function RivalryPage() {}' };
          if (args.path === 'model') return { loader: 'js', contents: `
            export const latestRivalrySeason = () => 2025;
            export const buildRivalryViewModel = (teamA, teamB, _games, options) => ({
              teamA, teamB, scope: options.scope, currentSeason: options.currentSeason,
              seasonRows: [{ season: 2025 }], gameRows: [{ date: '2025-09-01' }], leadPoints: [], tape: [], highlights: [],
              summary: { overall: { g: 1, w: 1, l: 0, pf: 100, pa: 90, recordText: '1-0' }, lastMeeting: null },
            });
          ` };
          if (args.path === 'disclosure') return { loader: 'js', contents: `
            export const createSectionDisclosure = () => ({
              update(value) { globalThis.__rivalryDisclosure = value; },
              dispose() { globalThis.__rivalryDisclosureDisposed = true; },
            });
          ` };
          if (args.path === 'tables') return { loader: 'js', contents: 'export const registerRivalryTables = runtime => runtime.registered = true;' };
          if (args.path === 'share') return { loader: 'js', contents: `
            export const mountRivalryCard = () => ({ dispose() { globalThis.__rivalryShareDisposed = true; } });
          ` };
          return { loader: 'css', contents: '' };
        });
      },
    }],
  });
  ({ createFeatureController } = await import(`${pathToFileURL(outfile).href}?${Date.now()}`));
});

test.after(() => fs.rmSync(directory, { recursive: true, force: true }));

function fixture({ favorite = null, owners = ['Alpha', 'Beta', 'History'] } = {}) {
  const root = {};
  const nav = {};
  const details = new Map([
    'rivalryLeadDisclosure', 'rivalryHighlightsDisclosure', 'rivalryTapeDisclosure',
    'rivalryTrendDisclosure', 'rivalryTimelineDisclosure', 'rivalrySeasonsDisclosure', 'rivalryGamesDisclosure',
  ].map(id => [id, { id, open: false }]));
  const calls = { headers: [], themes: [], routes: [], tables: [], unmounts: [] };
  const context = {
    data: {
      leagueGames: [],
      seasonSummaries: owners.map((owner, index) => ({ owner, season: 2025 - index })),
      currentSeason: { season: 2025 },
      rivalries: [{ slug: 'alpha-beta', name: 'Alpha Beta', type: 'pair', members: ['Alpha', 'Beta'] }],
      dataVersion: 'fixture',
    },
    document: {
      getElementById(id) {
        if (id === 'rivalryRoot') return root;
        if (id === 'rivalrySectionNav') return nav;
        return details.get(id) || null;
      },
    },
    window: { location: { origin: 'https://example.test' } },
    ownerPreference: { getSnapshot: () => ({ owner: favorite }), validOwners: () => owners },
    header: { feature: (...args) => calls.headers.push(args) },
    theme: { rivalry: (...args) => calls.themes.push(args) },
    router: { update: value => { calls.routes.push(value); return '/?tab=rivalry'; } },
    tables: {
      register() {},
      render: (...args) => calls.tables.push(args),
      unmount: id => calls.unmounts.push(id),
    },
  };
  return { calls, context, root };
}

function activation(route = {}, reason = 'bootstrap') {
  return { signal: new AbortController().signal, route, reason, activationId: 1 };
}

test('Rivalry controller normalizes routes and renders one typed Preact root', () => {
  const state = fixture({ favorite: 'Beta' });
  const controller = createFeatureController();
  controller.mount(state.context);
  controller.activate(activation({ rivalryScope: 'historic' }));
  assert.equal(globalThis.__rivalryVNode.props.state.teamA, 'Beta');
  assert.equal(globalThis.__rivalryVNode.props.state.teamB, 'Alpha');
  assert.equal(globalThis.__rivalryVNode.props.state.scope, 'historic');
  assert.equal(globalThis.__rivalryVNode.props.active, true);
  assert.equal(state.calls.tables.length, 2);
  assert.equal(globalThis.__rivalryDisclosure.sections.length, 7);
  assert.equal(state.calls.routes.at(-1).selectedRivalryTeamA, 'Beta');
});

test('Rivalry controller preserves tab state, contains inactive callbacks, and disposes resources', () => {
  globalThis.__rivalryDisclosureDisposed = false;
  const state = fixture();
  const controller = createFeatureController();
  controller.mount(state.context);
  controller.activate(activation({ rivalryTeamA: 'History', rivalryTeamB: 'Beta', rivalryScope: 'historic' }));
  globalThis.__rivalryVNode.props.onChange({ teamA: 'Beta', teamB: 'Alpha', scope: 'allTime' });
  assert.equal(state.calls.routes.at(-1).selectedRivalryTeamA, 'Beta');
  controller.activate(activation({ rivalryTeamA: 'Ignored', rivalryTeamB: 'Ignored' }, 'tab'));
  assert.equal(globalThis.__rivalryVNode.props.state.teamA, 'Beta');
  const beforeDeactivate = state.calls.routes.length;
  controller.deactivate();
  assert.equal(globalThis.__rivalryVNode.props.active, false);
  globalThis.__rivalryVNode.props.onChange({ teamA: 'Alpha', teamB: 'Beta', scope: 'historic' });
  assert.equal(state.calls.routes.length, beforeDeactivate);
  controller.dispose();
  assert.equal(globalThis.__rivalryDisclosureDisposed, true);
  assert.deepEqual(state.calls.unmounts, ['rivalry-seasons', 'rivalry-games']);
  assert.equal(state.root.rendered, null);
});
