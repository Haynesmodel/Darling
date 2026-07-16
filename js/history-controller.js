import { byDateDesc, canonicalGameKey } from './core-helpers.js';
import { loadLeagueAssets } from './data-helpers.js';
import {
  buildHistoryGameRows,
  queryHistoryGames,
} from './history-game-query.js';
import {
  bestStreakForTeam,
  computeBottomNWeeklyScoresAllTeams,
  computeExpectedWinForGame,
  computeHeadToHeadPairs,
  computeLeagueRowsSingleWeeks,
  computeLongestStreaksGlobal,
  computeLongestTeamStreaks,
  computeLuckSummary,
  computeSeasonAggregatesAllTeams,
  computeSubThresholdGamesPerTeam,
  computeTeamsFromLeagueGames,
  computeTopNWeeklyScoresAllTeams,
  computeWeeklyAwards,
} from './stats-helpers.js';
import {
  clearAppStatus,
  renderHeaderBanners,
  setAppStatus,
  showPage,
  updateTeamHeader,
} from './render-helpers.js';
import {
  applyFacetFilters,
  buildHistoryCsvText,
  parseUrlState,
  updateUrlFromState,
} from './state-helpers.js';
import {
  buildHistoryRenderKeys,
  facetStateKey as buildFacetStateKey,
  setLoadedLeagueData,
  setTeamAndKeepOpponents,
  snapshotFacetState,
} from './app-state-controller.js';
import {
  opponentBreakdownView,
  opponentBreakdownRows,
  renderTopHighlights,
  seasonRecapOutcome,
  seasonRecapRows,
  seasonCalloutView,
  weekByWeekRows,
} from './history-renderers.js';
import {
  readCurseTrackerFilters,
  renderCurseTracker,
} from './curse-tracker.js';
import {
  leagueFunFactsAllTeamsHtml,
  leagueFunListsAllTeamsHtml,
  leagueSummaryTablesHtml,
  teamFunFactsView,
} from './league-renderers.js';
import {
  buildRivalryControls,
} from './rivalry-controls.js';
import {
  buildCurrentSeasonControls,
} from './current-season-controls.js';
import {
  latestLeagueSeason,
} from './current-season-data.js';
import {
  buildCurrentSeasonViewModel,
  renderCurrentCommandCenter,
  renderCurrentMatchups,
  renderCurrentSeasonHero,
  renderCurrentStandings,
  renderCurrentTeamSnapshots,
} from './current-season-renderers.js';
import {
  buildRivalryViewModel,
  renderRivalryHighlightBoard,
  renderRivalryLeadMeter,
  renderRivalryLeadTrend,
  renderRivalryHeadline,
  renderRivalryTimeline,
  renderRivalryTape,
} from './rivalry-renderers.js';
import { setGroupBackdrop, triggerGroupEgg } from './easter-eggs.js';
import {
  buildHistoryControls,
  readFacetSelections,
  rebuildOpponentFacet,
  resetFacetControls,
  setFacetSelections,
  updateFacetCountTexts,
} from './history-controls.js';
import { opponentOptions, teamOptions } from './facet-helpers.js';
import {
  buildTrophyControls,
} from './trophy-controls.js';
import {
  buildTrophyCaseViewModel,
  renderTrophyHero,
  renderTrophyHardwareShelf,
  renderTrophyRankStrip,
  renderTrophyCareerShape,
  renderTrophyAchievementList,
  renderTrophyScarList,
} from './trophy-renderers.js';
import {
  buildDynastyControls,
} from './dynasty-controls.js';
import {
  findDynastyWindowByKey,
  findDynastyWindowByKeyFromRows,
  buildDynastyViewModel,
  renderDynastyCalculatorHero,
  renderDynastyScoreBreakdown,
  renderDynastyPeriodLeaderboard,
  renderDynastyBestWindows,
  renderDynastyHeatmap,
  renderDynastyTrendChart,
  renderDynastyWindowModal,
  renderDynastySlumpModal,
  renderDynastySlumps,
} from './dynasty-renderers.js';
import {
  buildTeamSeasons,
  teamSeasonId,
  headToHeadContext,
} from './gauntlet-data.js';
import {
  buildGauntletControls,
  resolveGauntletInitialState,
  readGauntletControls,
  syncGauntletControls,
} from './gauntlet-controls.js';
import {
  gauntletNarrativeText,
  gauntletModelLabel,
  renderGauntlet as renderGauntletView,
} from './gauntlet-renderers.js';
import { simulateMatchup } from './gauntlet-simulator.js';

const DEFAULT_TEAM = 'Joe';
const ALL_TEAMS = '__ALL__';
const BLOWOUT_MARGIN = 29;
const HIGH_SCORE_THRESHOLD = 150;
const SUB_SCORE_THRESHOLD = 70;
const CLOSE_GAME_MARGIN = 5;

function ownerOrNull(owner) {
  const value = String(owner || '').trim();
  return value && value !== ALL_TEAMS ? value : null;
}

function seasonModeFromLabels(labels = []) {
  let sawPostseason = false;
  let sawSaunders = false;
  labels.forEach((label) => {
    const value = String(label || '').trim().toLowerCase();
    if (!value || value === 'regular') return;
    if (value.includes('saunders')) sawSaunders = true;
    if (
      value.includes('playoff') ||
      value.includes('championship') ||
      value.includes('wild card') ||
      value.includes('semi final') ||
      value.includes('final')
    ) {
      sawPostseason = true;
    }
  });
  if (sawSaunders) return 'saunders';
  if (sawPostseason) return 'postseason';
  return 'regular';
}

function applyAppThemeContext(context = {}) {
  const fallback = {
    accentKind: 'league',
    seasonMode: 'regular',
    ...context,
  };
  if (typeof window !== 'undefined' && window.darlingTheme?.applyAppContext) {
    window.darlingTheme.applyAppContext(fallback);
    return;
  }
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.dataset.accentTheme = fallback.accentKind || 'league';
  root.dataset.seasonMode = fallback.seasonMode || 'regular';
  if (fallback.owner) root.dataset.ownerTheme = fallback.owner;
  else delete root.dataset.ownerTheme;
  if (fallback.rivalryA) root.dataset.rivalryA = fallback.rivalryA;
  else delete root.dataset.rivalryA;
  if (fallback.rivalryB) root.dataset.rivalryB = fallback.rivalryB;
  else delete root.dataset.rivalryB;
}

function historySeasonMode() {
  return seasonModeFromLabels([
    ...selectedTypes,
    ...selectedRounds,
  ]);
}

function currentSeasonMode(view) {
  const week = Number(view?.week);
  const season = Number(view?.season);
  const selectedGames = [...(currentSeason?.games || []), ...leagueGames]
    .filter(game => Number(game.season) === season && Number(game.week) === week);
  const labelMode = seasonModeFromLabels(selectedGames.flatMap(game => [game.type, game.round]));
  if (labelMode !== 'regular') return labelMode;
  const regularSeasonMaxWeek = Number(currentSeason?.playoff_rules?.regular_season_max_week);
  return Number.isFinite(week) && Number.isFinite(regularSeasonMaxWeek) && week > regularSeasonMaxWeek
    ? 'postseason'
    : 'regular';
}

function applyOwnerThemeContext(owner, seasonMode = 'regular') {
  const normalizedOwner = ownerOrNull(owner);
  applyAppThemeContext(normalizedOwner
    ? { accentKind: 'owner', owner: normalizedOwner, seasonMode }
    : { accentKind: 'league', seasonMode });
}

function applyRivalryThemeContext(ownerA, ownerB, seasonMode = 'regular') {
  const rivalryA = ownerOrNull(ownerA);
  const rivalryB = ownerOrNull(ownerB);
  if (rivalryA && rivalryB && rivalryA !== rivalryB) {
    applyAppThemeContext({ accentKind: 'rivalry', rivalryA, rivalryB, seasonMode });
    return;
  }
  applyOwnerThemeContext(rivalryA || rivalryB, seasonMode);
}

let leagueGames = [];
let seasonSummaries = [];
let rivalries = [];
let currentSeason = null;
let derivedStats = null;
let dataVersion = null;
let dataDiagnostics = null;
let selectedTeam = DEFAULT_TEAM;
let selectedSeasons = new Set();
let selectedWeeks = new Set();
let selectedOpponents = new Set();
let selectedTypes = new Set();
let selectedRounds = new Set();
let selectedRivalryTeamA = DEFAULT_TEAM;
let selectedRivalryTeamB = null;
let selectedRivalryScope = 'allTime';
let selectedCurrentSeasonState = null;
let selectedTrophyOwner = DEFAULT_TEAM;
let selectedDynastyState = null;
let selectedGauntletState = null;
let universe = { seasons: [], weeks: [], opponents: [], types: [], rounds: [] };
let isApplyingUrlState = false;
let derivedWeeksSet = new Set();
let seasonAggregatesCache = null;
let weeklyAwardsCache = null;
let teamsFromLeagueGamesCache = null;
let teamSeasonsCache = new Map();
const headToHeadPairsCache = new Map();
const renderSectionCache = new Map();
let filteredGamesCacheKey = null;
let filteredGamesCacheValue = [];
const renderMetrics = { filterRuns: 0 };
let lastEffectKey = null;
let listenersBound = false;
let dynastyModalOpener = null;
let dynastyModalOpenerKey = null;
let suppressNextDynastyModalClose = false;

