import './gauntlet.entry.css';
import { teamSeasonId } from '../../../js/gauntlet-data.js';
import { headToHeadContext } from '../../../js/shared/head-to-head-context.js';
import { buildGauntletControls, resolveGauntletInitialState } from '../../../js/gauntlet-controls.js';
import { gauntletModelLabel, gauntletNarrativeText, renderGauntlet } from '../../../js/gauntlet-renderers.js';
import { simulateMatchup } from '../../../js/gauntlet-simulator.js';
import { gauntletHistogramRows } from './gauntlet-histogram-data';
import type { AppContext } from '../../app/app-types';
import type { DarlingFeatureController, FeatureActivation } from '../../app/feature-contract';
import { createSectionDisclosure, type SectionDisclosureController } from '../../app/section-disclosure';

const HISTOGRAM_ERROR_MESSAGE = 'Score Distribution failed. Reload.';

function resetHistogramHost(host: HTMLElement | null): void {
  if (!host) return;
  host.dataset.chartState = 'idle';
  host.replaceChildren();
}

function renderHistogramLoading(host: HTMLElement): void {
  host.dataset.chartState = 'loading';
  const status = host.ownerDocument.createElement('div');
  status.className = 'chart-loading';
  status.setAttribute('role', 'status');
  status.textContent = 'Loading Score Distribution chart…';
  host.replaceChildren(status);
}

function renderHistogramImportError(host: HTMLElement, retry: () => void): void {
  host.dataset.chartState = 'error';
  const status = host.ownerDocument.createElement('div');
  status.className = 'chart-error';
  status.setAttribute('role', 'status');
  const message = host.ownerDocument.createElement('span');
  message.textContent = HISTOGRAM_ERROR_MESSAGE;
  const button = host.ownerDocument.createElement('button');
  button.type = 'button';
  button.className = 'btn';
  button.textContent = 'Retry Score Distribution chart';
  button.addEventListener('click', retry, { once: true });
  status.append(message, button);
  host.replaceChildren(status);
}

