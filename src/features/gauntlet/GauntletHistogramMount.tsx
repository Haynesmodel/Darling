import { h, render, type VNode } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { ChartState } from '../../charting/chart-types';
import type { DeferredChartProps } from '../../components/charts/DeferredChart';
import type { GauntletHistogramPayload } from './gauntlet-histogram-data';

type DeferredChartComponent = (props: DeferredChartProps) => VNode | null;
// A rejected module record is cached by browsers, so later mounts use a tiny alternate entry.
let deferredChartImportAttempts = 0;

function GauntletHistogram({ payload, signature, active, onError, onStateChange }: {
  payload: GauntletHistogramPayload;
  signature: string;
  active: boolean;
  onError: () => void;
  onStateChange: (state: ChartState) => void;
}) {
  const [DeferredChart, setDeferredChart] = useState<DeferredChartComponent | null>(null);
  const loadDeferredChart = () => {
    if (DeferredChart) return;
    const deferredChartImport = deferredChartImportAttempts++ === 0
      ? import('../../components/charts/DeferredChart')
      : import('../../components/charts/DeferredChartRetry');
    void deferredChartImport.then(module => {
      setDeferredChart(() => module.DeferredChart as DeferredChartComponent);
    }).catch(onError);
  };
  useEffect(() => { loadDeferredChart(); }, []);
  return <div class="gauntlet-histogram-mount">
    {DeferredChart ? h(DeferredChart, { class: 'gauntlet-histogram-inner', name: 'Score Distribution', signature, request: { kind: 'gauntlet-histogram' as const, data: payload }, active, onStateChange: state => {
      onStateChange(state);
    } })
      : null}
  </div>;
}

export function mountGauntletHistogram(host: HTMLElement | null, payload: GauntletHistogramPayload, signature: string, active: boolean, onError: () => void): () => void {
  if (!host) return () => undefined;
  host.dataset.chartState = payload.rows.length ? 'idle' : 'empty';
  render(h(GauntletHistogram, { payload, signature, active, onError, onStateChange: state => { host.dataset.chartState = state; } }), host);
  return () => render(null, host);
}
