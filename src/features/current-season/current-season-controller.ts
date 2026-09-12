import './current-season.entry.css';
import { buildCurrentSeasonControls } from '../../../js/current-season-controls.js';
import {
  attachCurrentSeasonOdds,
  buildCurrentSeasonViewModel,
  renderCurrentCommandCharts,
  renderCurrentCommandCenter,
  renderCurrentMatchups,
  renderCurrentRecap,
  renderCurrentSeasonHero,
  renderCurrentStandings,
  renderCurrentTeamSnapshots,
} from '../../../js/current-season-renderers.js';
import type { AppContext } from '../../app/app-types';
import type { DarlingFeatureController, FeatureActivation } from '../../app/feature-contract';
import { createSectionDisclosure, type SectionDisclosureController } from '../../app/section-disclosure';
import { seasonModeFromLabels } from '../../app/feature-utils';
import {
  defaultCurrentViewForPhase,
  resolveSeasonPresentation,
  seasonPresentationAllowsOdds,
} from '../../data/season-presentation';
import { latestCompleteSeason, resolveSeasonRecap } from '../../data/season-recap';
import { registerCurrentSeasonTables } from './current-season-tables';
import {
  type ShareCardActionController,
} from '../../share/share-card-actions';
import { mountCurrentMatchupCards } from '../../share/share-card-feature-adapters';

