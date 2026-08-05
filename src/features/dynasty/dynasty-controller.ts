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
import { createSectionDisclosure, type SectionDisclosureController } from '../../app/section-disclosure';
import type { ShareCardActionController } from '../../share/share-card-actions';
import { mountDynastyCard } from '../../share/share-card-feature-adapters';

export function createFeatureController(): DarlingFeatureController {
  let context: AppContext;
  let state: any = null;
  let active = false;
  let modalOpener: HTMLElement | null = null;
  let modalOpenerKey: string | null = null;
  let suppressClose = false;
  let disclosure: SectionDisclosureController | null = null;
  let shareAction: ShareCardActionController | null = null;

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
    shareAction?.dispose();
    shareAction = null;
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
    renderDynastyTrendChart(view.trendChart, { doc: context.document, hiddenOwners: state.chartHiddenOwners || [], renderChart: false });
    if (selectedWindowKind === 'saunders') renderDynastySlumpModal(selectedWindow, { doc: context.document, allGames: context.data.leagueGames });
    else renderDynastyWindowModal(selectedWindow, { doc: context.document, allGames: context.data.leagueGames });
    renderDynastyHeatmap(view.heatmap, { doc: context.document });
    renderDynastySlumps(view.slumps, { doc: context.document });
    const individual = view.controls.mode === 'calculator';
    const comparison = ['selected-range', 'all-time', 'rolling-3', 'rolling-5'].includes(view.controls.mode);
    const sections = [
      ['dynasty-score', 'Score Breakdown', 'dynastyScoreDisclosure', individual, undefined],
      ['dynasty-period', 'Period Comparison', 'dynastyPeriodDisclosure', comparison, undefined],
      ['dynasty-windows', 'Best Dynasty Windows', 'dynastyWindowsDisclosure', false, undefined],
      ['dynasty-trend', 'Dynasty Trend', 'dynastyTrendDisclosure', false, () => renderDynastyTrendChart(view.trendChart, { doc: context.document, hiddenOwners: state.chartHiddenOwners || [] })],
      ['dynasty-heatmap', 'Era Heatmap', 'dynastyHeatmapDisclosure', false, undefined],
      ['dynasty-slumps', 'Slumps', 'dynastySlumpsDisclosure', false, undefined],
    ] as const;
    disclosure?.update({
      signature: `${view.controls.mode}|${view.controls.owner}|${view.controls.startSeason}|${view.controls.endSeason}|${view.controls.minSeasons}|${view.controls.includeSaundersPenalty}`,
      sections: sections.flatMap(([id, label, detailsId, defaultOpen, onVisible]) => {
        const details = context.document.getElementById(detailsId) as HTMLDetailsElement | null;
        const content = details?.querySelector<HTMLElement>('.feature-section-content');
        return details ? [{ id, label, details, available: Boolean(content?.textContent?.trim()), defaultOpen, onVisible }] : [];
      }),
    });
    const canonicalPath = context.router.update({
      tab: 'dynasty',
      selectedDynastyMode: view.controls.mode,
      selectedDynastyOwner: view.controls.owner,
      selectedDynastyStartSeason: view.controls.requestedStartSeason ?? view.controls.startSeason,
      selectedDynastyEndSeason: view.controls.requestedEndSeason ?? view.controls.endSeason,
      selectedDynastyMinSeasons: view.controls.minSeasons,
      selectedDynastySaunders: view.controls.includeSaundersPenalty,
    });
    const host = context.document.getElementById('dynastyShareCard');
    shareAction = mountDynastyCard(
      host,
      score,
      canonicalPath,
      context.data.dataVersion,
      context.window,
      view.controls.mode === 'calculator' && view.controls.owner !== ALL_TEAMS
        ? view.controls.owner
        : null,
    );
  };

  return {
    id: 'dynasty',
    mount(nextContext) {
      context = nextContext;
      const disclosureMount = context.document.getElementById('dynastySectionNav');
      if (disclosureMount) {
        disclosure = createSectionDisclosure({
          doc: context.document,
          mount: disclosureMount,
          featureId: 'dynasty',
          featureLabel: 'Dynasty Rankings',
        });
      }
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
      const retained = input.reason === 'tab' ? state : null;
      const favorite = context.ownerPreference.getSnapshot().owner;
      const mode = input.route.dynastyMode
        || (input.route.dynastyOwner ? 'calculator' : retained?.mode)
        || (favorite ? 'calculator' : 'all-time');
      const initial = {
        ...(retained || {}),
        mode,
        owner: input.route.dynastyOwner || retained?.owner || (mode === 'calculator' ? favorite : ALL_TEAMS),
        startSeason: input.route.dynastyStart ?? retained?.startSeason,
        endSeason: input.route.dynastyEnd ?? retained?.endSeason,
        requestedStartSeason: input.route.dynastyStart ?? retained?.requestedStartSeason,
        requestedEndSeason: input.route.dynastyEnd ?? retained?.requestedEndSeason,
        minSeasons: input.route.dynastyMinSeasons ?? retained?.minSeasons ?? 2,
        includeSaundersPenalty: input.route.dynastySaunders ?? retained?.includeSaundersPenalty ?? true,
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
      shareAction?.dispose();
      shareAction = null;
      closeForNavigation();
    },
    dispose() {
      shareAction?.dispose();
      shareAction = null;
      disclosure?.dispose();
      disclosure = null;
    },
  };
}
