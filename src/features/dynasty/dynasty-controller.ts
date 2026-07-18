import './dynasty.entry.css';
import { buildDynastyControls } from '../../../js/dynasty-controls.js';
import {
  buildDynastyViewModel,
  findDynastyWindowByKey,
  findDynastyWindowByKeyFromRows,
  renderDynastyBestWindows,
  renderDynastyCalculatorHero,
  renderDynastyHeatmap,
  renderDynastyPeriodLeaderboard,
  renderDynastyScoreBreakdown,
  renderDynastySlumpModal,
  renderDynastySlumps,
  renderDynastyTrendChart,
  renderDynastyWindowModal,
} from '../../../js/dynasty-renderers.js';
import type { AppContext } from '../../app/app-types';
import type { DarlingFeatureController, FeatureActivation, FeatureId } from '../../app/feature-contract';
import { ALL_TEAMS } from '../../app/feature-utils';

export function createFeatureController(): DarlingFeatureController {
  let context: AppContext;
  let state: any = null;
  let active = false;
  let modalOpener: HTMLElement | null = null;
  let modalOpenerKey: string | null = null;
  let suppressClose = false;

  const restoreFocus = () => {
    if (!modalOpener && !modalOpenerKey) return;
    const fallback = context.document.querySelector<HTMLElement>('#dynastyBestWindows h4, #page-dynasty h3');
    const replacement = modalOpenerKey
      ? [...context.document.querySelectorAll<HTMLElement>('[data-window-key]')].find(element => element.dataset.windowKey === modalOpenerKey)
      : null;
    const target = modalOpener?.isConnected ? modalOpener : replacement || fallback;
    modalOpener = null;
    modalOpenerKey = null;
    requestAnimationFrame(() => target?.focus?.());
  };

  const closeForNavigation = () => {
    const modal = context.document.getElementById('dynastyWindowModal') as HTMLDialogElement | null;
    if (state) state = { ...state, selectedWindowKey: null, selectedWindowKind: null };
    modalOpener = null;
    modalOpenerKey = null;
    suppressClose = !!modal?.open;
    if (modal?.open) modal.close();
    modal?.replaceChildren();
    context.document.body.classList.remove('no-scroll');
  };

  const closeModal = () => {
    if (suppressClose) {
      suppressClose = false;
      return;
    }
    if (state?.selectedWindowKey) {
      state = { ...state, selectedWindowKey: null, selectedWindowKind: null };
      draw();
    }
    restoreFocus();
  };

  const draw = () => {
    if (!active || !state) return;
    const view = buildDynastyViewModel({
      leagueGames: context.data.leagueGames,
      seasonSummaries: context.data.seasonSummaries,
      seasonAggregates: context.selectors.seasonAggregates(),
      ...state,
      allTeams: ALL_TEAMS,
    });
    const score = view.selectedScore;
    const owner = score?.owner || null;
    context.header.feature(owner ? `${owner} Dynasty Rankings` : 'Dynasty Rankings', owner);
    context.theme.owner(view.controls.mode === 'calculator' ? view.controls.owner : null, state.selectedWindowKind === 'saunders' ? 'saunders' : 'regular');
    const selectedWindowKey = state.selectedWindowKey || '';
    const selectedWindowKind = state.selectedWindowKind || 'playoffs';
    const selectedWindow = selectedWindowKind === 'saunders'
      ? findDynastyWindowByKeyFromRows(view.slumps.lowestScores, selectedWindowKey)
      : findDynastyWindowByKey(view.bestWindows, selectedWindowKey);
    renderDynastyCalculatorHero(score, { doc: context.document });
    renderDynastyScoreBreakdown(score, { doc: context.document });
    renderDynastyPeriodLeaderboard(view.comparisonRows, { doc: context.document, mode: view.controls.mode, windowSizeLabel: view.bestWindows.windowSizeLabel });
    renderDynastyBestWindows(view.bestWindows, { doc: context.document });
    renderDynastyTrendChart(view.trendChart, { doc: context.document, hiddenOwners: state.chartHiddenOwners || [] });
    if (selectedWindowKind === 'saunders') renderDynastySlumpModal(selectedWindow, { doc: context.document, allGames: context.data.leagueGames });
    else renderDynastyWindowModal(selectedWindow, { doc: context.document, allGames: context.data.leagueGames });
    renderDynastyHeatmap(view.heatmap, { doc: context.document });
    renderDynastySlumps(view.slumps, { doc: context.document });
    context.router.update({
      tab: 'dynasty',
      selectedDynastyMode: view.controls.mode,
      selectedDynastyOwner: view.controls.owner,
      selectedDynastyStartSeason: view.controls.requestedStartSeason ?? view.controls.startSeason,
      selectedDynastyEndSeason: view.controls.requestedEndSeason ?? view.controls.endSeason,
      selectedDynastyMinSeasons: view.controls.minSeasons,
      selectedDynastySaunders: view.controls.includeSaundersPenalty,
    });
  };

  return {
    id: 'dynasty',
    mount(nextContext) {
      context = nextContext;
      const trend = context.document.getElementById('dynastyTrendChart');
      trend?.addEventListener('click', event => {
        if (!active) return;
        const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-dynasty-trend-toggle="1"]') : null;
        const owner = target?.dataset.owner;
        if (!owner) return;
        event.preventDefault();
        const hidden = new Set<string>(state?.chartHiddenOwners || []);
        if (hidden.has(owner)) hidden.delete(owner); else hidden.add(owner);
        state = { ...(state || {}), chartHiddenOwners: [...hidden].sort() };
        draw();
      });
      const bindCards = (id: string, selector: string, kind: string) => {
        const root = context.document.getElementById(id);
        root?.addEventListener('click', event => {
          if (!active) return;
          const button = event.target instanceof Element ? event.target.closest<HTMLElement>(selector) : null;
          if (!button?.dataset.windowKey || !root.contains(button)) return;
          event.preventDefault();
          modalOpener = button;
          modalOpenerKey = button.dataset.windowKey;
          state = { ...(state || {}), selectedWindowKey: button.dataset.windowKey, selectedWindowKind: kind };
          draw();
        });
      };
      bindCards('dynastyBestWindows', '.dynasty-window-card[data-window-key]', 'playoffs');
      bindCards('dynastySlumps', '.dynasty-slump-item[data-window-key]', 'saunders');
      const modal = context.document.getElementById('dynastyWindowModal') as HTMLDialogElement | null;
      modal?.addEventListener('darling:dialog-navigation-close', event => {
        event.preventDefault();
        closeForNavigation();
      });
      modal?.addEventListener('click', event => {
        const target = event.target instanceof Element ? event.target : null;
        if (target !== modal && !target?.closest('[data-dynasty-modal-close="1"]')) return;
        event.preventDefault();
        closeModal();
      });
      modal?.addEventListener('keydown', event => {
        if (event.key !== 'Tab' || !modal.open) return;
        const items = [...modal.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')];
        if (!items.length) return;
        if (event.shiftKey && context.document.activeElement === items[0]) { event.preventDefault(); items.at(-1)?.focus(); }
        else if (!event.shiftKey && context.document.activeElement === items.at(-1)) { event.preventDefault(); items[0].focus(); }
      });
      modal?.addEventListener('close', closeModal);
    },
    activate(input: FeatureActivation) {
      active = !input.signal.aborted;
      const initial = {
        ...(state || {}),
        mode: input.route.dynastyMode || state?.mode || 'calculator',
        owner: input.route.dynastyOwner || state?.owner || null,
        startSeason: input.route.dynastyStart ?? state?.startSeason,
        endSeason: input.route.dynastyEnd ?? state?.endSeason,
        requestedStartSeason: input.route.dynastyStart ?? state?.requestedStartSeason,
        requestedEndSeason: input.route.dynastyEnd ?? state?.requestedEndSeason,
        minSeasons: input.route.dynastyMinSeasons ?? state?.minSeasons ?? 2,
        includeSaundersPenalty: input.route.dynastySaunders ?? state?.includeSaundersPenalty ?? true,
      };
      state = (buildDynastyControls as any)({
        doc: context.document,
        seasonSummaries: context.data.seasonSummaries,
        selectedState: initial,
        urlState: input.route,
        allTeams: ALL_TEAMS,
        onChange: (next: any) => {
          if (!active) return;
          state = { ...(state || {}), ...next };
          draw();
        },
      });
      draw();
    },
    deactivate(_next: FeatureId) {
      active = false;
      closeForNavigation();
    },
  };
}
