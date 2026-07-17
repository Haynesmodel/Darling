import './current-season.entry.css';
import { buildCurrentSeasonControls } from '../../../js/current-season-controls.js';
import {
  attachCurrentSeasonOdds,
  buildCurrentSeasonViewModel,
  renderCurrentCommandCenter,
  renderCurrentMatchups,
  renderCurrentSeasonHero,
  renderCurrentStandings,
  renderCurrentTeamSnapshots,
} from '../../../js/current-season-renderers.js';
import type { AppContext } from '../../app/app-types';
import type { DarlingFeatureController, FeatureActivation } from '../../app/feature-contract';
import { seasonModeFromLabels } from '../../app/feature-utils';
import { registerCurrentSeasonTables } from './current-season-tables';

export function createFeatureController(): DarlingFeatureController {
  let context: AppContext;
  let state: any = null;
  let activeSignal: AbortSignal | null = null;
  const odds = new Map<string, any>();

  const seasonMode = (view: any) => {
    const games = [...(context.data.currentSeason?.games || []), ...context.data.leagueGames]
      .filter(game => Number(game.season) === Number(view.season) && Number(game.week) === Number(view.week));
    const labelled = seasonModeFromLabels(games.flatMap(game => [game.type, game.round]));
    if (labelled !== 'regular') return labelled;
    const maximum = Number(context.data.currentSeason?.playoff_rules?.regular_season_max_week);
    return Number.isFinite(maximum) && Number(view.week) > maximum ? 'postseason' : 'regular';
  };

  const draw = () => {
    if (!state || activeSignal?.aborted) return;
    const view = buildCurrentSeasonViewModel({
      leagueGames: context.data.leagueGames,
      seasonSummaries: context.data.seasonSummaries,
      currentSeason: context.data.currentSeason,
      season: state.selectedSeason,
      week: state.selectedWeek,
      selectedOwner: state.selectedOwner,
      selectedView: state.selectedView,
      projectionMode: state.selectedProjectionMode,
    });
    const key = JSON.stringify({ dataVersion: context.data.dataVersion, season: view.season, week: view.week, owner: view.commandCenter.selectedOwner, games: view.regularGames.map((game: any) => `${game.week}:${game.teamA}:${game.teamB}:${game.scoreA}:${game.scoreB}:${game.status}`).join('|') });
    const cached = odds.get(key);
    if (cached && cached !== 'loading') attachCurrentSeasonOdds(view, cached);
    if (!cached) {
      odds.set(key, 'loading');
      const signal = activeSignal;
      void import('../../../js/current-season-odds.js').then(({ buildCurrentSeasonOdds }) => {
        const value = (buildCurrentSeasonOdds as any)({
          leagueGames: context.data.leagueGames,
          currentSeason: context.data.currentSeason,
          derivedStats: context.data.derivedStats,
          season: view.season,
          week: view.week,
          dataVersion: context.data.dataVersion,
          selectedOwner: view.commandCenter.selectedOwner,
          playoffPicture: view.commandCenter.playoffPicture,
        });
        odds.set(key, value);
        if (!signal?.aborted && activeSignal === signal) draw();
      }).catch(error => {
        odds.set(key, { status: 'error', modelLabel: 'Deterministic team-score Monte Carlo', rows: [], movement: [], error: error.message || String(error) });
        if (!signal?.aborted && activeSignal === signal) draw();
      });
    }
    state = { selectedSeason: view.season, selectedWeek: view.week, selectedOwner: view.commandCenter.selectedOwner, selectedView: view.commandCenter.selectedView, selectedProjectionMode: view.commandCenter.selectedProjectionMode };
    const title = view.season ? `${view.season} Current Season` : 'Current Season';
    context.header.feature(title, null, title);
    context.theme.owner(view.commandCenter.selectedOwner, seasonMode(view));
    renderCurrentSeasonHero(view, { doc: context.document });
    renderCurrentCommandCenter(view, { doc: context.document });
    renderCurrentMatchups(view, { doc: context.document });
    renderCurrentStandings(view, { doc: context.document });
    renderCurrentTeamSnapshots(view, { doc: context.document });
    const tableContext = { season: view.season, selectedOwner: view.commandCenter.selectedOwner, playoffPicture: view.commandCenter.playoffPicture };
    const onContextChange = (next: Record<string, unknown>) => {
      if (activeSignal?.aborted) return;
      state = { ...state, selectedSeason: next.season || state.selectedSeason, selectedOwner: next.selectedOwner || '' };
      draw();
    };
    context.tables.render('current-standings', { rows: view.standings, context: tableContext, onContextChange, instanceKey: `${view.season}|${view.commandCenter.selectedView}` });
    context.tables.render('current-projected', { rows: view.commandCenter.projectedStandings, context: { ...tableContext, modelLabel: view.commandCenter.modelLabel }, onContextChange, instanceKey: `${view.season}|${view.commandCenter.selectedView}|${view.commandCenter.selectedProjectionMode}` });
    context.router.update({ tab: 'current', selectedCurrentSeason: view.season, selectedCurrentWeek: view.week, selectedCurrentOwner: view.commandCenter.selectedOwner, selectedCurrentView: view.commandCenter.selectedView, selectedCurrentProjection: view.commandCenter.selectedProjectionMode });
  };

  return {
    id: 'current',
    mount(nextContext) {
      context = nextContext;
      registerCurrentSeasonTables(context.tables);
    },
    activate(input: FeatureActivation) {
      activeSignal = input.signal;
      const existing = input.reason === 'tab' && state ? state : {};
      const built = (buildCurrentSeasonControls as any)({
        doc: context.document,
        leagueGames: context.data.leagueGames,
        seasonSummaries: context.data.seasonSummaries,
        currentSeason: context.data.currentSeason,
        selectedSeason: input.route.currentSeason ?? existing.selectedSeason ?? null,
        selectedWeek: input.route.currentWeek ?? existing.selectedWeek ?? null,
        selectedOwner: input.route.currentOwner ?? existing.selectedOwner ?? '',
        selectedView: input.route.currentView ?? existing.selectedView ?? 'command',
        selectedProjectionMode: input.route.currentProjection ?? existing.selectedProjectionMode ?? 'ifScoresHold',
        onChange: (next: any) => {
          if (activeSignal?.aborted) return;
          state = { ...(state || {}), ...next };
          draw();
        },
      });
      state = { selectedSeason: built.selectedSeason, selectedWeek: built.selectedWeek, selectedOwner: built.selectedOwner, selectedView: built.selectedView, selectedProjectionMode: built.selectedProjectionMode };
      draw();
    },
    deactivate() { activeSignal = null; },
  };
}
