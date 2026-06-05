function cloneSet(value) {
  return value instanceof Set ? new Set(value) : new Set(value || []);
}

function cloneUniverse(universe = {}) {
  return {
    seasons: [...(universe.seasons || [])],
    weeks: [...(universe.weeks || [])],
    opponents: [...(universe.opponents || [])],
    types: [...(universe.types || [])],
    rounds: [...(universe.rounds || [])],
  };
}

function snapshotFacetState(state = {}) {
  return {
    selectedTeam: state.selectedTeam,
    selectedSeasons: cloneSet(state.selectedSeasons),
    selectedWeeks: cloneSet(state.selectedWeeks),
    selectedOpponents: cloneSet(state.selectedOpponents),
    selectedTypes: cloneSet(state.selectedTypes),
    selectedRounds: cloneSet(state.selectedRounds),
    universe: cloneUniverse(state.universe),
    allTeams: state.allTeams || '__ALL__',
  };
}

function resetFacetSelections(state = {}) {
  return {
    ...state,
    selectedSeasons: new Set(),
    selectedWeeks: new Set(),
    selectedOpponents: new Set(),
    selectedTypes: new Set(),
    selectedRounds: new Set(),
  };
}

function applyTeamSelection(state = {}, nextTeam) {
  return {
    ...state,
    selectedTeam: nextTeam,
  };
}

function applyUrlFacetState(state = {}, urlState = {}) {
  return {
    ...state,
    selectedTeam: urlState.team || state.selectedTeam,
    selectedSeasons: cloneSet(urlState.seasons),
    selectedWeeks: cloneSet(urlState.weeks),
    selectedOpponents: cloneSet(urlState.opps),
    selectedTypes: cloneSet(urlState.types),
    selectedRounds: cloneSet(urlState.rounds),
  };
}

function resetRuntimeCaches(state = {}) {
  return {
    ...state,
    seasonAggregatesCache: null,
    weeklyAwardsCache: null,
    teamsFromLeagueGamesCache: null,
    headToHeadPairsCache: new Map(),
    renderSectionCache: new Map(),
    filteredGamesCacheKey: null,
    filteredGamesCacheValue: [],
    renderMetrics: { filterRuns: 0 },
    lastEffectKey: null,
  };
}

function setLoadedLeagueData(state = {}, loaded = {}) {
  return resetRuntimeCaches({
    ...state,
    leagueGames: loaded.leagueGames || [],
    derivedWeeksSet: loaded.derivedWeeksSet || new Set(),
    seasonSummaries: loaded.seasonSummaries || [],
    rivalries: loaded.rivalries || [],
  });
}

function setFacetUniverse(state = {}, universe = {}) {
  return {
    ...state,
    universe: cloneUniverse(universe),
  };
}

function setOpponentsPreservingSelection(state = {}, nextOpponents = []) {
  const selection = cloneSet(state.selectedOpponents);
  return {
    ...state,
    selectedOpponents: selection,
    universe: {
      ...(state.universe || {}),
      opponents: [...nextOpponents],
    },
  };
}

function setTeamAndKeepOpponents(state = {}, nextTeam, nextOpponents = []) {
  const next = applyTeamSelection(state, nextTeam);
  return setOpponentsPreservingSelection(next, nextOpponents);
}

function setFacetSelectionsFromDom(state = {}, nextSelections = {}) {
  return {
    ...state,
    selectedSeasons: cloneSet(nextSelections.selectedSeasons),
    selectedWeeks: cloneSet(nextSelections.selectedWeeks),
    selectedOpponents: cloneSet(nextSelections.selectedOpponents),
    selectedTypes: cloneSet(nextSelections.selectedTypes),
    selectedRounds: cloneSet(nextSelections.selectedRounds),
  };
}

function setKey(set) {
  return [...cloneSet(set)].map(v => `${v}`).sort().join(',');
}

function facetStateKey(state = {}) {
  const universe = state.universe || {};
  return [
    state.selectedTeam || '',
    `s:${setKey(state.selectedSeasons)}`,
    `w:${setKey(state.selectedWeeks)}`,
    `o:${setKey(state.selectedOpponents)}`,
    `t:${setKey(state.selectedTypes)}`,
    `r:${setKey(state.selectedRounds)}`,
    `us:${[...(universe.seasons || [])].join(',')}`,
    `uw:${[...(universe.weeks || [])].join(',')}`,
    `uo:${[...(universe.opponents || [])].join(',')}`,
    `ut:${[...(universe.types || [])].join(',')}`,
    `ur:${[...(universe.rounds || [])].join(',')}`,
  ].join('|');
}

function gamesKey(games = [], canonicalGameKeyFn = (g) => JSON.stringify(g)) {
  return games.map(canonicalGameKeyFn).join('|');
}

function buildHistoryRenderKeys(state = {}, filteredGames = [], opts = {}) {
  const selectedTeam = state.selectedTeam || opts.allTeams || '__ALL__';
  const allTeams = opts.allTeams || '__ALL__';
  const filteredKey = gamesKey(filteredGames, opts.canonicalGameKeyFn);
  const seasonFilterKey = setKey(state.selectedSeasons);
  const weekFilterKey = setKey(state.selectedWeeks);
  const opponentFilterKey = setKey(state.selectedOpponents);
  return {
    filteredKey,
    seasonFilterKey,
    weekFilterKey,
    opponentFilterKey,
    topHighlights: selectedTeam,
    funFacts: selectedTeam === allTeams ? selectedTeam : `${selectedTeam}|${filteredKey}`,
    oppBreakdown: `${selectedTeam}|${filteredKey}|weeks:${weekFilterKey}|opps:${opponentFilterKey}`,
    seasonRecap: `${selectedTeam}|seasons:${seasonFilterKey}`,
    seasonCallout: `${selectedTeam}|seasons:${seasonFilterKey}`,
    weekByWeek: `${selectedTeam}|${filteredKey}`,
    gamesTable: `${selectedTeam}|${filteredKey}`,
  };
}

export {
  applyTeamSelection,
  applyUrlFacetState,
  buildHistoryRenderKeys,
  facetStateKey,
  gamesKey,
  resetFacetSelections,
  resetRuntimeCaches,
  setFacetSelectionsFromDom,
  setFacetUniverse,
  setLoadedLeagueData,
  setTeamAndKeepOpponents,
  snapshotFacetState,
};
