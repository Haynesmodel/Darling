const test = require('node:test');
const assert = require('node:assert/strict');
const esbuild = require('esbuild');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const loreAsset = JSON.parse(fs.readFileSync(path.join(__dirname, '../assets/LeagueLore.json')));

let temp;
let search;
let navigation;

test.before(async () => {
  const coverageBundles = path.join(process.cwd(), 'coverage', 'test-bundles');
  fs.mkdirSync(coverageBundles, { recursive: true });
  temp = fs.mkdtempSync(path.join(coverageBundles, 'search-owner-hub-'));
  const outfile = path.join(temp, 'search-runtime.mjs');
  const build = (entryPoint, output) => esbuild.build({
    entryPoints: [entryPoint], outfile: output, bundle: true, platform: 'node', format: 'esm', target: 'node20',
    sourcemap: 'inline', sourcesContent: true, logLevel: 'silent',
  });
  await Promise.all([
    build(path.join(__dirname, '../src/search/search-runtime.ts'), outfile),
    build(path.join(__dirname, '../src/search/search-navigation.ts'), path.join(temp, 'search-navigation.mjs')),
  ]);
  global.window = {
    location: { pathname: '/Darling/' },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    history: { pushState() {} },
  };
  search = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  navigation = await import(`${pathToFileURL(path.join(temp, 'search-navigation.mjs')).href}?${Date.now()}`);
});

test.after(() => {
  delete global.window;
  fs.rmSync(temp, { recursive: true, force: true });
});

function hydrate(runtime) {
  runtime.hydrate({
    leagueGames: [{ season: 2025, date: '2025-09-01', teamA: 'Joe', teamB: 'Shap', scoreA: 100, scoreB: 90 }],
    seasonSummaries: [{ owner: 'Joe', season: 2025 }, { owner: 'Shap', season: 2025 }],
    rivalries: [],
    currentSeason: {
      teams: [
        { owner: 'Joe', display_name: 'Joseph H', sleeper_team_name: 'The Joes' },
        { owner: 'Expansion', display_name: 'New Owner', sleeper_team_name: 'Expansion Club' },
      ],
    },
  });
}

test('exact canonical owner and Sleeper aliases rank the canonical Owner Hub first', () => {
  const runtime = search.createSearchRuntime();
  hydrate(runtime);
  for (const query of ['Joe', 'Joseph H', 'The Joes']) {
    const result = runtime.search(query)[0];
    assert.equal(result.id, 'feature:owner:Joe', query);
    assert.equal(result.title, 'Joe Owner Hub');
    assert.equal(result.action.url, '/Darling/?tab=owner&owner=Joe');
  }
});

test('current-only owners and generic My Team remain searchable without persisting an alias', () => {
  const runtime = search.createSearchRuntime();
  hydrate(runtime);
  assert.equal(runtime.search('Expansion Club')[0].action.url, '/Darling/?tab=owner&owner=Expansion');
  assert.equal(runtime.search('my team')[0].id, 'feature:owner:all');
  const defaults = runtime.search('');
  assert.equal(defaults[0].id, 'feature:current:all');
  assert.equal(defaults[1].id, 'feature:owner:all');
});

test('authored League Lore owner aliases participate in structured owner intents', () => {
  const runtime = search.createSearchRuntime();
  runtime.hydrate({
    leagueGames: [{ season: 2025, date: '2025-09-01', teamA: 'Joe', teamB: 'Shap', scoreA: 100, scoreB: 90 }],
    seasonSummaries: [{ owner: 'Joe', season: 2025 }, { owner: 'Shap', season: 2025 }],
    currentSeason: { teams: [{ owner: 'Joe', display_name: 'Joseph H' }] },
    loreOwnerAliases: [{ owner: 'Joe', aliases: ['The Commissioner'] }],
  });
  assert.equal(runtime.search('The Commissioner owner hub')[0].action.url, '/Darling/?tab=owner&owner=Joe');
  const historical = runtime.search('The Commissioner 2025')[0];
  assert.equal(historical.action.url, '/Darling/?tab=history&team=Joe');
  assert.match(historical.title, /^Joe/);
});

