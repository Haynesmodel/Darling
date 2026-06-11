import { byDateDesc, canonicalGameKey } from './core-helpers.js';
import { loadLeagueAssets } from './data-helpers.js';
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
  renderGamesTable,
  renderSeasonRecap,
  renderTopHighlights,
  renderWeekByWeek,
  seasonCalloutView,
} from './history-renderers.js';
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
  buildRivalryViewModel,
  renderRivalryHighlightBoard,
  renderRivalryLeadMeter,
  renderRivalryLeadTrend,
  renderRivalryGameTable,
  renderRivalryHeadline,
  renderRivalrySeasonTable,
  renderRivalryTimeline,
  renderRivalryTape,
} from './rivalry-renderers.js';
import { setGroupBackdrop, triggerGroupEgg } from './easter-eggs.js';
import {
  buildHistoryControls,
  closeDropdowns,
  readFacetSelections,
  rebuildOpponentFacet,
  resetFacetControls,
  setDropdownOpen,
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
  renderTrophySeasonLedger,
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

const DEFAULT_TEAM = 'Joe';
const ALL_TEAMS = '__ALL__';
const BLOWOUT_MARGIN = 29;
const HIGH_SCORE_THRESHOLD = 150;
const SUB_SCORE_THRESHOLD = 70;
const CLOSE_GAME_MARGIN = 5;

let leagueGames = [];
let seasonSummaries = [];
let rivalries = [];
let selectedTeam = DEFAULT_TEAM;
let selectedSeasons = new Set();
let selectedWeeks = new Set();
let selectedOpponents = new Set();
let selectedTypes = new Set();
let selectedRounds = new Set();
let selectedRivalryTeamA = DEFAULT_TEAM;
let selectedRivalryTeamB = null;
let selectedTrophyOwner = DEFAULT_TEAM;
let selectedDynastyState = null;
let universe = { seasons: [], weeks: [], opponents: [], types: [], rounds: [] };
let isApplyingUrlState = false;
let derivedWeeksSet = new Set();
let seasonAggregatesCache = null;
let weeklyAwardsCache = null;
let teamsFromLeagueGamesCache = null;
const headToHeadPairsCache = new Map();
const renderSectionCache = new Map();
let filteredGamesCacheKey = null;
let filteredGamesCacheValue = [];
const renderMetrics = { filterRuns: 0 };
let lastEffectKey = null;
let listenersBound = false;

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
  seasonAggregatesCache = computeSeasonAggregatesAllTeams(leagueGames, seasonSummaries);
  return seasonAggregatesCache;
}

function headToHeadPairs(minGames = 5) {
  if (headToHeadPairsCache.has(minGames)) return headToHeadPairsCache.get(minGames);
  const rows = computeHeadToHeadPairs(leagueGames, minGames);
  headToHeadPairsCache.set(minGames, rows);
  return rows;
}

function weeklyAwards() {
  if (weeklyAwardsCache) return weeklyAwardsCache;
  weeklyAwardsCache = computeWeeklyAwards(leagueGames, HIGH_SCORE_THRESHOLD);
  return weeklyAwardsCache;
}

function handleRivalryChange(next) {
  selectedRivalryTeamA = next.selectedTeamA;
  selectedRivalryTeamB = next.selectedTeamB;
  renderRivalry();
}

function handleTrophyChange(next) {
  selectedTrophyOwner = next.selectedOwner;
  renderTrophy();
}

function ensureRivalryControls(initialState = {}) {
  const teamASelect = document.getElementById('rivalryTeamA');
  if (!teamASelect) return null;

  if (!teamASelect.dataset.ready) {
    const urlState = parseUrlState();
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
  }

  return teamASelect;
}

function ensureTrophyControls(initialState = {}) {
  const ownerSelect = document.getElementById('trophyOwnerSelect');
  if (!ownerSelect) return null;

  if (!ownerSelect.dataset.ready) {
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
  }

  return ownerSelect;
}

function renderRivalry() {
  if (!selectedRivalryTeamA || !selectedRivalryTeamB) return;

  const view = buildRivalryViewModel(selectedRivalryTeamA, selectedRivalryTeamB, leagueGames);
  const signature = `${selectedRivalryTeamA}|${selectedRivalryTeamB}|${view.summary.overall.g}`;
  updateHeaderForTeam(selectedRivalryTeamA);
  renderIfChanged('rivalry', signature, () => {
    renderRivalryHeadline(view, { doc: document });
    renderRivalryLeadMeter(view, { doc: document });
    renderRivalryHighlightBoard(view, { doc: document });
    renderRivalryTape(view, { doc: document });
    renderRivalryLeadTrend(view, { doc: document });
    renderRivalryTimeline(view, { doc: document });
    renderRivalrySeasonTable(view, { doc: document });
    renderRivalryGameTable(view, { doc: document });
    if (document.title !== undefined) {
      document.title = `${selectedRivalryTeamA} vs ${selectedRivalryTeamB} \u2014 Head to Head`;
    }
  });
  updateUrlFromState({
    tab: 'rivalry',
    selectedRivalryTeamA,
    selectedRivalryTeamB,
    isApplyingUrlState,
  });
}

