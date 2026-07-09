import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import * as data from '../js/data-helpers.js';
import { canonicalGameKey, dedupeGames, deriveWeeksInPlace } from '../js/core-helpers.js';
import {
  h2hPath,
  seasonPath,
  rivalPath,
  readJson,
  isNum,
  mockJsonResponse,
  validSeasonRow,
  isPlayoff,
  isSaunders,
  isThirdPlace,
  isRegular,
} from './test-helpers.js';

const {
  normalizeLeagueGame,
  normalizeCurrentSeasonGame,
  normalizeSeasonSummary,
  normalizeRivalry,
  validateLeagueGames,
  validateCurrentSeason,
  validateSeasonSummaries,
  validateRivalries,
  validateLeagueAssetBundle,
  loadLeagueAssets,
} = data;

test('assets JSON loads', () => {
  assert.ok(fsExists(h2hPath));
  assert.ok(fsExists(seasonPath));
  assert.ok(fsExists(rivalPath));

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
  for (const [i, g] of h2h.entries()) {
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
  for (const [i, r] of seasons.entries()) {
    assert.ok(r && typeof r === 'object');
    assert.ok(isNum(r.season), `row ${i} missing season`);
    assert.ok(typeof r.owner === 'string' && r.owner, `row ${i} missing owner`);
    assert.ok(isNum(r.wins), `row ${i} missing wins`);
    assert.ok(isNum(r.losses), `row ${i} missing losses`);
    assert.ok(isNum(r.ties), `row ${i} missing ties`);
    if (r.finish !== null && r.finish !== undefined) {
      assert.ok(isNum(r.finish), `row ${i} finish must be number or null`);
    }
    assert.ok(isNum(r.playoff_wins), `row ${i} missing playoff_wins`);
    assert.ok(isNum(r.playoff_losses), `row ${i} missing playoff_losses`);
    assert.ok(isNum(r.saunders_wins), `row ${i} missing saunders_wins`);
    assert.ok(isNum(r.saunders_losses), `row ${i} missing saunders_losses`);
  }
});

test('SeasonSummary points_for values stay numeric and positive', () => {
  const seasons = readJson(seasonPath);
  for (const [i, r] of seasons.entries()) {
    assert.ok(isNum(r.points_for), `row ${i} missing points_for`);
    assert.ok(+r.points_for > 0, `row ${i} points_for must be positive`);
  }
});

test('H2H has no duplicate games (canonical key)', () => {
  const h2h = readJson(h2hPath);
  const seen = new Set();
  for (const g of h2h) {
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
    ['assets/CurrentSeason.json', mockJsonResponse({
      source: 'sleeper',
      league_id: '1',
      season: 2026,
      current_week: 1,
      games: [{ ...game, season: 2026, scoreA: null, scoreB: null, status: 'scheduled' }],
    })],
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
  assert.equal(loaded.currentSeason.season, 2026);
  assert.equal(loaded.currentSeason.games[0].scoreA, null);
  assert.equal(loaded.currentSeason.games[0].status, 'scheduled');
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
    normalizeSeasonSummary(validSeasonRow({ season: '2025', owner: ' Joe ', wins: '10', finish: '', bagels_earned: '2', draft_pick: '4' })),
    validSeasonRow({ season: 2025, owner: 'Joe', wins: 10, finish: null, bagels_earned: 2, draft_pick: 4 })
  );
  assert.deepEqual(
    normalizeRivalry({ name: ' Rivals ', members: [' Joe ', ' Shap '], type: ' group ', slug: ' rivals ', note: ' Legacy ' }),
    { name: 'Rivals', members: ['Joe', 'Shap'], type: 'group', slug: 'rivals', note: 'Legacy' }
  );
  assert.deepEqual(
    normalizeCurrentSeasonGame({
      season: '2026',
      date: ' 2026-09-06 ',
      teamA: ' Joe ',
      teamB: ' Shap ',
      scoreA: '',
      scoreB: '90',
      week: '1',
      type: ' Regular ',
      round: null,
      status: ' scheduled ',
    }),
    {
      season: 2026,
      date: '2026-09-06',
      teamA: 'Joe',
      teamB: 'Shap',
      scoreA: null,
      scoreB: 90,
      week: 1,
      type: 'Regular',
      round: '',
      status: 'scheduled',
    }
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
      currentSeason: {
        source: 'sleeper',
        season: 2026,
        games: [{
          season: 2026,
          date: '2026-09-06',
          teamA: 'Joe',
          teamB: 'Shap',
          scoreA: null,
          scoreB: null,
          week: 1,
          type: 'Regular',
          round: '',
          status: 'scheduled',
        }],
      },
    })
  );
  assert.doesNotThrow(() => validateCurrentSeason({
    source: 'sleeper',
    season: 2026,
    playoff_rules: {
      regular_season_max_week: 14,
      playoff_slots: 6,
      bye_slots: 2,
      standings_tiebreakers: ['win_pct', 'points_for', 'points_differential', 'owner'],
      saunders_slots: 6,
    },
    update_context: {
      mode: 'manual',
      cutoff_date: '2026-07-08',
      contains_live_scores: false,
      contains_projected_scores: false,
    },
    games: [{
      season: 2026,
      date: '2026-09-06',
      teamA: 'Joe',
      teamB: 'Shap',
      scoreA: null,
      scoreB: null,
      week: 1,
      type: 'Regular',
      round: '',
      status: 'scheduled',
    }],
  }));
  assert.throws(
    () => validateCurrentSeason({
      source: 'sleeper',
      season: 2026,
      playoff_rules: { playoff_slots: 0 },
      games: [],
    }),
    /playoff_rules invalid playoff_slots/
  );
  assert.throws(
    () => validateCurrentSeason({
      source: 'sleeper',
      season: 2026,
      update_context: { contains_live_scores: 'yes' },
      games: [],
    }),
    /update_context invalid contains_live_scores/
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
  assert.equal(warnings.length, 2);
  assert.ok(warnings.some(warning => /Rivalries\.json missing/.test(warning)));
  assert.ok(warnings.some(warning => /CurrentSeason\.json missing/.test(warning)));
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

test('Playoff wins per season are within bracket limits', () => {
  const h2h = readJson(h2hPath);
  const rec = new Map();
  for (const g of h2h) {
    if (isThirdPlace(g)) continue;
    if (!isPlayoff(g)) continue;
    const season = +g.season;
    const upd = (team, win) => {
      const key = `${team}|${season}`;
      const r = rec.get(key) || { team, season, w: 0, l: 0 };
      if (win) r.w++; else r.l++;
      rec.set(key, r);
    };
    if (g.scoreA > g.scoreB) {
      upd(g.teamA, true); upd(g.teamB, false);
    } else if (g.scoreB > g.scoreA) {
      upd(g.teamA, false); upd(g.teamB, true);
    }
  }

  for (const r of rec.values()) {
    const maxWins = r.season === 2014 ? 2 : 3;
    assert.ok(r.w <= maxWins, `${r.team} ${r.season} has ${r.w} playoff wins`);
  }
});

test('SeasonSummary playoff/saunders totals match H2H', () => {
  const h2h = readJson(h2hPath);
  const seasons = readJson(seasonPath);
  const po = new Map();
  const sau = new Map();

  for (const g of h2h) {
    if (isThirdPlace(g)) continue;
    const season = +g.season;
    if (isPlayoff(g)) {
      const aKey = `${g.teamA}|${season}`;
      const bKey = `${g.teamB}|${season}`;
      const ra = po.get(aKey) || { w: 0, l: 0 };
      const rb = po.get(bKey) || { w: 0, l: 0 };
      if (g.scoreA > g.scoreB) { ra.w++; rb.l++; }
      else if (g.scoreB > g.scoreA) { ra.l++; rb.w++; }
      po.set(aKey, ra); po.set(bKey, rb);
    } else if (isSaunders(g)) {
      const aKey = `${g.teamA}|${season}`;
      const bKey = `${g.teamB}|${season}`;
      const ra = sau.get(aKey) || { w: 0, l: 0 };
      const rb = sau.get(bKey) || { w: 0, l: 0 };
      if (g.scoreA > g.scoreB) { ra.w++; rb.l++; }
      else if (g.scoreB > g.scoreA) { ra.l++; rb.w++; }
      sau.set(aKey, ra); sau.set(bKey, rb);
    }
  }

  for (const r of seasons) {
    const key = `${r.owner}|${r.season}`;
    const pr = po.get(key) || { w: 0, l: 0 };
    const sr = sau.get(key) || { w: 0, l: 0 };
    assert.equal(r.playoff_wins, pr.w, `${key} playoff_wins mismatch`);
    assert.equal(r.playoff_losses, pr.l, `${key} playoff_losses mismatch`);
    assert.equal(r.saunders_wins, sr.w, `${key} saunders_wins mismatch`);
    assert.equal(r.saunders_losses, sr.l, `${key} saunders_losses mismatch`);
  }
});

test('H2H playoff rounds stay within the known round set', () => {
  const h2h = readJson(h2hPath);
  const knownRounds = new Set([
    '',
    'Wild Card',
    'Semi Final',
    'Championship',
    'Saunders Wild Card',
    'Saunders Semi Final',
    'Saunders Final',
    'Third Place',
  ]);

  for (const [i, g] of h2h.entries()) {
    const round = String(g.round || '');
    assert.ok(knownRounds.has(round), `row ${i} has unexpected round: ${round}`);
  }
});

test('Each completed season has exactly one championship game', () => {
  const h2h = readJson(h2hPath);
  const counts = new Map();
  for (const g of h2h) {
    if (String(g.round || '') !== 'Championship') continue;
    counts.set(+g.season, (counts.get(+g.season) || 0) + 1);
  }
  for (const [season, count] of counts.entries()) {
    assert.equal(count, 1, `season ${season} has ${count} championship games`);
  }
});

test('SeasonSummary finish positions stay within season bounds and remain unique', () => {
  const seasons = readJson(seasonPath);
  const bySeason = new Map();
  for (const row of seasons) {
    const season = +row.season;
    const rows = bySeason.get(season) || [];
    rows.push(row);
    bySeason.set(season, rows);
  }

  for (const [season, rows] of bySeason.entries()) {
    const finishes = rows.map(row => +row.finish);
    const teamCount = rows.length;
    const seen = new Set();
    for (const [idx, finish] of finishes.entries()) {
      assert.ok(Number.isFinite(finish), `season ${season} row ${idx} missing finish`);
      assert.ok(finish >= 1 && finish <= teamCount, `season ${season} finish ${finish} out of range`);
      assert.ok(!seen.has(finish), `season ${season} has duplicate finish ${finish}`);
      seen.add(finish);
    }
  }
});

test('SeasonSummary owners exist in H2H teams', () => {
  const h2h = readJson(h2hPath);
  const seasons = readJson(seasonPath);
  const teams = new Set();
  for (const g of h2h) {
    teams.add(g.teamA);
    teams.add(g.teamB);
  }
  for (const r of seasons) {
    assert.ok(teams.has(r.owner), `unknown owner in SeasonSummary: ${r.owner}`);
  }
});

test('Regular-season games have empty playoff round', () => {
  const h2h = readJson(h2hPath);
  for (const g of h2h) {
    if (isRegular(g)) {
      const r = String(g.round || '').trim();
      assert.ok(r === '' || r.toLowerCase() === 'regular', `regular game with round: ${g.round}`);
    }
  }
});

test('Saunders is loser of Saunders Final (when present)', () => {
  const h2h = readJson(h2hPath);
  const seasons = readJson(seasonPath);
  const saundersLoser = new Map();
  for (const g of h2h) {
    if (isThirdPlace(g)) continue;
    if (!isSaunders(g)) continue;
    const r = String(g.round || '').toLowerCase();
    if (!r.includes('final')) continue;
    if (g.scoreA === g.scoreB) continue;
    const loser = g.scoreA > g.scoreB ? g.teamB : g.teamA;
    saundersLoser.set(+g.season, loser);
  }
  for (const r of seasons) {
    const loser = saundersLoser.get(+r.season);
    if (!loser) continue;
    assert.equal(r.saunders, r.owner === loser, `${r.owner}|${r.season} saunders flag mismatch`);
  }
});

test('Each season has a single champion', () => {
  const seasons = readJson(seasonPath);
  const bySeason = new Map();
  for (const r of seasons) {
    const s = +r.season;
    bySeason.set(s, (bySeason.get(s) || 0) + (r.champion ? 1 : 0));
  }
  for (const [season, count] of bySeason.entries()) {
    assert.equal(count, 1, `season ${season} has ${count} champions`);
  }
});

function fsExists(p) {
  return fs.existsSync(p);
}
