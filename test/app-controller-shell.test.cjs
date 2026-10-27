const test = require('node:test');
const assert = require('node:assert/strict');
const esbuild = require('esbuild');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

let temp;
let controller;
let coverageBundles;
let featureStatus;
let leagueSelectors;

test.before(async () => {
  temp = fs.mkdtempSync(path.join(os.tmpdir(), 'darling-app-controller-shell-'));
  await esbuild.build({
    entryPoints: [path.join(__dirname, '../src/app/app-controller.ts')],
    outfile: path.join(temp, 'app-controller.js'),
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    logLevel: 'silent',
  });
  controller = await import(`${pathToFileURL(path.join(temp, 'app-controller.js')).href}?${Date.now()}`);

  const bundleRoot = path.join(process.cwd(), 'coverage', 'test-bundles');
  fs.mkdirSync(bundleRoot, { recursive: true });
  coverageBundles = fs.mkdtempSync(path.join(bundleRoot, 'app-services-'));
  const buildService = async (source, output) => {
    const outfile = path.join(coverageBundles, output);
    await esbuild.build({
      entryPoints: [path.join(process.cwd(), source)],
      outfile,
      bundle: true,
      platform: 'node',
      format: 'esm',
      target: 'node20',
      sourcemap: 'inline',
      sourcesContent: true,
      logLevel: 'silent',
    });
    return import(pathToFileURL(outfile).href);
  };
  [featureStatus, leagueSelectors] = await Promise.all([
    buildService('src/app/services/feature-status.ts', 'feature-status.mjs'),
    buildService('src/app/services/league-selectors.ts', 'league-selectors.mjs'),
  ]);
});

test.after(() => {
  fs.rmSync(temp, { recursive: true, force: true });
  fs.rmSync(coverageBundles, { recursive: true, force: true });
});

test('fallback freshness runtime preserves assessment and supports the complete no-op contract', () => {
  const assessment = { state: 'final', detail: 'Season complete' };
  const runtime = controller.createFallbackFreshness(assessment);
  runtime.publish({ ignored: true });
  assert.equal(runtime.current(), null);
  assert.equal(runtime.currentAssessment(), assessment);
  const unsubscribe = runtime.subscribe(() => {});
  assert.equal(typeof unsubscribe, 'function');
  assert.equal(unsubscribe(), undefined);
});

test('canonical owner union includes historical and current-only owners once in locale order', () => {
  const owners = controller.canonicalOwners({
    seasonSummaries: [{ owner: ' Zubs ' }, { owner: 'Joel' }],
    leagueGames: [{ teamA: 'Joe', teamB: 'Joel' }, { teamA: '', teamB: 'Joe' }],
    currentSeason: { teams: [{ owner: 'Expansion' }, { owner: 'Joel' }] },
  });
  assert.deepEqual(owners, ['Expansion', 'Joe', 'Joel', 'Zubs']);
});

class ElementStub {
  constructor(id = '') {
    this.id = id;
    this.dataset = {};
    this.attributes = {};
    this.children = [];
    this.hidden = true;
    this.className = '';
    this.inert = false;
    this.textContent = '';
    this.listeners = {};
    this.classList = { add: () => {}, remove: () => {} };
  }
  setAttribute(name, value) { this.attributes[name] = value; }
  removeAttribute(name) { delete this.attributes[name]; }
  append(...children) { this.children.push(...children); }
  prepend(child) { this.children.unshift(child); }
  querySelector() { return this.message || null; }
  remove() { this.removed = true; }
  addEventListener(name, callback, options) { this.listeners[name] = { callback, options }; }
  click() { this.listeners.click?.callback(); }
}

function makeDocument() {
  const status = new ElementStub('appStatus');
  const panels = new Map(['history', 'current'].map(id => [`page-${id}`, new ElementStub(`page-${id}`)]));
  return {
    status,
    panels,
    getElementById(id) { return id === 'appStatus' ? status : panels.get(id) || null; },
    createElement() { return new ElementStub(); },
  };
}

