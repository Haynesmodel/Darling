import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCommandCenterModel,
  buildProjectedStandings,
  buildScenarioStandings,
  classifyOwnerStatus,
  remainingScheduleForOwner,
  resolveCurrentSeasonRules,
} from '../js/current-season-command-data.js';

const currentSeason = {
  season: 2026,
  current_week: 2,
  generated_at: '2026-09-14T18:00:00Z',
  playoff_rules: {
    regular_season_max_week: 3,
    playoff_slots: 2,
    bye_slots: 1,
    standings_tiebreakers: ['win_pct', 'points_for', 'points_differential', 'owner'],
    saunders_slots: 2,
  },
  games: [
    { season: 2026, date: '2026-09-06', teamA: 'Joe', teamB: 'Shap', scoreA: 110, scoreB: 100, week: 1, type: 'Regular', round: '', status: 'final' },
    { season: 2026, date: '2026-09-06', teamA: 'Nuss', teamB: 'Joel', scoreA: 90, scoreB: 95, week: 1, type: 'Regular', round: '', status: 'final' },
    { season: 2026, date: '2026-09-13', teamA: 'Joe', teamB: 'Nuss', scoreA: 40, scoreB: 30, week: 2, type: 'Regular', round: '', status: 'live' },
    { season: 2026, date: '2026-09-13', teamA: 'Shap', teamB: 'Joel', scoreA: 22, scoreB: 18, week: 2, type: 'Regular', round: '', status: 'live' },
    { season: 2026, date: '2026-09-20', teamA: 'Joe', teamB: 'Joel', scoreA: null, scoreB: null, week: 3, type: 'Regular', round: '', status: 'scheduled' },
    { season: 2026, date: '2026-09-20', teamA: 'Shap', teamB: 'Nuss', scoreA: null, scoreB: null, week: 3, type: 'Regular', round: '', status: 'scheduled' },
  ],
};

test('command rules resolve from CurrentSeason metadata', () => {
  const rules = resolveCurrentSeasonRules(currentSeason, 4);
  assert.equal(rules.regular_season_max_week, 3);
  assert.equal(rules.playoff_slots, 2);
  assert.equal(rules.bye_slots, 1);
  assert.deepEqual(rules.standings_tiebreakers, ['win_pct', 'points_for', 'points_differential', 'owner']);
});

test('projected standings count live leaders only in if-scores-hold mode', () => {
  const current = buildScenarioStandings({ currentSeason, season: 2026 });
  const projected = buildProjectedStandings({ currentSeason, season: 2026 });

  assert.equal(current.find(row => row.owner === 'Joe').record, '1-0');
  assert.equal(projected.find(row => row.owner === 'Joe').projectedRecord, '2-0');
  assert.equal(projected.find(row => row.owner === 'Shap').projectedRecord, '1-1');
  assert.equal(projected.find(row => row.owner === 'Nuss').projectedRecord, '0-2');
});

test('command model builds playoff picture, needs, movement, and owner focus', () => {
  const model = buildCommandCenterModel({
    currentSeason,
    season: 2026,
    week: 2,
    selectedOwner: 'Shap',
    selectedView: 'owners',
  });

  assert.equal(model.selectedOwner, 'Shap');
  assert.equal(model.selectedView, 'owners');
  assert.equal(model.playoffPicture.length, 4);
  assert.ok(model.ownerNeeds.some(row => row.owner === 'Shap' && row.isSelected));
  assert.match(model.ownerNeeds.find(row => row.owner === 'Shap').pathSummary, /Joel/);
  assert.ok(model.liveMovement.some(row => row.owner === 'Shap'));
  assert.equal(model.summary.highestLiveScore.owner, 'Joe');
  assert.equal(model.matchupImpacts.size, 2);
});

test('remaining schedule and completed-season statuses are deterministic', () => {
  const joeRemaining = remainingScheduleForOwner({ owner: 'Joe', currentSeason, season: 2026 });
  assert.equal(joeRemaining.length, 2);

  const finalStandings = [
    { owner: 'Joe', wins: 3, losses: 0, ties: 0, rank: 1 },
    { owner: 'Joel', wins: 2, losses: 1, ties: 0, rank: 2 },
    { owner: 'Shap', wins: 1, losses: 2, ties: 0, rank: 3 },
    { owner: 'Nuss', wins: 0, losses: 3, ties: 0, rank: 4 },
  ];
  const remaining = new Map(finalStandings.map(row => [row.owner, []]));
  assert.equal(classifyOwnerStatus({ row: finalStandings[0], standings: finalStandings, rules: currentSeason.playoff_rules, remaining }).key, 'clinched-bye');
  assert.equal(classifyOwnerStatus({ row: finalStandings[2], standings: finalStandings, rules: currentSeason.playoff_rules, remaining }).key, 'eliminated');
});