const SPECIAL_TITLE_NOTES = {
  Joel: { champs: { 2014: 'Singer not in league', 2020: 'COVID season' } },
  Joe: { saunders: { 2015: 'Saunders Bowl matchups incorrect' } },
};
const champNote = (owner, season) => SPECIAL_TITLE_NOTES[owner]?.champs?.[season] || null;
const saundersNote = (owner, season) => SPECIAL_TITLE_NOTES[owner]?.saunders?.[season] || null;

if (typeof window !== 'undefined') {
  window.__darlingRenderMetrics = renderMetrics;
}

function currentFacetState() {
  return snapshotFacetState({
    selectedTeam,
    selectedSeasons,
    selectedWeeks,
    selectedOpponents,
    selectedTypes,
    selectedRounds,
    universe,
    allTeams: ALL_TEAMS,
  });
}

function historyTableUrlState() {
  const state = parseUrlState();
  return {
    seasons: [...(state.seasons || [])],
    weeks: [...(state.weeks || [])],
    opps: [...(state.opps || [])],
    types: [...(state.types || [])],
    rounds: [...(state.rounds || [])],
    gameResult: state.gameResult,
    gameMinScore: state.gameMinScore,
    gameMaxScore: state.gameMaxScore,
    gameSort: state.gameSort,
    gameLimit: state.gameLimit,
  };
}

function filteredGamesForCurrentState() {
  const state = currentFacetState();
  const key = buildFacetStateKey(state);
  if (filteredGamesCacheKey === key) return filteredGamesCacheValue;
  filteredGamesCacheKey = key;
  filteredGamesCacheValue = applyFacetFilters(leagueGames, state);
  renderMetrics.filterRuns++;
  return filteredGamesCacheValue;
}

function renderIfChanged(section, signature, renderFn) {
  if (renderSectionCache.get(section) === signature) return;
  renderFn();
  renderSectionCache.set(section, signature);
}

function subThresholdGamesPerTeam(threshold = SUB_SCORE_THRESHOLD) {
  if (threshold === 70 && derivedStats?.records?.sub_70) return derivedStats.records.sub_70;
  return computeSubThresholdGamesPerTeam(leagueGames, threshold);
}

function longestLosingStreaksAllTeams(n = 10) {
  return computeLongestTeamStreaks(leagueGames, teamsFromLeagueGames(), 'L', n);
}

function longestWinStreaksAllTeams(n = 5) {
  return computeLongestTeamStreaks(leagueGames, teamsFromLeagueGames(), 'W', n);
}

function seasonAggregatesAllTeams() {
  if (seasonAggregatesCache) return seasonAggregatesCache;
  seasonAggregatesCache = derivedStats?.season_aggregates || computeSeasonAggregatesAllTeams(leagueGames, seasonSummaries);
  return seasonAggregatesCache;
}

function headToHeadPairs(minGames = 5) {
  if (headToHeadPairsCache.has(minGames)) return headToHeadPairsCache.get(minGames);
  const rows = derivedStats?.head_to_head_pairs
    ? derivedStats.head_to_head_pairs.filter(row => row.g >= minGames)
    : computeHeadToHeadPairs(leagueGames, minGames);
  headToHeadPairsCache.set(minGames, rows);
  return rows;
}

function weeklyAwards() {
  if (weeklyAwardsCache) return weeklyAwardsCache;
  weeklyAwardsCache = derivedStats?.weekly_awards || computeWeeklyAwards(leagueGames, HIGH_SCORE_THRESHOLD);
  return weeklyAwardsCache;
}

function teamSeasons(includePostseason = false) {
  const cacheKey = includePostseason ? 'postseason' : 'regular';
  if (teamSeasonsCache.has(cacheKey)) return teamSeasonsCache.get(cacheKey);
  const precomputed = includePostseason ? null : derivedStats?.team_seasons;
  const built = precomputed || buildTeamSeasons(leagueGames, seasonSummaries, { includePostseason });
  teamSeasonsCache.set(cacheKey, built);
  return built;
}

function handleRivalryChange(next) {
  selectedRivalryTeamA = next.selectedTeamA;
  selectedRivalryTeamB = next.selectedTeamB;
  renderRivalry();
}

function normalizeRivalryScope(scope) {
  return ['allTime', 'currentSeason', 'historic'].includes(scope) ? scope : 'allTime';
}

function handleRivalryScopeChange() {
  const scopeSelect = document.getElementById('rivalryScopeSelect');
  selectedRivalryScope = normalizeRivalryScope(scopeSelect?.value);
  renderRivalry();
}

function handleCurrentSeasonChange(next) {
  selectedCurrentSeasonState = {
    ...(selectedCurrentSeasonState || {}),
    ...next,
  };
  renderCurrentSeason();
}

function handleTrophyChange(next) {
  selectedTrophyOwner = next.selectedOwner;
  renderTrophy();
}

function applySavedTableContext(tableId, context = {}, urlState) {
  if (tableId.startsWith('history-')) {
    updateUrlFromState({
      ...currentFacetState(),
      selectedTeam: context.owner || ALL_TEAMS,
      ...(urlState ? {
        selectedSeasons: new Set(urlState.seasons || []),
        selectedWeeks: new Set(urlState.weeks || []),
        selectedOpponents: new Set(urlState.opps || []),
        selectedTypes: new Set(urlState.types || []),
        selectedRounds: new Set(urlState.rounds || []),
        selectedGameResult: urlState.gameResult,
        selectedGameMinScore: urlState.gameMinScore,
        selectedGameMaxScore: urlState.gameMaxScore,
        selectedGameSort: urlState.gameSort,
        selectedGameLimit: urlState.gameLimit,
      } : {}),
      isApplyingUrlState: false,
    });
  } else if (tableId.startsWith('rivalry-')) {
    updateUrlFromState({
      tab: 'rivalry',
      selectedRivalryTeamA: context.rivalryA || selectedRivalryTeamA,
      selectedRivalryTeamB: context.rivalryB || selectedRivalryTeamB,
      selectedRivalryScope,
      isApplyingUrlState: false,
    });
  } else if (tableId.startsWith('current-')) {
    updateUrlFromState({
      tab: 'current',
      selectedCurrentSeason: context.season || selectedCurrentSeasonState?.selectedSeason,
      selectedCurrentWeek: selectedCurrentSeasonState?.selectedWeek,
      selectedCurrentOwner: context.selectedOwner || null,
      selectedCurrentView: selectedCurrentSeasonState?.selectedView,
      selectedCurrentProjection: selectedCurrentSeasonState?.selectedProjectionMode,
      isApplyingUrlState: false,
    });
  } else if (tableId === 'trophy-seasons') {
    updateUrlFromState({
      tab: 'trophy',
      selectedTrophyOwner: context.owner || selectedTrophyOwner,
      isApplyingUrlState: false,
    });
  }
  const historyCacheKeys = {
    'history-opponents': 'oppBreakdown',
    'history-seasons': 'seasonRecap',
    'history-weeks': 'weekByWeek',
    'history-games': 'gamesTable',
  };
  const cacheKey = historyCacheKeys[tableId]
    || (tableId.startsWith('rivalry-') ? 'rivalry' : null)
    || (tableId.startsWith('current-') ? 'current' : null)
    || (tableId === 'trophy-seasons' ? 'trophy' : null);
  if (cacheKey) renderSectionCache.delete(cacheKey);
  applyUrlState(parseUrlState());
}

function handleGauntletChange(next) {
  const derivedSeed = `${teamSeasonId(next.selectedOwnerA, next.selectedSeasonA)}|${teamSeasonId(next.selectedOwnerB, next.selectedSeasonB)}|${next.selectedModel}|${next.selectedIncludePostseason ? 'postseason' : 'regular'}|${next.selectedSimulations}`;
  const explicitSeed = next.seedSource === 'explicit' || selectedGauntletState?.seedSource === 'explicit';
  selectedGauntletState = {
    ...next,
    seed: explicitSeed ? (next.seed || selectedGauntletState?.seed || derivedSeed) : derivedSeed,
    seedSource: explicitSeed ? 'explicit' : 'derived',
  };
  renderGauntlet();
}

function ensureRivalryControls(initialState = {}) {
  const teamASelect = document.getElementById('rivalryTeamA');
  if (!teamASelect) return null;
  const scopeSelect = document.getElementById('rivalryScopeSelect');
  const urlState = parseUrlState();
  const nextScope = normalizeRivalryScope(initialState.selectedScope || urlState.rivalryScope || selectedRivalryScope);
  selectedRivalryScope = nextScope;
  if (scopeSelect) {
    scopeSelect.value = nextScope;
    if (!scopeSelect.dataset.bound) {
      scopeSelect.addEventListener('change', handleRivalryScopeChange);
      scopeSelect.dataset.bound = '1';
    }
  }

  const built = buildRivalryControls({
    doc: document,
    leagueGames,
    seasonSummaries,
    rivalries,
    selectedTeamA: initialState.selectedTeamA || urlState.rivalryTeamA || selectedRivalryTeamA || selectedTeam,
    selectedTeamB: initialState.selectedTeamB || urlState.rivalryTeamB || selectedRivalryTeamB,
    allTeams: ALL_TEAMS,
    onChange: handleRivalryChange,
  });
  selectedRivalryTeamA = built.selectedTeamA;
  selectedRivalryTeamB = built.selectedTeamB;
  teamASelect.dataset.ready = '1';

  return teamASelect;
}

