import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  buildCurrentSeasonOdds,
  buildTeamScoringDistributions,
  conditionForcedScores,
  simulateOddsSnapshot,
} from '../js/current-season-odds.js';
import { resolveCurrentSeasonRules } from '../js/current-season-command-data.js';

const currentSeason = {
  season: 2026,
  current_week: 2,
  update_context: {
    mode: 'live',
    cutoff_date: '2026-09-13',
    contains_live_scores: true,
    contains_projected_scores: false,
  },
  playoff_rules: {
    regular_season_max_week: 3,
    playoff_slots: 2,
    bye_slots: 1,
    standings_tiebreakers: ['win_pct', 'points_for', 'points_differential', 'owner'],
    saunders_slots: 2,
  },
  games: [
    { season: 2026, date: '2026-09-06', teamA: 'Joe', teamB: 'Shap', scoreA: 120, scoreB: 100, week: 1, type: 'Regular', round: '', status: 'final' },
    { season: 2026, date: '2026-09-06', teamA: 'Nuss', teamB: 'Joel', scoreA: 90, scoreB: 110, week: 1, type: 'Regular', round: '', status: 'final' },
    { season: 2026, date: '2026-09-13', teamA: 'Joe', teamB: 'Nuss', scoreA: 65, scoreB: 50, week: 2, type: 'Regular', round: '', status: 'live' },
    { season: 2026, date: '2026-09-13', teamA: 'Shap', teamB: 'Joel', scoreA: 55, scoreB: 60, week: 2, type: 'Regular', round: '', status: 'live' },
    { season: 2026, date: '2026-09-20', teamA: 'Joe', teamB: 'Joel', scoreA: null, scoreB: null, week: 3, type: 'Regular', round: '', status: 'scheduled' },
    { season: 2026, date: '2026-09-20', teamA: 'Shap', teamB: 'Nuss', scoreA: null, scoreB: null, week: 3, type: 'Regular', round: '', status: 'scheduled' },
  ],
};

const derivedStats = {
  team_seasons: [
    { owner: 'Joe', season: 2025, scores: [115, 125, 130] },
    { owner: 'Shap', season: 2025, scores: [95, 100, 105] },
    { owner: 'Nuss', season: 2025, scores: [90, 98, 108] },
  ],
};

function readAsset(name) {
  return JSON.parse(fs.readFileSync(new URL(`../assets/${name}`, import.meta.url), 'utf8'));
}

test('fixed inputs and seed produce reproducible playoff, bye, seed, and Saunders odds', () => {
  const rules = resolveCurrentSeasonRules(currentSeason, 4);
  const distributions = buildTeamScoringDistributions({
    currentSeason,
    derivedStats,
    season: 2026,
    rules,
  });
  const options = {
    currentSeason,
    derivedStats,
    season: 2026,
    rules,
    distributions,
    simulations: 2500,
    seed: 'stable-test-seed',
    liveMode: 'score-aware',
  };
  const first = simulateOddsSnapshot(options);
  const second = simulateOddsSnapshot(options);
  assert.deepEqual(first.rows, second.rows);
  assert.equal(first.rows.reduce((sum, row) => sum + row.playoffOdds, 0), 2);
  assert.equal(first.rows.reduce((sum, row) => sum + row.byeOdds, 0), 1);
  assert.equal(first.rows.reduce((sum, row) => sum + row.saundersOdds, 0), 2);
  first.rows.forEach(row => {
    const seedTotal = Object.values(row.seedProbabilities).reduce((sum, value) => sum + value, 0);
    assert.ok(Math.abs(seedTotal - 1) < 1e-9);
  });
});

test('distribution builder shrinks sparse and missing owner history toward league scoring', () => {
  const rules = resolveCurrentSeasonRules(currentSeason, 4);
  const distributions = buildTeamScoringDistributions({
    currentSeason,
    derivedStats,
    season: 2026,
    rules,
  });
  const joel = distributions.find(row => row.owner === 'Joel');
  const joe = distributions.find(row => row.owner === 'Joe');
  assert.equal(joel.historicalSample, 0);
  assert.ok(joel.leagueWeight > 0);
  assert.ok(joe.historicalSample > 0);
  assert.ok(joe.currentWeight >= 0.4);
  assert.ok(distributions.every(row => row.floor >= 0 && row.ceiling > row.floor && row.standardDeviation >= 8));
});

