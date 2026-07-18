import './history.entry.css';
import { byDateDesc, canonicalGameKey } from '../../../js/core-helpers.js';
import { buildHistoryGameRows, queryHistoryGames } from '../../../js/history-game-query.js';
import {
  bestStreakForTeam,
  computeBottomNWeeklyScoresAllTeams,
  computeExpectedWinForGame,
  computeLeagueRowsSingleWeeks,
  computeLongestStreaksGlobal,
  computeLongestTeamStreaks,
  computeLuckSummary,
  computeSubThresholdGamesPerTeam,
  computeTopNWeeklyScoresAllTeams,
} from '../../../js/stats-helpers.js';
import { applyFacetFilters, buildHistoryCsvText, setFacetSelections } from '../../../js/state-helpers.js';
import { buildHistoryRenderKeys, facetStateKey, setTeamAndKeepOpponents, snapshotFacetState } from '../../../js/app-state-controller.js';
import {
  opponentBreakdownRows,
  opponentBreakdownView,
  renderTopHighlights,
  seasonCalloutView,
  seasonRecapOutcome,
  seasonRecapRows,
  weekByWeekRows,
} from '../../../js/history-renderers.js';
import { readCurseTrackerFilters, renderCurseTracker } from '../../../js/curse-tracker.js';
import { leagueFunFactsAllTeamsHtml, leagueFunListsAllTeamsHtml, leagueSummaryTablesHtml, teamFunFactsView } from '../../../js/league-renderers.js';
import {
  buildHistoryControls,
  readFacetSelections,
  rebuildOpponentFacet,
  resetFacetControls,
  updateFacetCountTexts,
} from '../../../js/history-controls.js';
import { opponentOptions, teamOptions } from '../../../js/facet-helpers.js';
import { setGroupBackdrop, triggerGroupEgg } from '../../../js/easter-eggs.js';
import type { AppContext, AppRoute } from '../../app/app-types';
import type { DarlingFeatureController, FeatureActivation } from '../../app/feature-contract';
import { ALL_TEAMS, DEFAULT_TEAM, seasonModeFromLabels } from '../../app/feature-utils';
import { registerHistoryTables } from './history-tables';

const BLOWOUT_MARGIN = 29;
const HIGH_SCORE_THRESHOLD = 150;
const SUB_SCORE_THRESHOLD = 70;
const CLOSE_GAME_MARGIN = 5;
const NOTES: Record<string, { champs?: Record<number, string>; saunders?: Record<number, string> }> = {
  Joel: { champs: { 2014: 'Singer not in league', 2020: 'COVID season' } },
  Joe: { saunders: { 2015: 'Saunders Bowl matchups incorrect' } },
};

