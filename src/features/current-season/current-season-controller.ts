import './current-season.entry.css';
import { buildCurrentSeasonControls } from '../../../js/current-season-controls.js';
import { buildScheduleComparison } from '../../../js/current-season-schedule.js';
import {
  attachCurrentSeasonOdds,
  buildCurrentSeasonViewModel,
  renderCurrentCommandCharts,
  renderCurrentCommandCenter,
  renderCurrentMatchups,
  renderCurrentRecap,
  renderCurrentSchedule,
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
  let machineRuntimePromise: Promise<any> | null = null;
  let shareActions: ShareCardActionController[] = [];
  const odds = new Map<string, any>();

  const disposeShareActions = () => {
    shareActions.forEach(action => action.dispose());
    shareActions = [];
  };
  const onScheduleClick = (event: Event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-schedule-team]');
    if (!button || !state) return;
    const team = button.getAttribute('data-schedule-team');
    const donor = button.getAttribute('data-schedule-donor');
    const selectedWeek = Number(button.getAttribute('data-schedule-week')) || null;
    state = {
      ...state,
      selectedOwner: team,
      selectedScheduleOwner: donor || team || state.selectedOwner,
      scheduleDetailWeek: selectedWeek,
    };
    const ownerControl = context.document.getElementById('currentOwnerSelect') as HTMLSelectElement | null;
    const donorControl = context.document.getElementById('currentScheduleOwnerSelect') as HTMLSelectElement | null;
    if (ownerControl) ownerControl.value = state.selectedOwner;
    if (donorControl) donorControl.value = state.selectedScheduleOwner;
    draw();
    context.window.requestAnimationFrame(() => {
      if (state.scheduleDetailWeek) {
        context.document.getElementById(`currentScheduleWeek${state.scheduleDetailWeek}`)?.querySelector('h4')?.focus();
      } else if (donor) {
        const match = [...context.document.querySelectorAll<HTMLButtonElement>('#currentScheduleRoot button[data-schedule-donor]')]
          .find(cell => cell.getAttribute('data-schedule-team') === state.selectedOwner && cell.getAttribute('data-schedule-donor') === state.selectedScheduleOwner);
        match?.focus();
      } else if (button.hasAttribute('data-schedule-total')) {
        [...context.document.querySelectorAll<HTMLButtonElement>('#currentScheduleRoot button[data-schedule-total]')]
          .find(cell => cell.getAttribute('data-schedule-team') === state.selectedOwner)?.focus();
      } else {
        context.document.getElementById('currentOwnerSelect')?.focus();
      }
    });
  };

  const onMachineClick = async (event: Event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('#currentPlayoffMachine button[data-machine-action]');
    if (!button || !state) return;
    const action = button.dataset.machineAction;
    const edits = { ...(state.machineEdits || {}) };
    let machineWeek = state.machineWeek ?? Number(context.document.querySelector<HTMLButtonElement>('#currentPlayoffMachine [data-machine-action="clear-week"]')?.dataset.week);
    if (action === 'reset') Object.keys(edits).forEach(key => delete edits[key]);
    else if (['clear-week', 'week-prev', 'week-next'].includes(action)) {
      if (action === 'week-prev' || action === 'week-next') {
        const weeks = (button.dataset.weeks || '').split(',').map(Number);
        const index = weeks.indexOf(Number(machineWeek));
        machineWeek = weeks[Math.max(0, Math.min(weeks.length - 1, index + (action === 'week-prev' ? -1 : 1)))];
      } else {
        for (const game of context.document.querySelectorAll<HTMLElement>('#currentPlayoffMachine .current-machine-game[data-week]')) {
          if (Number(game.dataset.week) === Number(button.dataset.week)) {
            const key = game.querySelector<HTMLInputElement>('input[data-game-key]')?.dataset.gameKey;
            if (key) delete edits[key];
          }
        }
      }
    } else if (action === 'clear-game') delete edits[button.dataset.gameKey || ''];
    else if (action === 'outcome') edits[button.dataset.gameKey || ''] = { outcome: button.dataset.outcome || null };
    const change = action === 'outcome' ? `Picked ${button.textContent?.trim() || 'an outcome'}`
      : action === 'reset' ? 'Reset all scenario picks'
        : action === 'clear-week' ? `Cleared week ${button.dataset.week}`
          : action === 'clear-game' ? 'Cleared a matchup pick'
            : `Showing week ${machineWeek}`;
    state = { ...state, machineEdits: edits, machineWeek, machineAnnouncement: change };
    await drawMachine();
    const target = [...context.document.querySelectorAll<HTMLButtonElement>('#currentPlayoffMachine button[data-machine-action]')]
      .find(item => item.dataset.machineAction === action
        && item.dataset.gameKey === button.dataset.gameKey
        && item.dataset.outcome === button.dataset.outcome
        && item.dataset.week === button.dataset.week);
    target?.focus();
  };

  const onMachineInput = async (event: Event) => {
    const input = (event.target as HTMLElement).closest<HTMLInputElement>('#currentPlayoffMachine input[data-machine-score]');
    if (!input || !state) return;
    const key = input.dataset.gameKey || '';
    const side = input.dataset.machineScore;
    const edits = { ...(state.machineEdits || {}) };
    const edit: any = { ...(edits[key] || {}), outcome: null };
    const pair = [...context.document.querySelectorAll<HTMLInputElement>('#currentPlayoffMachine input[data-game-key]')]
      .filter(item => item.dataset.gameKey === key);
    for (const item of pair) edit[item.dataset.machineScore === 'a' ? 'scoreA' : 'scoreB'] = item.value;
    edits[key] = edit;
    const selectionStart = input.selectionStart;
    const matchup = input.closest<HTMLElement>('.current-machine-game')?.querySelector('h4')?.textContent?.split(' vs ') || [];
    const owner = matchup[side === 'a' ? 0 : 1] || 'team';
    state = { ...state, machineEdits: edits, machineAnnouncement: `Updated ${owner} score to ${input.value || 'blank'}` };
    await drawMachine();
    const focused = [...context.document.querySelectorAll<HTMLInputElement>('#currentPlayoffMachine input[data-game-key]')]
      .find(item => item.dataset.gameKey === key && item.dataset.machineScore === side);
    focused?.focus();
    if (focused && selectionStart !== null) focused.setSelectionRange(selectionStart, selectionStart);
  };

  const seasonMode = (view: any) => {
    const games = [...(context.data.currentSeason?.games || []), ...context.data.leagueGames]
      .filter(game => Number(game.season) === Number(view.season) && Number(game.week) === Number(view.week));
    const labelled = seasonModeFromLabels(games.flatMap(game => [game.type, game.round]));
    if (labelled !== 'regular') return labelled;
    const maximum = Number(context.data.currentSeason?.playoff_rules?.regular_season_max_week);
    return Number.isFinite(maximum) && Number(view.week) > maximum ? 'postseason' : 'regular';
  };

  const drawMachine = async () => {
    if (!state || activeSignal?.aborted) return;
    const presentation = resolveSeasonPresentation({
      selectedSeason: state.selectedSeason,
      currentSeason: context.data.currentSeason,
      seasonSummaries: context.data.seasonSummaries,
      leagueGames: context.data.leagueGames,
    });
    const available = presentation.phase === 'regular-season'
      && Number(presentation.season) === Number(context.data.currentSeason?.season);
    if (state.selectedView !== 'machine') {
      const host = context.document.getElementById('currentPlayoffMachine');
      if (host) host.innerHTML = '';
      return;
    }
    if (!available) {
      const host = context.document.getElementById('currentPlayoffMachine');
      if (host) host.innerHTML = '<div class="section-heading"><h3>Playoff Machine</h3></div><p class="muted">The Playoff Machine is available during the active regular season.</p>';
      return;
    }
    machineRuntimePromise ||= import('../../../js/current-season-machine.js');
    const runtime = await machineRuntimePromise;
    if (!state || activeSignal?.aborted || state.selectedView !== 'machine' || Number(state.selectedSeason) !== Number(presentation.season)) return;
    runtime.drawPlayoffMachine({ leagueGames: context.data.leagueGames, currentSeason: context.data.currentSeason, season: presentation.season, scenario: state.machineEdits || {}, selectedWeek: state.machineWeek, changeAnnouncement: state.machineAnnouncement, doc: context.document });
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
    const scheduleModel = view.commandCenter.selectedView === 'schedule' ? buildScheduleComparison({
      leagueGames: context.data.leagueGames,
      currentSeason: context.data.currentSeason,
      season: view.season,
      week: view.week,
      owner: state.selectedOwner,
      donor: state.selectedOwner ? state.selectedScheduleOwner : '',
    }) : null;
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
      selectedOwner: view.commandCenter.selectedView === 'schedule' ? state.selectedOwner : view.commandCenter.selectedOwner,
      selectedView: view.commandCenter.selectedView,
      selectedProjectionMode: state.selectedProjectionMode,
      selectedScheduleOwner: state.selectedScheduleOwner,
      scheduleDetailWeek: state.scheduleDetailWeek,
      machineEdits: state.machineEdits || {},
      machineWeek: state.machineWeek ?? null,
      dataVersion: state.dataVersion,
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
    const scheduleOwner = state.selectedOwner && scheduleModel?.teams.includes(state.selectedOwner) ? state.selectedOwner : '';
    const scheduleDonor = state.selectedOwner && scheduleModel?.teams.includes(state.selectedScheduleOwner) ? state.selectedScheduleOwner : '';
    renderCurrentSchedule(scheduleModel, { doc: context.document, season: view.season, week: view.week, owner: scheduleOwner, donor: scheduleDonor });
    if (scheduleModel) {
      state = { ...state, selectedScheduleOwner: scheduleDonor };
      const donorControl = context.document.getElementById('currentScheduleOwnerSelect') as HTMLSelectElement | null;
      if (donorControl) donorControl.value = scheduleDonor;
    }
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
      ['current-schedule', 'Schedule Comparison', 'currentScheduleDisclosure', 'currentScheduleRoot'],
      ['current-machine', 'Playoff Machine', 'currentPlayoffMachineDisclosure', 'currentPlayoffMachine'],
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
          || (id === 'current-schedule' && view.commandCenter.selectedView === 'schedule')
          || (id === 'current-machine' && view.commandCenter.selectedView === 'machine')
          || (id === 'current-live-movement' && presentation.isLive);
        return [{
          id,
          label: resolvedLabel,
          details,
          available: (id === 'current-machine' && view.commandCenter.selectedView === 'machine') || (!content.hidden && Boolean(content.innerHTML.trim())),
          defaultOpen,
          onVisible: chartSection ? () => renderCurrentCommandCharts(view, { doc: context.document }) : undefined,
        }];
      }),
    });
    const recapMode = view.commandCenter.selectedView === 'recap';
    const machineMode = view.commandCenter.selectedView === 'machine';
    for (const id of ['currentWeekSelect', 'currentOwnerSelect', 'currentProjectionSelect', 'currentScheduleOwnerLabel']) {
      const control = context.document.getElementById(id);
      const controlLabel = control?.closest('label') as HTMLElement | null;
      if (controlLabel) controlLabel.hidden = id === 'currentOwnerSelect'
        ? recapMode || machineMode
        : id === 'currentScheduleOwnerLabel'
          ? view.commandCenter.selectedView !== 'schedule'
          : recapMode || machineMode || (id === 'currentProjectionSelect' && (presentation.phase !== 'regular-season' || view.commandCenter.selectedView === 'schedule'));
    }
    const routeOwner = view.commandCenter.selectedView === 'schedule' ? state.selectedOwner : view.commandCenter.selectedOwner;
    const routeOptions = {
      tab: 'current',
      selectedCurrentSeason: view.season,
      selectedCurrentWeek: view.week,
      selectedCurrentOwner: routeOwner,
      selectedCurrentView: view.commandCenter.selectedView,
      defaultCurrentView: defaultView,
      selectedCurrentProjection: state.selectedProjectionMode,
      selectedCurrentScheduleOwner: state.selectedScheduleOwner !== routeOwner ? state.selectedScheduleOwner : null,
    };
    const canonicalPath = context.router.update(routeOptions);
    void drawMachine();
    if (`${context.window.location.pathname}${context.window.location.search}` !== canonicalPath) {
      void context.router.runReplacing(() => context.router.update(routeOptions));
    }
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
      context.document.getElementById('currentScheduleRoot')?.addEventListener('click', onScheduleClick);
      context.document.getElementById('currentPlayoffMachine')?.addEventListener('click', onMachineClick);
      context.document.getElementById('currentPlayoffMachine')?.addEventListener('input', onMachineInput);
    },
    activate(input: FeatureActivation) {
      activeSignal = input.signal;
      const existing = input.reason === 'tab' && state && state.dataVersion === context.data.dataVersion ? state : {};
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
        selectedScheduleOwner: input.route.currentScheduleOwner ?? existing.selectedScheduleOwner ?? input.route.currentOwner ?? existing.selectedOwner ?? '',
        onChange: (next: any) => {
          if (activeSignal?.aborted) return;
          const previous = state || {};
          state = { ...previous, ...next, machineEdits: next.selectedSeason === previous.selectedSeason ? previous.machineEdits || {} : {} };
          draw();
        },
      });
      state = {
        selectedSeason: built.selectedSeason,
        selectedWeek: built.selectedWeek,
        selectedOwner: built.selectedOwner,
        selectedView: built.selectedView,
        selectedProjectionMode: built.selectedProjectionMode,
        selectedScheduleOwner: built.selectedScheduleOwner || built.selectedOwner,
        machineEdits: existing.selectedSeason === built.selectedSeason ? existing.machineEdits || {} : {},
        dataVersion: context.data.dataVersion,
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
      context?.document.getElementById('currentScheduleRoot')?.removeEventListener('click', onScheduleClick);
      context?.document.getElementById('currentPlayoffMachine')?.removeEventListener('click', onMachineClick);
      context?.document.getElementById('currentPlayoffMachine')?.removeEventListener('input', onMachineInput);
      disclosure = null;
    },
  };
}
