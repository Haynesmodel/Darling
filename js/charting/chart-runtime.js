function clearChart(host) {
  if (!host) return;
  host.replaceChildren();
  host.removeAttribute('data-chart-state');
}

function mountChart(host, chartNode, opts = {}) {
  if (!host) return null;
  clearChart(host);
  if (!chartNode) {
    renderChartEmpty(host, opts.emptyMessage || 'No chart data available.');
    return null;
  }
  if (opts.className && chartNode.classList) chartNode.classList.add(opts.className);
  if (opts.ariaLabel && chartNode.setAttribute) chartNode.setAttribute('aria-label', opts.ariaLabel);
  if (chartNode.setAttribute) chartNode.setAttribute('role', 'img');
  host.append(chartNode);
  host.dataset.chartState = 'ready';
  return chartNode;
}

function renderChartMessage(host, className, message, state, title) {
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

function renderChartEmpty(host, message = 'No chart data available.') {
  renderChartMessage(host, 'chart-empty', message, 'empty');
}

function renderChartError(host, error, message = 'Chart unavailable.') {
  renderChartMessage(host, 'chart-error', message, 'error', error?.message);
}

export {
  clearChart,
  mountChart,
  renderChartEmpty,
  renderChartError,
};