function renderTrophy() {
  if (!selectedTrophyOwner) return;

  const signature = selectedTrophyOwner;
  updateHeaderForTrophy(selectedTrophyOwner);
  renderIfChanged('trophy', signature, () => {
    const view = buildTrophyCaseViewModel(selectedTrophyOwner, {
      leagueGames,
      seasonSummaries,
      champNoteFn: champNote,
      saundersNoteFn: saundersNote,
    });

    renderTrophyHero(view, { doc: document });
    renderTrophyHardwareShelf(view, { doc: document });
    renderTrophyRankStrip(view, { doc: document });
    renderTrophyCareerShape(view, { doc: document });
    renderTrophyAchievementList(view, { doc: document });
    renderTrophyScarList(view, { doc: document });
    renderTrophySeasonLedger(view, { doc: document });
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

function handleDynastyWindowModalClose() {
  if (!selectedDynastyState?.selectedWindowKey) return;
  selectedDynastyState = {
    ...(selectedDynastyState || {}),
    selectedWindowKey: null,
    selectedWindowKind: null,
  };
  renderDynasty();
}

function applyHistoryUrlState(urlState = parseUrlState()) {
  const teamSelect = document.getElementById('teamSelect');
  if (!teamSelect) return;

  const teams = teamOptions(seasonSummaries, leagueGames, ALL_TEAMS);
  const defaultTeam = teams.find(t => t.value === DEFAULT_TEAM)?.value || teams[0]?.value || DEFAULT_TEAM;
  const nextTeam = (urlState.team && teams.some(t => t.value === urlState.team))
    ? urlState.team
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
    showPage(urlState.tab === 'rivalry' ? 'rivalry' : urlState.tab === 'trophy' ? 'trophy' : urlState.tab === 'dynasty' ? 'dynasty' : 'history');
    if (urlState.tab === 'rivalry') {
      ensureRivalryControls({
        selectedTeamA: urlState.rivalryTeamA || selectedRivalryTeamA,
        selectedTeamB: urlState.rivalryTeamB || selectedRivalryTeamB,
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
    const teamSelect = ensureHistoryControls();
    if (teamSelect && teamSelect.dataset.ready === '1') {
      applyHistoryUrlState(urlState);
    }
  } finally {
    isApplyingUrlState = false;
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
      handleDynastySlumpCardClick(button.dataset.windowKey);
    });
    slumps.dataset.bound = '1';
  }
  if (modal && !modal.dataset.bound) {
    modal.addEventListener('click', event => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target?.closest('[data-dynasty-modal-close="1"]')) return;
      event.preventDefault();
      handleDynastyWindowModalClose();
    });
    modal.dataset.bound = '1';
  }
  if (!document.body.dataset.dynastyModalEscBound) {
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && selectedDynastyState?.selectedWindowKey) {
        handleDynastyWindowModalClose();
      }
    });
    document.body.dataset.dynastyModalEscBound = '1';
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
    ({ leagueGames, derivedWeeksSet, seasonSummaries, rivalries } = setLoadedLeagueData({
      leagueGames,
      derivedWeeksSet,
      seasonSummaries,
      rivalries,
    }, loaded));
    seasonAggregatesCache = null;
    weeklyAwardsCache = null;
    teamsFromLeagueGamesCache = null;
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
    setAppStatus('error', 'Could not load league data. Refresh after the JSON files are available.');
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
  renderHistory();
  updateUrlFromState({ ...currentFacetState(), isApplyingUrlState });
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
      isApplyingUrlState = true;
      setFacetSelections('seasonFilters', 'season', urlState.seasons, document);
      setFacetSelections('weekFilters', 'week', urlState.weeks, document);
      setFacetSelections('oppFilters', 'opp', urlState.opps, document);
      setFacetSelections('typeFilters', 'type', urlState.types, document);
      setFacetSelections('roundFilters', 'round', urlState.rounds, document);
      syncFacetStateFromDom();
      isApplyingUrlState = false;
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
  return computeTopNWeeklyScoresAllTeams(leagueGames, n);
}

function bottomNWeeklyScoresAllTeams(n = 5) {
  return computeBottomNWeeklyScoresAllTeams(leagueGames, n);
}

