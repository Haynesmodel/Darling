import './dynasty.entry.css';
import { h, render } from 'preact';
import type { AppContext } from '../../app/app-types';
import type { DarlingFeatureController, FeatureActivation } from '../../app/feature-contract';
import { createSectionDisclosure, type SectionDisclosureController } from '../../app/section-disclosure';
import { mountDynastyCard } from '../../share/share-card-feature-adapters';
import type { ShareCardActionController } from '../../share/share-card-actions';
import { buildDynastyViewModel } from './dynasty-model.ts';
import { ALL_DYNASTY_TEAMS, normalizeDynastyStateChange, resolveDynastyInitialState } from './dynasty-state.ts';
import type { DynastyMode, DynastyScore, DynastyState } from './dynasty-types.ts';
import { DynastyPage } from './DynastyPage.tsx';

type DisclosureSpec = { id: string; label: string; detailsId: string; defaultOpen: boolean };
const disclosureSpecs: readonly DisclosureSpec[] = [
  { id: 'dynasty-score', label: 'Score Breakdown', detailsId: 'dynastyScoreDisclosure', defaultOpen: true },
  { id: 'dynasty-period', label: 'Period Comparison', detailsId: 'dynastyPeriodDisclosure', defaultOpen: true },
  { id: 'dynasty-windows', label: 'Best Dynasty Windows', detailsId: 'dynastyWindowsDisclosure', defaultOpen: false },
  { id: 'dynasty-trend', label: 'Dynasty Trend', detailsId: 'dynastyTrendDisclosure', defaultOpen: false },
  { id: 'dynasty-heatmap', label: 'Era Heatmap', detailsId: 'dynastyHeatmapDisclosure', defaultOpen: false },
  { id: 'dynasty-slumps', label: 'Slumps', detailsId: 'dynastySlumpsDisclosure', defaultOpen: false },
];

function aggregateRows(value: readonly unknown[]): Record<string, unknown>[] { return value.filter((row): row is Record<string, unknown> => Boolean(row && typeof row === 'object' && !Array.isArray(row))); }

