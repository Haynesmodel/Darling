import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as core from '../js/core-helpers.js';
import * as data from '../js/data-helpers.js';
import * as stats from '../js/stats-helpers.js';
import * as render from '../js/render-helpers.js';
import * as historyRenderers from '../js/history-renderers.js';
import * as leagueRenderers from '../js/league-renderers.js';
import * as facets from '../js/facet-helpers.js';
import * as state from '../js/state-helpers.js';

const root = process.cwd();
const assets = path.join(root, 'assets');
const h2hPath = path.join(assets, 'H2H.json');
const seasonPath = path.join(assets, 'SeasonSummary.json');
const rivalPath = path.join(assets, 'Rivalries.json');
const {
  canonicalGameKey,
  dedupeGames,
  deriveWeeksInPlace,
  computeRegularSeasonChampYears,
  sum,
  unique,
  byDateAsc,
  byDateDesc,
  fmtPct,
  csvEscape,
  normType,
  normRound,
  sidesForTeam,
  isSaundersGame,
  isRegularGame,
  isPlayoffGame,
  roundOrder,
  isRestrictive,
} = core;
const {
  teamOptions,
  seasonOptions,
  weekOptions,
  opponentOptions,
  typeOptions,
  roundOptionsOrdered,
} = facets;
const {
  parseUrlState,
  buildUrlFromState,
  applyFacetFilters,
  buildHistoryCsvText,
} = state;
const {
  normalizeLeagueGame,
  normalizeSeasonSummary,
  normalizeRivalry,
  validateLeagueGames,
  validateSeasonSummaries,
  validateRivalries,
  validateLeagueAssetBundle,
  loadLeagueAssets,
} = data;
const {
  computeSubThresholdGamesPerTeam,
  collectStreakRunsForTeam,
  bestStreakForTeam,
  computeLongestTeamStreaks,
  expectedWinScoreIndex,
  computeExpectedWinForGame,
  computeSeasonAggregatesAllTeams,
  computeHeadToHeadPairs,
  computeWeeklyAwards,
  computeTeamsFromLeagueGames,
  computeLeagueRowsSingleWeeks,
  computeTopNWeeklyScoresAllTeams,
  computeBottomNWeeklyScoresAllTeams,
  computeLongestStreaksGlobal,
  computeLuckSummary,
} = stats;
const {
  nfmt,
  fmtTrimmed,
  escapeHtml,
  headerBannerHtml,
  facetControlHtml,
} = render;
const {
  buildLeagueFunFactsAllTeamsViewModel,
  buildTeamFunFactsViewModel,
  leagueSummaryTablesHtml,
  leagueFunFactsAllTeamsHtml,
  leagueFunListsAllTeamsHtml,
  teamFunFactsView,
} = leagueRenderers;
const {
  buildTopHighlightsViewModel,
  buildSeasonCalloutViewModel,
  historyGamesTableRowHtml,
  historyGamesTableHtml,
  weekByWeekRows,
  weekByWeekTableHtml,
  seasonRecapOutcome,
  seasonRecapRows,
  seasonRecapTableHtml,
  avgFinishForTeam,
  topHighlightsHtml,
  seasonSummaryLookup,
  seasonCalloutView,
  groupMatched,
  exactSetMatch,
  isFxEligible,
  aggregateVsOpps,
  opponentBreakdownRows,
  opponentBreakdownTableHtml,
  opponentBreakdownView,
} = historyRenderers;

