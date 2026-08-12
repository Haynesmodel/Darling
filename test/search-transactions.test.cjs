const test = require('node:test');
const assert = require('node:assert/strict');
const esbuild = require('esbuild');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

let temp;
let search;
let fetches;

test.before(async () => {
  temp = fs.mkdtempSync(path.join(os.tmpdir(), 'darling-search-transactions-'));
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
  fetches = 0;
  global.fetch = async () => {
    fetches += 1;
    throw new Error('search must not fetch transaction data');
  };
  global.window = {
    location: { pathname: '/Darling/' },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    history: { pushState() {} },
  };
  search = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
});

test.after(() => {
  delete global.fetch;
  delete global.window;
  fs.rmSync(temp, { recursive: true, force: true });
});

function runtime(leagueGames = [{
  season: 2025,
  date: '2025-09-01',
  teamA: 'Joe',
  teamB: 'Shap',
  scoreA: 100,
  scoreB: 90,
}]) {
  const value = search.createSearchRuntime();
  value.hydrate({
    leagueGames,
    seasonSummaries: [{ owner: 'Joe', season: 2025 }, { owner: 'Shap', season: 2025 }],
    rivalries: [],
    currentSeason: null,
  });
  return value;
}

test('generic transaction intents build every canonical view without hydrating the asset', () => {
  const value = runtime();
  const expected = new Map([
    ['transactions', '/Darling/?tab=transactions'],
    ['trade desk', '/Darling/?tab=transactions&txView=trades'],
    ['waiver wire', '/Darling/?tab=transactions&txView=waivers'],
    ['player journeys', '/Darling/?tab=transactions&txView=players'],
    ['owner activity', '/Darling/?tab=transactions&txView=owners'],
    ['draft and keepers', '/Darling/?tab=transactions&txView=draft'],
  ]);
  for (const [query, url] of expected) {
    assert.equal(value.search(query)[0].action.url, url, query);
  }
  assert.equal(fetches, 0);
});

test('owner moves use the canonical owner and preserve neutral transactions', () => {
  const value = runtime();
  assert.equal(
    value.search('Joe moves')[0].action.url,
    '/Darling/?tab=transactions&txView=owners&txOwner=Joe',
  );
  assert.equal(value.search('transactions')[0].action.url, '/Darling/?tab=transactions');
  assert.equal(fetches, 0);
});

test('lowest-score search excludes the outlier from the returned record', () => {
  const target = { season: 2022, date: '2022-12-24', teamA: 'Joel', teamB: 'Plot', scoreA: 6.5, scoreB: 4.6, type: 'Saunders', round: 'Saunders Final' };
  const other = { season: 2022, date: '2022-12-23', teamA: 'Joe', teamB: 'Shap', scoreA: 100, scoreB: 90, type: 'Regular', round: '' };
  const result = runtime([target, other]).search('lowest score')[0];
  assert.equal(result.title, 'Lowest score');
  assert.match(result.subtitle, /90\.00/);
  assert.doesNotMatch(result.subtitle, /4\.60/);
});
