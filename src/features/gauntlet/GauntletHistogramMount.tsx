import { h, render } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { HistogramResultInput, HistogramTeamSeasonInput } from '../../charting/chart-data';

function GauntletHistogram({ result, teamSeasonA, teamSeasonB, active }: { result: HistogramResultInput | null; teamSeasonA: HistogramTeamSeasonInput | null; teamSeasonB: HistogramTeamSeasonInput | null; active: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'empty' | 'error'>('loading');
  useEffect(() => {
    const inner = host.current?.parentElement;
    if (inner) inner.dataset.chartState = state;
    const outer = inner?.parentElement;
    if (outer) outer.dataset.chartState = state;
  }, [state]);
  useEffect(() => {
    let current = true;
    const details = host.current?.closest('details');
    const onToggle = () => {
      if (details && !details.open) {
        current = false;
        host.current?.replaceChildren();
        setState('empty');
      }
    };
    details?.addEventListener('toggle', onToggle);
    if (!active || !result || !teamSeasonA || !teamSeasonB) {
      setState('empty');
      return () => { current = false; details?.removeEventListener('toggle', onToggle); };
    }
    void import('../../charting/plot-charts.ts').then(({ renderGauntletHistogramPlot }) => {
      if (!current || !host.current) return;
      setState('ready');
      const rendered = renderGauntletHistogramPlot(host.current, result, teamSeasonA, teamSeasonB);
      if (!rendered) setState('empty');
    }).catch(() => {
      if (current) setState('error');
    });
    return () => {
      current = false;
      details?.removeEventListener('toggle', onToggle);
      host.current?.replaceChildren();
    };
  }, [active, result, teamSeasonA, teamSeasonB]);
  return <div class="chart-host gauntlet-histogram-host" data-chart-state={state}>
    {state === 'loading' && <div class="chart-loading" role="status">Loading Score Distribution chart…</div>}
    {state === 'empty' && <div class="chart-empty">No simulation data available.</div>}
    {state === 'error' && <div class="chart-error" role="status">Score Distribution chart is unavailable.</div>}
    <div ref={host} class="chart-render-host" hidden={state !== 'ready'} />
  </div>;
}

export function mountGauntletHistogram(
  host: HTMLElement | null,
  result: HistogramResultInput | null,
  teamSeasonA: HistogramTeamSeasonInput | null,
  teamSeasonB: HistogramTeamSeasonInput | null,
  active: boolean,
): () => void {
  if (!host) return () => undefined;
  host.dataset.chartState = 'loading';
  render(h(GauntletHistogram, {
    result, teamSeasonA, teamSeasonB, active,
  }), host);
  return () => render(null, host);
}