export function createFeatureController(): DarlingFeatureController {
  let context: AppContext;
  let state: any = null;
  let active = false;
  let disclosure: SectionDisclosureController | null = null;
  let histogramDisposer: (() => void) | null = null;
  let histogramGeneration = 0;


  const copyText = (a: any, b: any, result: any, h2h: any) => {
    if (!a || !b || !result) return '';
    const lines = [
      `${a.owner} ${a.season} vs ${b.owner} ${b.season}`,
      `Model: ${gauntletModelLabel(result.model, result.includePostseason)}`,
      `Simulations: ${result.simulations.toLocaleString()}`,
      `Win probability: ${a.owner} ${(result.pctA * 100).toFixed(1)}% (${Math.round(result.actualWinsA || 0).toLocaleString()} wins) | ${b.owner} ${(result.pctB * 100).toFixed(1)}% (${Math.round(result.actualWinsB || 0).toLocaleString()} wins)`,
      `Average score: ${result.avgA.toFixed(1)} - ${result.avgB.toFixed(1)}`,
      `Average margin: ${result.avgMargin >= 0 ? '+' : ''}${result.avgMargin.toFixed(1)}`,
      `Median margin: ${result.medianMargin >= 0 ? '+' : ''}${result.medianMargin.toFixed(1)}`,
    ];
    if (h2h?.allTime?.games) lines.push(`All-time head-to-head: ${h2h.allTime.recordA} across ${h2h.allTime.games} games`);
    if (h2h?.selected?.games) lines.push(`Selected seasons: ${h2h.selected.recordA} across ${h2h.selected.games} games`);
    lines.push(`Current URL: ${context.window.location.href}`);
    return lines.join('\n');
  };

  const draw = () => {
    if (!active || !state) return;
    histogramDisposer?.();
    histogramDisposer = null;
    histogramGeneration += 1;
    const seasons = context.selectors.teamSeasons(state.selectedIncludePostseason) as any[];
    const a = seasons.find(item => item.id === teamSeasonId(state.selectedOwnerA, state.selectedSeasonA)) || null;
    const b = seasons.find(item => item.id === teamSeasonId(state.selectedOwnerB, state.selectedSeasonB)) || null;
    const title = a && b ? `${a.owner} ${a.season} vs ${b.owner} ${b.season} — Historical Matchup` : 'Historical Matchup';
    context.header.feature('Historical Matchup', null, title);
    context.theme.rivalry(a?.owner, b?.owner, state.selectedIncludePostseason ? 'postseason' : 'regular');
    if (!a || !b) {
      renderGauntlet({ teamSeasonA: a, teamSeasonB: b, result: null, context: null, narrative: 'No matchup selected.', copyText: '' }, { doc: context.document, renderHistogramChart: false });
      disclosure?.update({
        signature: 'empty',
        sections: [
          ['gauntlet-matchup', 'Matchup', 'gauntletMatchupDisclosure'],
          ['gauntlet-distribution', 'Score Distribution', 'gauntletHistogramDisclosure'],
          ['gauntlet-stats', 'Key Stats', 'gauntletStatsDisclosure'],
          ['gauntlet-context', 'Head to Head Context', 'gauntletContextDisclosure'],
          ['gauntlet-copy', 'Narrative and Copy', 'gauntletCopyDisclosure'],
        ].flatMap(([id, label, detailsId]) => {
          const details = context.document.getElementById(detailsId) as HTMLDetailsElement | null;
          return details ? [{ id, label, details, available: false }] : [];
        }),
      });
      return;
    }
    const result = simulateMatchup(a, b, { model: state.selectedModel, simulations: state.selectedSimulations, seed: state.seed, includePostseason: state.selectedIncludePostseason });
    const h2h = headToHeadContext(a.owner, b.owner, context.data.leagueGames, [a.season, b.season]);
    const rendered = { teamSeasonA: a, teamSeasonB: b, result, context: h2h, narrative: gauntletNarrativeText(result, a, b, h2h), copyText: copyText(a, b, result, h2h) };
    const histogramPayload = gauntletHistogramRows(result, a, b);
    const histogramSignature = `${teamSeasonId(a.owner, a.season)}|${teamSeasonId(b.owner, b.season)}|${state.selectedModel}|${state.selectedIncludePostseason}`;
    renderGauntlet(rendered, { doc: context.document, renderHistogramChart: false });
    let histogramLoad: Promise<void> | null = null;
    const performHistogramMount = async (): Promise<void> => {
      const generation = histogramGeneration;
      const details = context.document.getElementById('gauntletHistogramDisclosure') as HTMLDetailsElement | null;
      const host = context.document.getElementById('gauntletHistogramPlot');
      if (!active || !details?.open || !details.isConnected || !host?.isConnected) return;
      const current = () => active
        && generation === histogramGeneration
        && details.open
        && details.isConnected
        && host.isConnected
        && context.document.getElementById('gauntletHistogramPlot') === host;
      renderHistogramLoading(host);
      try {
        const adapter = await import('./GauntletHistogramMount');
        if (!current()) {
          if (host.isConnected && context.document.getElementById('gauntletHistogramPlot') === host) resetHistogramHost(host);
          return;
        }
        let mountedDisposer: (() => void) | null = null;
        const disposeHistogramMount = () => {
          const disposer = mountedDisposer;
          mountedDisposer = null;
          disposer?.();
          histogramDisposer = [histogramDisposer, null][Number(generation === histogramGeneration)];
        };
        const reportHistogramError = () => {
          disposeHistogramMount();
          renderHistogramImportError(host, () => context.window.location.reload());
        };
        const reportHistogramErrorForCurrentHost = () => [disposeHistogramMount, reportHistogramError][Number(current())]();
        mountedDisposer = adapter.mountGauntletHistogram(host, histogramPayload, histogramSignature, active, reportHistogramErrorForCurrentHost);
        histogramDisposer = disposeHistogramMount;
      } catch {
        if (!current()) {
          if (host.isConnected && context.document.getElementById('gauntletHistogramPlot') === host) resetHistogramHost(host);
          return;
        }
        renderHistogramImportError(host, () => { void mountHistogram(); });
      }
    };
    const mountHistogram = (): Promise<void> => {
      if (histogramDisposer) return Promise.resolve();
      if (histogramLoad) return histogramLoad;
      const pending = performHistogramMount().finally(() => {
        if (histogramLoad === pending) histogramLoad = null;
      });
      histogramLoad = pending;
      return pending;
    };
    const sections = [
      ['gauntlet-matchup', 'Matchup', 'gauntletMatchupDisclosure', true, undefined],
      ['gauntlet-distribution', 'Score Distribution', 'gauntletHistogramDisclosure', false, mountHistogram],
      ['gauntlet-stats', 'Key Stats', 'gauntletStatsDisclosure', false, undefined],
      ['gauntlet-context', 'Head to Head Context', 'gauntletContextDisclosure', false, undefined],
      ['gauntlet-copy', 'Narrative and Copy', 'gauntletCopyDisclosure', true, undefined],
    ] as const;
    disclosure?.update({
      signature: histogramSignature,
      sections: sections.flatMap(([id, label, detailsId, defaultOpen, onVisible]) => {
        const details = context.document.getElementById(detailsId) as HTMLDetailsElement | null;
        const content = details?.querySelector<HTMLElement>('.feature-section-content');
        return details ? [{ id, label, details, available: Boolean(content?.textContent?.trim()), defaultOpen, onVisible }] : [];
      }),
    });
    context.router.update({
      tab: 'gauntlet',
      selectedGauntletA: teamSeasonId(a.owner, a.season),
      selectedGauntletB: teamSeasonId(b.owner, b.season),
      selectedGauntletModel: state.selectedModel,
      selectedGauntletIncludePostseason: state.selectedIncludePostseason,
      selectedGauntletSimulations: state.selectedSimulations,
      selectedGauntletSeed: state.seed,
    });
  };

  const change = (next: any) => {
    if (!active) return;
    const derivedSeed = `${teamSeasonId(next.selectedOwnerA, next.selectedSeasonA)}|${teamSeasonId(next.selectedOwnerB, next.selectedSeasonB)}|${next.selectedModel}|${next.selectedIncludePostseason ? 'postseason' : 'regular'}|${next.selectedSimulations}`;
    const explicit = next.seedSource === 'explicit' || state?.seedSource === 'explicit';
    state = { ...next, seed: explicit ? (next.seed || state?.seed || derivedSeed) : derivedSeed, seedSource: explicit ? 'explicit' : 'derived' };
    draw();
  };

  return {
    id: 'gauntlet',
    mount(nextContext) {
      context = nextContext;
      const mount = context.document.getElementById('gauntletSectionNav');
      if (mount) {
        disclosure = createSectionDisclosure({
          doc: context.document,
          mount,
          featureId: 'gauntlet',
          featureLabel: 'Historical Matchup',
        });
      }
      const copy = context.document.getElementById('gauntletCopyBtn');
      copy?.addEventListener('click', async () => {
        const field = context.document.getElementById('gauntletCopyText') as HTMLTextAreaElement | null;
        if (!field?.value) return;
        const clipboard = context.window.navigator.clipboard;
        if (typeof clipboard?.writeText === 'function') {
          try {
            await clipboard.writeText(field.value);
            return;
          } catch {
            // Fall through to a selectable text field when permission is denied.
          }
        }
        field.focus();
        field.select();
      });
    },
    activate(input: FeatureActivation) {
      active = !input.signal.aborted;
      const preserveState = input.reason === 'tab' && state;
      state = resolveGauntletInitialState({
        teamSeasons: context.selectors.teamSeasons() as any[],
        urlState: preserveState ? null : input.route,
        currentState: preserveState || null,
      });
      state = buildGauntletControls({ doc: context.document, teamSeasons: context.selectors.teamSeasons() as any[], selectedState: state, onChange: change });
      draw();
    },
    deactivate() {
      active = false;
      histogramDisposer?.();
      histogramDisposer = null;
      histogramGeneration += 1;
      resetHistogramHost(context.document.getElementById('gauntletHistogramPlot'));
    },
    dispose() {
      histogramDisposer?.();
      histogramDisposer = null;
      histogramGeneration += 1;
      disclosure?.dispose();
      disclosure = null;
    },
  };
}
