const test = require('node:test');
const assert = require('node:assert/strict');
const esbuild = require('esbuild');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.join(__dirname, '..');
let temp;
let domain;

function summary(season = 2026, issue = '') {
  const row = (owner, finish, champion, saunders) => ({
    season, owner, wins: 10, losses: 4, ties: 0, finish,
    points_for: 1400, points_against: 1300, playoff_wins: 0,
    playoff_losses: 0, saunders_wins: 0, saunders_losses: 0,
    bagels_earned: null, bye: false, champion, saunders,
    saunders_bye: false, wild_card: false,
  });
  const rows = [row('Champion', 1, issue !== 'missing-champion', false), row('Runner-up', 2, issue === 'duplicate-champion', false), row('Saunders', 8, false, issue !== 'missing-saunders')];
  if (issue === 'duplicate-saunders') rows[1].saunders = true;
  return rows;
}

function game(overrides = {}) {
  return {
    season: 2026, date: '2026-09-07', teamA: 'Champion', teamB: 'Runner-up',
    scoreA: null, scoreB: null, week: 1, round: '', type: 'Regular',
    status: 'scheduled', matchup_id: 1, rosterA: 1, rosterB: 2, ...overrides,
  };
}

function current(games, overrides = {}) {
  return {
    source: 'fixture', league_id: 'fixture', season: 2026,
    generated_at: '2026-09-07T12:00:00Z', current_week: 1,
    regular_season_max_week: 14, max_week: 17, weeks_fetched: [1],
    playoff_rules: { regular_season_max_week: 14, playoff_slots: 1, bye_slots: 0, saunders_slots: 1, standings_tiebreakers: ['win_pct'] },
    update_context: { mode: 'fixture', cutoff_date: '2026-09-07', contains_live_scores: false, contains_projected_scores: false },
    teams: [{ roster_id: 1, owner: 'Champion' }, { roster_id: 2, owner: 'Runner-up' }],
    games, ...overrides,
  };
}

test.before(async () => {
  const tempRoot = process.env.NODE_V8_COVERAGE
    ? path.join(root, 'coverage')
    : os.tmpdir();
  fs.mkdirSync(tempRoot, { recursive: true });
  temp = fs.mkdtempSync(path.join(tempRoot, 'darling-season-domain-'));
  await esbuild.build({
    entryPoints: [
      path.join(root, 'src/data/season-presentation.ts'),
      path.join(root, 'src/data/season-recap.ts'),
    ],
    outdir: temp, bundle: true, platform: 'node', format: 'esm', target: 'node20',
    entryNames: '[name]', sourcemap: 'inline', sourcesContent: true, logLevel: 'silent',
  });
  const presentation = await import(`${pathToFileURL(path.join(temp, 'season-presentation.js')).href}?${Date.now()}`);
  const recap = await import(`${pathToFileURL(path.join(temp, 'season-recap.js')).href}?${Date.now()}`);
  domain = { ...presentation, ...recap };
});

test.after(() => {
  if (!process.env.NODE_V8_COVERAGE) fs.rmSync(temp, { recursive: true, force: true });
});

test('resolves all six phases and regular-season boundary states', () => {
  const cases = [
    [current([game()]), summary(), 'preseason'],
    [current([game({ status: 'live', scoreA: 50, scoreB: 45 })]), summary(), 'regular-season'],
    [current([game({ status: 'live', week: 14, scoreA: 50, scoreB: 45 })], { current_week: 14 }), summary(), 'regular-season'],
    [current([game({ status: 'live', week: 15, type: 'Playoff', round: 'Semifinal', scoreA: 50, scoreB: 45 })], { current_week: 15 }), summary(), 'postseason'],
    [current([game({ status: 'final', scoreA: 100, scoreB: 90 })]), [], 'finalizing'],
    [current([game({ status: 'final', scoreA: 100, scoreB: 90 })]), summary(), 'offseason'],
  ];
  for (const [currentSeason, seasonSummaries, phase] of cases) {
    assert.equal(domain.resolveSeasonPresentation({ currentSeason, seasonSummaries, leagueGames: [] }).phase, phase);
  }
  assert.equal(domain.resolveSeasonPresentation({ currentSeason: null, seasonSummaries: [], leagueGames: [{ season: 2024 }] }).phase, 'historical-fallback');
  assert.deepEqual(
    domain.resolveSeasonPresentation({ currentSeason: current([]), seasonSummaries: summary(), leagueGames: [] }),
    {
      phase: 'offseason',
      season: 2026,
      spotlightWeek: null,
      isLive: false,
      summaryComplete: true,
      source: 'historical',
    },
  );
  assert.equal(domain.resolveSeasonPresentation({ selectedSeason: null, currentSeason: current([game({ status: 'live' })]), seasonSummaries: [], leagueGames: [] }).phase, 'regular-season');
});

