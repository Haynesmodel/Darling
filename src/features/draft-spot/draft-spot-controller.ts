import { h, render } from 'preact';
import DraftSpotPage from './DraftSpotPage';
import { isDraftSpot, formatValidatorErrors, getValidatorErrors } from '../../data/generated/asset-validators';
import type { DraftSpot } from '../../data/generated/asset-types';
import type { DraftSpotMountOptions } from './draft-spot-types';
import { fetchVerifiedJson, versionedAssetUrl } from '../../data/verified-json-fetch';

const assetCache = new Map<string, Promise<DraftSpot>>();
let activeMount: HTMLElement | null = null;

function fetchDraftSpot(options: Pick<DraftSpotMountOptions, 'assetPath' | 'assetSha256' | 'assetBytes' | 'sourceHash' | 'dataVersion'>): Promise<DraftSpot> {
  const basePath = new URL('.', document.baseURI).pathname;
  const url = versionedAssetUrl(options.assetPath, basePath, options.assetSha256);
  if (!assetCache.has(url)) {
    const request = fetchVerifiedJson<DraftSpot>({
      name: 'DraftSpot',
      path: options.assetPath,
      sha256: options.assetSha256,
      bytes: options.assetBytes,
      dataVersion: options.dataVersion,
    }, { basePath }).then(result => {
      const value = result.value;
      if (!isDraftSpot(value)) {
        throw new Error(formatValidatorErrors('DraftSpot', getValidatorErrors('DraftSpot')));
      }
      if (value.source_sha256 !== options.sourceHash) {
        throw new Error('Draft Spot data was generated from an older SeasonSummary snapshot');
      }
      return value;
    });
    assetCache.set(url, request);
    void request.catch(() => {
      if (assetCache.get(url) === request) assetCache.delete(url);
    });
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
    const asset = await fetchDraftSpot(options);
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
