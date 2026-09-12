import type { ShareCardBuildResult } from './share-card-types';

type RuntimeModule = typeof import('./share-card-runtime');

export interface ShareCardActionController {
  dispose(): void;
}

interface ShareCardActionOptions {
  host: HTMLElement;
  result: ShareCardBuildResult;
  label?: string;
}

let runtime: RuntimeModule | null = null;
let runtimeRequest: Promise<RuntimeModule> | null = null;
let retryUrl = '', retry = 0;

function loadRuntime(): Promise<RuntimeModule> {
  if (runtime) return Promise.resolve(runtime);
  if (!runtimeRequest) {
    runtimeRequest = (retryUrl
      ? import(/* @vite-ignore */ `${retryUrl}#${++retry}`)
      : import('./share-card-runtime'))
      .then(module => {
        if (typeof module.openShareCardPreview !== 'function') {
          throw new Error('Share card runtime did not expose its preview contract');
        }
        runtime = module;
        return module;
      })
      .catch(error => {
        retryUrl ||= performance.getEntriesByType('resource')
          .reverse()
          .find(entry => import.meta.env.DEV
            ? entry.name.includes('share-card-runtime')
            : entry.name.endsWith('.js'))?.name || '';
        runtimeRequest = null;
        throw error;
      });
  }
  return runtimeRequest;
}

function element<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  name: K,
  className: string,
): HTMLElementTagNameMap[K] {
  const node = doc.createElement(name);
  node.className = className;
  return node;
}

function revealFallback(field: HTMLInputElement, status: HTMLElement, message: string): void {
  field.hidden = false;
  status.textContent = message;
  field.focus();
  field.select();
}

export function mountShareCardAction(options: ShareCardActionOptions): ShareCardActionController {
  const { host, result } = options;
  const doc = host.ownerDocument;
  host.replaceChildren();
  host.removeAttribute('data-share-state');
  host.removeAttribute('role');
  if (result.ok === false) {
    host.setAttribute('data-share-state', 'unavailable');
    host.setAttribute('role', 'alert');
    host.textContent = result.message;
    return {
      dispose() {
        host.replaceChildren();
        host.removeAttribute('data-share-state');
        host.removeAttribute('role');
      },
    };
  }
  const button = element(doc, 'button', 'btn share-card-button');
  button.type = 'button';
  button.textContent = options.label || 'Share card';
  const status = element(doc, 'span', 'share-card-action-status');
  status.setAttribute('aria-live', 'polite');
  const field = element(doc, 'input', 'share-card-link-fallback');
  field.type = 'url';
  field.readOnly = true;
  field.value = result.spec.canonicalUrl;
  field.setAttribute('aria-label', 'Canonical story link');
  field.hidden = true;
  host.append(button, status, field);
  let disposed = false;
  const open = async () => {
    if (disposed || button.getAttribute('aria-busy') === 'true') return;
    button.setAttribute('aria-busy', 'true');
    button.disabled = true;
    status.textContent = 'Preparing…';
    try {
      const module = await loadRuntime();
      if (disposed) return;
      await module.openShareCardPreview(result.spec, button);
      if (!disposed) status.textContent = '';
    } catch {
      if (!disposed) revealFallback(field, status, 'Share card could not be loaded.');
    } finally {
      if (!disposed) {
        button.removeAttribute('aria-busy');
        button.disabled = false;
      }
    }
  };
  button.addEventListener('click', open);
  return {
    dispose() {
      disposed = true;
      button.removeEventListener('click', open);
      runtime?.closeShareCardPreview(button);
      host.replaceChildren();
      host.removeAttribute('data-share-state');
      host.removeAttribute('role');
    },
  };
}

export function mountCopyLinkAction(
  host: HTMLElement,
  canonicalUrl: string,
  label = 'Copy matchup link',
): ShareCardActionController {
  const doc = host.ownerDocument;
  host.replaceChildren();
  host.removeAttribute('data-share-state');
  host.removeAttribute('role');
  const button = element(doc, 'button', 'btn share-card-button');
  button.type = 'button';
  button.textContent = label;
  const status = element(doc, 'span', 'share-card-action-status');
  status.setAttribute('aria-live', 'polite');
  const field = element(doc, 'input', 'share-card-link-fallback');
  field.type = 'url';
  field.readOnly = true;
  field.value = canonicalUrl;
  field.setAttribute('aria-label', 'Canonical matchup link');
  field.hidden = true;
  const copy = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error();
      await navigator.clipboard.writeText(canonicalUrl);
      status.textContent = 'Link copied.';
    } catch {
      revealFallback(field, status, 'Copy is unavailable; the link is selected.');
    }
  };
  button.addEventListener('click', copy);
  host.append(button, status, field);
  return {
    dispose() {
      button.removeEventListener('click', copy);
      host.replaceChildren();
      host.removeAttribute('data-share-state');
      host.removeAttribute('role');
    },
  };
}

export function absoluteShareHref(href: string, win: Window): string {
  return new URL(href, win.location.href).toString();
}
