const test = require('node:test');
const assert = require('node:assert/strict');
const esbuild = require('esbuild');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.join(__dirname, '..');
let temp;
let pulse;

function summary(season = 2026, duplicateChampion = false) {
  const base = (owner, finish, champion, saunders) => ({ season, owner, wins: 10 - finish, losses: finish, ties: 0, finish, points_for: 1400 - finish * 10, points_against: 1300, playoff_wins: 0, playoff_losses: 0, saunders_wins: 0, saunders_losses: 0, bagels_earned: null, bye: false, champion, saunders, saunders_bye: false, wild_card: false });
  return [base('Joe', 1, true, false), base('Shap', 2, duplicateChampion, true)];
}

function game(overrides = {}) {
  return { season: 2026, date: '2026-09-07', teamA: 'Joe', teamB: 'Shap', scoreA: null, scoreB: null, week: 1, round: '', type: 'Regular', status: 'scheduled', matchup_id: 1, rosterA: 1, rosterB: 2, ...overrides };
}

function current(games, overrides = {}) {
  return { source: 'fixture', league_id: 'fixture', season: 2026, generated_at: '2026-09-07T12:00:00Z', current_week: 1, regular_season_max_week: 14, max_week: 17, weeks_fetched: [1], playoff_rules: { regular_season_max_week: 14, playoff_slots: 1, bye_slots: 0, saunders_slots: 1, standings_tiebreakers: ['win_pct', 'points_for', 'owner'] }, update_context: { mode: 'fixture', cutoff_date: '2026-09-07', contains_live_scores: false, contains_projected_scores: false }, teams: [{ roster_id: 1, owner: 'Joe', display_name: 'Joe', sleeper_team_name: 'Joe' }, { roster_id: 2, owner: 'Shap', display_name: 'Shap', sleeper_team_name: 'Shap' }], games, ...overrides };
}

test.before(async () => {
  temp = fs.mkdtempSync(path.join(os.tmpdir(), 'darling-league-pulse-'));
  await esbuild.build({ entryPoints: [path.join(root, 'src/features/league-pulse/league-pulse-model.ts')], outfile: path.join(temp, 'model.js'), bundle: true, platform: 'node', format: 'esm', target: 'node20', logLevel: 'silent' });
  pulse = await import(`${pathToFileURL(path.join(temp, 'model.js')).href}?${Date.now()}`);
});

test.after(() => fs.rmSync(temp, { recursive: true, force: true }));

test('season resolver covers every year-round phase and completion edge', () => {
  const cases = [
    ['preseason', current([game()]), summary(), 'preseason'],
    ['regular live', current([game({ status: 'live', scoreA: 50, scoreB: 45 })]), summary(), 'regular-season'],
    ['postseason live', current([game({ week: 16, status: 'live', scoreA: 50, scoreB: 45, type: 'Playoff', round: 'Semi Final' })], { current_week: 16 }), summary(), 'postseason'],
    ['finalizing', current([game({ status: 'final', scoreA: 100, scoreB: 90 })]), [], 'finalizing'],
    ['offseason', current([game({ status: 'final', scoreA: 100, scoreB: 90 })]), summary(), 'offseason'],
    ['duplicate champion', current([game({ status: 'final', scoreA: 100, scoreB: 90 })]), summary(2026, true), 'finalizing'],
    ['empty current fallback', current([]), summary(), 'offseason'],
  ];
  for (const [label, currentSeason, seasonSummaries, expected] of cases) {
    assert.equal(pulse.resolvePulseSeasonState({ currentSeason, seasonSummaries, leagueGames: [] }).phase, expected, label);
  }
  assert.equal(pulse.resolvePulseSeasonState({ currentSeason: null, seasonSummaries: summary(), leagueGames: [] }).phase, 'offseason');
  assert.equal(pulse.resolvePulseSeasonState({ currentSeason: null, seasonSummaries: [], leagueGames: [{ season: 2024 }] }).phase, 'historical-fallback');
});

test('spotlight selection prioritizes live games and is independent of input order', () => {
  const games = [game({ week: 2, status: 'final', scoreA: 100, scoreB: 90 }), game({ week: 3, status: 'live', scoreA: 40, scoreB: 50 }), game({ week: 4 })];
  const a = pulse.resolvePulseSeasonState({ currentSeason: current(games, { current_week: 2 }), seasonSummaries: summary(), leagueGames: [] });
  const b = pulse.resolvePulseSeasonState({ currentSeason: current(games.slice().reverse(), { current_week: 2 }), seasonSummaries: summary(), leagueGames: [] });
  assert.deepEqual(a, b);
  assert.equal(a.spotlightWeek, 3);
  assert.equal(a.isLive, true);
});

test('canonical 2025 snapshot builds an authoritative year in review without mutating data', () => {
  const data = {
    leagueGames: JSON.parse(fs.readFileSync(path.join(root, 'assets/H2H.json'), 'utf8')),
    seasonSummaries: JSON.parse(fs.readFileSync(path.join(root, 'assets/SeasonSummary.json'), 'utf8')),
    rivalries: JSON.parse(fs.readFileSync(path.join(root, 'assets/Rivalries.json'), 'utf8')),
    currentSeason: JSON.parse(fs.readFileSync(path.join(root, 'assets/CurrentSeason.json'), 'utf8')),
    derivedStats: JSON.parse(fs.readFileSync(path.join(root, 'assets/DerivedStats.json'), 'utf8')),
    dataVersion: 'fixture',
  };
  const before = JSON.stringify(data);
  const model = pulse.buildLeaguePulseModel(data, { pathname: '/Darling/' });
  assert.equal(model.state.phase, 'offseason');
  assert.equal(model.state.season, 2025);
  assert.equal(model.yearInReview.champion, 'Zook');
  assert.equal(model.yearInReview.saunders, 'Connor');
  assert.deepEqual(model.yearInReview.finalStandings.map(row => row.finish), [...model.yearInReview.finalStandings.map(row => row.finish)].sort((a, b) => a - b));
  assert.match(model.hero.title, /2025 Year in Review/);
  assert.ok(model.featuredMatchup);
  assert.ok(model.record);
  assert.equal(JSON.stringify(data), before);
});
