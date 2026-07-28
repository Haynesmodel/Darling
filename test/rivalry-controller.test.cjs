const test = require('node:test');
const assert = require('node:assert/strict');
const esbuild = require('esbuild');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

let directory;
let createFeatureController;

test.before(async () => {
  const coverageBundles = path.join(process.cwd(), 'coverage', 'test-bundles');
  fs.mkdirSync(coverageBundles, { recursive: true });
  directory = fs.mkdtempSync(path.join(coverageBundles, 'rivalry-controller-'));
  const outfile = path.join(directory, 'rivalry-controller.mjs');
  await esbuild.build({
    entryPoints: [path.join(__dirname, '../src/features/rivalry/rivalry-controller.ts')],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    sourcemap: 'inline',
    sourcesContent: true,
    logLevel: 'silent',
    plugins: [{
      name: 'rivalry-controller-test-stubs',
      setup(build) {
        build.onResolve({ filter: /\.css$/ }, () => ({ path: 'css', namespace: 'stub' }));
        build.onResolve({ filter: /rivalry-controls\.js$/ }, () => ({ path: 'controls', namespace: 'stub' }));
        build.onResolve({ filter: /current-season-data\.js$/ }, () => ({ path: 'season', namespace: 'stub' }));
        build.onResolve({ filter: /rivalry-renderers\.js$/ }, () => ({ path: 'renderers', namespace: 'stub' }));
        build.onResolve({ filter: /feature-utils$/ }, () => ({ path: 'utils', namespace: 'stub' }));
        build.onResolve({ filter: /section-disclosure$/ }, () => ({ path: 'disclosure', namespace: 'stub' }));
        build.onResolve({ filter: /rivalry-tables$/ }, () => ({ path: 'tables', namespace: 'stub' }));
        build.onLoad({ filter: /.*/, namespace: 'stub' }, args => {
          if (args.path === 'controls') return {
            contents: [
              'export function buildRivalryControls(options) {',
              '  globalThis.__rivalryControls = options;',
              '  return { selectedTeamA: options.selectedTeamA || "Alpha", selectedTeamB: options.selectedTeamB || "Beta" };',
              '}',
            ].join('\n'),
            loader: 'js',
          };
          if (args.path === 'season') return {
            contents: 'export const latestLeagueSeason = () => 2025;',
            loader: 'js',
          };
          if (args.path === 'renderers') return {
            contents: [
              'export const buildRivalryViewModel = (teamA, teamB, _games, options) => ({ teamA, teamB, scope: options.scope, seasonRows: [], gameRows: [{}] });',
              'export const renderRivalryHighlightBoard = () => {};',
              'export const renderRivalryHeadline = () => {};',
              'export const renderRivalryLeadMeter = () => {};',
              'export const renderRivalryLeadTrend = () => {};',
              'export const renderRivalryTape = () => {};',
              'export const renderRivalryTimeline = () => {};',
            ].join('\n'),
            loader: 'js',
          };
          if (args.path === 'utils') return {
            contents: 'export const ALL_TEAMS = "__ALL__";',
            loader: 'js',
          };
          if (args.path === 'disclosure') return {
            contents: [
              'export const createSectionDisclosure = () => ({',
              '  update: value => { globalThis.__rivalryDisclosureUpdate = value; },',
              '  dispose: () => { globalThis.__rivalryDisclosureDisposed = true; },',
              '});',
            ].join('\n'),
            loader: 'js',
          };
          if (args.path === 'tables') return {
            contents: 'export const registerRivalryTables = () => {};',
            loader: 'js',
          };
          return { contents: '', loader: 'css' };
        });
      },
    }],
  });
  ({ createFeatureController } = await import(`${pathToFileURL(outfile).href}?${Date.now()}`));
});

test.after(() => fs.rmSync(directory, { recursive: true, force: true }));