test('feature status service reports data and feature loading, recovery, and retry states', () => {
  const doc = makeDocument();
  const service = featureStatus.createFeatureStatusService(doc);
  const panel = doc.panels.get('page-history');
  let retried = 0;

  service.dataLoading();
  assert.equal(doc.status.hidden, false);
  assert.match(doc.status.textContent, /Loading league data/);
  service.dataError(Object.assign(new Error('changed payload'), { code: 'INTEGRITY_MISMATCH' }));
  assert.match(doc.status.textContent, /Could not verify league data/);
  service.dataError('offline');
  assert.match(doc.status.textContent, /offline/);
  service.clearGlobal();
  assert.equal(doc.status.hidden, true);

  service.loading('history', 'History');
  assert.equal(panel.dataset.featureState, 'loading');
  assert.equal(panel.attributes['aria-busy'], 'true');
  assert.equal(panel.inert, true);
  assert.match(doc.status.textContent, /Loading History/);

  panel.message = new ElementStub();
  service.ready('history');
  assert.equal(panel.message.removed, true);
  assert.equal(panel.dataset.featureState, 'ready');
  assert.equal(panel.inert, false);
  assert.equal('aria-busy' in panel.attributes, false);

  service.error('history', 'History', new Error('bad schema'), () => { retried += 1; });
  const alert = panel.children[0];
  assert.equal(alert.attributes.role, 'alert');
  assert.match(alert.children[0], /bad schema/);
  assert.equal(alert.children[1].textContent, 'Retry');
  assert.deepEqual(alert.children[1].listeners.click.options, { once: true });
  alert.children[1].click();
  assert.equal(retried, 1);
  assert.equal(doc.status.hidden, true);

  service.loading('missing', 'Missing');
  service.ready('missing');
  service.error('missing', 'Missing', 'failure', () => {});
});

test('feature status tolerates a document without the global status banner', () => {
  const service = featureStatus.createFeatureStatusService({ getElementById: () => null, createElement: () => new ElementStub() });
  assert.doesNotThrow(() => service.dataLoading());
  assert.doesNotThrow(() => service.dataError('offline'));
  assert.doesNotThrow(() => service.clearGlobal());
});

test('league selectors memoize derived datasets by their selection keys', () => {
  const games = [
    { season: 2025, date: '2025-09-07', teamA: 'Joe', teamB: 'Joel', scoreA: 150, scoreB: 100, type: 'Regular', round: '' },
    { season: 2025, date: '2025-09-14', teamA: 'Joe', teamB: 'Joel', scoreA: 80, scoreB: 90, type: 'Regular', round: '' },
    { season: 2025, date: '2025-09-21', teamA: 'Joe', teamB: 'Joel', scoreA: 130, scoreB: 120, type: 'Playoff', round: 'Final' },
    { season: 2025, date: '2025-09-28', teamA: 'Joe', teamB: 'Shap', scoreA: 100, scoreB: 110, type: 'Saunders', round: 'Final' },
  ];
  const selectors = leagueSelectors.createLeagueSelectors({
    leagueGames: games,
    seasonSummaries: [{ owner: 'Joe', season: 2025 }, { owner: 'Ghost', season: 2025 }],
  });

  const aggregates = selectors.seasonAggregates();
  assert.equal(aggregates, selectors.seasonAggregates());
  assert.deepEqual(aggregates.find(row => row.team === 'Joe'), {
    team: 'Joe', season: 2025, w: 1, l: 1, t: 0, n: 2, pf: 230, pa: 190,
    actWins: 1, expWins: 1, pct: 0.5, ppg: 115, oppg: 95, luck: 0, diff: 40,
  });
  assert.equal(aggregates.find(row => row.team === 'Ghost').n, 0);
  const awards = selectors.weeklyAwards();
  assert.equal(awards, selectors.weeklyAwards());
  assert.deepEqual(awards.high150, [{ team: 'Joe', count: 1 }]);
  assert.deepEqual(selectors.teams(), ['Joe', 'Joel', 'Shap']);
  assert.equal(selectors.teams(), selectors.teams());
  assert.equal(selectors.headToHeadPairs(), selectors.headToHeadPairs());
  assert.deepEqual(selectors.headToHeadPairs(), []);
  assert.notEqual(selectors.headToHeadPairs(), selectors.headToHeadPairs(2));
  const joePair = selectors.headToHeadPairs(2).find(pair => pair.team === 'Joe' && pair.opp === 'Joel');
  assert.deepEqual({ games: joePair.g, wins: joePair.w, losses: joePair.l }, { games: 3, wins: 2, losses: 1 });
  const regularSeasons = selectors.teamSeasons();
  assert.equal(regularSeasons, selectors.teamSeasons());
  const joeRegular = regularSeasons.find(row => row.owner === 'Joe');
  assert.deepEqual({ games: joeRegular.wins + joeRegular.losses, wins: joeRegular.wins }, { games: 2, wins: 1 });
  assert.notEqual(regularSeasons, selectors.teamSeasons(true));
  const joeIncludingPostseason = selectors.teamSeasons(true).find(row => row.owner === 'Joe');
  assert.deepEqual(
    { games: joeIncludingPostseason.wins + joeIncludingPostseason.losses, wins: joeIncludingPostseason.wins },
    { games: 3, wins: 2 },
  );
});