test('odds model exposes movement and selected-owner win/loss scenarios', () => {
  const result = buildCurrentSeasonOdds({
    currentSeason,
    derivedStats,
    season: 2026,
    week: 2,
    dataVersion: 'sha256:test',
    selectedOwner: 'Shap',
    playoffPicture: [
      { owner: 'Joe', status: { key: 'in-control' } },
      { owner: 'Joel', status: { key: 'in-control' } },
      { owner: 'Shap', status: { key: 'bubble' } },
      { owner: 'Nuss', status: { key: 'bubble' } },
    ],
    simulations: 2500,
  });
  assert.equal(result.status, 'ready');
  assert.equal(result.rows.length, 4);
  assert.equal(result.movement.length, 4);
  assert.equal(result.selectedOwnerScenario.owner, 'Shap');
  assert.notDeepEqual(result.selectedOwnerScenario.win, result.selectedOwnerScenario.loss);
  assert.match(result.liveMode, /Score-aware/);
});

test('forced outcomes condition sampled scores without lowering live totals', () => {
  const live = {
    season: 2026,
    week: 2,
    teamA: 'Joe',
    teamB: 'Shap',
    status: 'live',
    scoreA: 130,
    scoreB: 120,
  };
  const forcedLoss = conditionForcedScores(
    live,
    { owner: 'Joe', outcome: 'loss', week: 2 },
    150,
    125,
  );
  assert.ok(forcedLoss[0] >= 130);
  assert.ok(forcedLoss[1] >= 120);
  assert.ok(forcedLoss[1] > forcedLoss[0]);

  const scheduled = { ...live, status: 'scheduled', scoreA: null, scoreB: null };
  assert.deepEqual(
    conditionForcedScores(scheduled, { owner: 'Joe', outcome: 'win', week: 2 }, 160, 100),
    [160, 100],
  );
  assert.deepEqual(
    conditionForcedScores(scheduled, { owner: 'Joe', outcome: 'win', week: 2 }, 90, 140),
    [140, 90],
  );
});

test('past-week movement excludes results completed after the selected week', () => {
  const withLaterResults = {
    ...currentSeason,
    current_week: 3,
    games: currentSeason.games.map(game => {
      if (game.week === 2) return { ...game, status: 'final' };
      if (game.week === 3) {
        return game.teamA === 'Joe'
          ? { ...game, status: 'final', scoreA: 70, scoreB: 160 }
          : { ...game, status: 'final', scoreA: 155, scoreB: 75 };
      }
      return game;
    }),
  };
  const throughWeekTwo = {
    ...withLaterResults,
    current_week: 2,
    games: withLaterResults.games.map(game => (
      game.week <= 2
        ? game
        : { ...game, status: 'scheduled', scoreA: null, scoreB: null }
    )),
  };
  const options = {
    derivedStats,
    season: 2026,
    week: 2,
    dataVersion: 'past-week-regression',
    simulations: 1500,
  };
  const historical = buildCurrentSeasonOdds({ ...options, currentSeason: withLaterResults });
  const contemporaneous = buildCurrentSeasonOdds({ ...options, currentSeason: throughWeekTwo });
  assert.equal(historical.seed, contemporaneous.seed);
  assert.deepEqual(historical.rows, contemporaneous.rows);
  assert.deepEqual(historical.movement, contemporaneous.movement);
});

