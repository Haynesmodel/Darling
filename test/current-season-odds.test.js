import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCurrentSeasonOdds,
  buildTeamScoringDistributions,
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