export function createFeatureController(): DarlingFeatureController {
  let context: AppContext;
  let state: any = null;
  let activeSignal: AbortSignal | null = null;
  let disclosure: SectionDisclosureController | null = null;
  let shareActions: ShareCardActionController[] = [];
  const odds = new Map<string, any>();

  const disposeShareActions = () => {
    shareActions.forEach(action => action.dispose());
    shareActions = [];
  };

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
    disposeShareActions();
    const presentation = resolveSeasonPresentation({
      selectedSeason: state.selectedSeason,
      currentSeason: context.data.currentSeason,
      seasonSummaries: context.data.seasonSummaries,
      leagueGames: context.data.leagueGames,
    });
    const defaultView = defaultCurrentViewForPhase(presentation.phase);
    const projectionMode = presentation.phase === 'regular-season'
      ? state.selectedProjectionMode
      : 'current';
    const view = buildCurrentSeasonViewModel({
      leagueGames: context.data.leagueGames,
      seasonSummaries: context.data.seasonSummaries,
      currentSeason: context.data.currentSeason,
      season: presentation.season,
      week: state.selectedWeek,
      selectedOwner: state.selectedOwner,
      selectedView: state.selectedView,
      projectionMode,
    });
    const recap = resolveSeasonRecap({
      season: presentation.season,
      seasonSummaries: context.data.seasonSummaries,
      leagueGames: context.data.leagueGames,
    });
    const priorSeason = presentation.season === null
      ? null
      : latestCompleteSeason(context.data.seasonSummaries.filter(row => Number(row.season) < Number(presentation.season)));
    const contextRecap = resolveSeasonRecap({
      season: priorSeason,
      seasonSummaries: context.data.seasonSummaries,
      leagueGames: context.data.leagueGames,
    });
    if (recap && !recap.finalStandings.length && ['finalizing', 'historical-fallback'].includes(presentation.phase)) {
      const finalStandings = view.standings
        .slice()
        .sort((a: any, b: any) => Number(a.rank) - Number(b.rank) || a.owner.localeCompare(b.owner));
      recap.finalStandings = [];
      for (const row of finalStandings) {
        recap.finalStandings.push({
          finish: row.rank,
          owner: row.owner,
          record: row.record,
          pointsFor: row.pointsFor,
        });
      }
    }
    Object.assign(view, { presentation, recap, contextRecap });
    const key = JSON.stringify({ dataVersion: context.data.dataVersion, season: view.season, week: view.week, owner: view.commandCenter.selectedOwner, games: view.regularGames.map((game: any) => `${game.week}:${game.teamA}:${game.teamB}:${game.scoreA}:${game.scoreB}:${game.status}`).join('|') });
    const cached = odds.get(key);
    const allowsOdds = seasonPresentationAllowsOdds(presentation, view.commandCenter.selectedView);
    if (allowsOdds && cached && cached !== 'loading') attachCurrentSeasonOdds(view, cached);
    if (allowsOdds && !cached) {
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
    state = {
      selectedSeason: view.season,
      selectedWeek: view.week,
      selectedOwner: view.commandCenter.selectedOwner,
      selectedView: view.commandCenter.selectedView,
      selectedProjectionMode: state.selectedProjectionMode,
    };
    const title = view.season ? `${view.season} Current Season` : 'Current Season';
    context.header.feature(title, null, title);
    context.theme.owner(view.commandCenter.selectedOwner, seasonMode(view));
    renderCurrentSeasonHero(view, { doc: context.document });
    renderCurrentRecap(view, { doc: context.document });
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
    const sectionDefinitions = [
      ['current-recap', 'Season Recap', 'currentRecapDisclosure', 'currentRecap'],
      ['current-playoff-picture', 'Playoff Picture', 'currentPlayoffPictureDisclosure', 'currentPlayoffPicture'],
      ['current-owner-needs', 'Owner Needs', 'currentWeekNeedsDisclosure', 'currentWeekNeeds'],
      ['current-live-movement', 'Live Movement', 'currentLiveMovementDisclosure', 'currentLiveMovement'],
      ['current-projected-standings', 'Projected Standings', 'currentProjectedStandingsDisclosure', 'currentProjectedStandings'],
      ['current-matchups', 'Matchups', 'currentMatchupsDisclosure', 'currentMatchups'],
      ['current-standings', 'Standings', 'currentStandingsDisclosure', 'currentStandings'],
      ['current-owner-snapshots', 'Owner Snapshots', 'currentTeamSnapshotsDisclosure', 'currentTeamSnapshots'],
    ] as const;
    disclosure?.update({
      signature: `${view.season}|${presentation.phase}|${view.commandCenter.selectedView}`,
      sections: sectionDefinitions.flatMap(([id, label, detailsId, contentId]) => {
        const details = context.document.getElementById(detailsId) as HTMLDetailsElement | null;
        const content = context.document.getElementById(contentId);
        if (!details || !content) return [];
        const chartSection = ['current-live-movement', 'current-projected-standings'].includes(id);
        const resolvedLabel = id === 'current-live-movement' && !presentation.isLive
          ? 'Standings Movement'
          : label;
        const defaultOpen = id === 'current-recap'
          || id === 'current-matchups'
          || id === 'current-playoff-picture'
          || (id === 'current-owner-needs' && Boolean(view.commandCenter.selectedOwner))
          || (id === 'current-live-movement' && presentation.isLive);
        return [{
          id,
          label: resolvedLabel,
          details,
          available: !content.hidden && Boolean(content.innerHTML.trim()),
          defaultOpen,
          onVisible: chartSection ? () => renderCurrentCommandCharts(view, { doc: context.document }) : undefined,
        }];
      }),
    });
    const recapMode = view.commandCenter.selectedView === 'recap';
    for (const id of ['currentWeekSelect', 'currentOwnerSelect', 'currentProjectionSelect']) {
      const control = context.document.getElementById(id);
      const controlLabel = control?.closest('label') as HTMLElement | null;
      if (controlLabel) controlLabel.hidden = recapMode || (id === 'currentProjectionSelect' && presentation.phase !== 'regular-season');
    }
    const canonicalPath = context.router.update({
      tab: 'current',
      selectedCurrentSeason: view.season,
      selectedCurrentWeek: view.week,
      selectedCurrentOwner: view.commandCenter.selectedOwner,
      selectedCurrentView: view.commandCenter.selectedView,
      defaultCurrentView: defaultView,
      selectedCurrentProjection: state.selectedProjectionMode,
    });
    shareActions = mountCurrentMatchupCards(
      context.document.getElementById('currentMatchups'),
      view,
      canonicalPath,
      context.data.dataVersion,
      context.window,
    );
  };

  return {
    id: 'current',
    mount(nextContext) {
      context = nextContext;
      registerCurrentSeasonTables(context.tables);
      const mount = context.document.getElementById('currentSectionNav');
      if (mount) {
        disclosure = createSectionDisclosure({
          doc: context.document,
          mount,
          featureId: 'current',
          featureLabel: 'Current Season',
        });
      }
    },
    activate(input: FeatureActivation) {
      activeSignal = input.signal;
      const existing = input.reason === 'tab' && state ? state : {};
      const selectedSeason = input.route.currentSeason ?? existing.selectedSeason ?? null;
      const presentation = resolveSeasonPresentation({
        selectedSeason,
        currentSeason: context.data.currentSeason,
        seasonSummaries: context.data.seasonSummaries,
        leagueGames: context.data.leagueGames,
      });
      const defaultView = defaultCurrentViewForPhase(presentation.phase);
      const built = (buildCurrentSeasonControls as any)({
        doc: context.document,
        leagueGames: context.data.leagueGames,
        seasonSummaries: context.data.seasonSummaries,
        currentSeason: context.data.currentSeason,
        selectedSeason: presentation.season,
        selectedWeek: input.route.currentWeek ?? existing.selectedWeek ?? null,
        selectedOwner: input.route.currentOwner ?? existing.selectedOwner ?? context.ownerPreference.getSnapshot().owner ?? '',
        selectedView: input.route.currentView ?? existing.selectedView ?? defaultView,
        defaultView,
        selectedProjectionMode: input.route.currentProjection ?? existing.selectedProjectionMode ?? 'ifScoresHold',
        onChange: (next: any) => {
          if (activeSignal?.aborted) return;
          state = { ...(state || {}), ...next };
          draw();
        },
      });
      state = {
        selectedSeason: built.selectedSeason,
        selectedWeek: built.selectedWeek,
        selectedOwner: built.selectedOwner,
        selectedView: built.selectedView,
        selectedProjectionMode: built.selectedProjectionMode,
      };
      draw();
    },
    deactivate() {
      activeSignal = null;
      disposeShareActions();
    },
    dispose() {
      disposeShareActions();
      disclosure?.dispose();
      disclosure = null;
    },
  };
}
