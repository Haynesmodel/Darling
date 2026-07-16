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
  chartNode.querySelectorAll?.('[aria-label]').forEach((element) => {
    if (element !== chartNode) element.removeAttribute('aria-label');
  });
  host.append(chartNode);
  host.dataset.chartState = 'ready';
  return chartNode;
}

function renderChartEmpty(host, message = 'No chart data available.') {
  if (!host) return;
  clearChart(host);
  const doc = host.ownerDocument || (typeof document !== 'undefined' ? document : null);
  if (!doc) return;
  const empty = doc.createElement('div');
  empty.className = 'chart-empty';
  empty.textContent = message;
  host.append(empty);
  host.dataset.chartState = 'empty';
}

function renderChartError(host, error, message = 'Chart unavailable.') {
  if (!host) return;
  clearChart(host);
  const doc = host.ownerDocument || (typeof document !== 'undefined' ? document : null);
  if (!doc) return;
  const el = doc.createElement('div');
  el.className = 'chart-error';
  el.textContent = message;
  if (error?.message) el.title = error.message;
  host.append(el);
  host.dataset.chartState = 'error';
}

export {
  clearChart,
  mountChart,
  renderChartEmpty,
  renderChartError,
};