function readJson(p){
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function isNum(x){
  return Number.isFinite(+x);
}

function isThirdPlace(g){
  return String(g.round || '').toLowerCase().includes('third place');
}

function isSaunders(g){
  const t = String(g.type || '').toLowerCase();
  const r = String(g.round || '').toLowerCase();
  return t === 'saunders' || r.includes('saunders');
}

function isPlayoff(g){
  const t = String(g.type || '').toLowerCase();
  return t && t !== 'regular' && !isSaunders(g);
}

function isRegular(g){
  return String(g.type || '').toLowerCase() === 'regular';
}

function mockJsonResponse(body, opts = {}) {
  return {
    ok: opts.ok ?? true,
    status: opts.status || 200,
    async json() {
      if (opts.rejectJson) throw new Error('bad json');
      return body;
    },
  };
}

function validSeasonRow(overrides = {}) {
  return {
    season: 2025,
    owner: 'Joe',
    wins: 10,
    losses: 4,
    ties: 0,
    finish: 1,
    playoff_wins: 2,
    playoff_losses: 0,
    saunders_wins: 0,
    saunders_losses: 0,
    ...overrides,
  };
}

test('assets JSON loads', () => {
  assert.ok(fs.existsSync(h2hPath));
  assert.ok(fs.existsSync(seasonPath));
  assert.ok(fs.existsSync(rivalPath));

  const h2h = readJson(h2hPath);
  const seasons = readJson(seasonPath);
  const rivals = readJson(rivalPath);

  assert.ok(Array.isArray(h2h));
  assert.ok(Array.isArray(seasons));
  assert.ok(Array.isArray(rivals));
});

test('H2H rows have required shape', () => {
  const h2h = readJson(h2hPath);
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  for (const [i, g] of h2h.entries()){
    assert.ok(g && typeof g === 'object');
    assert.ok(isNum(g.season), `row ${i} missing season`);
    assert.ok(typeof g.date === 'string' && dateRe.test(g.date), `row ${i} invalid date`);
    assert.ok(typeof g.teamA === 'string' && g.teamA, `row ${i} missing teamA`);
    assert.ok(typeof g.teamB === 'string' && g.teamB, `row ${i} missing teamB`);
    assert.ok(isNum(g.scoreA), `row ${i} missing scoreA`);
    assert.ok(isNum(g.scoreB), `row ${i} missing scoreB`);
    assert.ok(isNum(g.week) || g.week === null || g.week === '', `row ${i} missing week`);
    assert.ok(typeof g.type === 'string' && g.type, `row ${i} missing type`);
    assert.ok(g.scoreA >= 0 && g.scoreB >= 0, `row ${i} negative score`);
  }
});

test('SeasonSummary rows have required shape', () => {
  const seasons = readJson(seasonPath);
  for (const [i, r] of seasons.entries()){
    assert.ok(r && typeof r === 'object');
    assert.ok(isNum(r.season), `row ${i} missing season`);
    assert.ok(typeof r.owner === 'string' && r.owner, `row ${i} missing owner`);
    assert.ok(isNum(r.wins), `row ${i} missing wins`);
    assert.ok(isNum(r.losses), `row ${i} missing losses`);
    assert.ok(isNum(r.ties), `row ${i} missing ties`);
    if (r.finish !== null && r.finish !== undefined){
      assert.ok(isNum(r.finish), `row ${i} finish must be number or null`);
    }
    assert.ok(isNum(r.playoff_wins), `row ${i} missing playoff_wins`);
    assert.ok(isNum(r.playoff_losses), `row ${i} missing playoff_losses`);
    assert.ok(isNum(r.saunders_wins), `row ${i} missing saunders_wins`);
    assert.ok(isNum(r.saunders_losses), `row ${i} missing saunders_losses`);
  }
});

test('H2H has no duplicate games (canonical key)', () => {
  const h2h = readJson(h2hPath);
  const seen = new Set();
  for (const g of h2h){
    const key = canonicalGameKey(g);
    assert.ok(!seen.has(key), `duplicate game: ${key}`);
    seen.add(key);
  }
});

test('dedupeGames removes canonical duplicates', () => {
  const a = {
    season: 2025,
    date: '2025-10-05',
    type: 'Regular',
    round: null,
    teamA: 'Joe',
    teamB: 'Shap',
    scoreA: 111.2,
    scoreB: 98.4,
  };
  const b = { ...a };
  const c = { ...a, date: '2025-10-12', scoreA: 120.1 };
  const out = dedupeGames([a, b, c]);
  assert.equal(out.length, 2);
  assert.equal(out[0], a);
  assert.equal(out[1], c);
});

test('deriveWeeksInPlace assigns per-team week numbers', () => {
  const games = [
    {
      season: 2025,
      date: '2025-09-07',
      teamA: 'Joe',
      teamB: 'Shap',
      scoreA: 100,
      scoreB: 90,
    },
    {
      season: 2025,
      date: '2025-09-14',
      teamA: 'Joe',
      teamB: 'Nuss',
      scoreA: 110,
      scoreB: 80,
    },
  ];
  const weeks = deriveWeeksInPlace(games);
  assert.deepEqual([...weeks], [1, 2]);
  assert.equal(games[0]._weekByTeam.Joe, 1);
  assert.equal(games[1]._weekByTeam.Joe, 2);
  assert.equal(games[0]._weekByTeam.Shap, 1);
  assert.equal(games[1]._weekByTeam.Nuss, 1);
});

test('loadLeagueAssets fetches, dedupes, and derives weeks', async () => {
  const game = {
    season: 2025,
    date: '2025-09-07',
    teamA: 'Joe',
    teamB: 'Shap',
    scoreA: 100,
    scoreB: 90,
    week: 1,
    type: 'Regular',
    round: '',
  };
  const responses = new Map([
    ['assets/H2H.json', mockJsonResponse([game, { ...game }])],
    ['assets/SeasonSummary.json', mockJsonResponse([validSeasonRow({ season: 2025, owner: 'Joe', wins: 10, finish: 1 })])],
    ['assets/Rivalries.json', mockJsonResponse([{ name: ' Originals ', members: [' Joe ', ' Shap '], note: ' Founders ' }])],
  ]);
  const loaded = await loadLeagueAssets({
    fetchFn: async (url) => responses.get(url),
    logger: { warn() {} },
  });

  assert.equal(loaded.rawGames.length, 2);
  assert.equal(loaded.leagueGames.length, 1);
  assert.deepEqual([...loaded.derivedWeeksSet], [1]);
  assert.equal(loaded.leagueGames[0]._weekByTeam.Joe, 1);
  assert.equal(loaded.rawGames[0].season, 2025);
  assert.equal(loaded.rawGames[0].teamA, 'Joe');
  assert.equal(loaded.rawGames[0].scoreA, 100);
  assert.equal(loaded.rawGames[0].round, '');
  assert.equal(loaded.rawGames[0].week, 1);
  assert.deepEqual(loaded.seasonSummaries, [validSeasonRow({ owner: 'Joe' })]);
  assert.deepEqual(loaded.rivalries, [{ name: 'Originals', members: ['Joe', 'Shap'], note: 'Founders' }]);
});

test('asset normalizers coerce imported rows into canonical shapes', () => {
  assert.deepEqual(
    normalizeLeagueGame({
      season: '2025',
      date: ' 2025-09-07 ',
      teamA: ' Joe ',
      teamB: ' Shap ',
      scoreA: '100.5',
      scoreB: '90',
      week: '',
      type: ' Regular ',
      round: null,
    }),
    {
      season: 2025,
      date: '2025-09-07',
      teamA: 'Joe',
      teamB: 'Shap',
      scoreA: 100.5,
      scoreB: 90,
      week: null,
      type: 'Regular',
      round: '',
    }
  );
  assert.deepEqual(
    normalizeSeasonSummary(validSeasonRow({ season: '2025', owner: ' Joe ', wins: '10', finish: '', bagels_earned: '2' })),
    validSeasonRow({ season: 2025, owner: 'Joe', wins: 10, finish: null, bagels_earned: 2 })
  );
  assert.deepEqual(
    normalizeRivalry({ name: ' Rivals ', members: [' Joe ', ' Shap '], type: ' group ', slug: ' rivals ', note: ' Legacy ' }),
    { name: 'Rivals', members: ['Joe', 'Shap'], type: 'group', slug: 'rivals', note: 'Legacy' }
  );
});

test('asset validation accepts optional fields and null-handling cases', () => {
  assert.doesNotThrow(() =>
    validateLeagueAssetBundle({
      h2hRows: [{
        season: 2025,
        date: '2025-09-07',
        teamA: 'Joe',
        teamB: 'Shap',
        scoreA: 100,
        scoreB: 90,
        week: null,
        type: 'Regular',
        round: null,
      }],
      seasonSummaryRows: [{
        season: 2025,
        owner: 'Joe',
        wins: 10,
        losses: 4,
        ties: 0,
        finish: null,
        playoff_wins: 2,
        playoff_losses: 0,
        saunders_wins: 0,
        saunders_losses: 0,
      }],
      rivalriesRows: [{
        name: 'Founders',
        members: ['Joe', 'Shap'],
        note: '  Legacy  ',
      }],
    })
  );
});

test('loadLeagueAssets defaults to globalThis.fetch', async () => {
  const game = {
    season: 2025,
    date: '2025-09-07',
    teamA: 'Joe',
    teamB: 'Shap',
    scoreA: 100,
    scoreB: 90,
    type: 'Regular',
    round: '',
  };
  const responses = new Map([
    ['assets/H2H.json', mockJsonResponse([game])],
    ['assets/SeasonSummary.json', mockJsonResponse([validSeasonRow()])],
    ['assets/Rivalries.json', mockJsonResponse([{ name: 'Originals', members: ['Joe', 'Shap'] }])],
  ]);
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (url) => responses.get(url);
  try {
    const loaded = await loadLeagueAssets({ logger: { warn() {} } });
    assert.equal(loaded.leagueGames.length, 1);
    assert.equal(loaded.leagueGames[0]._weekByTeam.Joe, 1);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('loadLeagueAssets treats rivalry data as optional', async () => {
  const game = {
    season: 2025,
    date: '2025-09-07',
    teamA: 'Joe',
    teamB: 'Shap',
    scoreA: 100,
    scoreB: 90,
    type: 'Regular',
    round: '',
  };
  const warnings = [];
  const responses = new Map([
    ['assets/H2H.json', mockJsonResponse([game])],
    ['assets/SeasonSummary.json', mockJsonResponse([validSeasonRow()])],
    ['assets/Rivalries.json', mockJsonResponse([], { ok: false, status: 404 })],
  ]);
  const loaded = await loadLeagueAssets({
    fetchFn: async (url) => responses.get(url),
    logger: { warn(msg) { warnings.push(msg); } },
  });

  assert.deepEqual(loaded.rivalries, []);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /Rivalries\.json missing/);
});

test('loadLeagueAssets fails clearly when required data is unavailable', async () => {
  const responses = new Map([
    ['assets/H2H.json', mockJsonResponse([], { ok: false, status: 500 })],
    ['assets/SeasonSummary.json', mockJsonResponse([])],
    ['assets/Rivalries.json', mockJsonResponse([])],
  ]);

  await assert.rejects(
    loadLeagueAssets({
      fetchFn: async (url) => responses.get(url),
      logger: { warn() {} },
    }),
    /Could not load assets\/H2H\.json: HTTP 500/
  );
});

test('data validators reject invalid league asset rows', async () => {
  assert.throws(
    () => validateLeagueGames([{ season: 2025, date: 'not-a-date', teamA: 'Joe', teamB: 'Shap', scoreA: 1, scoreB: 2, type: 'Regular' }], 'H2H'),
    /H2H row 0 invalid date/
  );
  assert.throws(
    () => validateLeagueGames([{ season: null, date: '2025-09-07', teamA: 'Joe', teamB: 'Shap', scoreA: 1, scoreB: 2, type: 'Regular' }], 'H2H'),
    /H2H row 0 missing numeric season/
  );
  assert.throws(
    () => validateLeagueGames([{ season: 2025, date: '2025-09-07', teamA: 'Joe', teamB: 'Shap', scoreA: '', scoreB: 2, type: 'Regular' }], 'H2H'),
    /H2H row 0 missing numeric scoreA/
  );
  assert.throws(
    () => validateSeasonSummaries([{ ...validSeasonRow(), wins: 'ten' }], 'SeasonSummary'),
    /SeasonSummary row 0 missing numeric wins/
  );
  assert.throws(
    () => validateSeasonSummaries([{ ...validSeasonRow(), wins: null }], 'SeasonSummary'),
    /SeasonSummary row 0 missing numeric wins/
  );
  assert.throws(
    () => validateRivalries([{ name: 'Bad', members: ['Joe'] }], 'Rivalries'),
    /Rivalries row 0 members must contain at least two team names/
  );

  const game = {
    season: 2025,
    date: '2025-09-07',
    teamA: 'Joe',
    teamB: 'Shap',
    scoreA: 100,
    scoreB: 90,
    type: 'Regular',
    round: '',
  };
  const responses = new Map([
    ['assets/H2H.json', mockJsonResponse([game])],
    ['assets/SeasonSummary.json', mockJsonResponse([validSeasonRow()])],
    ['assets/Rivalries.json', mockJsonResponse([{ name: 'Bad', members: ['Joe'] }])],
  ]);

  await assert.rejects(
    loadLeagueAssets({
      fetchFn: async (url) => responses.get(url),
      logger: { warn() {} },
    }),
    /assets\/Rivalries\.json row 0 members/
  );
});

test('computeRegularSeasonChampYears returns seasons where owner tied for most wins', () => {
  const summaries = [
    { season: 2024, owner: 'Joe', wins: 9 },
    { season: 2024, owner: 'Shap', wins: 8 },
    { season: 2025, owner: 'Joe', wins: 7 },
    { season: 2025, owner: 'Shap', wins: 7 },
    { season: 2025, owner: 'Nuss', wins: 5 },
  ];
  assert.deepEqual(computeRegularSeasonChampYears('Joe', summaries), [2024, 2025]);
  assert.deepEqual(computeRegularSeasonChampYears('Nuss', summaries), []);
});

test('unique preserves first-seen order without duplicates', () => {
  assert.deepEqual(unique(['Joe', 'Shap', 'Joe', 'Nuss', 'Shap']), ['Joe', 'Shap', 'Nuss']);
});

test('basic shared helpers behave consistently', () => {
  assert.equal(sum([1, 2, 3, 4]), 10);
  assert.deepEqual(
    [{ date: '2025-10-12' }, { date: '2025-09-07' }].sort(byDateAsc),
    [{ date: '2025-09-07' }, { date: '2025-10-12' }]
  );
  assert.deepEqual(
    [{ date: '2025-09-07' }, { date: '2025-10-12' }].sort(byDateDesc),
    [{ date: '2025-10-12' }, { date: '2025-09-07' }]
  );
  assert.equal(fmtPct(7, 2, 1), '75.0%');
  assert.equal(csvEscape('Joe "The Boss"'), 'Joe ""The Boss""');
  assert.equal(normType(''), 'Regular');
  assert.equal(normRound(null), '');
  assert.equal(roundOrder('Saunders Final'), 2);
});

test('isRestrictive only flags partial selections', () => {
  assert.equal(isRestrictive(new Set(), ['A', 'B']), false);
  assert.equal(isRestrictive(new Set(['A', 'B']), ['A', 'B']), false);
  assert.equal(isRestrictive(new Set(['A']), ['A', 'B']), true);
  assert.equal(isRestrictive(new Set(['A']), []), false);
});

test('game helpers classify and orient matchups consistently', () => {
  const game = {
    teamA: 'Joe',
    teamB: 'Shap',
    scoreA: 101,
    scoreB: 97,
    type: 'Regular',
    round: '',
  };

  assert.deepEqual(sidesForTeam(game, 'Joe'), { pf: 101, pa: 97, opp: 'Shap', result: 'W' });
  assert.deepEqual(sidesForTeam(game, 'Shap'), { pf: 97, pa: 101, opp: 'Joe', result: 'L' });
  assert.equal(sidesForTeam(game, 'Nuss'), null);
  assert.equal(isRegularGame(game), true);
  assert.equal(isPlayoffGame(game), false);
  assert.equal(isSaundersGame({ ...game, type: 'Saunders' }), true);
  assert.equal(isPlayoffGame({ ...game, type: 'Playoff' }), true);
});

test('stats helpers compute expected wins and season aggregates', () => {
  const games = [
    { season: 2025, date: '2025-09-07', teamA: 'Joe', teamB: 'Shap', scoreA: 100, scoreB: 90, type: 'Regular', round: '' },
    { season: 2025, date: '2025-09-07', teamA: 'Nuss', teamB: 'Singer', scoreA: 80, scoreB: 100, type: 'Regular', round: '' },
    { season: 2025, date: '2025-09-14', teamA: 'Joe', teamB: 'Shap', scoreA: 70, scoreB: 75, type: 'Regular', round: '' },
    { season: 2025, date: '2025-09-21', teamA: 'Joe', teamB: 'Nuss', scoreA: 65, scoreB: 80, type: 'Regular', round: '' },
  ];
  const summaries = [
    { season: 2025, owner: 'Joe' },
    { season: 2025, owner: 'Shap' },
  ];

  assert.equal(computeExpectedWinForGame(games, 'Joe', games[0]), 2.5 / 3);
  assert.equal(computeExpectedWinForGame(games, 'Nuss', games[1]), 0);
  assert.equal(expectedWinScoreIndex(games), expectedWinScoreIndex(games));
  assert.equal(expectedWinScoreIndex(games).get('2025|2025-09-07').length, 4);

  const rows = computeSeasonAggregatesAllTeams(games, summaries);
  const joe = rows.find(r => r.team === 'Joe' && r.season === 2025);
  assert.equal(joe.w, 1);
  assert.equal(joe.l, 2);
  assert.equal(joe.n, 3);
  assert.equal(joe.pf, 235);
  assert.equal(joe.pa, 245);
  assert.equal(joe.ppg, 235 / 3);
  assert.equal(joe.pct, 1 / 3);

  const luck = computeLuckSummary(games, 'Joe', games);
  assert.equal(luck.act, 1);
  assert.equal(luck.exp, 2.5 / 3);
  assert.equal(luck.luck, 1 - (2.5 / 3));
});

test('stats helpers compute league lists and streaks', () => {
  const games = [
    { season: 2025, date: '2025-09-07', teamA: 'Joe', teamB: 'Shap', scoreA: 100, scoreB: 90, type: 'Regular', round: '' },
    { season: 2025, date: '2025-09-07', teamA: 'Nuss', teamB: 'Singer', scoreA: 80, scoreB: 100, type: 'Regular', round: '' },
    { season: 2025, date: '2025-09-14', teamA: 'Joe', teamB: 'Shap', scoreA: 70, scoreB: 75, type: 'Regular', round: '' },
    { season: 2025, date: '2025-09-21', teamA: 'Joe', teamB: 'Nuss', scoreA: 65, scoreB: 80, type: 'Regular', round: '' },
    { season: 2014, date: '2014-12-21', teamA: 'Joe', teamB: 'Shap', scoreA: 200, scoreB: 180, type: 'Playoff', round: 'Final' },
  ];

  assert.deepEqual(computeTeamsFromLeagueGames(games), ['Joe', 'Nuss', 'Shap', 'Singer']);
  assert.deepEqual(computeSubThresholdGamesPerTeam(games, 70), [{ team: 'Joe', count: 1 }]);
  assert.equal(computeLeagueRowsSingleWeeks(games).length, 8);
  assert.equal(computeTopNWeeklyScoresAllTeams(games, 1)[0].team, 'Joe');
  assert.equal(computeBottomNWeeklyScoresAllTeams(games, 1)[0].team, 'Joe');

  const h2h = computeHeadToHeadPairs(games, 1).find(r => r.team === 'Joe' && r.opp === 'Shap');
  assert.equal(h2h.g, 3);
  assert.equal(h2h.w, 2);
  assert.equal(h2h.l, 1);
  assert.equal(h2h.pct, 2 / 3);

  const awards = computeWeeklyAwards(games, 100);
  assert.deepEqual(awards.high150.sort((a, b) => a.team.localeCompare(b.team)), [
    { team: 'Joe', count: 1 },
    { team: 'Singer', count: 1 },
  ]);

  const joeLosses = collectStreakRunsForTeam(games, 'Joe', 'L');
  assert.equal(joeLosses[0].len, 2);
  assert.equal(bestStreakForTeam(games, 'Joe', 'L').len, 2);
  assert.equal(computeLongestTeamStreaks(games, ['Joe', 'Shap'], 'L', 1)[0].team, 'Joe');
  assert.equal(computeLongestStreaksGlobal(games, ['Joe', 'Shap'], 'L', 1)[0].team, 'Joe');
});

test('render helpers format text and build stable markup', () => {
  assert.equal(nfmt(12.345, 1), '12.3');
  assert.equal(nfmt(undefined, 1), '\u2014');
  assert.equal(fmtTrimmed(12), '12.');
  assert.equal(fmtTrimmed(12.3), '12.3');
  assert.equal(escapeHtml('Joe & <Shap> "Nuss"'), 'Joe &amp; &lt;Shap&gt; &quot;Nuss&quot;');

  const banners = headerBannerHtml('Joe', [
    { owner: 'Joe', season: 2024, champion: true, wins: 10 },
    { owner: 'Joe', season: 2025, champion: false, wins: 11 },
    { owner: 'Shap', season: 2025, champion: false, wins: 9 },
  ]);
  assert.match(banners, /banner champ/);
  assert.match(banners, /&#x1f3c6; 2024/);
  assert.match(banners, /&#x1f947; 2025/);

  const facet = facetControlHtml(['A&B', 'Semi Final'], { prefix: 'round' });
  assert.match(facet, /class="round-all"/);
  assert.match(facet, /id="round-all-option"/);
  assert.match(facet, /for="round-option-0"/);
  assert.match(facet, /class="round-cb"/);
  assert.match(facet, /data-value="A%26B"/);
  assert.match(facet, /Semi Final/);
});

test('renderers escape data-driven text before building html', () => {
  const team = 'Joe <Owner>';
  const opp = 'Shap & "Co"';
  const game = {
    season: 2025,
    date: '2025-09-07',
    teamA: team,
    teamB: opp,
    scoreA: 100,
    scoreB: 90,
    type: 'Regular <bad>',
    round: 'Semi & Final',
    _weekByTeam: { [team]: 1, [opp]: 1 },
  };

  const historyHtml = historyGamesTableRowHtml(game, team);
  assert.match(historyHtml, /Shap &amp; &quot;Co&quot;/);
  assert.match(historyHtml, /Regular &lt;bad&gt;/);
  assert.doesNotMatch(historyHtml, /<bad>/);

  const callout = seasonCalloutView(team, {
    seasonSummaries: [{ ...validSeasonRow({ owner: team }) }],
    selectedSeasons: new Set([2025]),
    allTeams: '__ALL__',
    champNoteFn: () => '<unsafe note>',
    saundersNoteFn: () => null,
  }).html;
  assert.match(callout, /Joe &lt;Owner&gt;/);
  assert.match(callout, /&lt;unsafe note&gt;/);
  assert.doesNotMatch(callout, /<unsafe note>/);

  const leagueHtml = leagueSummaryTablesHtml({
    leagueGames: [game],
    seasonSummaries: [{ ...validSeasonRow({ owner: team }) }],
    seasonAggregates: [{ team, w: 1, l: 0, t: 0, n: 1, pf: 100, pa: 90 }],
  });
  assert.match(leagueHtml, /Joe &lt;Owner&gt;/);
  assert.doesNotMatch(leagueHtml, /<Owner>/);
});

test('league renderer view models normalize all-teams fun fact text', () => {
  const vm = buildLeagueFunFactsAllTeamsViewModel({
    seasonAggregates: [
      { team: 'Joe', season: 2025, w: 10, l: 4, t: 0, n: 14, pct: 10 / 14, pf: 1400, pa: 1200, diff: 200 },
      { team: 'Shap', season: 2025, w: 3, l: 11, t: 0, n: 14, pct: 3 / 14, pf: 1050, pa: 1300, diff: -250 },
    ],
    winStreak: { team: 'Joe', len: 6, start: { date: '2025-09-07' }, end: { date: '2025-10-12' } },
    lossStreak: { team: 'Shap', len: 5, start: { date: '2025-09-14' }, end: { date: '2025-10-12' } },
    headToHeadPairs: [
      { team: 'Joe', opp: 'Shap', w: 7, l: 1, t: 0, g: 8, pct: 7 / 8 },
    ],
    topWeeklyScores: [
      { team: 'Joe', opp: 'Shap', pf: 180.25, date: '2025-09-07' },
    ],
  });

  assert.equal(vm.tiles[0].label, 'Best Single-Season Record');
  assert.equal(vm.tiles[0].value, '10-4');
  assert.match(vm.tiles[0].sub, /Joe \u2022 2025 \u2022 71\.4%/);
  assert.match(vm.tiles[4].sub, /Joe \(2025-09-07 \u2192 2025-10-12\)/);
  assert.match(vm.tiles[5].sub, /Shap \(2025-09-14 \u2192 2025-10-12\)/);
  assert.match(vm.tiles[6].sub, /Joe vs Shap/);
  assert.equal(vm.tiles[7].value, '180.25');
});

test('league renderer view models normalize team fun fact text', () => {
  const games = [
    { season: 2025, date: '2025-09-07', teamA: 'Joe', teamB: 'Shap', scoreA: 120, scoreB: 100, type: 'Regular', round: '', _weekByTeam: { Joe: 1, Shap: 1 } },
    { season: 2025, date: '2025-09-14', teamA: 'Joe', teamB: 'Nuss', scoreA: 75, scoreB: 82, type: 'Regular', round: '', _weekByTeam: { Joe: 2, Nuss: 2 } },
  ];
  const vm = buildTeamFunFactsViewModel('Joe', games, {
    seasonSummaries: [{ owner: 'Joe', season: 2025, bye: true }],
    seasonAggregates: [{ team: 'Joe', season: 2025, n: 2, ppg: 97.5, oppg: 91.0 }],
    winStreak: { len: 1, start: { date: '2025-09-07' }, end: { date: '2025-09-07' } },
    lossStreak: { len: 1, start: { date: '2025-09-14' }, end: { date: '2025-09-14' } },
    luckSummary: { act: 1, exp: 1.5, luck: -0.5 },
  });

  assert.equal(vm.facts[0].label, 'Highest Score');
  assert.equal(vm.facts[0].value, '120.00');
  assert.match(vm.facts[0].sub, /2025-09-07 vs Shap/);
  assert.match(vm.facts[3].sub, /2025-09-07 → 2025-09-07/);
  assert.match(vm.facts[8].value, /97\.50/);
  assert.equal(vm.highestGames[0].score, '120.00 – 100.00');
  assert.equal(vm.highestGames[0].opponent, 'Shap');
  assert.equal(vm.lowestGames[0].opponent, 'Nuss');
});

test('league renderer builds all-teams summary tables', () => {
  const seasonAggregates = [
    { team: 'Joe', w: 10, l: 4, t: 0, n: 14, pf: 1400, pa: 1260 },
    { team: 'Shap', w: 7, l: 7, t: 0, n: 14, pf: 1330, pa: 1320 },
    { team: 'Joe', w: 8, l: 6, t: 0, n: 14, pf: 1330, pa: 1290 },
  ];
  const summaries = [
    {
      owner: 'Joe',
      playoff_wins: 2,
      playoff_losses: 0,
      bye: true,
      champion: true,
      saunders_wins: 0,
      saunders_losses: 0,
      saunders: false,
      bagels_earned: 2,
      finish: 1,
    },
    {
      owner: 'Shap',
      playoff_wins: 0,
      playoff_losses: 1,
      bye: false,
      champion: false,
      saunders_wins: 1,
      saunders_losses: 0,
      saunders: true,
      bagels_earned: 1,
      finish: 3,
    },
  ];
  const games = [
    { teamA: 'Joe', teamB: 'Shap', scoreA: 120, scoreB: 100, type: 'Playoff' },
    { teamA: 'Shap', teamB: 'Joe', scoreA: 90, scoreB: 80, type: 'Saunders' },
  ];

  const html = leagueSummaryTablesHtml({
    leagueGames: games,
    seasonSummaries: summaries,
    seasonAggregates,
  });

  assert.match(html, /Regular Season \(All-Time\)/);
  assert.match(html, /<td>Joe<\/td><td>18-10<\/td><td>64\.3%<\/td><td>97\.50<\/td><td>91\.07<\/td>/);
  assert.match(html, /Post Season \(All-Time\)/);
  assert.doesNotMatch(html, /<th scope="col">Bagels<\/th>/);
  assert.match(html, /<td>Joe<\/td><td>2-0<\/td><td>1<\/td><td>1<\/td>\s*<td>120\.00<\/td><td>100\.00<\/td>/);
  assert.match(html, /<td>Shap<\/td><td>0-1<\/td><td>0<\/td><td>0<\/td>\s*<td>100\.00<\/td><td>120\.00<\/td>/);
  assert.match(html, /<td>1-0<\/td><td>1<\/td>/);
  assert.match(html, /Average Finish \(All-Time\)/);
  assert.match(html, /<td>Joe<\/td><td>1\.00<\/td><td>1<\/td>/);
});

test('league renderer builds all-teams fun fact tiles', () => {
  const html = leagueFunFactsAllTeamsHtml({
    seasonAggregates: [
      { team: 'Joe', season: 2025, w: 10, l: 4, t: 0, n: 14, pct: 10 / 14, pf: 1400, pa: 1200, diff: 200 },
      { team: 'Shap', season: 2025, w: 3, l: 11, t: 0, n: 14, pct: 3 / 14, pf: 1050, pa: 1300, diff: -250 },
    ],
    winStreak: { team: 'Joe', len: 6, start: { date: '2025-09-07' }, end: { date: '2025-10-12' } },
    lossStreak: { team: 'Shap', len: 5, start: { date: '2025-09-14' }, end: { date: '2025-10-12' } },
    headToHeadPairs: [
      { team: 'Joe', opp: 'Shap', w: 7, l: 1, t: 0, g: 8, pct: 7 / 8 },
    ],
    topWeeklyScores: [
      { team: 'Joe', opp: 'Shap', pf: 180.25, date: '2025-09-07' },
    ],
  });

  assert.match(html, /Best Single-Season Record/);
  assert.match(html, /<div class="value">10-4<\/div>/);
  assert.match(html, /Joe \u2022 2025 \u2022 71\.4%/);
  assert.match(html, /Worst Season Point Diff/);
  assert.match(html, /-250/);
  assert.match(html, /Joe \(2025-09-07 \u2192 2025-10-12\)/);
  assert.match(html, /Shap \(2025-09-14 \u2192 2025-10-12\)/);
  assert.doesNotMatch(html, /\[object Object\]/);
  assert.match(html, /87\.5%/);
  assert.match(html, /180\.25/);
});

test('league renderer builds all-teams fun list tables', () => {
  const seasonAggregates = [
    { team: 'Joe', season: 2025, w: 10, l: 4, t: 0, n: 14, pct: 10 / 14, ppg: 100, oppg: 85, luck: 1.25 },
    { team: 'Shap', season: 2025, w: 4, l: 10, t: 0, n: 14, pct: 4 / 14, ppg: 80, oppg: 105, luck: -1.5 },
  ];
  const leagueGames = [
    { season: 2025, date: '2025-09-07', teamA: 'Joe', teamB: 'Shap', scoreA: 120, scoreB: 90, type: 'Regular', round: '' },
    { season: 2025, date: '2025-09-14', teamA: 'Joe', teamB: 'Shap', scoreA: 75, scoreB: 82, type: 'Regular', round: '' },
    { season: 2025, date: '2025-12-14', teamA: 'Joe', teamB: 'Shap', scoreA: 130, scoreB: 100, type: 'Playoff', round: 'Final' },
  ];
  const html = leagueFunListsAllTeamsHtml({
    leagueGames,
    seasonSummaries: [{ owner: 'Joe', season: 2025, champion: true }],
    seasonAggregates,
    highs: [{ team: 'Joe', opp: 'Shap', pf: 120, pa: 90, date: '2025-09-07' }],
    lows: [{ team: 'Joe', opp: 'Shap', pf: 75, pa: 82, date: '2025-09-14' }],
    streaks: [{ team: 'Joe', len: 3, start: '2025-09-07', end: '2025-09-21' }],
    streaksLoss: [{ team: 'Shap', len: 2, start: '2025-09-07', end: '2025-09-14' }],
    weeklyAwards: {
      top: [{ team: 'Joe', count: 2 }],
      low: [{ team: 'Shap', count: 2 }],
      high150: [{ team: 'Joe', count: 1 }],
    },
    sub70: [{ team: 'Shap', count: 1 }],
    headToHeadPairs: [{ team: 'Joe', opp: 'Shap', w: 2, l: 1, t: 0, g: 3, pct: 2 / 3 }],
    limit: 10,
  });

  assert.match(html, /Best Regular Seasons/);
  assert.match(html, /<td>Joe<\/td><td>2025<\/td><td>10-4<\/td>/);
  assert.match(html, /Most Dominant Playoff Runs/);
  assert.match(html, /<td>Joe<\/td><td>2025<\/td><td>30\.00<\/td><td>1<\/td>/);
  assert.match(html, /Highest Scoring Performances/);
  assert.match(html, /120\.\u201390\./);
  assert.match(html, /Most Dominant Rivalries/);
  assert.match(html, /66\.7%/);
  assert.match(html, /Lowest Scoring Wins/);
  assert.match(html, /82\.\u201375\./);
  assert.match(html, /Most Consecutive Weeks Not Lowest/);
  assert.match(html, /Most Rival Wins/);
});

test('league renderer builds team-specific fun fact view', () => {
  const games = [
    {
      season: 2025,
      date: '2025-09-07',
      teamA: 'Joe',
      teamB: 'Shap',
      scoreA: 160,
      scoreB: 100,
      type: 'Regular',
      round: '',
      _weekByTeam: { Joe: 1, Shap: 1 },
    },
    {
      season: 2025,
      date: '2025-09-14',
      teamA: 'Joe',
      teamB: 'Nuss',
      scoreA: 80,
      scoreB: 100,
      type: 'Regular',
      round: '',
      _weekByTeam: { Joe: 2, Nuss: 2 },
    },
    {
      season: 2025,
      date: '2025-09-21',
      teamA: 'Joe',
      teamB: 'Shap',
      scoreA: 120,
      scoreB: 118,
      type: 'Regular',
      round: '',
      _weekByTeam: { Joe: 3, Shap: 3 },
    },
  ];
  const view = teamFunFactsView('Joe', games, {
    leagueGames: games,
    seasonSummaries: [
      { owner: 'Joe', season: 2025, bye: true, saunders_bye: true },
    ],
    seasonAggregates: [
      { team: 'Joe', season: 2025, n: 14, ppg: 100, oppg: 90 },
      { team: 'Joe', season: 2014, n: 14, ppg: 120, oppg: 80 },
    ],
    winStreak: { len: 2, start: games[0], end: games[2] },
    lossStreak: { len: 1, start: games[1], end: games[1] },
    luckSummary: { exp: 1.5, act: 2, luck: 0.5 },
    blowoutMargin: 29,
    highScoreThreshold: 150,
    closeGameMargin: 5,
  });

  assert.match(view.factsHtml, /Highest Score/);
  assert.match(view.factsHtml, /160\.00/);
  assert.match(view.factsHtml, /Biggest Blowout/);
  assert.match(view.factsHtml, /\+60\.00/);
  assert.match(view.factsHtml, /Biggest Loss/);
  assert.match(view.factsHtml, /-20\.00/);
  assert.match(view.factsHtml, /Wk 1 2025 \u2192 Wk 3 2025/);
  assert.match(view.factsHtml, /Top-Week Crowns/);
  assert.match(view.factsHtml, /Bottom-Week Turds/);
  assert.match(view.factsHtml, /Close Games Record \(&lt;5\)|Close Games Record \(<5\)/);
  assert.match(view.factsHtml, /Most PPG Season/);
  assert.match(view.factsHtml, /2025/);
  assert.match(view.factsHtml, /Luck \(Actual \u2212 Expected\)/);
  assert.match(view.factsHtml, /\+0\.50/);
  assert.match(view.factsHtml, /Years: 2025/);
  assert.match(view.listsHtml, /Top 5 Highest Scoring Games/);
  assert.match(view.listsHtml, /160\.00 \u2013 100\.00/);
  assert.match(view.listsHtml, /Bottom 5 Lowest Scoring Games/);
  assert.match(view.listsHtml, /80\.00 \u2013 100\.00/);
});

test('history renderer builds all-games table html for selected team', () => {
  const games = [
    { season: 2025, date: '2025-09-07', teamA: 'Joe', teamB: 'Shap', scoreA: 100, scoreB: 90, type: 'Regular', round: '' },
    { season: 2025, date: '2025-09-14', teamA: 'Nuss', teamB: 'Joe', scoreA: 80, scoreB: 70, type: 'Playoff', round: 'Semi Final' },
  ];

  const row = historyGamesTableRowHtml(games[0], 'Joe');
  assert.match(row, /result-win/);
  assert.match(row, /100\.00 - 90\.00/);
  assert.match(row, /<td>Shap<\/td>/);

  const html = historyGamesTableHtml('Joe', games, { allTeams: '__ALL__' });
  assert.ok(html.indexOf('2025-09-14') < html.indexOf('2025-09-07'));
  assert.match(html, /result-loss postseason/);
  assert.match(html, /Semi Final/);

  const allHtml = historyGamesTableHtml('__ALL__', games, { allTeams: '__ALL__' });
  assert.match(allHtml, /Select a team to see full game list/);
});

test('history renderer builds week-by-week table html for selected team', () => {
  const allGames = [
    { season: 2025, date: '2025-09-07', teamA: 'Joe', teamB: 'Shap', scoreA: 100, scoreB: 90, type: 'Regular', round: '', _weekByTeam: { Joe: 1, Shap: 1 } },
    { season: 2025, date: '2025-09-07', teamA: 'Nuss', teamB: 'Singer', scoreA: 60, scoreB: 95, type: 'Regular', round: '', _weekByTeam: { Nuss: 1, Singer: 1 } },
    { season: 2025, date: '2025-09-14', teamA: 'Shap', teamB: 'Joe', scoreA: 85, scoreB: 70, type: 'Playoff', round: 'Semi Final', _weekByTeam: { Shap: 2, Joe: 2 } },
  ];
  const filtered = [allGames[0], allGames[2]];

  const rows = weekByWeekRows('Joe', filtered, { allGames });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].date, '2025-09-14');
  assert.equal(rows[0].result, 'L');
  assert.equal(rows[1].isCrown, true);
  assert.equal(rows[1].isTurd, false);
  assert.equal(rows[1].xw, 1);

  const html = weekByWeekTableHtml('Joe', filtered, { allGames, allTeams: '__ALL__' });
  assert.match(html, /result-loss postseason/);
  assert.match(html, /Semi Final/);
  assert.match(html, /&#x1f451;/);
  assert.match(html, /1\.00/);

  const allHtml = weekByWeekTableHtml('__ALL__', filtered, { allGames, allTeams: '__ALL__' });
  assert.match(allHtml, /Select a team to see week-by-week games/);
});

test('history renderer builds season recap html and narratives', () => {
  const summaries = [
    { owner: 'Joe', season: 2025, wins: 10, losses: 4, ties: 0, finish: 1, champion: true, saunders: false, bagels_earned: 2 },
    { owner: 'Joe', season: 2024, wins: 7, losses: 7, ties: 0, finish: 5, champion: false, saunders: false, bye: true },
    { owner: 'Shap', season: 2025, wins: 8, losses: 6, ties: 0, finish: 3, champion: false, saunders: false },
  ];
  const games = [
    { season: 2025, date: '2025-12-14', teamA: 'Joe', teamB: 'Shap', scoreA: 120, scoreB: 100, type: 'Playoff', round: 'Semi Final' },
    { season: 2025, date: '2025-12-21', teamA: 'Nuss', teamB: 'Joe', scoreA: 90, scoreB: 110, type: 'Playoff', round: 'Final' },
  ];

  assert.equal(
    seasonRecapOutcome('Joe', summaries[0], games),
    'Defeated Shap in Semi Final, Defeated Nuss in Final \u2022 Bagels earned \ud83e\udd6f: 2'
  );
  assert.equal(seasonRecapOutcome('Joe', summaries[1], games), 'Top-2 Seed');

  const rows = seasonRecapRows('Joe', summaries, {
    selectedSeasons: new Set([2025]),
    universeSeasons: [2024, 2025],
  });
  assert.deepEqual(rows.map(r => r.season), [2025]);

  const html = seasonRecapTableHtml('Joe', summaries, {
    allGames: games,
    selectedSeasons: new Set([2025]),
    universeSeasons: [2024, 2025],
    allTeams: '__ALL__',
  });
  assert.match(html, /10-4-0/);
  assert.match(html, /71\.4%/);
  assert.match(html, /\ud83d\udc51 Defeated Shap in Semi Final/);

  const allHtml = seasonRecapTableHtml('__ALL__', summaries, { allTeams: '__ALL__' });
  assert.match(allHtml, /Select a team to see season recap/);
});

test('history renderer builds top highlight chips', () => {
  const summaries = [
    { owner: 'Joe', season: 2025, champion: true, saunders: false, wins: 11, finish: 1 },
    { owner: 'Joe', season: 2024, champion: false, saunders: true, wins: 7, finish: 8 },
    { owner: 'Shap', season: 2025, champion: false, saunders: false, wins: 9, finish: 3 },
    { owner: 'Shap', season: 2024, champion: true, saunders: false, wins: 7, finish: 1 },
  ];

  assert.equal(avgFinishForTeam('Joe', summaries), 4.5);

  const html = topHighlightsHtml('Joe', {
    seasonSummaries: summaries,
    allTeams: '__ALL__',
    champNoteFn: (owner, season) => owner === 'Joe' && season === 2025 ? 'note' : null,
    saundersNoteFn: (owner, season) => owner === 'Joe' && season === 2024 ? 'bad bracket' : null,
  });
  assert.match(html, /Darlings/);
  assert.match(html, /Years: 2025\*/);
  assert.match(html, /Saunders/);
  assert.match(html, /Years: 2024\*/);
  assert.match(html, /Regular-Season Titles/);
  assert.match(html, /Years: 2025/);
  assert.match(html, /Avg Finish/);
  assert.match(html, /4\.50/);
  assert.match(html, /2025 \u2014 note/);
  assert.match(html, /2024 \u2014 bad bracket/);

  const allHtml = topHighlightsHtml('__ALL__', { allTeams: '__ALL__', seasonSummaries: summaries });
  assert.match(allHtml, /League view/);
});

test('history renderer view models normalize headline text', () => {
  const summaries = [
    { owner: 'Joe', season: 2025, champion: true, saunders: false, wins: 11, finish: 1 },
    { owner: 'Joe', season: 2024, champion: false, saunders: true, wins: 7, finish: 8 },
  ];
  const vm = buildTopHighlightsViewModel('Joe', {
    seasonSummaries: summaries,
    allTeams: '__ALL__',
    champNoteFn: (owner, season) => owner === 'Joe' && season === 2025 ? 'note' : null,
    saundersNoteFn: (owner, season) => owner === 'Joe' && season === 2024 ? 'bad bracket' : null,
  });
  assert.equal(vm.isLeagueView, false);
  assert.equal(vm.chips[0].title, 'Darlings');
  assert.equal(vm.chips[0].main, '1');
  assert.match(vm.chips[0].sub, /Years: 2025\*/);
  assert.equal(vm.chips[3].main, '4.50');
  assert.match(vm.chips[4].sub, /2025 \u2014 note/);
  assert.match(vm.chips[4].sub, /2024 \u2014 bad bracket/);

  const leagueVm = buildTopHighlightsViewModel('__ALL__', { allTeams: '__ALL__', seasonSummaries: summaries });
  assert.equal(leagueVm.isLeagueView, true);
  assert.match(leagueVm.chips[0].main, /Select a team/);
});

test('history renderer builds season callout view and effect metadata', () => {
  const summaries = [
    {
      owner: 'Joe',
      season: 2025,
      wins: 10,
      losses: 4,
      ties: 0,
      finish: 1,
      champion: true,
      bye: true,
      saunders: false,
      playoff_wins: 2,
      playoff_losses: 0,
    },
  ];

  assert.equal(seasonSummaryLookup('Joe', 2025, summaries), summaries[0]);
  const view = seasonCalloutView('Joe', {
    seasonSummaries: summaries,
    selectedSeasons: new Set([2025]),
    allTeams: '__ALL__',
    champNoteFn: () => 'COVID season',
    saundersNoteFn: () => null,
  });
  assert.match(view.html, /Joe in <strong>2025<\/strong>/);
  assert.match(view.html, /Record: <strong>10-4-0<\/strong> \(71\.4%\)/);
  assert.match(view.html, /Champion\*/);
  assert.match(view.html, /Top-2 Seed/);
  assert.match(view.html, /Playoffs: 2-0-0/);
  assert.match(view.html, /2025 \u2014 COVID season/);
  assert.equal(view.effectKey, 'Joe|2025|C');
  assert.equal(view.effectType, 'champion');
  assert.equal(view.resetEffect, false);

  const reset = seasonCalloutView('Joe', {
    seasonSummaries: summaries,
    selectedSeasons: new Set([2024, 2025]),
    allTeams: '__ALL__',
  });
  assert.equal(reset.html, '');
  assert.equal(reset.resetEffect, true);

  const allView = seasonCalloutView('__ALL__', {
    seasonSummaries: summaries,
    selectedSeasons: new Set([2025]),
    allTeams: '__ALL__',
  });
  assert.equal(allView.html, '');
  assert.equal(allView.resetEffect, false);
});

test('history renderer view model normalizes season callout text', () => {
  const summaries = [
    {
      owner: 'Joe',
      season: 2025,
      wins: 10,
      losses: 4,
      ties: 0,
      finish: 1,
      champion: true,
      bye: true,
      saunders: false,
      playoff_wins: 2,
      playoff_losses: 0,
    },
  ];
  const vm = buildSeasonCalloutViewModel('Joe', {
    seasonSummaries: summaries,
    selectedSeasons: new Set([2025]),
    allTeams: '__ALL__',
    champNoteFn: () => 'COVID season',
    saundersNoteFn: () => null,
  });
  assert.equal(vm.show, true);
  assert.equal(vm.record, '10-4-0');
  assert.equal(vm.pct, '71.4%');
  assert.equal(vm.finish, '1');
  assert.match(vm.bits.join(' \u2022 '), /Champion/);
  assert.match(vm.notes.join(' \u2022 '), /2025 \u2014 COVID season/);
  assert.equal(vm.effectKey, 'Joe|2025|C');
  assert.equal(vm.effectType, 'champion');
});

test('history renderer builds opponent breakdown rows and rivalry metadata', () => {
  const games = [
    {
      season: 2025,
      date: '2025-09-07',
      teamA: 'Joe',
      teamB: 'Shap',
      scoreA: 100,
      scoreB: 90,
      type: 'Regular',
      round: '',
      _weekByTeam: { Joe: 1, Shap: 1 },
    },
    {
      season: 2025,
      date: '2025-09-14',
      teamA: 'Joe',
      teamB: 'Nuss',
      scoreA: 80,
      scoreB: 70,
      type: 'Regular',
      round: '',
      _weekByTeam: { Joe: 2, Nuss: 2 },
    },
    {
      season: 2025,
      date: '2025-09-21',
      teamA: 'Shap',
      teamB: 'Nuss',
      scoreA: 75,
      scoreB: 85,
      type: 'Regular',
      round: '',
      _weekByTeam: { Shap: 2, Nuss: 3 },
    },
  ];
  const rivalries = [
    { name: 'Rivals', type: 'group', members: ['Joe', 'Shap', 'Nuss'], slug: 'rivals' },
    { name: 'Pair', type: 'pair', members: ['Singer', 'Nuss'], slug: 'singer-nuss' },
  ];
  const selectedOpponents = new Set(['Shap', 'Nuss']);

  assert.equal(groupMatched(['Joe', 'Shap', 'Nuss'], selectedOpponents, 'Joe'), true);
  assert.equal(exactSetMatch(['Joe', 'Shap', 'Nuss'], selectedOpponents, 'Joe'), true);
  assert.equal(isFxEligible(rivalries[0]), true);
  assert.equal(isFxEligible(rivalries[1]), true);

  const agg = aggregateVsOpps('Joe', games, ['Shap', 'Nuss']);
  assert.deepEqual(agg, { w: 2, l: 0, t: 0, n: 2, ppg: 90, oppg: 80 });

  const rows = opponentBreakdownRows('Joe', games, { allTeams: '__ALL__' });
  assert.deepEqual(rows.map(r => r.label), ['Nuss', 'Shap']);
  assert.equal(rows[0].w, 1);
  assert.equal(rows[0].ppg, 80);

  const html = opponentBreakdownTableHtml('Joe', games, { allTeams: '__ALL__' });
  assert.match(html, /Nuss/);
  assert.match(html, /1-0-0/);
  assert.match(html, /100\.0%/);

  const view = opponentBreakdownView('Joe', games, {
    allTeams: '__ALL__',
    rivalries,
    selectedOpponents,
    universeOpponents: ['Shap', 'Nuss', 'Singer'],
  });
  assert.equal(view.title, 'Opponent Breakdown');
  assert.equal(view.firstCol, 'Opponent');
  assert.match(view.calloutsHtml, /Rivals/);
  assert.match(view.calloutsHtml, /2-0-0/);
  assert.equal(view.triggerSlug, 'rivals');
  assert.equal(view.backdropSlug, 'rivals');

  const allView = opponentBreakdownView('__ALL__', games, {
    allTeams: '__ALL__',
    rivalries,
    selectedOpponents: new Set(['Joe', 'Shap', 'Nuss']),
    universeOpponents: ['Joe', 'Shap', 'Nuss', 'Rishi'],
  });
  assert.equal(allView.title, 'Team Breakdown');
  assert.equal(allView.firstCol, 'Team');
  assert.match(allView.calloutsHtml, /Rivals/);
  assert.equal(allView.triggerSlug, 'rivals');

  const weekRows = opponentBreakdownRows('__ALL__', games, {
    allTeams: '__ALL__',
    selectedWeeks: new Set([1]),
    universeWeeks: [1, 2, 3],
  });
  assert.deepEqual(weekRows.map(r => r.label), ['Joe', 'Shap']);
});

test('facet helpers build predictable option lists', () => {
  const games = [
    { season: 2025, teamA: 'Joe', teamB: 'Shap', type: 'Regular', round: '', date: '2025-09-07' },
    { season: 2024, teamA: 'Nuss', teamB: 'Joe', type: 'Saunders', round: 'Saunders Final', date: '2024-12-15' },
  ];
  const summaries = [
    { owner: 'Joe' },
    { owner: 'Shap' },
  ];
  const weeks = new Set([1, 3, 2]);

  assert.deepEqual(teamOptions(summaries, games, '__ALL__'), [
    { value: '__ALL__', label: 'All Teams (League)' },
    { value: 'Joe', label: 'Joe' },
    { value: 'Nuss', label: 'Nuss' },
    { value: 'Shap', label: 'Shap' },
  ]);
  assert.deepEqual(seasonOptions(games), [2025, 2024]);
  assert.deepEqual(weekOptions(weeks), [1, 2, 3]);
  assert.deepEqual(opponentOptions(games, 'Joe', '__ALL__'), ['Nuss', 'Shap']);
  assert.deepEqual(typeOptions(games), ['Regular', 'Saunders']);
  assert.deepEqual(roundOptionsOrdered(games), ['Saunders Final']);
});

test('url helpers parse and rebuild facet state', () => {
  const parsed = parseUrlState('?team=Joe&seasons=2024,2025&weeks=1,3&opps=Shap&types=Regular&rounds=Semi%20Final');
  assert.equal(parsed.team, 'Joe');
  assert.deepEqual([...parsed.seasons], [2024, 2025]);
  assert.deepEqual([...parsed.weeks], [1, 3]);
  assert.deepEqual([...parsed.opps], ['Shap']);
  assert.deepEqual([...parsed.types], ['Regular']);
  assert.deepEqual([...parsed.rounds], ['Semi Final']);
  assert.equal(parsed.hasAny, true);

  const next = buildUrlFromState({
    selectedTeam: 'Joe',
    selectedSeasons: new Set([2024, 2025]),
    selectedWeeks: new Set([1]),
    selectedOpponents: new Set(['Shap']),
    selectedTypes: new Set(['Regular']),
    selectedRounds: new Set(['Semi Final']),
    universe: {
      seasons: [2023, 2024, 2025],
      weeks: [1, 2],
      opponents: ['Shap', 'Nuss'],
      types: ['Regular'],
      rounds: ['Semi Final', 'Final'],
    },
    pathname: '/index.html',
    allTeams: '__ALL__',
  });
  assert.equal(next, '/index.html?team=Joe&seasons=2024%2C2025&weeks=1&opps=Shap&rounds=Semi+Final');
});

test('url helpers preserve opponent selections with spaces and punctuation', () => {
  const next = buildUrlFromState({
    selectedTeam: 'Joe',
    selectedOpponents: new Set(['The Boss', 'A&B / C+']),
    universe: {
      seasons: [],
      weeks: [],
      opponents: ['The Boss', 'A&B / C+', 'Other'],
      types: [],
      rounds: [],
    },
    pathname: '/index.html',
    allTeams: '__ALL__',
  });
  assert.equal(next, '/index.html?team=Joe&opps=The+Boss%2CA%26B+%2F+C%2B');

  const parsed = parseUrlState(next.slice(next.indexOf('?')));
  assert.deepEqual([...parsed.opps], ['The Boss', 'A&B / C+']);
});

test('applyFacetFilters honors team and facet selections', () => {
  const games = [
    { teamA: 'Joe', teamB: 'Shap', season: 2025, type: 'Regular', round: '', date: '2025-09-07', scoreA: 100, scoreB: 90, _weekByTeam: { Joe: 1, Shap: 1 } },
    { teamA: 'Joe', teamB: 'Nuss', season: 2025, type: 'Regular', round: '', date: '2025-09-14', scoreA: 80, scoreB: 70, _weekByTeam: { Joe: 2, Nuss: 2 } },
    { teamA: 'Shap', teamB: 'Nuss', season: 2024, type: 'Regular', round: '', date: '2024-09-07', scoreA: 77, scoreB: 88, _weekByTeam: { Shap: 1, Nuss: 1 } },
  ];
  const filtered = applyFacetFilters(games, {
    selectedTeam: 'Joe',
    selectedSeasons: new Set([2025]),
    selectedWeeks: new Set([1]),
    selectedOpponents: new Set(['Shap']),
    selectedTypes: new Set(['Regular']),
    selectedRounds: new Set(),
    universe: {
      seasons: [2024, 2025],
      weeks: [1, 2],
      opponents: ['Shap', 'Nuss'],
      types: ['Regular'],
      rounds: [],
    },
    allTeams: '__ALL__',
  });
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].teamB, 'Shap');
});

test('buildHistoryCsvText exports single-team and all-team rows', () => {
  const games = [
    {
      season: 2025,
      date: '2025-09-07',
      teamA: 'Joe',
      teamB: 'Shap',
      scoreA: 100,
      scoreB: 90,
      type: 'Regular',
      round: '',
      _weekByTeam: { Joe: 1, Shap: 1 },
    },
    {
      season: 2025,
      date: '2025-09-14',
      teamA: 'Nuss',
      teamB: 'Joe',
      scoreA: 80,
      scoreB: 70,
      type: 'Playoff',
      round: 'Final',
      _weekByTeam: { Nuss: 2, Joe: 2 },
    },
  ];

  const single = buildHistoryCsvText(games, {
    allTeams: '__ALL__',
    selectedTeam: 'Joe',
    expectedWinForGameFn: () => 0.5,
  }).split('\n');
  assert.equal(single[0], 'date,season,team,opponent,result,pf,pa,type,round,week,xw');
  assert.equal(single[1], '"2025-09-07","2025","Joe","Shap","W","100.00","90.00","Regular","","1","0.5"');
  assert.equal(single[2], '"2025-09-14","2025","Joe","Nuss","L","70.00","80.00","Playoff","Final","2",""');

  const allTeams = buildHistoryCsvText(games, {
    allTeams: '__ALL__',
    selectedTeam: '__ALL__',
    selectedWeeks: new Set([1]),
    universeWeeks: [1, 2],
    expectedWinForGameFn: (team) => team === 'Joe' ? 0.75 : 0.25,
  }).split('\n');
  assert.equal(allTeams.length, 3);
  assert.equal(allTeams[1], '"2025-09-07","2025","Joe","Shap","W","100.00","90.00","Regular","","1","0.75"');
  assert.equal(allTeams[2], '"2025-09-07","2025","Shap","Joe","L","90.00","100.00","Regular","","1","0.25"');
});

test('Playoff wins per season are within bracket limits', () => {
  const h2h = readJson(h2hPath);
  const rec = new Map();
  for (const g of h2h){
    if (isThirdPlace(g)) continue;
    if (!isPlayoff(g)) continue;
    const season = +g.season;
    const upd = (team, win) => {
      const key = `${team}|${season}`;
      const r = rec.get(key) || { team, season, w: 0, l: 0 };
      if (win) r.w++; else r.l++;
      rec.set(key, r);
    };
    if (g.scoreA > g.scoreB){
      upd(g.teamA, true); upd(g.teamB, false);
    } else if (g.scoreB > g.scoreA){
      upd(g.teamA, false); upd(g.teamB, true);
    }
  }

  for (const r of rec.values()){
    const maxWins = r.season === 2014 ? 2 : 3;
    assert.ok(r.w <= maxWins, `${r.team} ${r.season} has ${r.w} playoff wins`);
  }
});

test('SeasonSummary playoff/saunders totals match H2H', () => {
  const h2h = readJson(h2hPath);
  const seasons = readJson(seasonPath);
  const po = new Map();
  const sau = new Map();

  for (const g of h2h){
    if (isThirdPlace(g)) continue;
    const season = +g.season;
    if (isPlayoff(g)){
      const aKey = `${g.teamA}|${season}`;
      const bKey = `${g.teamB}|${season}`;
      const ra = po.get(aKey) || { w:0, l:0 };
      const rb = po.get(bKey) || { w:0, l:0 };
      if (g.scoreA > g.scoreB){ ra.w++; rb.l++; }
      else if (g.scoreB > g.scoreA){ ra.l++; rb.w++; }
      po.set(aKey, ra); po.set(bKey, rb);
    } else if (isSaunders(g)){
      const aKey = `${g.teamA}|${season}`;
      const bKey = `${g.teamB}|${season}`;
      const ra = sau.get(aKey) || { w:0, l:0 };
      const rb = sau.get(bKey) || { w:0, l:0 };
      if (g.scoreA > g.scoreB){ ra.w++; rb.l++; }
      else if (g.scoreB > g.scoreA){ ra.l++; rb.w++; }
      sau.set(aKey, ra); sau.set(bKey, rb);
    }
  }

  for (const r of seasons){
    const key = `${r.owner}|${r.season}`;
    const pr = po.get(key) || { w:0, l:0 };
    const sr = sau.get(key) || { w:0, l:0 };
    assert.equal(r.playoff_wins, pr.w, `${key} playoff_wins mismatch`);
    assert.equal(r.playoff_losses, pr.l, `${key} playoff_losses mismatch`);
    assert.equal(r.saunders_wins, sr.w, `${key} saunders_wins mismatch`);
    assert.equal(r.saunders_losses, sr.l, `${key} saunders_losses mismatch`);
  }
});

test('SeasonSummary owners exist in H2H teams', () => {
  const h2h = readJson(h2hPath);
  const seasons = readJson(seasonPath);
  const teams = new Set();
  for (const g of h2h){ teams.add(g.teamA); teams.add(g.teamB); }
  for (const r of seasons){ assert.ok(teams.has(r.owner), `unknown owner in SeasonSummary: ${r.owner}`); }
});

test('Regular-season games have empty playoff round', () => {
  const h2h = readJson(h2hPath);
  for (const g of h2h){
    if (isRegular(g)){
      const r = String(g.round || '').trim();
      assert.ok(r === '' || r.toLowerCase() === 'regular', `regular game with round: ${g.round}`);
    }
  }
});

test('Saunders is loser of Saunders Final (when present)', () => {
  const h2h = readJson(h2hPath);
  const seasons = readJson(seasonPath);
  const saundersLoser = new Map();
  for (const g of h2h){
    if (isThirdPlace(g)) continue;
    if (!isSaunders(g)) continue;
    const r = String(g.round || '').toLowerCase();
    if (!r.includes('final')) continue;
    if (g.scoreA === g.scoreB) continue;
    const loser = g.scoreA > g.scoreB ? g.teamB : g.teamA;
    saundersLoser.set(+g.season, loser);
  }
  for (const r of seasons){
    const loser = saundersLoser.get(+r.season);
    if (!loser) continue;
    assert.equal(r.saunders, r.owner === loser, `${r.owner}|${r.season} saunders flag mismatch`);
  }
});

test('Each season has a single champion', () => {
  const seasons = readJson(seasonPath);
  const bySeason = new Map();
  for (const r of seasons){
    const s = +r.season;
    bySeason.set(s, (bySeason.get(s) || 0) + (r.champion ? 1 : 0));
  }
  for (const [season, count] of bySeason.entries()){
    assert.equal(count, 1, `season ${season} has ${count} champions`);
  }
});
