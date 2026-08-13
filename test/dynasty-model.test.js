import test from 'node:test';
import assert from 'node:assert/strict';
import { formatDynastyScore } from '../src/data/dynasty-formatters.ts';
import { buildDynastyViewModel, buildOwnerSeasonProfiles, buildDynastyTrendChartModel, calculateDynastyScore, calculateWinRatePrecision, computeRollingDynastyWindows, computeSlumpWindows, scoreOwnerSeason } from '../src/features/dynasty/dynasty-model.ts';
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
  assert.equal(trend.series.find(series => series.owner === 'Joe')?.points.at(-1)?.title, 'Joe: 213 through 2023');
  assert.equal(trend.series.find(series => series.owner === 'Joe')?.color, '#2563eb');
  assert.equal(trend.series.find(series => series.owner === 'Shap')?.color, '#f59e0b');
  assert.ok(trend.minScore < Math.min(...trend.series.flatMap(series => series.points.map(point => point.cumulativeScore))));
  assert.ok(trend.maxScore > Math.max(...trend.series.flatMap(series => series.points.map(point => point.cumulativeScore))));
});

test('win-rate precision is capped, tie-aware, and rounded at the season boundary', () => {
  const profiles = buildOwnerSeasonProfiles({ seasonSummaries: [
    row(2024, 'TenWins', { wins: 10, losses: 3, ties: 0 }),
    row(2024, 'SixSix', { wins: 6, losses: 6, ties: 0 }),
    row(2024, 'Tied', { wins: 5, losses: 5, ties: 2 }),
    row(2024, 'NoGames', { wins: 0, losses: 0, ties: 0 }),
  ] });
  const value = owner => profiles.find(profile => profile.owner === owner);
  assert.equal(calculateWinRatePrecision({ wins: 10, losses: 3, ties: 0, games: 13 }), 2.3);
  assert.equal(value('TenWins').seasonComponents.winRatePrecision, 2.3);
  assert.equal(value('SixSix').seasonComponents.winRatePrecision, 1.5);
  assert.equal(value('Tied').seasonComponents.winRatePrecision, 1.5);
  assert.equal(value('NoGames').seasonComponents.winRatePrecision, 0);
  assert.equal(scoreOwnerSeason(value('TenWins')).components.winRatePrecision, 2.3);
});

test('precision aggregates consistently across periods, rolling windows, heatmap, and trend', () => {
  const profiles = buildOwnerSeasonProfiles({ seasonSummaries: [
    row(2021, 'Joe', { wins: 10, losses: 3, ties: 0 }),
    row(2022, 'Joe', { wins: 6, losses: 6, ties: 0 }),
    row(2023, 'Joe', { wins: 0, losses: 0, ties: 0 }),
  ] });
  const period = calculateDynastyScore({ owner: 'Joe', startSeason: 2021, endSeason: 2022, seasonProfiles: profiles });
  const window = computeRollingDynastyWindows({ windowSize: 2, seasonProfiles: profiles, startSeason: 2021, endSeason: 2022, minSeasons: 1 }).find(score => score.owner === 'Joe');
  const trend = buildDynastyTrendChartModel(profiles).series.find(series => series.owner === 'Joe');
  const seasonTotal = profiles.filter(profile => profile.season <= 2022).reduce((sum, profile) => sum + profile.seasonScore, 0);
  const allSeasonTotal = profiles.reduce((sum, profile) => sum + profile.seasonScore, 0);
  assert.equal(period.components.winRatePrecision, 3.8);
  assert.equal(window.components.winRatePrecision, 3.8);
  assert.equal(period.score, Object.values(period.components).reduce((sum, component) => sum + component, 0));
  assert.equal(trend.points.find(point => point.season === 2022).cumulativeScore, seasonTotal);
  assert.equal(trend.points.find(point => point.season === 2023).cumulativeScore, allSeasonTotal);
  const heatmapCell = buildDynastyViewModel({ leagueGames: [], seasonSummaries: profiles.map(profile => ({ ...profile, points_for: profile.pointsFor, points_against: profile.pointsAgainst, playoff_wins: profile.playoffWins, playoff_losses: profile.playoffLosses, saunders_wins: profile.saundersWins, saunders_losses: profile.saundersLosses, wild_card: profile.wildCard, saunders_bye: profile.saundersBye, bagels_earned: profile.bagelsEarned })), mode: 'calculator', owner: 'Joe', startSeason: 2021, endSeason: 2022, minSeasons: 1 }).heatmap.rows.find(row => row.owner === 'Joe').cells.find(cell => cell.season === 2021);
  assert.equal(heatmapCell.score, heatmapCell.profile.seasonScore);
  assert.equal(heatmapCell.profile.seasonComponents.winRatePrecision, 2.3);
});

test('ranking remains deterministic when precision separates otherwise equivalent records', () => {
  const profiles = buildOwnerSeasonProfiles({ seasonSummaries: [
    row(2024, 'Zulu', { wins: 10, losses: 3, ties: 0 }),
    row(2024, 'Amy', { wins: 10, losses: 4, ties: 0 }),
    row(2024, 'Moe', { wins: 10, losses: 3, ties: 0 }),
  ] });
  const scores = calculateDynastyScore({ owner: 'Zulu', startSeason: 2024, endSeason: 2024, seasonProfiles: profiles });
  const ranked = [
    ...new Set(['Zulu', 'Amy', 'Moe']),
  ].map(owner => calculateDynastyScore({ owner, startSeason: 2024, endSeason: 2024, seasonProfiles: profiles }));
  assert.equal(scores.components.winRatePrecision, 2.3);
  assert.deepEqual(ranked.sort((a, b) => a.rankInPeriod - b.rankInPeriod).map(row => row.owner), ['Moe', 'Zulu', 'Amy']);
  assert.equal(ranked.find(row => row.owner === 'Moe').score, ranked.find(row => row.owner === 'Zulu').score);
});

test('Dynasty score display trims insignificant tenths and rejects invalid values', () => {
  assert.equal(formatDynastyScore(7), '7');
  assert.equal(formatDynastyScore(7.0), '7');
  assert.equal(formatDynastyScore(28.7), '28.7');
  assert.equal(formatDynastyScore(-0), '0');
  assert.equal(formatDynastyScore(-0.04), '0');
  assert.equal(formatDynastyScore(null), '—');
  assert.equal(formatDynastyScore(undefined), '—');
  assert.equal(formatDynastyScore(Number.NaN), '—');
  assert.equal(formatDynastyScore(Number.POSITIVE_INFINITY), '—');
});

test('trend preserves a flat point for seasons an owner did not participate', () => {
  const profiles = buildOwnerSeasonProfiles({ seasonSummaries: summaries }).filter(profile => profile.owner !== 'Shap' || profile.season !== 2022);
  const points = buildDynastyTrendChartModel(profiles).series.find(series => series.owner === 'Shap').points;
  assert.deepEqual(points.map(point => point.season), [2021, 2022, 2023]);
  assert.equal(points[1].seasonScore, 0);
  assert.equal(points[1].cumulativeScore, points[0].cumulativeScore);
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

test('invalid URL modes normalize to the legacy calculator fallback', () => {
  const state = resolveDynastyInitialState({ seasonSummaries: summaries, urlState: { dynastyMode: 'unsupported', dynastyOwner: 'Joe' } });
  assert.equal(state.mode, 'calculator');
  assert.equal(state.owner, 'Joe');
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
