const test = require('node:test');
const assert = require('node:assert/strict');
const esbuild = require('esbuild');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

let temp;
let search;

test.before(async () => {
  temp = fs.mkdtempSync(path.join(os.tmpdir(), 'darling-search-owner-hub-'));
  const outfile = path.join(temp, 'search-runtime.mjs');
  await esbuild.build({
    entryPoints: [path.join(__dirname, '../src/search/search-runtime.ts')],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    logLevel: 'silent',
  });
  global.window = {
    location: { pathname: '/Darling/' },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    history: { pushState() {} },
  };
  search = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
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

test('transaction destinations are generic and owner-scoped without transaction data hydration', () => {
  const runtime = search.createSearchRuntime();
  hydrate(runtime);
  assert.equal(runtime.search('transactions')[0].action.url, '/Darling/?tab=transactions');
  assert.equal(runtime.search('trade desk')[0].action.url, '/Darling/?tab=transactions&txView=trades');
  assert.equal(runtime.search('Joe moves')[0].action.url, '/Darling/?tab=transactions&txView=owners&txOwner=Joe');
});