function teamsFromLeagueGames() {
  if (teamsFromLeagueGamesCache) return teamsFromLeagueGamesCache;
  teamsFromLeagueGamesCache = computeTeamsFromLeagueGames(leagueGames);
  return teamsFromLeagueGamesCache;
}

function longestWinStreaksGlobal(n = 10) {
  return computeLongestStreaksGlobal(leagueGames, teamsFromLeagueGames(), 'W', n);
}

function longestLosingStreaksGlobal(n = 10) {
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

function renderOppBreakdown(team, games) {
  const titleEl = document.getElementById('oppTableTitle');
  const firstCol = document.getElementById('oppFirstCol');
  const tb = document.querySelector('#oppTable tbody');
  if (!tb || !titleEl || !firstCol) return;

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
  firstCol.textContent = view.firstCol;
  tb.innerHTML = view.tableHtml;

  if (calloutsBox) {
    calloutsBox.innerHTML = view.calloutsHtml;
    if (view.shouldUpdateBackdrop) {
      if (view.triggerSlug) triggerGroupEgg(view.triggerSlug);
      setGroupBackdrop(view.backdropSlug || null);
    }
  }
}

function renderHistory() {
  const teamSel = document.getElementById('teamSelect');
  if (teamSel && selectedTeam !== teamSel.value) selectedTeam = teamSel.value;
  updateHeaderForTeam(selectedTeam);

  const filtered = filteredGamesForCurrentState();
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
  renderIfChanged('oppBreakdown', renderKeys.oppBreakdown, () => {
    renderOppBreakdown(selectedTeam, filtered);
  });
  renderIfChanged('seasonRecap', renderKeys.seasonRecap, () => {
    renderSeasonRecap(selectedTeam, seasonSummaries, {
      allTeams: ALL_TEAMS,
      allGames: leagueGames,
      selectedSeasons,
      universeSeasons: universe.seasons,
    });
  });
  renderIfChanged('seasonCallout', renderKeys.seasonCallout, () => {
    renderSeasonCallout(selectedTeam);
  });
  renderIfChanged('weekByWeek', renderKeys.weekByWeek, () => {
    renderWeekByWeek(selectedTeam, filtered, { allTeams: ALL_TEAMS, allGames: leagueGames });
  });
  renderIfChanged('gamesTable', renderKeys.gamesTable, () => {
    renderGamesTable(selectedTeam, filtered);
  });
}

function exportHistoryCsv() {
  const filtered = applyFacetFilters(leagueGames, currentFacetState()).sort(byDateDesc);
  const csv = buildHistoryCsvText(filtered, {
    allTeams: ALL_TEAMS,
    selectedTeam,
    selectedWeeks,
    universeWeeks: universe.weeks,
    expectedWinForGameFn: expectedWinForGame,
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
  const fog = document.getElementById('fxSaunders');
  if (!fog) return;
  fog.style.display = 'block';
  setTimeout(() => {
    fog.style.display = 'none';
  }, 2000);
}

function handleDocumentClick(e) {
  const toggle = e.target.closest('.dropdown-toggle');
  if (toggle) {
    const dropdown = toggle.closest('.dropdown');
    const shouldOpen = !dropdown.classList.contains('open');
    closeDropdowns(dropdown, document);
    setDropdownOpen(dropdown, shouldOpen, document);
    return;
  }
  if (!e.target.closest('.dropdown')) closeDropdowns(null, document);
}

function handleKeydown(e) {
  if (e.key !== 'Escape') return;
  const openToggle = document.querySelector('.dropdown.open .dropdown-toggle');
  closeDropdowns(null, document);
  if (openToggle) openToggle.focus();
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

  document.addEventListener('click', handleDocumentClick);
  document.addEventListener('keydown', handleKeydown);
  window.addEventListener('popstate', () => {
    if (!leagueGames.length) return;
    applyUrlState(parseUrlState());
  });

  const clearBtn = document.getElementById('clearFilters');
  if (clearBtn) clearBtn.addEventListener('click', resetAllFacetsToAll);
  const exportBtn = document.getElementById('exportCsv');
  if (exportBtn) exportBtn.addEventListener('click', exportHistoryCsv);
}

async function bootstrapHistoryApp() {
  const urlState = parseUrlState();
  showPage(urlState.tab === 'rivalry' ? 'rivalry' : urlState.tab === 'trophy' ? 'trophy' : urlState.tab === 'dynasty' ? 'dynasty' : 'history');
  const loaded = await loadLeagueJSON();
  if (!loaded) return;
  bindListeners();
  applyUrlState(urlState);
}

export {
  bootstrapHistoryApp,
};
