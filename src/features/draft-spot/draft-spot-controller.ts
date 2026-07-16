import { h, render } from 'preact';
import DraftSpotPage from './DraftSpotPage';
import { isDraftSpot, formatValidatorErrors, getValidatorErrors } from '../../data/generated/asset-validators';
import type { DraftSpot } from '../../data/generated/asset-types';
import type { DraftSpotMountOptions } from './draft-spot-types';

const assetCache = new Map<string, Promise<DraftSpot>>();
let activeMount: HTMLElement | null = null;

function fetchDraftSpot(path: string, sourceHash: string): Promise<DraftSpot> {
  const url = new URL(path, document.baseURI).toString();
  if (!assetCache.has(url)) {
    assetCache.set(url, fetch(url).then(async response => {
      if (!response.ok) throw new Error(`Draft Spot data request failed with HTTP ${response.status}`);
      const value = await response.json() as unknown;
      if (!isDraftSpot(value)) {
        throw new Error(formatValidatorErrors('DraftSpot', getValidatorErrors('DraftSpot')));
      }
      if (value.source_sha256 !== sourceHash) {
        throw new Error('Draft Spot data was generated from an older SeasonSummary snapshot');
      }
      return value;
    }));
  }
  return assetCache.get(url) as Promise<DraftSpot>;
}

function renderStatus(mount: HTMLElement, kind: 'loading' | 'error' | 'empty', message: string) {
  render(
    h('div', {
      class: `status-banner status-${kind === 'empty' ? 'error' : kind}`,
      role: kind === 'error' ? 'alert' : 'status',
    }, message),
    mount,
  );
}

export async function mountDraftSpot(options: DraftSpotMountOptions): Promise<void> {
  activeMount = options.mount;
  renderStatus(options.mount, 'loading', 'Loading Draft Spot data…');
  try {
    const asset = await fetchDraftSpot(options.assetPath, options.sourceHash);
    if (activeMount !== options.mount) return;
    if (!asset.rows.length) {
      renderStatus(options.mount, 'empty', 'Draft Spot is unavailable because no seasons contain draft-pick data.');
      return;
    }
    const stateKey = JSON.stringify(options.state || {});
    render(
      h(DraftSpotPage, {
        key: stateKey,
        asset,
        requestedState: options.state,
        dataVersion: options.dataVersion,
        onStateChange: options.onStateChange,
        onReady: options.onReady,
      }),
      options.mount,
    );
  } catch (error) {
    if (activeMount !== options.mount) return;
    renderStatus(options.mount, 'error', `Draft Spot is unavailable: ${(error as Error).message}`);
  }
}

export function unmountDraftSpot(): void {
  if (activeMount) render(null, activeMount);
  activeMount = null;
}