function fixture({ favorite = null, owners = ['Alpha', 'Beta'], elements = true } = {}) {
  const scopeSelect = {
    value: '',
    addEventListener(_type, listener) { this.listener = listener; },
  };
  const teamASelect = { value: '' };
  const teamBSelect = { value: '' };
  const calls = { headers: [], themes: [], routes: [], tables: [] };
  const context = {
    data: { leagueGames: [], seasonSummaries: [], currentSeason: null, rivalries: [] },
    document: {
      getElementById(id) {
        if (!elements) return null;
        if (id === 'rivalrySectionNav') return {};
        if (id === 'rivalryScopeSelect') return scopeSelect;
        if (id === 'rivalryTeamA') return teamASelect;
        if (id === 'rivalryTeamB') return teamBSelect;
        if (id.endsWith('Disclosure')) return { open: false };
        return null;
      },
    },
    ownerPreference: {
      getSnapshot: () => ({ owner: favorite }),
      validOwners: () => owners,
    },
    header: { feature: (...args) => calls.headers.push(args) },
    theme: { rivalry: (...args) => calls.themes.push(args) },
    router: { update: value => calls.routes.push(value) },
    tables: {
      render: (...args) => calls.tables.push(args),
    },
  };
  return { calls, context, scopeSelect, teamASelect, teamBSelect };
}

function activation(route = {}, reason = 'route') {
  return { signal: new AbortController().signal, route, reason };
}

test('Rivalry controller resolves favorite and first-owner fallbacks', () => {
  const favoriteState = fixture({ favorite: 'Beta' });
  const favoriteController = createFeatureController();
  favoriteController.mount(favoriteState.context);
  favoriteController.activate(activation());
  assert.equal(globalThis.__rivalryControls.selectedTeamA, 'Beta');

  const firstState = fixture();
  const firstController = createFeatureController();
  firstController.mount(firstState.context);
  firstController.activate(activation({ team: '__ALL__' }));
  assert.equal(globalThis.__rivalryControls.selectedTeamA, 'Alpha');

  const emptyState = fixture({ owners: [], elements: false });
  const emptyController = createFeatureController();
  emptyController.mount(emptyState.context);
  emptyController.activate(activation());
  assert.equal(globalThis.__rivalryControls.selectedTeamA, '');
});

test('Rivalry controller handles controls, table context, scope, preservation, and disposal', () => {
  globalThis.__rivalryDisclosureDisposed = false;
  const state = fixture();
  const controller = createFeatureController();
  controller.mount(state.context);
  controller.activate(activation({
    team: 'History',
    rivalryTeamB: 'Beta',
    rivalryScope: 'historic',
  }));
  assert.equal(globalThis.__rivalryControls.selectedTeamA, 'History');
  assert.equal(state.scopeSelect.value, 'historic');
  assert.ok(state.calls.tables.length >= 2);

  globalThis.__rivalryControls.onChange({ selectedTeamA: 'Beta', selectedTeamB: 'Alpha' });
  const tableOptions = state.calls.tables.at(-1)[1];
  tableOptions.onContextChange({ rivalryA: 'Alpha', rivalryB: 'Beta' });
  assert.equal(state.teamASelect.value, 'Alpha');
  assert.equal(state.teamBSelect.value, 'Beta');

  state.scopeSelect.value = 'invalid';
  state.scopeSelect.listener();
  assert.equal(state.calls.routes.at(-1).selectedRivalryScope, 'allTime');

  controller.activate(activation({ rivalryTeamA: 'Ignored', rivalryTeamB: 'Ignored' }, 'tab'));
  assert.equal(globalThis.__rivalryControls.selectedTeamA, 'Ignored');
  controller.deactivate();
  const routeCount = state.calls.routes.length;
  globalThis.__rivalryControls.onChange({ selectedTeamA: 'Beta', selectedTeamB: 'Alpha' });
  state.scopeSelect.listener();
  assert.equal(state.calls.routes.length, routeCount);

  controller.dispose();
  assert.equal(globalThis.__rivalryDisclosureDisposed, true);
});