function ensureCurrentSeasonControls(initialState = {}) {
  const seasonSelect = document.getElementById('currentSeasonSelect');
  if (!seasonSelect) return null;

  const urlState = parseUrlState();
  const selectedState = {
    ...(selectedCurrentSeasonState || {}),
    ...initialState,
  };

  if (!seasonSelect.dataset.ready) {
    const built = buildCurrentSeasonControls({
      doc: document,
      leagueGames,
      seasonSummaries,
      currentSeason,
      selectedSeason: selectedState.selectedSeason || urlState.currentSeason,
      selectedWeek: selectedState.selectedWeek || urlState.currentWeek,
      selectedOwner: selectedState.selectedOwner ?? urlState.currentOwner ?? '',
      selectedView: selectedState.selectedView || urlState.currentView || 'command',
      selectedProjectionMode: selectedState.selectedProjectionMode || urlState.currentProjection || 'ifScoresHold',
      onChange: handleCurrentSeasonChange,
    });
    selectedCurrentSeasonState = {
      selectedSeason: built.selectedSeason,
      selectedWeek: built.selectedWeek,
      selectedOwner: built.selectedOwner,
      selectedView: built.selectedView,
      selectedProjectionMode: built.selectedProjectionMode,
    };
    seasonSelect.dataset.ready = '1';
  } else {
    const built = buildCurrentSeasonControls({
      doc: document,
      leagueGames,
      seasonSummaries,
      currentSeason,
      selectedSeason: selectedState.selectedSeason || urlState.currentSeason,
      selectedWeek: selectedState.selectedWeek || urlState.currentWeek,
      selectedOwner: selectedState.selectedOwner ?? urlState.currentOwner ?? '',
      selectedView: selectedState.selectedView || urlState.currentView || 'command',
      selectedProjectionMode: selectedState.selectedProjectionMode || urlState.currentProjection || 'ifScoresHold',
      onChange: handleCurrentSeasonChange,
    });
    selectedCurrentSeasonState = {
      selectedSeason: built.selectedSeason,
      selectedWeek: built.selectedWeek,
      selectedOwner: built.selectedOwner,
      selectedView: built.selectedView,
      selectedProjectionMode: built.selectedProjectionMode,
    };
  }

  return seasonSelect;
}

function ensureTrophyControls(initialState = {}) {
  const ownerSelect = document.getElementById('trophyOwnerSelect');
  if (!ownerSelect) return null;

  const urlState = parseUrlState();
  const built = buildTrophyControls({
    doc: document,
    leagueGames,
    seasonSummaries,
    selectedOwner: initialState.selectedOwner
      || urlState.trophyOwner
      || urlState.team
      || selectedTrophyOwner
      || selectedTeam,
    allTeams: ALL_TEAMS,
    onChange: handleTrophyChange,
  });
  selectedTrophyOwner = built.selectedOwner;
  ownerSelect.dataset.ready = '1';

  return ownerSelect;
}

function ensureGauntletControls(initialState = {}) {
  const container = document.getElementById('gauntletControls');
  if (!container) return null;

  const urlState = parseUrlState();
  const currentState = urlState.hasGauntlet ? null : (initialState.selectedOwnerA ? initialState : selectedGauntletState);
  const resolved = resolveGauntletInitialState({
    teamSeasons: teamSeasons(),
    urlState: urlState.hasGauntlet ? urlState : null,
    currentState,
  });

  if (!container.dataset.ready) {
    selectedGauntletState = buildGauntletControls({
      doc: document,
      teamSeasons: teamSeasons(),
      selectedState: resolved,
      onChange: handleGauntletChange,
    });
    container.dataset.ready = '1';
  } else {
    selectedGauntletState = resolved;
    buildGauntletControls({
      doc: document,
      teamSeasons: teamSeasons(),
      selectedState: selectedGauntletState,
      onChange: handleGauntletChange,
    });
  }

  return container;
}

function renderRivalry() {
  if (!selectedRivalryTeamA || !selectedRivalryTeamB) return;

  const currentSeasonYear = selectedCurrentSeasonState?.selectedSeason || latestLeagueSeason(leagueGames, seasonSummaries, currentSeason);
  const view = buildRivalryViewModel(selectedRivalryTeamA, selectedRivalryTeamB, leagueGames, {
    scope: selectedRivalryScope,
    currentSeason: currentSeasonYear,
  });
  const signature = `${selectedRivalryTeamA}|${selectedRivalryTeamB}|${selectedRivalryScope}|${currentSeasonYear}|${view.summary.overall.g}`;
  updateHeaderForTeam(selectedRivalryTeamA);
  applyRivalryThemeContext(selectedRivalryTeamA, selectedRivalryTeamB);
  renderIfChanged('rivalry', signature, () => {
    renderRivalryHeadline(view, { doc: document });
    renderRivalryLeadMeter(view, { doc: document });
    renderRivalryHighlightBoard(view, { doc: document });
    renderRivalryTape(view, { doc: document });
    renderRivalryLeadTrend(view, { doc: document });
    renderRivalryTimeline(view, { doc: document });
    window.darlingTables?.render?.('rivalry-seasons', {
      rows: view.seasonRows,
      context: { rivalryA: view.teamA, rivalryB: view.teamB },
      onContextChange: (context, urlState) => applySavedTableContext('rivalry-seasons', context, urlState),
      instanceKey: `${view.teamA}|${view.teamB}|${view.scope}`,
    });
    window.darlingTables?.render?.('rivalry-games', {
      rows: view.gameRows,
      context: { rivalryA: view.teamA, rivalryB: view.teamB },
      onContextChange: (context, urlState) => applySavedTableContext('rivalry-games', context, urlState),
      instanceKey: `${view.teamA}|${view.teamB}|${view.scope}`,
    });
    if (document.title !== undefined) {
      document.title = `${selectedRivalryTeamA} vs ${selectedRivalryTeamB} \u2014 Head to Head`;
    }
  });
  updateUrlFromState({
    tab: 'rivalry',
    selectedRivalryTeamA,
    selectedRivalryTeamB,
    selectedRivalryScope,
    isApplyingUrlState,
  });
}

function updateHeaderForCurrentSeason(view) {
  const h2 = document.querySelector('header h2');
  if (h2) h2.textContent = view?.season ? `${view.season} Current Season` : 'Current Season';
  renderHeaderBanners('', seasonSummaries);
  if (document.title !== undefined) {
    document.title = view?.season ? `${view.season} Current Season` : 'Current Season';
  }
}

function renderCurrentSeason() {
  const resolvedState = selectedCurrentSeasonState || {};
  const view = buildCurrentSeasonViewModel({
    leagueGames,
    seasonSummaries,
    currentSeason,
    season: resolvedState.selectedSeason,
    week: resolvedState.selectedWeek,
    selectedOwner: resolvedState.selectedOwner,
    selectedView: resolvedState.selectedView,
    projectionMode: resolvedState.selectedProjectionMode,
  });

  selectedCurrentSeasonState = {
    selectedSeason: view.season,
    selectedWeek: view.week,
    selectedOwner: view.commandCenter.selectedOwner,
    selectedView: view.commandCenter.selectedView,
    selectedProjectionMode: view.commandCenter.selectedProjectionMode,
  };
  updateHeaderForCurrentSeason(view);
  applyOwnerThemeContext(view.commandCenter.selectedOwner, currentSeasonMode(view));

  const signature = JSON.stringify({
    season: view.season,
    week: view.week,
    games: view.regularGames.length,
    matchups: view.matchups.map(row => `${row.teamA}:${row.teamB}:${row.scoreA}:${row.scoreB}`).join('|'),
    standings: view.standings.map(row => `${row.owner}:${row.record}:${row.pointsFor}:${row.pointsAgainst}`).join('|'),
    owner: view.commandCenter.selectedOwner,
    mode: view.commandCenter.selectedView,
    projection: view.commandCenter.selectedProjectionMode,
    picture: view.commandCenter.playoffPicture.map(row => `${row.owner}:${row.currentSeed}:${row.projectedSeed}:${row.status.key}`).join('|'),
  });

  renderIfChanged('current', signature, () => {
    renderCurrentSeasonHero(view, { doc: document });
    renderCurrentCommandCenter(view, { doc: document });
    renderCurrentMatchups(view, { doc: document });
    renderCurrentStandings(view, { doc: document });
    renderCurrentTeamSnapshots(view, { doc: document });
    window.darlingTables?.render?.('current-standings', {
      rows: view.standings,
      context: {
        season: view.season,
        selectedOwner: view.commandCenter.selectedOwner,
        playoffPicture: view.commandCenter.playoffPicture,
      },
      onContextChange: (context, urlState) => applySavedTableContext('current-standings', context, urlState),
      instanceKey: `${view.season}|${view.commandCenter.selectedView}`,
    });
    window.darlingTables?.render?.('current-projected', {
      rows: view.commandCenter.projectedStandings,
      context: {
        season: view.season,
        selectedOwner: view.commandCenter.selectedOwner,
        modelLabel: view.commandCenter.modelLabel,
      },
      onContextChange: (context, urlState) => applySavedTableContext('current-projected', context, urlState),
      instanceKey: `${view.season}|${view.commandCenter.selectedView}|${view.commandCenter.selectedProjectionMode}`,
    });
  });

  updateUrlFromState({
    tab: 'current',
    selectedCurrentSeason: view.season,
    selectedCurrentWeek: view.week,
    selectedCurrentOwner: view.commandCenter.selectedOwner,
    selectedCurrentView: view.commandCenter.selectedView,
    selectedCurrentProjection: view.commandCenter.selectedProjectionMode,
    isApplyingUrlState,
  });
}