export function createFeatureController(): DarlingFeatureController {
  let context: AppContext;
  let root: HTMLElement | null = null;
  let activeSignal: AbortSignal | null = null;
  let initialized = false;
  let controlsInteracted = false;
  let lastIndividualOwner: string | null = null;
  let state: DynastyState = resolveDynastyInitialState({ seasonSummaries: [] });
  let disclosure: SectionDisclosureController | null = null;
  let shareAction: ShareCardActionController | null = null;
  const isActive = () => Boolean(activeSignal && !activeSignal.aborted);
  const buildView = () => buildDynastyViewModel({ leagueGames: context.data.leagueGames, seasonSummaries: context.data.seasonSummaries, seasonAggregates: aggregateRows(context.selectors.seasonAggregates()), mode: state.mode, owner: state.owner, startSeason: state.startSeason, endSeason: state.endSeason, requestedStartSeason: state.requestedStartSeason, requestedEndSeason: state.requestedEndSeason, minSeasons: state.minSeasons, includeSaundersPenalty: state.includeSaundersPenalty });
  const renderCurrent = (allowInactive = false) => {
    if (!root || (!isActive() && !allowInactive)) return;
    const model = buildView();
    render(h(DynastyPage, {
      view: model,
      state,
      seasonSummaries: context.data.seasonSummaries,
      leagueGames: context.data.leagueGames,
      active: isActive(),
      openWindows: controlsInteracted && state.mode === 'calculator',
      openScore: state.mode === 'calculator',
      openPeriod: state.mode !== 'calculator',
      onChange(next: DynastyState) {
        if (!isActive()) return;
        controlsInteracted = true;
        if (state.mode === 'calculator' && state.owner !== ALL_DYNASTY_TEAMS) lastIndividualOwner = state.owner;
        const candidate = next.mode === 'calculator' && next.owner === ALL_DYNASTY_TEAMS
          ? { ...next, owner: lastIndividualOwner || ALL_DYNASTY_TEAMS }
          : next;
        state = normalizeDynastyStateChange({ ...candidate, requestedStartSeason: candidate.startSeason, requestedEndSeason: candidate.endSeason }, context.data.seasonSummaries);
        if (state.mode === 'calculator' && state.owner !== ALL_DYNASTY_TEAMS) lastIndividualOwner = state.owner;
        renderCurrent();
      },
      onToggleTrend(owner: string) { if (!isActive()) return; const hidden = new Set(state.chartHiddenOwners); if (hidden.has(owner)) hidden.delete(owner); else hidden.add(owner); state = { ...state, chartHiddenOwners: [...hidden].sort() }; renderCurrent(); },
      onSelectWindow(row: DynastyScore, kind: 'playoffs' | 'saunders' = 'playoffs') { if (!isActive()) return; state = { ...state, selectedWindowKey: `${row.owner}|${row.windowStartSeason}|${row.windowEndSeason}|${row.windowSize || ''}`, selectedWindowKind: kind }; renderCurrent(); },
      onCloseWindow() { if (!isActive()) return; state = { ...state, selectedWindowKey: null, selectedWindowKind: null }; renderCurrent(); },
    }), root);
    if (!isActive()) return;
    if (!disclosure) {
      const mount = context.document.getElementById('dynastySectionNav');
      if (mount) disclosure = createSectionDisclosure({ doc: context.document, mount, featureId: 'dynasty', featureLabel: 'Dynasty Rankings' });
    }
    const signature = `${state.mode}|${state.owner}|${state.startSeason}|${state.endSeason}|${state.minSeasons}|${state.includeSaundersPenalty}`;
    disclosure?.update({ signature, sections: disclosureSpecs.flatMap(spec => { const details = context.document.getElementById(spec.detailsId) as HTMLDetailsElement | null; const defaultOpen = spec.id === 'dynasty-score' ? state.mode === 'calculator' : spec.id === 'dynasty-period' ? state.mode !== 'calculator' : spec.defaultOpen; return details ? [{ id: spec.id, label: spec.label, details, available: true, defaultOpen }] : []; }) });
    if (controlsInteracted && state.mode === 'calculator') {
      disclosure?.setOpen('dynasty-windows', true);
    }
    const owner = model.selectedScore?.owner || null;
    context.header.feature(owner ? `${owner} Dynasty Rankings` : 'Dynasty Rankings', owner);
    context.theme.owner(state.mode === 'calculator' ? state.owner : null, state.selectedWindowKind === 'saunders' ? 'saunders' : 'regular');
    const canonicalPath = context.router.update({ tab: 'dynasty', selectedDynastyMode: state.mode, selectedDynastyOwner: state.mode === 'calculator' ? state.owner : lastIndividualOwner, selectedDynastyStartSeason: state.requestedStartSeason, selectedDynastyEndSeason: state.requestedEndSeason, selectedDynastyMinSeasons: state.minSeasons, selectedDynastySaunders: state.includeSaundersPenalty });
    shareAction?.dispose();
    shareAction = mountDynastyCard(context.document.getElementById('dynastyShareCard'), model.selectedScore, canonicalPath, context.data.dataVersion, context.window, state.mode === 'calculator' && state.owner !== ALL_DYNASTY_TEAMS ? state.owner : null);
  };
  return {
    id: 'dynasty',
    mount(nextContext) { context = nextContext; root = context.document.getElementById('dynastyRoot'); if (!root) throw new Error('Dynasty Rankings root missing'); },
    activate(input: FeatureActivation) {
      activeSignal = input.signal;
      if (input.signal.aborted) return;
      const retained = input.reason === 'tab' && initialized ? state : null;
      const favorite = context.ownerPreference.getSnapshot().owner;
      const mode = (input.route.dynastyMode || retained?.mode || (input.route.dynastyOwner || favorite ? 'calculator' : 'all-time')) as DynastyMode;
      state = resolveDynastyInitialState({ seasonSummaries: context.data.seasonSummaries, urlState: input.route, mode, owner: input.route.dynastyOwner || retained?.owner || favorite, startSeason: input.route.dynastyStart ?? retained?.startSeason, endSeason: input.route.dynastyEnd ?? retained?.endSeason, minSeasons: input.route.dynastyMinSeasons ?? retained?.minSeasons, includeSaundersPenalty: input.route.dynastySaunders ?? retained?.includeSaundersPenalty });
      // Keep the window disclosure eligible when the feature is reactivated
      // from a URL that already carries an explicit calculator range. This is
      // also the durable representation of a prior control interaction when
      // navigation restores the feature.
      controlsInteracted = controlsInteracted
        || input.route.dynastyStart != null
        || input.route.dynastyEnd != null;
      state = { ...state, chartHiddenOwners: retained?.chartHiddenOwners || [], selectedWindowKey: null, selectedWindowKind: null };
      const routeOwner = input.route.dynastyOwner || retained?.owner || favorite;
      if (routeOwner && routeOwner !== ALL_DYNASTY_TEAMS) lastIndividualOwner = routeOwner;
      initialized = true;
      renderCurrent();
    },
    deactivate() { activeSignal = null; shareAction?.dispose(); shareAction = null; renderCurrent(true); },
    dispose() { activeSignal = null; shareAction?.dispose(); shareAction = null; disclosure?.dispose(); disclosure = null; if (root) render(null, root); root = null; },
  };
}
