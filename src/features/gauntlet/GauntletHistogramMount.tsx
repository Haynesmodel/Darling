import { h, render, type VNode } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { DeferredChartProps } from '../../components/charts/DeferredChart';
import type { GauntletHistogramPayload } from './gauntlet-histogram-data';

type DeferredChartComponent = (props: DeferredChartProps) => VNode | null;
// A rejected module record is cached by browsers, so later mounts use a tiny alternate entry.
let deferredChartImportAttempts = 0;

function GauntletHistogram({ payload, signature, active, onError }: {
  payload: GauntletHistogramPayload;
  signature: string;
  active: boolean;
  onError: () => void;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
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
  useEffect(() => {
    const outer = mountRef.current?.parentElement;
    if (!DeferredChart) {
      if (outer) outer.dataset.chartState = payload.rows.length ? 'idle' : 'empty';
      return undefined;
    }
    const chartHost = mountRef.current?.querySelector<HTMLElement>('[data-chart-state]');
    if (!outer || !chartHost) return undefined;
    const syncState = () => { const state = chartHost.dataset.chartState; if (state) outer.dataset.chartState = state; };
    syncState();
    const observer = typeof MutationObserver === 'function' ? new MutationObserver(syncState) : null;
    observer?.observe(chartHost, { attributes: true, attributeFilter: ['data-chart-state'] });
    return () => observer?.disconnect();
  }, [signature, active, DeferredChart]);
  return <div ref={mountRef} class="gauntlet-histogram-mount" data-chart-state={DeferredChart ? undefined : payload.rows.length ? 'idle' : 'empty'}>
    {DeferredChart ? h(DeferredChart, { class: 'gauntlet-histogram-inner', name: 'Score Distribution', signature, request: { kind: 'gauntlet-histogram' as const, data: payload }, active })
      : null}
  </div>;
}

export function mountGauntletHistogram(host: HTMLElement | null, payload: GauntletHistogramPayload, signature: string, active: boolean, onError: () => void): () => void {
  if (!host) return () => undefined;
  render(h(GauntletHistogram, { payload, signature, active, onError }), host);
  return () => render(null, host);
}