function renderTrophy() {
  if (!selectedTrophyOwner) return;

  const signature = selectedTrophyOwner;
  updateHeaderForTrophy(selectedTrophyOwner);
  applyOwnerThemeContext(selectedTrophyOwner);
  renderIfChanged('trophy', signature, () => {
    const view = buildTrophyCaseViewModel(selectedTrophyOwner, {
      leagueGames,
      seasonSummaries,
      weeklyAwards: weeklyAwards(),
      seasonAggregates: seasonAggregatesAllTeams(),
      ownerCareers: derivedStats?.owner_careers || null,
      champNoteFn: champNote,
      saundersNoteFn: saundersNote,
    });

    renderTrophyHero(view, { doc: document });
    renderTrophyHardwareShelf(view, { doc: document });
    renderTrophyRankStrip(view, { doc: document });
    renderTrophyCareerShape(view, { doc: document });
    renderTrophyAchievementList(view, { doc: document });
    renderTrophyScarList(view, { doc: document });
    window.darlingTables?.render?.('trophy-seasons', {
      rows: view.seasonLedger,
      context: { owner: view.owner },
      onContextChange: (context, urlState) => applySavedTableContext('trophy-seasons', context, urlState),
      instanceKey: view.owner,
    });
  });

  updateUrlFromState({
    tab: 'trophy',
    selectedTrophyOwner,
    isApplyingUrlState,
  });
}

function handleDynastyChange(next) {
  selectedDynastyState = {
    ...(selectedDynastyState || {}),
    ...next,
  };
  renderDynasty();
}

function handleDynastyTrendToggle(owner) {
  if (!owner) return;
  const current = Array.isArray(selectedDynastyState?.chartHiddenOwners)
    ? selectedDynastyState.chartHiddenOwners
    : [];
  const hidden = new Set(current);
  if (hidden.has(owner)) hidden.delete(owner);
  else hidden.add(owner);
  selectedDynastyState = {
    ...(selectedDynastyState || {}),
    chartHiddenOwners: [...hidden].sort((a, b) => a.localeCompare(b)),
  };
  renderDynasty();
}

function handleDynastyWindowCardClick(key) {
  if (!key) return;
  selectedDynastyState = {
    ...(selectedDynastyState || {}),
    selectedWindowKey: key,
    selectedWindowKind: 'playoffs',
  };
  renderDynasty();
}

function handleDynastySlumpCardClick(key) {
  if (!key) return;
  selectedDynastyState = {
    ...(selectedDynastyState || {}),
    selectedWindowKey: key,
    selectedWindowKind: 'saunders',
  };
  renderDynasty();
}

function restoreDynastyModalFocus() {
  if (!dynastyModalOpener && !dynastyModalOpenerKey) return;
  const fallback = document.querySelector('#dynastyBestWindows h4, #page-dynasty h3');
  const replacement = dynastyModalOpenerKey
    ? [...document.querySelectorAll('[data-window-key]')]
      .find(element => element.dataset.windowKey === dynastyModalOpenerKey)
    : null;
  const target = dynastyModalOpener?.isConnected ? dynastyModalOpener : replacement || fallback;
  dynastyModalOpener = null;
  dynastyModalOpenerKey = null;
  requestAnimationFrame(() => target?.focus?.());
}

function handleDynastyWindowModalClose() {
  if (suppressNextDynastyModalClose) {
    suppressNextDynastyModalClose = false;
    return;
  }
  if (selectedDynastyState?.selectedWindowKey) {
    selectedDynastyState = {
      ...(selectedDynastyState || {}),
      selectedWindowKey: null,
      selectedWindowKind: null,
    };
    renderDynasty();
  }
  restoreDynastyModalFocus();
}

function closeDynastyWindowForNavigation(modal) {
  if (selectedDynastyState) {
    selectedDynastyState = {
      ...selectedDynastyState,
      selectedWindowKey: null,
      selectedWindowKind: null,
    };
  }
  dynastyModalOpener = null;
  dynastyModalOpenerKey = null;
  suppressNextDynastyModalClose = !!modal?.open;
  if (modal?.open && typeof modal.close === 'function') modal.close();
  modal?.replaceChildren?.();
  document.body.classList.remove('no-scroll');
}

function applyHistoryUrlState(urlState = parseUrlState()) {
  const teamSelect = document.getElementById('teamSelect');
  if (!teamSelect) return;

  const teams = teamOptions(seasonSummaries, leagueGames, ALL_TEAMS);
  const defaultTeam = teams.find(t => t.value === DEFAULT_TEAM)?.value || teams[0]?.value || DEFAULT_TEAM;
  const leagueWideGameSearch = !urlState.team && (
    urlState.hasGameQuery
    || (urlState.focus === 'games' && (urlState.seasons?.size || urlState.types?.size || urlState.rounds?.size))
  );
  const nextTeam = (urlState.team && teams.some(t => t.value === urlState.team))
    ? urlState.team
    : leagueWideGameSearch
      ? ALL_TEAMS
      : defaultTeam;

  selectedTeam = nextTeam;
  teamSelect.value = nextTeam;
  updateHeaderForTeam(selectedTeam);

  rebuildOpponentFacet({
    doc: document,
    leagueGames,
    selectedTeam,
    allTeams: ALL_TEAMS,
    onFacetChange: syncFacetStateFromDom,
  });

  universe.opponents = opponentOptions(leagueGames, selectedTeam, ALL_TEAMS);
  setFacetSelections('seasonFilters', 'season', urlState.seasons, document);
  setFacetSelections('weekFilters', 'week', urlState.weeks, document);
  setFacetSelections('oppFilters', 'opp', urlState.opps, document);
  setFacetSelections('typeFilters', 'type', urlState.types, document);
  setFacetSelections('roundFilters', 'round', urlState.rounds, document);

  if (urlState.hasAny) {
    syncFacetStateFromDom();
  } else {
    resetAllFacetsToAll();
  }
}

function applyUrlState(urlState = parseUrlState()) {
  isApplyingUrlState = true;
  try {
    showPage(urlState.tab === 'current' ? 'current' : urlState.tab === 'rivalry' ? 'rivalry' : urlState.tab === 'trophy' ? 'trophy' : urlState.tab === 'dynasty' ? 'dynasty' : urlState.tab === 'gauntlet' ? 'gauntlet' : 'history');
    if (urlState.tab === 'current') {
      ensureCurrentSeasonControls({
        selectedSeason: urlState.currentSeason,
        selectedWeek: urlState.currentWeek,
        selectedOwner: urlState.currentOwner || '',
        selectedView: urlState.currentView || 'command',
        selectedProjectionMode: urlState.currentProjection || 'ifScoresHold',
      });
      renderCurrentSeason();
      return;
    }
    if (urlState.tab === 'rivalry') {
      ensureRivalryControls({
        selectedTeamA: urlState.rivalryTeamA || selectedRivalryTeamA,
        selectedTeamB: urlState.rivalryTeamB || selectedRivalryTeamB,
        selectedScope: urlState.rivalryScope || selectedRivalryScope,
      });
      renderRivalry();
      return;
    }
    if (urlState.tab === 'trophy') {
      ensureTrophyControls({
        selectedOwner: urlState.trophyOwner || selectedTrophyOwner,
      });
      renderTrophy();
      return;
    }
    if (urlState.tab === 'dynasty') {
      ensureDynastyControls({
        mode: urlState.dynastyMode || 'calculator',
        owner: urlState.dynastyOwner || null,
        startSeason: urlState.dynastyStart,
        endSeason: urlState.dynastyEnd,
        requestedStartSeason: urlState.dynastyStart,
        requestedEndSeason: urlState.dynastyEnd,
        minSeasons: urlState.dynastyMinSeasons ?? 2,
        includeSaundersPenalty: urlState.dynastySaunders ?? true,
      });
      renderDynasty();
      return;
    }
    if (urlState.tab === 'gauntlet') {
      ensureGauntletControls({
        ...(selectedGauntletState || {}),
        selectedOwnerA: selectedGauntletState?.selectedOwnerA,
        selectedSeasonA: selectedGauntletState?.selectedSeasonA,
        selectedOwnerB: selectedGauntletState?.selectedOwnerB,
        selectedSeasonB: selectedGauntletState?.selectedSeasonB,
        selectedModel: selectedGauntletState?.selectedModel,
        selectedIncludePostseason: selectedGauntletState?.selectedIncludePostseason,
        selectedSimulations: selectedGauntletState?.selectedSimulations,
        seed: selectedGauntletState?.seed,
        seedSource: selectedGauntletState?.seedSource,
      });
      renderGauntlet();
      return;
    }
    const teamSelect = ensureHistoryControls();
    if (teamSelect && teamSelect.dataset.ready === '1') {
      applyHistoryUrlState(urlState);
    }
  } finally {
    isApplyingUrlState = false;
    if (urlState.focus) applyFocusTarget(urlState.focus);
  }
}

