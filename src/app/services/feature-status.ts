import type { FeatureStatusService } from '../app-types';
import type { FeatureId } from '../feature-contract';

function panelFor(doc: Document, id: FeatureId): HTMLElement | null {
  return doc.getElementById(`page-${id}`);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error || 'Unknown error');
}

function isIntegrityError(error: unknown): boolean {
  return typeof error === 'object' && error !== null
    && ['INTEGRITY_MISMATCH', 'SIZE_MISMATCH', 'INVALID_UTF8', 'INTEGRITY_UNAVAILABLE'].includes(String((error as { code?: string }).code));
}

export function createFeatureStatusService(doc: Document): FeatureStatusService {
  const globalStatus = doc.getElementById('appStatus');
  const clearPanelMessage = (panel: HTMLElement) => panel.querySelector('[data-feature-message]')?.remove();
  return {
    dataLoading() {
      if (!globalStatus) return;
      globalStatus.hidden = false;
      globalStatus.className = 'status-banner status-loading';
      globalStatus.textContent = 'Loading league data…';
    },
    dataError(error) {
      if (!globalStatus) return;
      globalStatus.hidden = false;
      globalStatus.className = 'status-banner status-error';
      globalStatus.setAttribute('role', 'alert');
      globalStatus.textContent = isIntegrityError(error)
        ? 'Could not verify league data. Reload to request a fresh snapshot.'
        : `Could not load league data. ${errorMessage(error)} Refresh to retry.`;
    },
    clearGlobal() {
      if (globalStatus) globalStatus.hidden = true;
    },
    loading(id, label) {
      const panel = panelFor(doc, id);
      if (!panel) return;
      clearPanelMessage(panel);
      panel.dataset.featureState = 'loading';
      panel.setAttribute('aria-busy', 'true');
      panel.inert = true;
      if (globalStatus) {
        globalStatus.hidden = false;
        globalStatus.className = 'status-banner status-loading';
        globalStatus.setAttribute('role', 'status');
        globalStatus.textContent = `Loading ${label}…`;
      }
    },
    ready(id) {
      const panel = panelFor(doc, id);
      if (!panel) return;
      clearPanelMessage(panel);
      panel.dataset.featureState = 'ready';
      panel.removeAttribute('aria-busy');
      panel.inert = false;
      if (globalStatus) globalStatus.hidden = true;
    },
    error(id, label, error, retry) {
      const panel = panelFor(doc, id);
      if (!panel) return;
      clearPanelMessage(panel);
      panel.dataset.featureState = 'error';
      panel.removeAttribute('aria-busy');
      panel.inert = false;
      const alert = doc.createElement('div');
      alert.className = 'status-banner status-error';
      alert.dataset.featureMessage = 'error';
      alert.setAttribute('role', 'alert');
      alert.append(`${label} could not be loaded: ${errorMessage(error)} `);
      const button = doc.createElement('button');
      button.type = 'button';
      button.className = 'btn';
      button.textContent = 'Retry';
      button.addEventListener('click', retry, { once: true });
      alert.append(button);
      panel.prepend(alert);
      if (globalStatus) globalStatus.hidden = true;
    },
  };
}
