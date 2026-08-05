import { useEffect, useRef, useState } from 'preact/hooks';
import { chartRequestHasData, type ChartRequest, type ChartState } from '../../charting/chart-types';
import { loadChartRuntime } from '../../charting/load-chart-runtime';

export const CHART_INTERSECTION_OPTIONS: IntersectionObserverInit = Object.freeze({
  root: null,
  rootMargin: '600px 0px',
  threshold: 0,
});

export interface DeferredChartProps {
  request: ChartRequest | null;
  signature: string;
  name: string;
  id?: string;
  class?: string;
  emptyMessage?: string;
  active?: boolean;
}

function disclosureFor(host: HTMLElement): HTMLDetailsElement | null {
  return host.closest('details');
}

export function isChartHostAvailable(host: HTMLElement, active: boolean): boolean {
  const disclosure = disclosureFor(host);
  return active && host.isConnected && (!disclosure || disclosure.open);
}

export function chartErrorMessage(name: string): string {
  return `${name} chart is unavailable. Retry, or reload the page if the browser continues to reuse a failed download.`;
}

export function DeferredChart({
  request,
  signature,
  name,
  id,
  class: className,
  emptyMessage = `No ${name.toLowerCase()} chart data is available.`,
  active = true,
}: DeferredChartProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<HTMLDivElement>(null);
  const generationRef = useRef(0);
  const beginLoadRef = useRef<() => void>(() => undefined);
  const stateRef = useRef<ChartState>(request && chartRequestHasData(request) ? 'idle' : 'empty');
  const [state, setStateValue] = useState<ChartState>(stateRef.current);

  const setState = (next: ChartState) => {
    stateRef.current = next;
    setStateValue(next);
  };

  useEffect(() => {
    const host = hostRef.current;
    const plotHost = plotRef.current;
    if (!host || !plotHost) return undefined;
    const disclosure = disclosureFor(host);
    const hasData = Boolean(request && chartRequestHasData(request));
    let observer: IntersectionObserver | null = null;
    let disposed = false;
    let inFlight = false;

    const clearPlot = () => plotHost.replaceChildren();
    const current = (generation: number) => (
      !disposed
      && generationRef.current === generation
      && request !== null
      && isChartHostAvailable(host, active)
    );
    const invalidate = () => {
      generationRef.current += 1;
      inFlight = false;
      clearPlot();
    };
    const beginLoad = () => {
      if (!request || !hasData || inFlight || stateRef.current === 'ready') return;
      if (!isChartHostAvailable(host, active)) return;
      inFlight = true;
      observer?.disconnect();
      const generation = ++generationRef.current;
      setState('loading');
      void loadChartRuntime().then(runtime => {
        if (!current(generation)) return;
        try {
          runtime.renderChart(plotHost, request);
        } catch {
          if (!current(generation)) return;
          clearPlot();
          inFlight = false;
          setState('error');
          return;
        }
        if (!current(generation)) {
          clearPlot();
          return;
        }
        inFlight = false;
        setState('ready');
      }).catch(() => {
        if (!current(generation)) return;
        clearPlot();
        inFlight = false;
        setState('error');
      });
    };
    beginLoadRef.current = beginLoad;

    const observe = () => {
      observer?.disconnect();
      observer = null;
      if (!request || !hasData || !isChartHostAvailable(host, active) || typeof IntersectionObserver !== 'function') return;
      observer = new IntersectionObserver(entries => {
        if (entries.some(entry => entry.isIntersecting)) beginLoad();
      }, CHART_INTERSECTION_OPTIONS);
      observer.observe(host);
    };
    const onToggle = () => {
      if (disclosure && !disclosure.open) {
        observer?.disconnect();
        invalidate();
        setState(hasData ? 'idle' : 'empty');
        return;
      }
      observe();
    };

    invalidate();
    setState(hasData ? 'idle' : 'empty');
    disclosure?.addEventListener('toggle', onToggle);
    observe();

    return () => {
      disposed = true;
      beginLoadRef.current = () => undefined;
      observer?.disconnect();
      disclosure?.removeEventListener('toggle', onToggle);
      invalidate();
    };
  }, [active, request, signature]);

  return <div
    id={id}
    ref={hostRef}
    class={['chart-host', className].filter(Boolean).join(' ')}
    data-chart-state={state}
  >
    {state === 'idle' && <button type="button" class="btn chart-load-button" onClick={() => beginLoadRef.current()}>
      Load {name} chart
    </button>}
    {state === 'loading' && <div class="chart-loading" role="status">Loading {name} chart…</div>}
    {state === 'empty' && <div class="chart-empty">{emptyMessage}</div>}
    {state === 'error' && <div class="chart-error" role="status">
      <span>{chartErrorMessage(name)}</span>
      <button type="button" class="btn" onClick={() => beginLoadRef.current()}>Retry {name} chart</button>
    </div>}
    <div ref={plotRef} class="chart-render-host" hidden={state !== 'ready'} />
  </div>;
}
