const test = require('node:test');
const assert = require('node:assert/strict');
const esbuild = require('esbuild');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.join(__dirname, '..');
let temp;
let recap;

function summary(owner, finish, overrides = {}) {
  return {
    season: 2030, owner, wins: 1, losses: 0, ties: 0, finish,
    points_for: 100, points_against: 90, playoff_wins: 0, playoff_losses: 0,
    saunders_wins: 0, saunders_losses: 0, bagels_earned: null, bye: false,
    champion: false, saunders: false, saunders_bye: false, wild_card: false,
    ...overrides,
  };
}

function game(teamA, teamB, overrides = {}) {
  return {
    season: 2030, date: '2030-09-08', teamA, teamB, scoreA: 100, scoreB: 90,
    week: 1, round: '', type: 'Regular', status: 'final', matchup_id: 1,
    rosterA: 1, rosterB: 2, ...overrides,
  };
}

function data(games, owners = ['A', 'B', 'C', 'D'], current = false) {
  const seasonSummaries = owners.map((owner, index) => summary(owner, index + 1));
  return {
    leagueGames: current ? [] : games,
    seasonSummaries,
    rivalries: [],
    currentSeason: current ? {
      source: 'fixture', league_id: 'fixture', season: 2030, generated_at: '2030-09-08T00:00:00Z',
      current_week: 1, regular_season_max_week: 14, max_week: 17, weeks_fetched: [1],
      playoff_rules: { regular_season_max_week: 14, playoff_slots: 2, bye_slots: 0, saunders_slots: 2, standings_tiebreakers: [] },
      update_context: { mode: 'fixture', cutoff_date: '2030-09-08', contains_live_scores: false, contains_projected_scores: false },
      teams: owners.map((owner, index) => ({ roster_id: index + 1, owner, display_name: owner, sleeper_team_name: owner })),
      games,
    } : null,
    derivedStats: null,
    dataVersion: 'sha256:fixture',
  };
}

function weekly(model) {
  return model.editions.find(edition => edition.id === 'weekly:2030:1');
}

test.before(async () => {
  temp = fs.mkdtempSync(path.join(os.tmpdir(), 'darling-recap-model-'));
  await esbuild.build({
    entryPoints: [path.join(root, 'src/features/league-pulse/league-recap-model.ts')],
    outfile: path.join(temp, 'recap.js'),
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    logLevel: 'silent',
  });
  recap = await import(`${pathToFileURL(path.join(temp, 'recap.js')).href}?${Date.now()}`);
});

test.after(() => fs.rmSync(temp, { recursive: true, force: true }));

test('complete weekly editions have exactly four deterministic highlights', () => {
  const games = [game('A', 'B', { scoreA: 120 }), game('C', 'D', { scoreA: 110, scoreB: 105 })];
  const edition = weekly(recap.buildLeagueNewspaper(data(games), '/Darling/'));
  assert.equal(edition.state, 'complete');
  assert.equal(edition.issue, null);
  assert.deepEqual(edition.highlights.map(item => item.label), [
    'Highest score', 'Closest matchup', 'Largest margin', 'Standings leader',
  ]);
  assert.match(edition.sourceHref, /tab=history/);
  assert.match(edition.sourceHref, /focus=games/);
});

test('current live and non-finite games remain pending', () => {
  for (const changed of [
    game('A', 'B', { status: 'live' }),
    game('A', 'B', { scoreA: null }),
  ]) {
    const edition = weekly(recap.buildLeagueNewspaper(data([changed, game('C', 'D')], undefined, true), '/Darling/'));
    assert.equal(edition.state, 'pending');
    assert.equal(edition.issue.code, 'LIVE_GAMES');
    assert.equal(edition.facts, null);
  }
});

test('weekly integrity failures use deterministic issue codes', () => {
  const cases = [
    ['MISSING_EXPECTED_OWNERS', { ...data([game('A', 'B')], []), seasonSummaries: [] }],
    ['MISSING_GAMES', data([game('A', 'B')])],
    ['DUPLICATE_OWNER', data([game('A', 'B'), game('A', 'C')])],
    ['DUPLICATE_PAIR', data([game('A', 'B'), game('B', 'A')])],
    ['UNKNOWN_OWNER', data([game('A', 'X')], ['A', 'B'])],
    ['INVALID_SCORE', data([game('A', 'B', { scoreA: Number.NaN })], ['A', 'B'])],
  ];
  for (const [code, fixture] of cases) {
    const edition = weekly(recap.buildLeagueNewspaper(fixture, '/Darling/'));
    assert.equal(edition.state, 'partial', code);
    assert.equal(edition.issue.code, code);
    assert.equal(edition.facts, null);
  }
});

