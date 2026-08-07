import { h, render } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { gauntletHistogramRows, type HistogramResultInput, type HistogramTeamSeasonInput } from '../../charting/chart-data';
import { DeferredChart } from '../../components/charts/DeferredChart';

function GauntletHistogram({
  result,
  teamSeasonA,
  teamSeasonB,
  active,
}: {
  result: HistogramResultInput | null;
  teamSeasonA: HistogramTeamSeasonInput | null;
  teamSeasonB: HistogramTeamSeasonInput | null;
  active: boolean;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const payload = gauntletHistogramRows(result, teamSeasonA, teamSeasonB);
  const signature = [
    teamSeasonA?.owner || '',
    teamSeasonA?.season || '',
    teamSeasonB?.owner || '',
    teamSeasonB?.season || '',
    payload.rows.length,
    payload.maxCount,
    payload.domain.join(','),
  ].join('|');

  useEffect(() => {
    const mount = mountRef.current;
    const outer = mount?.parentElement;
    const chartHost = mount?.querySelector<HTMLElement>('[data-chart-state]');
    if (!outer || !chartHost) return undefined;
    const syncState = () => {
      const state = chartHost.dataset.chartState;
      if (state) outer.dataset.chartState = state;
    };
    syncState();
    const observer = typeof MutationObserver === 'function'
      ? new MutationObserver(syncState)
      : null;
    observer?.observe(chartHost, { attributes: true, attributeFilter: ['data-chart-state'] });
    return () => observer?.disconnect();
  }, [signature, active]);

  return <div ref={mountRef} class="gauntlet-histogram-mount">
    <DeferredChart
      class="gauntlet-histogram-inner"
      name="Score Distribution"
      signature={signature}
      request={{ kind: 'gauntlet-histogram', data: payload }}
      active={active}
      emptyMessage="No simulation data available."
    />
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
  render(h(GauntletHistogram, {
    result,
    teamSeasonA,
    teamSeasonB,
    active,
  }), host);
  return () => render(null, host);
}
