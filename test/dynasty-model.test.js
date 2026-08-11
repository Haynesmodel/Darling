import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDynastyViewModel, buildOwnerSeasonProfiles, buildDynastyTrendChartModel, calculateDynastyScore, computeRollingDynastyWindows } from '../src/features/dynasty/dynasty-model.ts';
import { normalizeDynastyRange, resolveDynastyInitialState } from '../src/features/dynasty/dynasty-state.ts';

function row(season, owner, overrides = {}) { return { season, owner, wins: 8, losses: 4, ties: 0, finish: 2, points_for: 1000, points_against: 950, playoff_wins: 1, playoff_losses: 1, saunders_wins: 0, saunders_losses: 0, champion: false, saunders: false, bye: false, wild_card: true, saunders_bye: false, bagels_earned: null, ...overrides }; }
const summaries = [row(2021, 'Joe', { champion: true }), row(2021, 'Shap', { wins: 4, finish: 8 }), row(2022, 'Joe'), row(2022, 'Shap', { wins: 7 }), row(2023, 'Joe', { champion: true }), row(2023, 'Shap', { wins: 5 })];

test('typed dynasty model preserves score, ranks, windows, and trend facts', () => {
  const profiles = buildOwnerSeasonProfiles({ seasonSummaries: summaries });
  assert.equal(profiles.length, 6);
  const score = calculateDynastyScore({ owner: 'Joe', startSeason: 2021, endSeason: 2023, seasonProfiles: profiles, minSeasons: 2 });
  assert.equal(score.championships, 2);
  assert.equal(score.label, 'Dynasty Run');
  assert.equal(computeRollingDynastyWindows({ windowSize: 3, seasonProfiles: profiles, startSeason: 2021, endSeason: 2023, minSeasons: 2 }).length, 2);
  const trend = buildDynastyTrendChartModel(profiles);
  assert.deepEqual(trend.seasonList, [2021, 2022, 2023]);
  assert.equal(trend.series.find(series => series.owner === 'Joe')?.points.at(-1)?.title, 'Joe: 207.0 through 2023');
});

test('range and URL state clamp requested seasons without losing intent', () => {
  const range = normalizeDynastyRange({ availableSeasons: [2021, 2022, 2023], requestedStartSeason: 2018, requestedEndSeason: 2030 });
  assert.deepEqual(range, { requestedStartSeason: 2018, requestedEndSeason: 2030, startSeason: 2021, endSeason: 2023 });
  const state = resolveDynastyInitialState({ seasonSummaries: summaries, urlState: { dynastyMode: 'calculator', dynastyOwner: 'Joe', dynastyStart: 2018, dynastyEnd: 2030 } });
  assert.equal(state.owner, 'Joe');
  assert.equal(state.startSeason, 2021);
  assert.equal(state.endSeason, 2023);
});

test('view model is deterministic for empty history', () => {
  const view = buildDynastyViewModel({ leagueGames: [], seasonSummaries: [], mode: 'all-time', owner: '__ALL__' });
  assert.equal(view.selectedScore, null);
  assert.deepEqual(view.heatmap.seasonList, []);
  assert.deepEqual(view.trendChart.series, []);
});
