function renderDraftChartError(host: HTMLDivElement, error: unknown) {
  host.replaceChildren();
  const fallback = host.ownerDocument.createElement('div');
  fallback.className = 'chart-error';
  fallback.setAttribute('role', 'status');
  fallback.textContent = 'Chart unavailable.';
  if (error instanceof Error && error.message) fallback.title = error.message;
  host.append(fallback);
  host.dataset.chartState = 'error';
}

export { renderDraftChartError };
