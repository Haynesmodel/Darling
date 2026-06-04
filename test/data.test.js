const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const assets = path.join(root, 'assets');
const core = require(path.join(root, 'js', 'core-helpers.js'));
const data = require(path.join(root, 'js', 'data-helpers.js'));
const stats = require(path.join(root, 'js', 'stats-helpers.js'));
const render = require(path.join(root, 'js', 'render-helpers.js'));
const historyRenderers = require(path.join(root, 'js', 'history-renderers.js'));
const facets = require(path.join(root, 'js', 'facet-helpers.js'));
const state = require(path.join(root, 'js', 'state-helpers.js'));
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
} = state;
const {
  loadLeagueAssets,
} = data;
const {
  computeSubThresholdGamesPerTeam,
  collectStreakRunsForTeam,
  bestStreakForTeam,
  computeLongestTeamStreaks,
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
  historyGamesTableRowHtml,
  historyGamesTableHtml,
  weekByWeekRows,
  weekByWeekTableHtml,
  seasonRecapOutcome,
  seasonRecapRows,
  seasonRecapTableHtml,
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
    type: 'Regular',
    round: '',
  };
  const responses = new Map([
    ['assets/H2H.json', mockJsonResponse([game, { ...game }])],
    ['assets/SeasonSummary.json', mockJsonResponse([{ season: 2025, owner: 'Joe' }])],
    ['assets/Rivalries.json', mockJsonResponse([{ group: 'Originals' }])],
  ]);
  const loaded = await loadLeagueAssets({
    fetchFn: async (url) => responses.get(url),
    logger: { warn() {} },
  });

  assert.equal(loaded.rawGames.length, 2);
  assert.equal(loaded.leagueGames.length, 1);
  assert.deepEqual([...loaded.derivedWeeksSet], [1]);
  assert.equal(loaded.leagueGames[0]._weekByTeam.Joe, 1);
  assert.deepEqual(loaded.seasonSummaries, [{ season: 2025, owner: 'Joe' }]);
  assert.deepEqual(loaded.rivalries, [{ group: 'Originals' }]);
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
    ['assets/SeasonSummary.json', mockJsonResponse([{ season: 2025, owner: 'Joe' }])],
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
  assert.match(facet, /class="round-cb"/);
  assert.match(facet, /data-value="A%26B"/);
  assert.match(facet, /Semi Final/);
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