test('historical season snapshots truncate league games for current and baseline odds', () => {
  const leagueGames = readAsset('H2H.json');
  const historicalCurrentSeason = readAsset('CurrentSeason.json');
  const historicalDerivedStats = readAsset('DerivedStats.json');
  const options = {
    currentSeason: historicalCurrentSeason,
    derivedStats: historicalDerivedStats,
    season: 2024,
    dataVersion: 'historical-season-regression',
    simulations: 500,
    playoffPicture: [{ owner: 'Joe', status: { key: 'clinched-playoff' } }],
  };
  const results = [1, 7, 14].map(week => buildCurrentSeasonOdds({
    ...options,
    leagueGames,
    week,
  }));

  results.forEach((result, index) => {
    const week = [1, 7, 14][index];
    assert.deepEqual([...new Set(result.distributions.map(row => row.currentSample))], [week]);
    assert.ok(result.movement.some(row => Math.abs(row.playoffChange) > 0));
  });
  assert.notDeepEqual(results[0].rows, results[1].rows);
  assert.notDeepEqual(results[1].rows, results[2].rows);
  assert.notEqual(results[0].rows.find(row => row.owner === 'Joe').playoffOdds, 1);

  const truncatedLeagueGames = leagueGames.map(game => (
    game.season === 2024 && game.week > 7
      ? { ...game, status: 'scheduled', scoreA: null, scoreB: null }
      : game
  ));
  const contemporaneous = buildCurrentSeasonOdds({
    ...options,
    leagueGames: truncatedLeagueGames,
    week: 7,
  });
  assert.equal(results[1].seed, contemporaneous.seed);
  assert.deepEqual(results[1].rows, contemporaneous.rows);
  assert.deepEqual(results[1].movement, contemporaneous.movement);
});

test('historical distributions exclude future weeks and future-season priors', () => {
  const historicalGames = [
    { season: 2024, teamA: 'Joe', teamB: 'Shap', scoreA: 110, scoreB: 90, week: 1, type: 'Regular', status: 'final' },
    { season: 2024, teamA: 'Nuss', teamB: 'Joel', scoreA: 95, scoreB: 85, week: 1, type: 'Regular', status: 'final' },
    { season: 2024, teamA: 'Joe', teamB: 'Nuss', scoreA: 300, scoreB: 280, week: 2, type: 'Regular', status: 'final' },
    { season: 2024, teamA: 'Shap', teamB: 'Joel', scoreA: 290, scoreB: 270, week: 2, type: 'Regular', status: 'final' },
  ];
  const laterCurrentSeason = {
    ...currentSeason,
    season: 2026,
    current_week: 2,
    games: currentSeason.games.map(game => ({ ...game, season: 2026 })),
  };
  const availablePriors = {
    team_seasons: [
      { owner: 'Joe', season: 2023, scores: [100, 105] },
      { owner: 'Shap', season: 2023, scores: [90, 95] },
    ],
  };
  const withFuturePriors = {
    team_seasons: [
      ...availablePriors.team_seasons,
      { owner: 'Joe', season: 2025, scores: [800, 900] },
      { owner: 'Shap', season: 2025, scores: [700, 750] },
    ],
  };
  const options = {
    currentSeason: laterCurrentSeason,
    season: 2024,
    week: 1,
    dataVersion: 'future-score-regression',
    simulations: 500,
  };
  const historical = buildCurrentSeasonOdds({
    ...options,
    leagueGames: historicalGames,
    derivedStats: withFuturePriors,
  });
  const contemporaneous = buildCurrentSeasonOdds({
    ...options,
    leagueGames: historicalGames.map(game => (
      game.week > 1 ? { ...game, status: 'scheduled', scoreA: null, scoreB: null } : game
    )),
    derivedStats: availablePriors,
  });

  assert.deepEqual(historical.distributions, contemporaneous.distributions);
  assert.ok(historical.distributions.every(row => row.currentSample === 1));
  assert.ok(historical.distributions.every(row => row.ceiling < 300));
});

test('configured tiebreakers determine exact completed-season seed probabilities', () => {
  const complete = {
    season: 2026,
    playoff_rules: {
      regular_season_max_week: 1,
      playoff_slots: 2,
      bye_slots: 1,
      standings_tiebreakers: ['win_pct', 'points_against', 'owner'],
      saunders_slots: 2,
    },
    games: [
      { season: 2026, date: '2026-09-06', teamA: 'Joe', teamB: 'Shap', scoreA: 100, scoreB: 90, week: 1, type: 'Regular', round: '', status: 'final' },
      { season: 2026, date: '2026-09-06', teamA: 'Nuss', teamB: 'Joel', scoreA: 80, scoreB: 70, week: 1, type: 'Regular', round: '', status: 'final' },
    ],
  };
  const result = buildCurrentSeasonOdds({
    currentSeason: complete,
    season: 2026,
    week: 1,
    dataVersion: 'complete',
    simulations: 1000,
  });
  assert.equal(result.rows.find(row => row.owner === 'Nuss').seedProbabilities['1'], 1);
  assert.equal(result.rows.find(row => row.owner === 'Joe').seedProbabilities['2'], 1);
});