export function createFeatureController(): DarlingFeatureController {
  let context: AppContext;
  let active = false;
  let selectedTeam = DEFAULT_TEAM;
  let selectedSeasons = new Set<number>();
  let selectedWeeks = new Set<number>();
  let selectedOpponents = new Set<string>();
  let selectedTypes = new Set<string>();
  let selectedRounds = new Set<string>();
  let universe: any = { seasons: [], weeks: [], opponents: [], types: [], rounds: [] };
  let filteredKey: string | null = null;
  let filteredValue: any[] = [];
  const renderCache = new Map<string, string>();
  const metrics = { filterRuns: 0 };
  let lastEffectKey: string | null = null;

  const champNote = (owner: string, season: number) => NOTES[owner]?.champs?.[season] || null;
  const saundersNote = (owner: string, season: number) => NOTES[owner]?.saunders?.[season] || null;
  const facetState = () => snapshotFacetState({ selectedTeam, selectedSeasons, selectedWeeks, selectedOpponents, selectedTypes, selectedRounds, universe, allTeams: ALL_TEAMS });
  const tableUrlState = () => {
    const route = context.router.parse();
    return {
      seasons: [...(route.seasons || [])], weeks: [...(route.weeks || [])], opps: [...(route.opps || [])], types: [...(route.types || [])], rounds: [...(route.rounds || [])],
      gameResult: route.gameResult, gameMinScore: route.gameMinScore, gameMaxScore: route.gameMaxScore, gameSort: route.gameSort, gameLimit: route.gameLimit,
    };
  };
  const currentUrlOptions = () => ({ ...facetState(), tab: 'history' });
  const filtered = () => {
    const key = facetStateKey(facetState());
    if (key === filteredKey) return filteredValue;
    filteredKey = key;
    filteredValue = applyFacetFilters(context.data.leagueGames, facetState());
    metrics.filterRuns += 1;
    return filteredValue;
  };
  const renderIfChanged = (section: string, signature: string, callback: () => void) => {
    if (renderCache.get(section) === signature) return;
    callback();
    renderCache.set(section, signature);
  };
  const seasonAggregates = () => context.data.derivedStats?.season_aggregates || context.selectors.seasonAggregates();
  const weeklyAwards = () => context.data.derivedStats?.weekly_awards || context.selectors.weeklyAwards();
  const teams = () => context.data.derivedStats?.owners || context.selectors.teams();
  const headToHeadPairs = (minimum = 5) => context.data.derivedStats?.head_to_head_pairs?.filter((row: any) => row.g >= minimum) || context.selectors.headToHeadPairs(minimum);
  const topScores = (n = 5) => context.data.derivedStats?.records?.top_scores?.slice(0, n) || computeTopNWeeklyScoresAllTeams(context.data.leagueGames, n);
  const bottomScores = (n = 5) => context.data.derivedStats?.records?.bottom_scores?.slice(0, n) || computeBottomNWeeklyScoresAllTeams(context.data.leagueGames, n);
  const winStreaks = (n = 5) => computeLongestTeamStreaks(context.data.leagueGames, teams(), 'W', n);
  const lossStreaks = (n = 10) => computeLongestTeamStreaks(context.data.leagueGames, teams(), 'L', n);

  const updateUrl = (extra: Record<string, unknown> = {}) => context.router.update({ ...currentUrlOptions(), ...extra });

  const syncFromDom = () => {
    if (!active) return;
    const next = readFacetSelections({ doc: context.document, leagueGames: context.data.leagueGames, derivedWeeksSet: context.data.derivedWeeksSet, selectedTeam, allTeams: ALL_TEAMS });
    selectedSeasons = next.selectedSeasons;
    selectedWeeks = next.selectedWeeks;
    selectedOpponents = next.selectedOpponents;
    selectedTypes = next.selectedTypes;
    selectedRounds = next.selectedRounds;
    universe = next.universe;
    updateFacetCountTexts({ doc: context.document, selectedSeasons, selectedWeeks, selectedOpponents, selectedTypes, selectedRounds, universe });
    updateUrl();
    draw();
  };

  const reset = () => {
    resetFacetControls({ doc: context.document });
    syncFromDom();
  };

  const changeTeam = () => {
    const select = context.document.getElementById('teamSelect') as HTMLSelectElement | null;
    if (!select || !active) return;
    const next: any = setTeamAndKeepOpponents(facetState(), select.value, opponentOptions(context.data.leagueGames, select.value, ALL_TEAMS));
    selectedTeam = next.selectedTeam;
    rebuildOpponentFacet({ doc: context.document, leagueGames: context.data.leagueGames, selectedTeam, allTeams: ALL_TEAMS, onFacetChange: syncFromDom });
    setFacetSelections('oppFilters', 'opp', next.selectedOpponents, context.document);
    universe.opponents = opponentOptions(context.data.leagueGames, selectedTeam, ALL_TEAMS);
    syncFromDom();
  };

  const ensureControls = () => {
    const select = context.document.getElementById('teamSelect') as HTMLSelectElement | null;
    if (!select) throw new Error('History team control is missing');
    if (!select.dataset.ready) {
      const choices = teamOptions(context.data.seasonSummaries, context.data.leagueGames, ALL_TEAMS);
      const fallback = choices.some((item: any) => item.value === DEFAULT_TEAM) ? DEFAULT_TEAM : choices[0]?.value;
      const built = buildHistoryControls({ doc: context.document, leagueGames: context.data.leagueGames, seasonSummaries: context.data.seasonSummaries, derivedWeeksSet: context.data.derivedWeeksSet, allTeams: ALL_TEAMS, selectedTeam: fallback, onFacetChange: syncFromDom });
      selectedTeam = built.selectedTeam;
      select.dataset.ready = '1';
      select.addEventListener('change', changeTeam);
    }
    return select;
  };

  const applyRoute = (route: AppRoute) => {
    const select = ensureControls();
    const choices = teamOptions(context.data.seasonSummaries, context.data.leagueGames, ALL_TEAMS);
    const fallback = choices.find((item: any) => item.value === DEFAULT_TEAM)?.value || choices[0]?.value || DEFAULT_TEAM;
    const leagueQuery = !route.team && (route.hasGameQuery || (route.focus === 'games' && (route.seasons?.size || route.types?.size || route.rounds?.size)));
    selectedTeam = route.team && choices.some((item: any) => item.value === route.team) ? route.team : leagueQuery ? ALL_TEAMS : fallback;
    select.value = selectedTeam;
    rebuildOpponentFacet({ doc: context.document, leagueGames: context.data.leagueGames, selectedTeam, allTeams: ALL_TEAMS, onFacetChange: syncFromDom });
    universe.opponents = opponentOptions(context.data.leagueGames, selectedTeam, ALL_TEAMS);
    setFacetSelections('seasonFilters', 'season', route.seasons, context.document);
    setFacetSelections('weekFilters', 'week', route.weeks, context.document);
    setFacetSelections('oppFilters', 'opp', route.opps, context.document);
    setFacetSelections('typeFilters', 'type', route.types, context.document);
    setFacetSelections('roundFilters', 'round', route.rounds, context.document);
    if (!route.hasAny) resetFacetControls({ doc: context.document });
    const next = readFacetSelections({ doc: context.document, leagueGames: context.data.leagueGames, derivedWeeksSet: context.data.derivedWeeksSet, selectedTeam, allTeams: ALL_TEAMS });
    selectedSeasons = next.selectedSeasons;
    selectedWeeks = next.selectedWeeks;
    selectedOpponents = next.selectedOpponents;
    selectedTypes = next.selectedTypes;
    selectedRounds = next.selectedRounds;
    universe = next.universe;
    updateFacetCountTexts({ doc: context.document, selectedSeasons, selectedWeeks, selectedOpponents, selectedTypes, selectedRounds, universe });
  };

  const crownRain = () => {
    if (context.window.darlingAccessibility?.prefersReducedMotion?.()) return;
    const wrap = context.document.getElementById('fxCrown');
    if (!wrap) return;
    wrap.replaceChildren();
    wrap.style.display = 'block';
    for (let index = 0; index < 28; index += 1) {
      const crown = context.document.createElement('span');
      crown.className = 'crown'; crown.textContent = '👑'; crown.style.left = `${Math.random() * 100}vw`; crown.style.animationDuration = `${1.8 + Math.random()}s`; crown.style.animationDelay = `${Math.random() * 0.5}s`; crown.style.fontSize = `${20 + Math.random() * 12}px`;
      wrap.append(crown);
    }
    context.window.setTimeout(() => { wrap.style.display = 'none'; wrap.replaceChildren(); }, 3000);
  };
  const saundersFog = () => {
    if (context.window.darlingAccessibility?.prefersReducedMotion?.()) return;
    const fog = context.document.getElementById('fxSaunders');
    if (!fog) return;
    fog.style.display = 'block';
    context.window.setTimeout(() => { fog.style.display = 'none'; }, 2000);
  };

  const seasonCallout = () => {
    const mount = context.document.getElementById('seasonCallout');
    if (!mount) return;
    const view = seasonCalloutView(selectedTeam, { allTeams: ALL_TEAMS, selectedSeasons, seasonSummaries: context.data.seasonSummaries, champNoteFn: champNote, saundersNoteFn: saundersNote });
    mount.innerHTML = view.html;
    if (view.resetEffect) lastEffectKey = null;
    if (view.effectKey && view.effectKey !== lastEffectKey) {
      lastEffectKey = view.effectKey;
      if (view.effectType === 'champion') crownRain(); else if (view.effectType === 'saunders') saundersFog();
    }
  };

  const funFacts = (games: any[]) => {
    const facts = context.document.getElementById('funFacts');
    const lists = context.document.getElementById('funLists');
    if (!facts || !lists) return;
    if (selectedTeam === ALL_TEAMS) {
      facts.innerHTML = leagueFunFactsAllTeamsHtml({ seasonAggregates: seasonAggregates(), minGames: 8, winStreak: winStreaks(1)[0] || null, lossStreak: lossStreaks(1)[0] || null, headToHeadPairs: headToHeadPairs(5), topWeeklyScores: topScores(1) });
      let summary = context.document.getElementById('leagueSummary');
      if (!summary) { summary = context.document.createElement('div'); summary.id = 'leagueSummary'; summary.className = 'fun-lists'; facts.parentNode?.insertBefore(summary, lists); }
      summary.innerHTML = leagueSummaryTablesHtml({ leagueGames: context.data.leagueGames, seasonSummaries: context.data.seasonSummaries, seasonAggregates: seasonAggregates() });
      lists.innerHTML = leagueFunListsAllTeamsHtml({ leagueGames: context.data.leagueGames, seasonSummaries: context.data.seasonSummaries, seasonAggregates: seasonAggregates(), highs: topScores(10), lows: bottomScores(10), streaks: context.data.derivedStats?.streaks?.wins?.slice(0, 10) || computeLongestStreaksGlobal(context.data.leagueGames, teams(), 'W', 10), streaksLoss: context.data.derivedStats?.streaks?.losses?.slice(0, 10) || computeLongestStreaksGlobal(context.data.leagueGames, teams(), 'L', 10), weeklyAwards: weeklyAwards(), sub70: context.data.derivedStats?.records?.sub_70 || computeSubThresholdGamesPerTeam(context.data.leagueGames, SUB_SCORE_THRESHOLD), headToHeadPairs: headToHeadPairs(5), limit: 10 });
      return;
    }
    context.document.getElementById('leagueSummary')?.remove();
    const view = teamFunFactsView(selectedTeam, games, { leagueGames: context.data.leagueGames, seasonSummaries: context.data.seasonSummaries, seasonAggregates: seasonAggregates(), winStreak: bestStreakForTeam(games, selectedTeam, 'W'), lossStreak: bestStreakForTeam(games, selectedTeam, 'L'), luckSummary: computeLuckSummary(context.data.leagueGames, selectedTeam, games), blowoutMargin: BLOWOUT_MARGIN, highScoreThreshold: HIGH_SCORE_THRESHOLD, closeGameMargin: CLOSE_GAME_MARGIN });
    facts.innerHTML = view.factsHtml;
    lists.innerHTML = view.listsHtml;
  };

  const tableContextChange = (tableContext: Record<string, unknown>, urlState?: any) => {
    selectedTeam = String(tableContext.owner || ALL_TEAMS);
    if (urlState) {
      selectedSeasons = new Set(urlState.seasons || []); selectedWeeks = new Set(urlState.weeks || []); selectedOpponents = new Set(urlState.opps || []); selectedTypes = new Set(urlState.types || []); selectedRounds = new Set(urlState.rounds || []);
    }
    updateUrl({ selectedTeam, ...(urlState ? { selectedGameResult: urlState.gameResult, selectedGameMinScore: urlState.gameMinScore, selectedGameMaxScore: urlState.gameMaxScore, selectedGameSort: urlState.gameSort, selectedGameLimit: urlState.gameLimit } : {}) });
    applyRoute(context.router.parse());
    renderCache.clear();
    draw();
  };

  const draw = () => {
    if (!active) return;
    const select = context.document.getElementById('teamSelect') as HTMLSelectElement | null;
    if (select && selectedTeam !== select.value) selectedTeam = select.value;
    context.header.team(selectedTeam);
    context.theme.owner(selectedTeam, seasonModeFromLabels([...selectedTypes, ...selectedRounds]));
    const games = filtered();
    const route = context.router.parse();
    const gameQuery = { gameResult: route.gameResult, gameMinScore: route.gameMinScore, gameMaxScore: route.gameMaxScore, gameSort: route.gameSort, gameLimit: route.gameLimit };
    const curse = readCurseTrackerFilters({ doc: context.document, selectedTeam, allTeams: ALL_TEAMS });
    const keys = buildHistoryRenderKeys(facetState(), games, { allTeams: ALL_TEAMS, canonicalGameKeyFn: canonicalGameKey });
    renderIfChanged('top', keys.topHighlights, () => renderTopHighlights(selectedTeam, { allTeams: ALL_TEAMS, seasonSummaries: context.data.seasonSummaries, champNoteFn: champNote, saundersNoteFn: saundersNote }));
    renderIfChanged('facts', keys.funFacts, () => funFacts(games));
    renderIfChanged('curse', JSON.stringify({ team: selectedTeam, ...curse }), () => renderCurseTracker({ doc: context.document, leagueGames: context.data.leagueGames, seasonSummaries: context.data.seasonSummaries, selectedTeam, allTeams: ALL_TEAMS, seasonAggregates: seasonAggregates(), onChange: () => { renderCache.delete('curse'); draw(); } }));
    renderIfChanged('opponents', keys.oppBreakdown, () => {
      const view = opponentBreakdownView(selectedTeam, games, { allTeams: ALL_TEAMS, rivalries: context.data.rivalries, selectedOpponents, universeOpponents: universe.opponents, selectedWeeks, universeWeeks: universe.weeks });
      const title = context.document.getElementById('oppTableTitle'); if (title) title.textContent = view.title;
      context.tables.render('history-opponents', { rows: opponentBreakdownRows(selectedTeam, games, { allTeams: ALL_TEAMS, selectedWeeks, universeWeeks: universe.weeks }), context: { owner: selectedTeam === ALL_TEAMS ? null : selectedTeam, games, isLeague: selectedTeam === ALL_TEAMS }, urlState: tableUrlState(), onContextChange: tableContextChange, instanceKey: `${selectedTeam}|${games.length}` });
      const callouts = context.document.getElementById('rivalGroupCallouts');
      if (callouts) { callouts.innerHTML = view.calloutsHtml; if (view.shouldUpdateBackdrop) { if (view.triggerSlug) triggerGroupEgg(view.triggerSlug); setGroupBackdrop(view.backdropSlug || null); } }
    });
    renderIfChanged('seasons', keys.seasonRecap, () => {
      const rows = selectedTeam === ALL_TEAMS ? [] : seasonRecapRows(selectedTeam, context.data.seasonSummaries, { selectedSeasons, universeSeasons: universe.seasons }).map((row: any) => ({ ...row, outcome: seasonRecapOutcome(selectedTeam, row, context.data.leagueGames) }));
      context.tables.render('history-seasons', { rows, context: { owner: selectedTeam === ALL_TEAMS ? null : selectedTeam, latestSeason: Math.max(...universe.seasons) }, urlState: tableUrlState(), onContextChange: tableContextChange, instanceKey: `${selectedTeam}|${[...selectedSeasons].join(',')}` });
    });
    renderIfChanged('callout', keys.seasonCallout, seasonCallout);
    renderIfChanged('weeks', keys.weekByWeek, () => context.tables.render('history-weeks', { rows: selectedTeam === ALL_TEAMS ? [] : weekByWeekRows(selectedTeam, games, { allGames: context.data.leagueGames }), context: { owner: selectedTeam === ALL_TEAMS ? null : selectedTeam }, urlState: tableUrlState(), onContextChange: tableContextChange, instanceKey: `${selectedTeam}|${keys.weekByWeek}` }));
    renderIfChanged('games', `${keys.gamesTable}|${JSON.stringify(gameQuery)}`, () => {
      context.tables.render('history-games', { rows: buildHistoryGameRows(games, { selectedTeam, allTeams: ALL_TEAMS }), context: { owner: selectedTeam === ALL_TEAMS ? null : selectedTeam }, initialState: { columnVisibility: { team: selectedTeam === ALL_TEAMS }, columnPinning: { left: [selectedTeam === ALL_TEAMS ? 'team' : 'date'], right: [] } }, urlState: tableUrlState(), onUrlStateChange: next => { updateUrl({ selectedGameResult: next.gameResult, selectedGameMinScore: next.gameMinScore, selectedGameMaxScore: next.gameMaxScore, selectedGameSort: next.gameSort, selectedGameLimit: next.gameLimit }); updateGameSummary(games, next); }, onContextChange: tableContextChange, instanceKey: `${selectedTeam}|${keys.gamesTable}|${JSON.stringify(gameQuery)}` });
      updateGameSummary(games, gameQuery);
    });
  };

  const updateGameSummary = (games: any[], query: any) => {
    const mount = context.document.getElementById('historyGamesQuerySummary');
    if (!mount) return;
    const view = queryHistoryGames(games, { selectedTeam, allTeams: ALL_TEAMS, query });
    mount.textContent = selectedTeam === ALL_TEAMS || query.gameResult || Number.isFinite(query.gameMinScore) || Number.isFinite(query.gameMaxScore) || query.gameSort || query.gameLimit ? view.summary : '';
  };

  const exportCsv = () => {
    const games = applyFacetFilters(context.data.leagueGames, facetState()).sort(byDateDesc);
    const route = context.router.parse();
    const csv = buildHistoryCsvText(games, { allTeams: ALL_TEAMS, selectedTeam, selectedWeeks, universeWeeks: universe.weeks, expectedWinForGameFn: (team: string, game: any) => computeExpectedWinForGame(context.data.leagueGames, team, game), gameQuery: route.hasGameQuery ? { gameResult: route.gameResult, gameMinScore: route.gameMinScore, gameMaxScore: route.gameMaxScore, gameSort: route.gameSort, gameLimit: route.gameLimit } : null });
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const anchor = context.document.createElement('a'); anchor.href = url; anchor.download = `history_${selectedTeam === ALL_TEAMS ? 'ALL' : selectedTeam}.csv`; context.document.body.append(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url);
  };

  return {
    id: 'history',
    mount(nextContext) {
      context = nextContext;
      registerHistoryTables(context.tables);
      context.window.__darlingRenderMetrics = metrics;
      context.document.getElementById('clearFilters')?.addEventListener('click', reset);
      context.document.getElementById('exportCsv')?.addEventListener('click', exportCsv);
    },
    activate(input: FeatureActivation) {
      active = !input.signal.aborted;
      if (input.reason === 'tab' && context.document.getElementById('teamSelect')?.dataset.ready) {
        ensureControls();
      } else {
        applyRoute(input.route);
      }
      renderCache.clear();
      draw();
    },
    deactivate() {
      active = false;
      const crown = context.document.getElementById('fxCrown'); if (crown) { crown.style.display = 'none'; crown.replaceChildren(); }
      const fog = context.document.getElementById('fxSaunders'); if (fog) fog.style.display = 'none';
    },
  };
}
