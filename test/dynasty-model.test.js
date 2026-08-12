import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDynastyViewModel, buildOwnerSeasonProfiles, buildDynastyTrendChartModel, calculateDynastyScore, computeRollingDynastyWindows, computeSlumpWindows } from '../src/features/dynasty/dynasty-model.ts';
import { normalizeDynastyRange, normalizeDynastyStateChange, resolveDynastyInitialState } from '../src/features/dynasty/dynasty-state.ts';

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

test('initial URL state clamps minimum seasons to available history', () => {
  const state = resolveDynastyInitialState({ seasonSummaries: summaries, urlState: { dynastyMode: 'calculator', dynastyOwner: 'Joe', dynastyMinSeasons: 999 } });
  assert.equal(state.minSeasons, 3);
});

test('view model is deterministic for empty history', () => {
  const view = buildDynastyViewModel({ leagueGames: [], seasonSummaries: [], mode: 'all-time', owner: '__ALL__' });
  assert.equal(view.selectedScore, null);
  assert.deepEqual(view.heatmap.seasonList, []);
  assert.deepEqual(view.trendChart.series, []);
});

test('control changes normalize owner, bounds, and minimum seasons', () => {
  const state = normalizeDynastyStateChange({ mode: 'calculator', owner: '__ALL__', startSeason: 2023, endSeason: 2021, minSeasons: 99, includeSaundersPenalty: true }, summaries);
  assert.equal(state.owner, 'Joe');
  assert.deepEqual([state.startSeason, state.endSeason], [2021, 2023]);
  assert.deepEqual([state.requestedStartSeason, state.requestedEndSeason], [2021, 2023]);
  assert.equal(state.minSeasons, 3);
});

test('slump windows compare every consecutive pair and retain biggest drops', () => {
  const profiles = buildOwnerSeasonProfiles({ seasonSummaries: summaries });
  const windows = computeRollingDynastyWindows({ windowSize: 3, seasonProfiles: profiles, startSeason: 2021, endSeason: 2023, minSeasons: 1 });
  const slumps = computeSlumpWindows({ rollingWindows: [
    { ...windows[0], owner: 'Joe', windowStartSeason: 2014, windowEndSeason: 2016, windowLabel: '2014-2016', score: 100 },
    { ...windows[0], owner: 'Joe', windowStartSeason: 2016, windowEndSeason: 2018, windowLabel: '2016-2018', score: 90 },
  ], seasonProfiles: profiles, windowSize: 3 });
  assert.equal(slumps.biggestDrops.length, 1);
  assert.equal(slumps.biggestDrops[0].delta, -10);
});
