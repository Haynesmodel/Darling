import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyTeamSelection,
  applyUrlFacetState,
  buildHistoryRenderKeys,
  facetStateKey,
  resetFacetSelections,
  resetRuntimeCaches,
  setLoadedLeagueData,
  setTeamAndKeepOpponents,
  snapshotFacetState,
} from '../js/app-state-controller.js';
import {
  seasonModeFromLabels,
} from '../js/shared/season-mode.js';

test('snapshotFacetState clones selections and universe arrays', () => {
  const state = snapshotFacetState({
    selectedTeam: 'Joe',
    selectedSeasons: new Set([2025]),
    selectedWeeks: new Set([1]),
    selectedOpponents: new Set(['Shap']),
    selectedTypes: new Set(['Regular']),
    selectedRounds: new Set(['Final']),
    universe: {
      seasons: [2024, 2025],
      weeks: [1, 2],
      opponents: ['Shap'],
      types: ['Regular'],
      rounds: ['Final'],
    },
  });

  state.selectedSeasons.add(2024);
  state.universe.seasons.push(2026);

  assert.deepEqual([...state.selectedSeasons], [2025, 2024]);
  assert.deepEqual(state.universe.seasons, [2024, 2025, 2026]);
});

test('facetStateKey encodes selection and universe state deterministically', () => {
  const key = facetStateKey({
    selectedTeam: 'Joe',
    selectedSeasons: new Set([2025, 2024]),
    selectedWeeks: new Set([2, 1]),
    selectedOpponents: new Set(['Shap']),
    selectedTypes: new Set(['Regular']),
    selectedRounds: new Set(['Final']),
    universe: {
      seasons: [2024, 2025],
      weeks: [1, 2],
      opponents: ['Shap'],
      types: ['Regular'],
      rounds: ['Final'],
    },
  });

  assert.equal(key, 'Joe|s:2024,2025|w:1,2|o:Shap|t:Regular|r:Final|us:2024,2025|uw:1,2|uo:Shap|ut:Regular|ur:Final');
});

test('applyUrlFacetState and resetFacetSelections update only selection state', () => {
  const base = {
    selectedTeam: 'Joe',
    selectedSeasons: new Set([2025]),
    selectedWeeks: new Set([1]),
    selectedOpponents: new Set(['Shap']),
    selectedTypes: new Set(['Regular']),
    selectedRounds: new Set(['Final']),
  };

  const restored = applyUrlFacetState(base, {
    team: 'Shap',
    seasons: new Set([2024]),
    weeks: new Set([2]),
    opps: new Set(['Joe']),
    types: new Set(['Playoff']),
    rounds: new Set(['Semi Final']),
  });
  assert.equal(restored.selectedTeam, 'Shap');
  assert.deepEqual([...restored.selectedSeasons], [2024]);
  assert.deepEqual([...restored.selectedOpponents], ['Joe']);

  const reset = resetFacetSelections(restored);
  assert.deepEqual([...reset.selectedSeasons], []);
  assert.deepEqual([...reset.selectedWeeks], []);
  assert.deepEqual([...reset.selectedOpponents], []);
  assert.deepEqual([...reset.selectedTypes], []);
  assert.deepEqual([...reset.selectedRounds], []);
});

test('buildHistoryRenderKeys centralizes render cache signatures', () => {
  const keys = buildHistoryRenderKeys({
    selectedTeam: 'Joe',
    selectedSeasons: new Set([2025]),
    selectedWeeks: new Set([1]),
    selectedOpponents: new Set(['Shap']),
  }, [{ season: 2025, date: '2025-09-07' }], {
    allTeams: '__ALL__',
    canonicalGameKeyFn: (g) => `${g.season}:${g.date}`,
  });

  assert.equal(keys.topHighlights, 'Joe');
  assert.equal(keys.funFacts, 'Joe|2025:2025-09-07');
  assert.equal(keys.oppBreakdown, 'Joe|2025:2025-09-07|weeks:1|opps:Shap');
  assert.equal(keys.seasonRecap, 'Joe|seasons:2025');
  assert.equal(keys.weekByWeek, 'Joe|2025:2025-09-07');
});

test('setLoadedLeagueData and resetRuntimeCaches produce clean runtime state', () => {
  const loaded = setLoadedLeagueData({
    seasonAggregatesCache: { stale: true },
    weeklyAwardsCache: { stale: true },
    teamsFromLeagueGamesCache: ['old'],
    headToHeadPairsCache: new Map([['x', []]]),
    renderSectionCache: new Map([['y', 'z']]),
    filteredGamesCacheKey: 'old',
    filteredGamesCacheValue: [1],
    renderMetrics: { filterRuns: 9 },
    lastEffectKey: 'old',
  }, {
    leagueGames: [1, 2],
    derivedWeeksSet: new Set([1]),
    seasonSummaries: [3],
    rivalries: [4],
  });

  assert.deepEqual(loaded.leagueGames, [1, 2]);
  assert.deepEqual([...loaded.derivedWeeksSet], [1]);
  assert.equal(loaded.seasonAggregatesCache, null);
  assert.equal(loaded.weeklyAwardsCache, null);
  assert.equal(loaded.lastEffectKey, null);
  assert.equal(loaded.renderMetrics.filterRuns, 0);

  const reset = resetRuntimeCaches(loaded);
  assert.equal(reset.filteredGamesCacheKey, null);
  assert.equal(reset.filteredGamesCacheValue.length, 0);
  assert.equal(reset.renderSectionCache.size, 0);
});

test('applyTeamSelection preserves other state fields', () => {
  const next = applyTeamSelection({
    selectedTeam: 'Joe',
    selectedOpponents: new Set(['Shap']),
    universe: { opponents: ['Shap'] },
  }, '__ALL__');
  assert.equal(next.selectedTeam, '__ALL__');
  assert.deepEqual([...next.selectedOpponents], ['Shap']);
});

test('setTeamAndKeepOpponents changes team without clearing selections', () => {
  const next = setTeamAndKeepOpponents({
    selectedTeam: 'Joe',
    selectedOpponents: new Set(['Shap']),
    universe: { opponents: ['Shap'] },
  }, 'Shap', ['Joe', 'Joe']);

  assert.equal(next.selectedTeam, 'Shap');
  assert.deepEqual([...next.selectedOpponents], ['Shap']);
  assert.deepEqual(next.universe.opponents, ['Joe', 'Joe']);
});

test('seasonModeFromLabels prioritizes Saunders rounds over generic postseason labels', () => {
  assert.equal(seasonModeFromLabels(['Regular']), 'regular');
  assert.equal(seasonModeFromLabels(['Championship']), 'postseason');
  assert.equal(seasonModeFromLabels(['Saunders Wild Card']), 'saunders');
  assert.equal(seasonModeFromLabels(['Saunders Semi Final']), 'saunders');
  assert.equal(seasonModeFromLabels(['Saunders Final']), 'saunders');
});