test('a complete week after a partial week cannot publish cumulative standings', () => {
  const games = [
    game('A', 'B'),
    game('A', 'B', { week: 2, date: '2030-09-15', scoreA: 80, scoreB: 90 }),
    game('C', 'D', { week: 2, date: '2030-09-15', scoreA: 95, scoreB: 85 }),
  ];
  const model = recap.buildLeagueNewspaper(data(games), '/Darling/');
  const first = model.editions.find(edition => edition.id === 'weekly:2030:1');
  const second = model.editions.find(edition => edition.id === 'weekly:2030:2');
  assert.equal(first.state, 'partial');
  assert.equal(second.state, 'partial');
  assert.equal(second.issue.code, 'INCOMPLETE_STANDINGS_PREFIX');
  assert.equal(second.issue.standingsWeek, 1);
  assert.equal(second.facts, null);
});

test('tie handling is independent of source order and owner names are canonical', () => {
  const games = [
    game('C', 'D', { scoreA: 120, scoreB: 100 }),
    game('B', 'A', { scoreA: 90, scoreB: 120 }),
  ];
  const first = weekly(recap.buildLeagueNewspaper(data(games), '/Darling/'));
  const second = weekly(recap.buildLeagueNewspaper(data(games.slice().reverse()), '/Darling/'));
  assert.deepEqual(first.facts, second.facts);
  assert.equal(first.facts.highScore.value, 'A, C');
  const tiedWeek = weekly(recap.buildLeagueNewspaper(data([
    game('A', 'B', { scoreA: 100, scoreB: 100 }),
    game('C', 'D', { scoreA: 90, scoreB: 90 }),
  ]), '/Darling/'));
  assert.equal(tiedWeek.facts.largestMargin.value, 'Tie');
});

test('all ten audited historical anomalies remain partial and unshareable', () => {
  const model = recap.buildLeagueNewspaper({
    leagueGames: JSON.parse(fs.readFileSync(path.join(root, 'assets/H2H.json'), 'utf8')),
    seasonSummaries: JSON.parse(fs.readFileSync(path.join(root, 'assets/SeasonSummary.json'), 'utf8')),
    currentSeason: JSON.parse(fs.readFileSync(path.join(root, 'assets/CurrentSeason.json'), 'utf8')),
    rivalries: [], derivedStats: null, dataVersion: 'fixture',
  }, '/Darling/');
  const anomalies = [
    'weekly:2015:7', 'weekly:2015:8', 'weekly:2016:4', 'weekly:2016:8',
    'weekly:2016:9', 'weekly:2016:10', 'weekly:2016:13', 'weekly:2019:3',
    'weekly:2019:4', 'weekly:2019:13',
  ];
  assert.deepEqual(
    anomalies.map(id => [id, model.editions.find(edition => edition.id === id)?.state]),
    anomalies.map(id => [id, 'partial']),
  );
  assert.ok(anomalies.every(id => model.editions.find(edition => edition.id === id)?.facts === null));
  for (const id of ['weekly:2015:9', 'weekly:2015:14', 'weekly:2016:14', 'weekly:2019:12']) {
    const edition = model.editions.find(candidate => candidate.id === id);
    assert.equal(edition?.state, 'partial', id);
    assert.equal(edition?.issue?.code, 'INCOMPLETE_STANDINGS_PREFIX', id);
    assert.equal(edition?.facts, null, id);
  }
  assert.equal(model.editions.find(edition => edition.id === 'season:2025').state, 'complete');
  assert.equal(model.defaultEditionId.startsWith('weekly:2025:'), true);
});

test('incomplete honors produce pending seasons while canonical facts remain authoritative', () => {
  const pending = recap.buildLeagueNewspaper(data([game('A', 'B')], ['A', 'B']), '/Darling/')
    .editions.find(edition => edition.id === 'season:2030');
  assert.equal(pending.state, 'pending');
  assert.equal(pending.issue.code, 'HONORS_PENDING');
  const canonical = {
    leagueGames: JSON.parse(fs.readFileSync(path.join(root, 'assets/H2H.json'), 'utf8')),
    seasonSummaries: JSON.parse(fs.readFileSync(path.join(root, 'assets/SeasonSummary.json'), 'utf8')),
    currentSeason: JSON.parse(fs.readFileSync(path.join(root, 'assets/CurrentSeason.json'), 'utf8')),
    rivalries: [], derivedStats: null, dataVersion: 'fixture',
  };
  const review = recap.buildSeasonYearInReview(canonical, 2025, '/Darling/');
  assert.equal(review.champion, 'Zook');
  assert.equal(review.saunders, 'Connor');
  assert.equal(review.superlatives.length, 5);
});