function ensureDynastyControls(initialState = {}) {
  const modeSelect = document.getElementById('dynastyModeSelect');
  if (!modeSelect) return null;

  if (!modeSelect.dataset.ready) {
    const urlState = parseUrlState();
    const built = buildDynastyControls({
      doc: document,
      seasonSummaries,
      selectedState: initialState,
      urlState,
      allTeams: ALL_TEAMS,
      onChange: handleDynastyChange,
    });
    selectedDynastyState = built;
    modeSelect.dataset.ready = '1';
  }

  return modeSelect;
}

function ensureDynastyTrendControls() {
  const container = document.getElementById('dynastyTrendChart');
  if (!container || container.dataset.bound) return container;
  container.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target : null;
    const button = target?.closest('[data-dynasty-trend-toggle="1"]');
    if (!button || !container.contains(button)) return;
    event.preventDefault();
    handleDynastyTrendToggle(button.dataset.owner);
  });
  container.dataset.bound = '1';
  return container;
}

function ensureDynastyWindowInteractions() {
  const bestWindows = document.getElementById('dynastyBestWindows');
  const slumps = document.getElementById('dynastySlumps');
  const modal = document.getElementById('dynastyWindowModal');
  if (bestWindows && !bestWindows.dataset.bound) {
    bestWindows.addEventListener('click', event => {
      const target = event.target instanceof Element ? event.target : null;
      const button = target?.closest('.dynasty-window-card[data-window-key]');
      if (!button || !bestWindows.contains(button)) return;
      event.preventDefault();
      dynastyModalOpener = button;
      dynastyModalOpenerKey = button.dataset.windowKey;
      handleDynastyWindowCardClick(button.dataset.windowKey);
    });
    bestWindows.dataset.bound = '1';
  }
  if (slumps && !slumps.dataset.bound) {
    slumps.addEventListener('click', event => {
      const target = event.target instanceof Element ? event.target : null;
      const button = target?.closest('.dynasty-slump-item[data-window-key]');
      if (!button || !slumps.contains(button)) return;
      event.preventDefault();
      dynastyModalOpener = button;
      dynastyModalOpenerKey = button.dataset.windowKey;
      handleDynastySlumpCardClick(button.dataset.windowKey);
    });
    slumps.dataset.bound = '1';
  }
  if (modal && !modal.dataset.bound) {
    modal.addEventListener('darling:dialog-navigation-close', event => {
      event.preventDefault();
      closeDynastyWindowForNavigation(modal);
    });
    modal.addEventListener('click', event => {
      const target = event.target instanceof Element ? event.target : null;
      if (target !== modal && !target?.closest('[data-dynasty-modal-close="1"]')) return;
      event.preventDefault();
      handleDynastyWindowModalClose();
    });
    modal.addEventListener('keydown', event => {
      if (event.key !== 'Tab' || !modal.open) return;
      const focusable = window.darlingAccessibility?.focusableElements?.(modal)
        || [...modal.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });
    modal.addEventListener('close', handleDynastyWindowModalClose);
    modal.dataset.bound = '1';
  }
}

function updateHeaderForDynasty(score) {
  const h2 = document.querySelector('header h2');
  const owner = score?.owner || null;
  if (h2) h2.textContent = owner ? `${owner} Dynasty Rankings` : 'Dynasty Rankings';
  if (owner) renderHeaderBanners(owner, seasonSummaries);
  else renderHeaderBanners('', seasonSummaries);
  if (document.title !== undefined) {
    document.title = owner ? `${owner} Dynasty Rankings` : 'Dynasty Rankings';
  }
}

function renderDynasty() {
  if (!selectedDynastyState) return;

  const view = buildDynastyViewModel({
    leagueGames,
    seasonSummaries,
    seasonAggregates: seasonAggregatesAllTeams(),
    ...selectedDynastyState,
    allTeams: ALL_TEAMS,
  });
  const score = view.selectedScore;
  updateHeaderForDynasty(score);
  applyOwnerThemeContext(view.controls.mode === 'calculator' ? view.controls.owner : null, selectedDynastyState?.selectedWindowKind === 'saunders' ? 'saunders' : 'regular');
  const selectedWindowKey = selectedDynastyState?.selectedWindowKey || '';
  const selectedWindowKind = selectedDynastyState?.selectedWindowKind || 'playoffs';
  const selectedWindow = selectedWindowKind === 'saunders'
    ? findDynastyWindowByKeyFromRows(view.slumps.lowestScores, selectedWindowKey)
    : findDynastyWindowByKey(view.bestWindows, selectedWindowKey);

  const signature = JSON.stringify({
    mode: view.controls.mode,
    owner: view.controls.owner,
    startSeason: view.controls.startSeason,
    endSeason: view.controls.endSeason,
    requestedStartSeason: view.controls.requestedStartSeason,
    requestedEndSeason: view.controls.requestedEndSeason,
    minSeasons: view.controls.minSeasons,
    includeSaundersPenalty: view.controls.includeSaundersPenalty,
    score: score?.score ?? null,
    scoreOwner: score?.owner ?? null,
    leaderboardTop: view.periodScores[0]?.owner ?? null,
    windowsTop: view.bestWindows.topOverall[0]?.owner ?? null,
    trendHidden: (selectedDynastyState?.chartHiddenOwners || []).slice().sort().join('|'),
    selectedWindowKey,
    selectedWindowKind,
  });

  renderIfChanged('dynasty', signature, () => {
    renderDynastyCalculatorHero(score, { doc: document });
    renderDynastyScoreBreakdown(score, { doc: document });
    renderDynastyPeriodLeaderboard(view.comparisonRows, {
      doc: document,
      mode: view.controls.mode,
      windowSizeLabel: view.bestWindows.windowSizeLabel,
    });
    renderDynastyBestWindows(view.bestWindows, { doc: document });
    renderDynastyTrendChart(view.trendChart, {
      doc: document,
      hiddenOwners: selectedDynastyState?.chartHiddenOwners || [],
    });
    if (selectedWindowKind === 'saunders') {
      renderDynastySlumpModal(selectedWindow, { doc: document, allGames: leagueGames });
    } else {
      renderDynastyWindowModal(selectedWindow, { doc: document, allGames: leagueGames });
    }
    renderDynastyHeatmap(view.heatmap, { doc: document });
    renderDynastySlumps(view.slumps, { doc: document });
  });
  ensureDynastyTrendControls();
  ensureDynastyWindowInteractions();

  updateUrlFromState({
    tab: 'dynasty',
    selectedDynastyMode: view.controls.mode,
    selectedDynastyOwner: view.controls.owner,
    selectedDynastyStartSeason: view.controls.requestedStartSeason ?? view.controls.startSeason,
    selectedDynastyEndSeason: view.controls.requestedEndSeason ?? view.controls.endSeason,
    selectedDynastyMinSeasons: view.controls.minSeasons,
    selectedDynastySaunders: view.controls.includeSaundersPenalty,
    isApplyingUrlState,
  });
}

async function loadLeagueJSON() {
  setAppStatus('loading', 'Loading league data...');
  try {
    const loaded = await loadLeagueAssets();
    ({ leagueGames, derivedWeeksSet, seasonSummaries, rivalries, currentSeason, derivedStats, dataVersion, diagnostics: dataDiagnostics } = setLoadedLeagueData({
      leagueGames,
      derivedWeeksSet,
      seasonSummaries,
      rivalries,
      currentSeason,
      derivedStats,
      dataVersion,
      diagnostics: dataDiagnostics,
    }, loaded));
    if (typeof window !== 'undefined') {
      window.darlingDataDiagnostics = dataDiagnostics;
      window.__darlingDataVersion = dataVersion;
    }
    seasonAggregatesCache = null;
    weeklyAwardsCache = null;
    teamsFromLeagueGamesCache = null;
    teamSeasonsCache = new Map();
    selectedCurrentSeasonState = null;
    selectedGauntletState = null;
    headToHeadPairsCache.clear();
    renderSectionCache.clear();
    filteredGamesCacheKey = null;
    filteredGamesCacheValue = [];
    renderMetrics.filterRuns = 0;
    lastEffectKey = null;
    clearAppStatus();
    return true;
  } catch (e) {
    console.error('Failed to load league JSON', e);
    const failedAsset = e?.asset ? ` (${e.asset})` : '';
    const versionHint = e?.dataVersion ? ` Data ${String(e.dataVersion).replace(/^sha256:/, '').slice(0, 12)}.` : '';
    setAppStatus('error', `Could not load league data${failedAsset}.${versionHint} Refresh to retry.`);
    return false;
  }
}

function updateHeaderForTeam(team) {
  updateTeamHeader(team, seasonSummaries);
}

function updateHeaderForTrophy(owner) {
  const h2 = document.querySelector('header h2');
  if (h2) h2.textContent = owner;
  renderHeaderBanners(owner, seasonSummaries);
  if (document.title !== undefined) {
    document.title = `${owner} Trophy Case`;
  }
}

function updateHeaderForGauntlet(teamSeasonA, teamSeasonB) {
  const h2 = document.querySelector('header h2');
  if (h2) h2.textContent = 'Historical Matchup';
  renderHeaderBanners('', seasonSummaries);
  if (document.title !== undefined) {
    if (teamSeasonA && teamSeasonB) {
      document.title = `${teamSeasonA.owner} ${teamSeasonA.season} vs ${teamSeasonB.owner} ${teamSeasonB.season} — Historical Matchup`;
    } else {
      document.title = 'Historical Matchup';
    }
  }
}

function buildGauntletCopyText({ teamSeasonA, teamSeasonB, result, context }) {
  if (!teamSeasonA || !teamSeasonB || !result) return '';
  const modelLabel = gauntletModelLabel(result.model, result.includePostseason);
  const lines = [
    `${teamSeasonA.owner} ${teamSeasonA.season} vs ${teamSeasonB.owner} ${teamSeasonB.season}`,
    `Model: ${modelLabel}`,
    `Simulations: ${result.simulations.toLocaleString()}`,
    `Win probability: ${teamSeasonA.owner} ${(result.pctA * 100).toFixed(1)}% (${Math.round(result.actualWinsA || 0).toLocaleString()} wins) | ${teamSeasonB.owner} ${(result.pctB * 100).toFixed(1)}% (${Math.round(result.actualWinsB || 0).toLocaleString()} wins)`,
    `Average score: ${result.avgA.toFixed(1)} - ${result.avgB.toFixed(1)}`,
    `Average margin: ${result.avgMargin >= 0 ? '+' : ''}${result.avgMargin.toFixed(1)}`,
    `Median margin: ${result.medianMargin >= 0 ? '+' : ''}${result.medianMargin.toFixed(1)}`,
  ];
  if (context?.allTime?.games) {
    lines.push(`All-time head-to-head: ${context.allTime.recordA} across ${context.allTime.games} games`);
  }
  if (context?.selected?.games) {
    lines.push(`Selected seasons: ${context.selected.recordA} across ${context.selected.games} games`);
  }
  lines.push(`Current URL: ${window.location.href}`);
  return lines.join('\n');
}

function renderGauntlet() {
  const gauntletContainer = document.getElementById('gauntletControls');
  if (!gauntletContainer) return;

  const resolvedState = selectedGauntletState || resolveGauntletInitialState({
    teamSeasons: teamSeasons(),
    currentState: null,
  });
  const seasons = teamSeasons(resolvedState.selectedIncludePostseason);
  const teamSeasonA = seasons.find(teamSeason => teamSeason.id === teamSeasonId(resolvedState.selectedOwnerA, resolvedState.selectedSeasonA)) || null;
  const teamSeasonB = seasons.find(teamSeason => teamSeason.id === teamSeasonId(resolvedState.selectedOwnerB, resolvedState.selectedSeasonB)) || null;

  updateHeaderForGauntlet(teamSeasonA, teamSeasonB);
  applyRivalryThemeContext(teamSeasonA?.owner, teamSeasonB?.owner, resolvedState.selectedIncludePostseason ? 'postseason' : 'regular');
  if (!teamSeasonA || !teamSeasonB) {
    renderGauntletView({
      teamSeasonA,
      teamSeasonB,
      result: null,
      context: null,
      narrative: 'No matchup selected.',
      copyText: '',
    }, { doc: document });
    return;
  }

  const result = simulateMatchup(teamSeasonA, teamSeasonB, {
    model: resolvedState.selectedModel,
    simulations: resolvedState.selectedSimulations,
    seed: resolvedState.seed,
    includePostseason: resolvedState.selectedIncludePostseason,
  });
  const context = headToHeadContext(teamSeasonA.owner, teamSeasonB.owner, leagueGames, [teamSeasonA.season, teamSeasonB.season]);
  const narrative = gauntletNarrativeText(result, teamSeasonA, teamSeasonB, context);
  const signature = JSON.stringify({
    a: teamSeasonA.id,
    b: teamSeasonB.id,
    model: resolvedState.selectedModel,
    postseason: resolvedState.selectedIncludePostseason,
    sims: resolvedState.selectedSimulations,
    seed: resolvedState.seed,
    pctA: result.pctA,
    pctB: result.pctB,
    avgA: result.avgA,
    avgB: result.avgB,
    avgMargin: result.avgMargin,
    contextA: context.allTime.games,
    contextS: context.selected?.games || 0,
  });

  updateUrlFromState({
    tab: 'gauntlet',
    selectedGauntletA: teamSeasonId(teamSeasonA.owner, teamSeasonA.season),
    selectedGauntletB: teamSeasonId(teamSeasonB.owner, teamSeasonB.season),
    selectedGauntletModel: resolvedState.selectedModel,
    selectedGauntletIncludePostseason: resolvedState.selectedIncludePostseason,
    selectedGauntletSimulations: resolvedState.selectedSimulations,
    selectedGauntletSeed: resolvedState.seed,
    isApplyingUrlState,
  });

  const copyText = buildGauntletCopyText({
    teamSeasonA,
    teamSeasonB,
    result,
    context,
  });

  renderIfChanged('gauntlet', signature, () => {
    renderGauntletView({
      teamSeasonA,
      teamSeasonB,
      result,
      context,
      narrative,
      copyText,
    }, { doc: document });
  });
}

function syncFacetStateFromDom() {
  const next = readFacetSelections({
    doc: document,
    leagueGames,
    derivedWeeksSet,
    selectedTeam,
    allTeams: ALL_TEAMS,
  });
  selectedSeasons = next.selectedSeasons;
  selectedWeeks = next.selectedWeeks;
  selectedOpponents = next.selectedOpponents;
  selectedTypes = next.selectedTypes;
  selectedRounds = next.selectedRounds;
  universe = next.universe;
  updateFacetCountTexts({
    doc: document,
    selectedSeasons,
    selectedWeeks,
    selectedOpponents,
    selectedTypes,
    selectedRounds,
    universe,
  });
  updateUrlFromState({ ...currentFacetState(), isApplyingUrlState });
  renderHistory();
}

function resetAllFacetsToAll() {
  resetFacetControls({ doc: document });
  syncFacetStateFromDom();
}

function handleTeamChange() {
  const teamSelect = document.getElementById('teamSelect');
  if (!teamSelect) return;
  const nextState = setTeamAndKeepOpponents(currentFacetState(), teamSelect.value, opponentOptions(leagueGames, teamSelect.value, ALL_TEAMS));
  selectedTeam = nextState.selectedTeam;
  updateHeaderForTeam(selectedTeam);
  rebuildOpponentFacet({
    doc: document,
    leagueGames,
    selectedTeam,
    allTeams: ALL_TEAMS,
    onFacetChange: syncFacetStateFromDom,
  });
  const nextOpponents = opponentOptions(leagueGames, selectedTeam, ALL_TEAMS);
  setFacetSelections('oppFilters', 'opp', nextState.selectedOpponents, document);
  universe.opponents = nextOpponents;
  syncFacetStateFromDom();
}

function ensureHistoryControls() {
  const teamSel = document.getElementById('teamSelect');
  if (!teamSel) return null;

  if (!teamSel.dataset.ready) {
    const urlState = parseUrlState();
    const teams = teamOptions(seasonSummaries, leagueGames, ALL_TEAMS);
    const defaultTeam = teams.find(t => t.value === DEFAULT_TEAM) ? DEFAULT_TEAM : teams[0].value;
    const initialTeam = (urlState.team && teams.some(t => t.value === urlState.team)) ? urlState.team : defaultTeam;

    const built = buildHistoryControls({
      doc: document,
      leagueGames,
      seasonSummaries,
      derivedWeeksSet,
      allTeams: ALL_TEAMS,
      selectedTeam: initialTeam,
      onFacetChange: syncFacetStateFromDom,
    });
    selectedTeam = built.selectedTeam;
    updateHeaderForTeam(selectedTeam);
    teamSel.dataset.ready = '1';

    if (!teamSel.dataset.bound) {
      teamSel.addEventListener('change', handleTeamChange);
      teamSel.dataset.bound = '1';
    }

    if (urlState.hasAny) {
      const wasApplyingUrlState = isApplyingUrlState;
      isApplyingUrlState = true;
      try {
        setFacetSelections('seasonFilters', 'season', urlState.seasons, document);
        setFacetSelections('weekFilters', 'week', urlState.weeks, document);
        setFacetSelections('oppFilters', 'opp', urlState.opps, document);
        setFacetSelections('typeFilters', 'type', urlState.types, document);
        setFacetSelections('roundFilters', 'round', urlState.rounds, document);
        syncFacetStateFromDom();
      } finally {
        isApplyingUrlState = wasApplyingUrlState;
      }
    } else {
      resetAllFacetsToAll();
    }
  }

  return teamSel;
}

function renderSeasonCallout(team) {
  const callout = document.getElementById('seasonCallout');
  if (!callout) return;
  const view = seasonCalloutView(team, {
    allTeams: ALL_TEAMS,
    selectedSeasons,
    seasonSummaries,
    champNoteFn: champNote,
    saundersNoteFn: saundersNote,
  });
  callout.innerHTML = view.html;
  if (view.resetEffect) lastEffectKey = null;
  if (view.effectKey && view.effectKey !== lastEffectKey) {
    lastEffectKey = view.effectKey;
    if (view.effectType === 'champion') triggerCrownRain();
    else if (view.effectType === 'saunders') triggerSaundersFog();
  }
}

function leagueRowsSingleWeeks() {
  return computeLeagueRowsSingleWeeks(leagueGames);
}

function topNWeeklyScoresAllTeams(n = 5) {
  if (derivedStats?.records?.top_scores && n <= derivedStats.records.top_scores.length) {
    return derivedStats.records.top_scores.slice(0, n);
  }
  return computeTopNWeeklyScoresAllTeams(leagueGames, n);
}

function bottomNWeeklyScoresAllTeams(n = 5) {
  if (derivedStats?.records?.bottom_scores && n <= derivedStats.records.bottom_scores.length) {
    return derivedStats.records.bottom_scores.slice(0, n);
  }
  return computeBottomNWeeklyScoresAllTeams(leagueGames, n);
}

function teamsFromLeagueGames() {
  if (teamsFromLeagueGamesCache) return teamsFromLeagueGamesCache;
  teamsFromLeagueGamesCache = derivedStats?.owners || computeTeamsFromLeagueGames(leagueGames);
  return teamsFromLeagueGamesCache;
}

function longestWinStreaksGlobal(n = 10) {
  if (derivedStats?.streaks?.wins && n <= derivedStats.streaks.wins.length) return derivedStats.streaks.wins.slice(0, n);
  return computeLongestStreaksGlobal(leagueGames, teamsFromLeagueGames(), 'W', n);
}

function longestLosingStreaksGlobal(n = 10) {
  if (derivedStats?.streaks?.losses && n <= derivedStats.streaks.losses.length) return derivedStats.streaks.losses.slice(0, n);
  return computeLongestStreaksGlobal(leagueGames, teamsFromLeagueGames(), 'L', n);
}

function expectedWinForGame(team, g) {
  return computeExpectedWinForGame(leagueGames, team, g);
}

function luckSummary(team, games) {
  return computeLuckSummary(leagueGames, team, games);
}

function renderLeagueSummaryTablesAllTeams() {
  const funLists = document.getElementById('funLists');
  const facts = document.getElementById('funFacts');
  if (!funLists || !facts) return;

  let box = document.getElementById('leagueSummary');
  if (!box) {
    box = document.createElement('div');
    box.id = 'leagueSummary';
    box.className = 'fun-lists';
    facts.parentNode.insertBefore(box, funLists);
  }

  box.innerHTML = leagueSummaryTablesHtml({
    leagueGames,
    seasonSummaries,
    seasonAggregates: seasonAggregatesAllTeams(),
  });
}

function renderFunFactsAllTeams() {
  const el = document.getElementById('funFacts');
  if (!el) return;

  el.innerHTML = leagueFunFactsAllTeamsHtml({
    seasonAggregates: seasonAggregatesAllTeams(),
    minGames: 8,
    winStreak: longestWinStreaksAllTeams(1)[0] || null,
    lossStreak: longestLosingStreaksAllTeams(1)[0] || null,
    headToHeadPairs: headToHeadPairs(5),
    topWeeklyScores: topNWeeklyScoresAllTeams(1),
  });
}

function renderFunListsAllTeams() {
  const el = document.getElementById('funLists');
  if (!el) return;

  el.innerHTML = leagueFunListsAllTeamsHtml({
    leagueGames,
    seasonSummaries,
    seasonAggregates: seasonAggregatesAllTeams(),
    highs: topNWeeklyScoresAllTeams(10),
    lows: bottomNWeeklyScoresAllTeams(10),
    streaks: longestWinStreaksGlobal(10),
    streaksLoss: longestLosingStreaksGlobal(10),
    weeklyAwards: weeklyAwards(),
    sub70: subThresholdGamesPerTeam(SUB_SCORE_THRESHOLD),
    headToHeadPairs: headToHeadPairs(5),
    limit: 10,
  });
}

function renderFunFacts(team, games) {
  if (team === ALL_TEAMS) {
    renderFunFactsAllTeams();
    renderLeagueSummaryTablesAllTeams();
    renderFunListsAllTeams();
    return;
  }
  document.getElementById('leagueSummary')?.remove();
  const box = document.getElementById('funFacts');
  const lists = document.getElementById('funLists');
  if (!box || !lists) return;

  const view = teamFunFactsView(team, games, {
    leagueGames,
    seasonSummaries,
    seasonAggregates: seasonAggregatesAllTeams(),
    winStreak: bestStreakForTeam(games, team, 'W'),
    lossStreak: bestStreakForTeam(games, team, 'L'),
    luckSummary: luckSummary(team, games),
    blowoutMargin: BLOWOUT_MARGIN,
    highScoreThreshold: HIGH_SCORE_THRESHOLD,
    closeGameMargin: CLOSE_GAME_MARGIN,
  });
  box.innerHTML = view.factsHtml;
  lists.innerHTML = view.listsHtml;
}

function renderCurseTrackerSection() {
  return renderCurseTracker({
    doc: document,
    leagueGames,
    seasonSummaries,
    selectedTeam,
    allTeams: ALL_TEAMS,
    seasonAggregates: seasonAggregatesAllTeams(),
    onChange: renderCurseTrackerSection,
  });
}

function renderOppBreakdown(team, games) {
  const titleEl = document.getElementById('oppTableTitle');
  if (!titleEl) return;

  const calloutsBox = document.getElementById('rivalGroupCallouts');

  const view = opponentBreakdownView(team, games, {
    allTeams: ALL_TEAMS,
    rivalries,
    selectedOpponents,
    universeOpponents: universe.opponents,
    selectedWeeks,
    universeWeeks: universe.weeks,
  });

  titleEl.textContent = view.title;
  const rows = opponentBreakdownRows(team, games, {
    allTeams: ALL_TEAMS,
    selectedWeeks,
    universeWeeks: universe.weeks,
  });
  window.darlingTables?.render?.('history-opponents', {
    rows,
    context: {
      owner: team === ALL_TEAMS ? null : team,
      games,
      isLeague: team === ALL_TEAMS,
    },
    urlState: historyTableUrlState(),
    onContextChange: (context, urlState) => applySavedTableContext('history-opponents', context, urlState),
    instanceKey: `${team}|${renderKeysForGames(games)}`,
  });

  if (calloutsBox) {
    calloutsBox.innerHTML = view.calloutsHtml;
    if (view.shouldUpdateBackdrop) {
      if (view.triggerSlug) triggerGroupEgg(view.triggerSlug);
      setGroupBackdrop(view.backdropSlug || null);
    }
  }
}

function renderKeysForGames(games = []) {
  if (!games.length) return 'empty';
  return `${games.length}|${canonicalGameKey(games[0])}|${canonicalGameKey(games[games.length - 1])}`;
}

function updateHistoryGamesSummary(team, games, gameQuery) {
  const summary = document.getElementById('historyGamesQuerySummary');
  if (!summary) return;
  const includeTeam = team === ALL_TEAMS;
  const view = queryHistoryGames(games, {
    selectedTeam: team,
    allTeams: ALL_TEAMS,
    query: gameQuery,
  });
  summary.textContent = (includeTeam || gameQuery?.gameResult || Number.isFinite(gameQuery?.gameMinScore) || Number.isFinite(gameQuery?.gameMaxScore) || gameQuery?.gameSort || gameQuery?.gameLimit)
    ? view.summary
    : '';
}

function handleHistoryGameTableUrlState(gameQuery = {}) {
  updateUrlFromState({
    ...currentFacetState(),
    selectedGameResult: gameQuery.gameResult,
    selectedGameMinScore: gameQuery.gameMinScore,
    selectedGameMaxScore: gameQuery.gameMaxScore,
    selectedGameSort: gameQuery.gameSort,
    selectedGameLimit: gameQuery.gameLimit,
    isApplyingUrlState,
  });
  updateHistoryGamesSummary(selectedTeam, filteredGamesForCurrentState(), gameQuery);
}

function renderHistory() {
  const teamSel = document.getElementById('teamSelect');
  if (teamSel && selectedTeam !== teamSel.value) selectedTeam = teamSel.value;
  updateHeaderForTeam(selectedTeam);
  applyOwnerThemeContext(selectedTeam, historySeasonMode());

  const filtered = filteredGamesForCurrentState();
  const urlState = parseUrlState();
  const gameQuery = {
    gameResult: urlState.gameResult,
    gameMinScore: urlState.gameMinScore,
    gameMaxScore: urlState.gameMaxScore,
    gameSort: urlState.gameSort,
    gameLimit: urlState.gameLimit,
  };
  const curseFilters = readCurseTrackerFilters({
    doc: document,
    selectedTeam,
    allTeams: ALL_TEAMS,
  });
  const renderKeys = buildHistoryRenderKeys(currentFacetState(), filtered, {
    allTeams: ALL_TEAMS,
    canonicalGameKeyFn: canonicalGameKey,
  });

  renderIfChanged('topHighlights', renderKeys.topHighlights, () => {
    renderTopHighlights(selectedTeam, {
      allTeams: ALL_TEAMS,
      seasonSummaries,
      champNoteFn: champNote,
      saundersNoteFn: saundersNote,
    });
  });

  renderIfChanged('funFacts', renderKeys.funFacts, () => {
    renderFunFacts(selectedTeam, filtered);
  });
  renderIfChanged('curseTracker', JSON.stringify({
    team: selectedTeam,
    owner: curseFilters.owner,
    category: curseFilters.category,
    status: curseFilters.status,
    severity: curseFilters.severity,
  }), () => {
    renderCurseTrackerSection();
  });
  renderIfChanged('oppBreakdown', renderKeys.oppBreakdown, () => {
    renderOppBreakdown(selectedTeam, filtered);
  });
  renderIfChanged('seasonRecap', renderKeys.seasonRecap, () => {
    const rows = selectedTeam === ALL_TEAMS ? [] : seasonRecapRows(selectedTeam, seasonSummaries, {
      selectedSeasons,
      universeSeasons: universe.seasons,
    }).map(row => ({
      ...row,
      outcome: seasonRecapOutcome(selectedTeam, row, leagueGames),
    }));
    window.darlingTables?.render?.('history-seasons', {
      rows,
      context: {
        owner: selectedTeam === ALL_TEAMS ? null : selectedTeam,
        latestSeason: Math.max(...universe.seasons),
      },
      urlState: historyTableUrlState(),
      onContextChange: (context, urlState) => applySavedTableContext('history-seasons', context, urlState),
      instanceKey: `${selectedTeam}|${[...selectedSeasons].join(',')}`,
    });
  });
  renderIfChanged('seasonCallout', renderKeys.seasonCallout, () => {
    renderSeasonCallout(selectedTeam);
  });
  renderIfChanged('weekByWeek', renderKeys.weekByWeek, () => {
    const rows = selectedTeam === ALL_TEAMS ? [] : weekByWeekRows(selectedTeam, filtered, { allGames: leagueGames });
    window.darlingTables?.render?.('history-weeks', {
      rows,
      context: { owner: selectedTeam === ALL_TEAMS ? null : selectedTeam },
      urlState: historyTableUrlState(),
      onContextChange: (context, urlState) => applySavedTableContext('history-weeks', context, urlState),
      instanceKey: `${selectedTeam}|${renderKeys.weekByWeek}`,
    });
  });
  renderIfChanged('gamesTable', `${renderKeys.gamesTable}|${JSON.stringify(gameQuery)}`, () => {
    const rows = buildHistoryGameRows(filtered, {
      selectedTeam,
      allTeams: ALL_TEAMS,
    });
    window.darlingTables?.render?.('history-games', {
      rows,
      context: { owner: selectedTeam === ALL_TEAMS ? null : selectedTeam },
      initialState: {
        columnVisibility: { team: selectedTeam === ALL_TEAMS },
        columnPinning: { left: [selectedTeam === ALL_TEAMS ? 'team' : 'date'], right: [] },
      },
      urlState: historyTableUrlState(),
      onUrlStateChange: handleHistoryGameTableUrlState,
      onContextChange: (context, urlState) => applySavedTableContext('history-games', context, urlState),
      instanceKey: `${selectedTeam}|${renderKeys.gamesTable}|${JSON.stringify(gameQuery)}`,
    });
    updateHistoryGamesSummary(selectedTeam, filtered, gameQuery);
  });
}

function applyFocusTarget(focus) {
  const targets = {
    top: 'page-history',
    overview: 'teamOverview',
    games: 'historyGamesCard',
    standings: 'currentStandings',
    'playoff-picture': 'currentPlayoffPicture',
  };
  const element = document.getElementById(targets[focus]);
  if (!element) return;
  element.setAttribute('tabindex', '-1');
  requestAnimationFrame(() => {
    element.scrollIntoView({ block: 'start', behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    element.focus({ preventScroll: true });
  });
}

function exportHistoryCsv() {
  const filtered = applyFacetFilters(leagueGames, currentFacetState()).sort(byDateDesc);
  const urlState = parseUrlState();
  const csv = buildHistoryCsvText(filtered, {
    allTeams: ALL_TEAMS,
    selectedTeam,
    selectedWeeks,
    universeWeeks: universe.weeks,
    expectedWinForGameFn: expectedWinForGame,
    gameQuery: urlState.hasGameQuery ? {
      gameResult: urlState.gameResult,
      gameMinScore: urlState.gameMinScore,
      gameMaxScore: urlState.gameMaxScore,
      gameSort: urlState.gameSort,
      gameLimit: urlState.gameLimit,
    } : null,
  });
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `history_${selectedTeam === ALL_TEAMS ? 'ALL' : selectedTeam}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function triggerCrownRain() {
  if (window.darlingAccessibility?.prefersReducedMotion?.()) return;
  const wrap = document.getElementById('fxCrown');
  if (!wrap) return;
  wrap.innerHTML = '';
  wrap.style.display = 'block';
  const N = 28;
  let cleared = 0;
  for (let i = 0; i < N; i++) {
    const s = document.createElement('span');
    s.className = 'crown';
    s.textContent = '👑';
    s.style.left = `${Math.random() * 100}vw`;
    s.style.animationDuration = `${1.8 + Math.random() * 1.0}s`;
    s.style.animationDelay = `${Math.random() * 0.5}s`;
    s.style.fontSize = `${20 + Math.random() * 12}px`;
    wrap.appendChild(s);
    s.addEventListener('animationend', () => {
      s.remove();
      cleared++;
      if (cleared === N) wrap.style.display = 'none';
    });
  }
  setTimeout(() => {
    wrap.style.display = 'none';
    wrap.innerHTML = '';
  }, 3000);
}

function triggerSaundersFog() {
  if (window.darlingAccessibility?.prefersReducedMotion?.()) return;
  const fog = document.getElementById('fxSaunders');
  if (!fog) return;
  fog.style.display = 'block';
  setTimeout(() => {
    fog.style.display = 'none';
  }, 2000);
}

function bindListeners() {
  if (listenersBound) return;
  listenersBound = true;

  const histTab = document.getElementById('tabHistoryBtn');
  if (histTab) {
    histTab.addEventListener('click', () => {
      showPage('history');
      ensureHistoryControls();
      renderHistory();
      updateUrlFromState({ ...currentFacetState(), isApplyingUrlState });
    });
  }

  const currentTab = document.getElementById('tabCurrentBtn');
  if (currentTab) {
    currentTab.addEventListener('click', () => {
      showPage('current');
      ensureCurrentSeasonControls();
      renderCurrentSeason();
    });
  }

  const rivalryTab = document.getElementById('tabRivalryBtn');
  if (rivalryTab) {
    rivalryTab.addEventListener('click', () => {
      showPage('rivalry');
      ensureRivalryControls();
      renderRivalry();
    });
  }

  const trophyTab = document.getElementById('tabTrophyBtn');
  if (trophyTab) {
    trophyTab.addEventListener('click', () => {
      showPage('trophy');
      ensureTrophyControls();
      renderTrophy();
    });
  }

  const dynastyTab = document.getElementById('tabDynastyBtn');
  if (dynastyTab) {
    dynastyTab.addEventListener('click', () => {
      showPage('dynasty');
      ensureDynastyControls();
      renderDynasty();
    });
  }

  const gauntletTab = document.getElementById('tabGauntletBtn');
  if (gauntletTab) {
    gauntletTab.addEventListener('click', () => {
      showPage('gauntlet');
      ensureGauntletControls({
        ...(selectedGauntletState || {}),
        selectedOwnerA: selectedGauntletState?.selectedOwnerA,
        selectedSeasonA: selectedGauntletState?.selectedSeasonA,
        selectedOwnerB: selectedGauntletState?.selectedOwnerB,
        selectedSeasonB: selectedGauntletState?.selectedSeasonB,
        selectedModel: selectedGauntletState?.selectedModel,
        selectedIncludePostseason: selectedGauntletState?.selectedIncludePostseason,
        selectedSimulations: selectedGauntletState?.selectedSimulations,
        seed: selectedGauntletState?.seed,
        seedSource: selectedGauntletState?.seedSource,
      });
      renderGauntlet();
    });
  }

  window.addEventListener('popstate', () => {
    if (!leagueGames.length) return;
    applyUrlState(parseUrlState());
  });

  const clearBtn = document.getElementById('clearFilters');
  if (clearBtn) clearBtn.addEventListener('click', resetAllFacetsToAll);
  const exportBtn = document.getElementById('exportCsv');
  if (exportBtn) exportBtn.addEventListener('click', exportHistoryCsv);
  const copyBtn = document.getElementById('gauntletCopyBtn');
  if (copyBtn && !copyBtn.dataset.bound) {
    copyBtn.addEventListener('click', async () => {
      const text = document.getElementById('gauntletCopyText')?.value || '';
      if (!text) return;
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(text);
          return;
        }
      } catch {
        // Fall back to text selection below.
      }
      const field = document.getElementById('gauntletCopyText');
      if (field) {
        field.focus();
        field.select();
      }
    });
    copyBtn.dataset.bound = '1';
  }
}

async function bootstrapHistoryApp() {
  const urlState = parseUrlState();
  showPage(urlState.tab === 'current' ? 'current' : urlState.tab === 'rivalry' ? 'rivalry' : urlState.tab === 'trophy' ? 'trophy' : urlState.tab === 'dynasty' ? 'dynasty' : urlState.tab === 'gauntlet' ? 'gauntlet' : 'history');
  const loaded = await loadLeagueJSON();
  if (!loaded) return;
  bindListeners();
  window.darlingSearch?.hydrate?.({
    leagueGames,
    seasonSummaries,
    rivalries,
    currentSeason,
  });
  applyUrlState(urlState);
}

export {
  bootstrapHistoryApp,
  seasonModeFromLabels,
};