test('exact 42 search ranks the canonical record entry and executes its lore action', () => {
  const runtime = search.createSearchRuntime({ loreAction: action => { runtime.loreAction = action; } });
  runtime.hydrate({
    leagueGames: [{ season: 2019, date: '2019-11-17', teamA: 'Joe', teamB: 'Nuss', scoreA: 42, scoreB: 88 }],
    seasonSummaries: [{ owner: 'Joe', season: 2019 }, { owner: 'Nuss', season: 2019 }],
    currentSeason: null,
    loreDocuments: loreAsset.entries.map(entry => ({ id: `lore:entry:${entry.id}`, category: 'lore', title: entry.title, subtitle: entry.teaser, keywords: [...entry.search_terms, ...entry.owners], priority: 125, action: { kind: 'lore', targetType: 'entry', targetId: entry.id } })).concat(loreAsset.collections.map(collection => ({ id: `lore:collection:${collection.id}`, category: 'lore', title: collection.title, subtitle: collection.summary, keywords: collection.search_terms, priority: 130, action: { kind: 'lore', targetType: 'collection', targetId: collection.id } }))),
  });
  const result = runtime.search('42')[0];
  assert.equal(result.id, 'lore:entry:record-42');
  runtime.execute(result);
  assert.equal(runtime.loreAction.targetId, 'record-42');
});

test('transaction destinations are generic and owner-scoped without transaction data hydration', () => {
  const runtime = search.createSearchRuntime();
  hydrate(runtime);
  assert.equal(runtime.search('transactions')[0].action.url, '/Darling/?tab=transactions');
  assert.equal(runtime.search('trade desk')[0].action.url, '/Darling/?tab=transactions&txView=trades');
  assert.equal(runtime.search('Joe moves')[0].action.url, '/Darling/?tab=transactions&txView=owners&txOwner=Joe');
});

test('search actions cover lore, canonical navigation, theme fallbacks, and export', () => {
  const calls = [];
  global.window.location = { pathname: '/Darling/', search: '?tab=history' };
  global.window.history.pushState = (_state, _title, url) => calls.push(['push', url]);
  global.window.dispatchEvent = event => calls.push(['event', event.type]);
  global.PopStateEvent = class PopStateEvent { constructor(type) { this.type = type; } };
  const fallback = { click: () => calls.push(['fallback-theme']) };
  const exportButton = { click: () => calls.push(['export']) };
  global.document = {
    querySelector: selector => selector.includes('light') ? fallback : null,
    getElementById: id => id === 'exportCsv' ? exportButton : null,
  };

  navigation.executeSearchAction({ kind: 'lore', targetType: 'entry', targetId: 'record-42' }, action => calls.push(['lore', action.targetId]));
  navigation.executeSearchAction({ kind: 'lore', targetType: 'entry', targetId: 'ignored' });
  navigation.executeSearchAction({ kind: 'navigate', url: '/Darling/?tab=trophy' });
  navigation.navigateToSearchUrl('/Darling/?tab=history');
  navigation.executeSearchAction({ kind: 'command', command: 'theme-light' });
  global.window.darlingTheme = { setColorSchemePreference: value => calls.push(['theme', value]) };
  navigation.executeSearchAction({ kind: 'command', command: 'theme-dark' });
  navigation.executeSearchAction({ kind: 'command', command: 'theme-system' });
  navigation.executeSearchAction({ kind: 'command', command: 'export-history' });

  assert.deepEqual(calls, [
    ['lore', 'record-42'],
    ['push', '/Darling/?tab=trophy'], ['event', 'popstate'],
    ['event', 'popstate'],
    ['fallback-theme'], ['theme', 'dark'], ['theme', 'system'], ['export'],
  ]);
  delete global.document;
  delete global.PopStateEvent;
});