test('selected older season is historical while a newer current asset exists', () => {
  const state = domain.resolveSeasonPresentation({
    selectedSeason: 2025,
    currentSeason: current([game({ status: 'live' })]),
    seasonSummaries: summary(2025),
    leagueGames: [{ season: 2025 }],
  });
  assert.deepEqual(state, {
    phase: 'historical-fallback',
    season: 2025,
    spotlightWeek: null,
    isLive: false,
    summaryComplete: true,
    source: 'historical',
  });
});

test('empty current data falls back consistently unless its season is explicitly selected', () => {
  const input = {
    currentSeason: current([]),
    seasonSummaries: summary(2025),
    leagueGames: [{ season: 2025 }],
  };
  assert.deepEqual(domain.resolveSeasonPresentation(input), {
    phase: 'offseason',
    season: 2025,
    spotlightWeek: null,
    isLive: false,
    summaryComplete: true,
    source: 'historical',
  });
  assert.deepEqual(domain.resolveSeasonPresentation({ ...input, selectedSeason: 2026 }), {
    phase: 'historical-fallback',
    season: 2026,
    spotlightWeek: null,
    isLive: false,
    summaryComplete: false,
    source: 'historical',
  });
});

test('summary completeness fails closed and recap withholds disputed honors', () => {
  for (const issue of ['missing-champion', 'duplicate-champion', 'missing-saunders', 'duplicate-saunders']) {
    assert.equal(domain.isSeasonSummaryComplete(summary(2026, issue), 2026), false, issue);
    const recap = domain.resolveSeasonRecap({ season: 2026, seasonSummaries: summary(2026, issue), leagueGames: [] });
    assert.equal(recap.complete, false, issue);
    assert.equal(recap.champion, null, issue);
    assert.equal(recap.saunders, null, issue);
  }
});

test('canonical recap identifies 2025 honors and standings', () => {
  const seasonSummaries = JSON.parse(fs.readFileSync(path.join(root, 'assets/SeasonSummary.json'), 'utf8'));
  const leagueGames = JSON.parse(fs.readFileSync(path.join(root, 'assets/H2H.json'), 'utf8'));
  const recap = domain.resolveSeasonRecap({ season: 2025, seasonSummaries, leagueGames });
  assert.equal(recap.complete, true);
  assert.equal(recap.champion, 'Zook');
  assert.equal(recap.runnerUp, 'Singer');
  assert.equal(recap.saunders, 'Connor');
  assert.ok(recap.finalStandings.length);
});

test('phase defaults and probability work are lifecycle-aware', () => {
  assert.equal(domain.defaultCurrentViewForPhase('offseason'), 'recap');
  assert.equal(domain.defaultCurrentViewForPhase('preseason'), 'recap');
  assert.equal(domain.defaultCurrentViewForPhase('regular-season'), 'command');
  assert.equal(domain.defaultCurrentViewForPhase('postseason'), 'command');
  const regular = domain.resolveSeasonPresentation({
    currentSeason: current([game({ status: 'live', scoreA: 50, scoreB: 45 })]),
    seasonSummaries: [],
    leagueGames: [],
  });
  assert.equal(domain.seasonPresentationAllowsOdds(regular, 'command'), true);
  assert.equal(domain.seasonPresentationAllowsOdds(regular, 'matchups'), false);
  assert.equal(domain.seasonPresentationAllowsOdds({ ...regular, phase: 'offseason' }, 'command'), false);
});
