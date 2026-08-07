export function clearChart(host: HTMLElement | null): void {
  if (!host) return;
  host.replaceChildren();
  host.removeAttribute('data-chart-state');
}

export function mountChart(
  host: HTMLElement | null,
  chartNode: Element | null,
  opts: { emptyMessage?: string; className?: string; ariaLabel?: string } = {},
): Element | null {
  if (!host) return null;
  clearChart(host);
  if (!chartNode) {
    renderChartEmpty(host, opts.emptyMessage || 'No chart data available.');
    return null;
  }
  if (opts.className) chartNode.classList.add(opts.className);
  if (opts.ariaLabel) chartNode.setAttribute('aria-label', opts.ariaLabel);
  chartNode.setAttribute('role', 'img');
  host.append(chartNode);
  host.dataset.chartState = 'ready';
  return chartNode;
}

function renderChartMessage(
  host: HTMLElement | null,
  className: string,
  message: string,
  state: 'empty' | 'error',
  title?: string,
): void {
  if (!host) return;
  clearChart(host);
  const doc = host.ownerDocument || (typeof document !== 'undefined' ? document : null);
  if (!doc) return;
  const element = doc.createElement('div');
  element.className = className;
  element.textContent = message;
  if (title) element.title = title;
  host.append(element);
  host.dataset.chartState = state;
}

export function renderChartEmpty(host: HTMLElement | null, message = 'No chart data available.'): void {
  renderChartMessage(host, 'chart-empty', message, 'empty');
}

export function renderChartError(host: HTMLElement | null, error: unknown, message = 'Chart unavailable.'): void {
  renderChartMessage(host, 'chart-error', message, 'error', error instanceof Error ? error.message : undefined);
}
