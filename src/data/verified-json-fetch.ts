import { canonicalJsonBytes, sha256Bytes } from './canonical-json';
import { DataLoadError } from './data-errors';

const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/;
export const MANIFEST_MAX_BYTES = 256 * 1024;
export const ASSET_MAX_BYTES = 16 * 1024 * 1024;

export interface JsonAssetDescriptor {
  name: string;
  path: string;
  sha256: string;
  bytes: number;
  dataVersion: string;
}

export interface VerifiedJsonResult<T = unknown> {
  value: T;
  url: string;
  expectedSha256: string;
  actualSha256: string;
  expectedBytes: number;
  actualBytes: number;
  attempts: number;
  cacheRecovered: boolean;
}

export interface VerifiedJsonFetchOptions {
  fetchFn?: typeof fetch;
  basePath?: string;
  digestFn?: (bytes: Uint8Array) => Promise<string>;
  logger?: Pick<Console, 'warn'>;
}

function withBasePath(path: string, basePath: string): string {
  const base = basePath.endsWith('/') ? basePath : `${basePath}/`;
  return `${base}${path.replace(/^\//, '')}`;
}

export function versionedAssetUrl(path: string, basePath: string, sha256: string): string {
  if (!SHA256_PATTERN.test(sha256)) {
    throw new DataLoadError('INVALID_MANIFEST', path, `${path}: invalid SHA-256 descriptor`);
  }
  const url = withBasePath(path, basePath);
  const hashIndex = url.indexOf('#');
  const fragment = hashIndex >= 0 ? url.slice(hashIndex) : '';
  const withoutFragment = hashIndex >= 0 ? url.slice(0, hashIndex) : url;
  const separator = withoutFragment.includes('?') ? '&' : '?';
  return `${withoutFragment}${separator}v=${sha256.slice('sha256:'.length)}${fragment}`;
}

function responseSizeError(
  asset: string,
  dataVersion: string | null,
  actualBytes: number,
  maximumBytes: number,
  attempts: number,
): DataLoadError {
  return new DataLoadError(
    asset === 'asset-manifest.json' ? 'INVALID_MANIFEST' : 'SIZE_MISMATCH',
    asset,
    `${asset}: response exceeds the maximum allowed size`,
    dataVersion,
    { actualBytes, maximumBytes, attempts },
  );
}

async function streamedResponseBytes(
  response: Response,
  asset: string,
  dataVersion: string | null,
  attempts: number,
  maximumBytes: number,
): Promise<Uint8Array | null> {
  const body = response.body;
  if (!body || typeof body.getReader !== 'function') return null;
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value?.byteLength) continue;
    totalBytes += value.byteLength;
    if (totalBytes > maximumBytes) {
      try {
        void reader.cancel().catch(() => undefined);
      } catch {
        // Cancellation is best-effort; the size failure remains authoritative.
      }
      throw responseSizeError(asset, dataVersion, totalBytes, maximumBytes, attempts);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

async function responseBytes(
  response: Response,
  asset: string,
  dataVersion: string | null,
  attempts = 1,
  maximumBytes = ASSET_MAX_BYTES,
): Promise<Uint8Array> {
  const declaredLength = Number(response.headers?.get?.('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    throw responseSizeError(asset, dataVersion, declaredLength, maximumBytes, attempts);
  }
  try {
    const streamed = await streamedResponseBytes(response, asset, dataVersion, attempts, maximumBytes);
    const bytes = streamed || new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > maximumBytes) {
      throw responseSizeError(asset, dataVersion, bytes.byteLength, maximumBytes, attempts);
    }
    return bytes;
  } catch (error) {
    if (error instanceof DataLoadError) throw error;
    throw new DataLoadError('INVALID_ASSET', asset, `${asset}: response could not be read`, dataVersion, { attempts });
  }
}

async function checkedFetch(fetchFn: typeof fetch, url: string, init: RequestInit, asset: string, dataVersion: string | null): Promise<Response> {
  let response: Response;
  try {
    response = await fetchFn(url, init);
  } catch (error) {
    throw new DataLoadError('HTTP_ERROR', asset, `${asset}: request failed`, dataVersion);
  }
  if (!response.ok) {
    throw new DataLoadError('HTTP_ERROR', asset, `${asset}: HTTP ${response.status}`, dataVersion);
  }
  return response;
}

export async function fetchManifestJson(
  path: string,
  options: Pick<VerifiedJsonFetchOptions, 'fetchFn' | 'basePath'> = {},
): Promise<unknown> {
  const fetchFn = options.fetchFn || globalThis.fetch;
  if (typeof fetchFn !== 'function') throw new Error('fetchManifestJson requires a fetch function');
  const url = withBasePath(path, options.basePath || '/');
  const response = await checkedFetch(fetchFn, url, {
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  }, 'asset-manifest.json', null);
  const bytes = await responseBytes(response, 'asset-manifest.json', null, 1, MANIFEST_MAX_BYTES);
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (error) {
    throw new DataLoadError('INVALID_UTF8', 'asset-manifest.json', 'Asset manifest is not valid UTF-8');
  }
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new DataLoadError('INVALID_MANIFEST', 'asset-manifest.json', 'Asset manifest is not valid JSON');
  }
}

async function verifyAttempt<T>(
  descriptor: JsonAssetDescriptor,
  url: string,
  fetchFn: typeof fetch,
  digestFn: (bytes: Uint8Array) => Promise<string>,
  cache: RequestCache,
  attempt: number,
): Promise<Omit<VerifiedJsonResult<T>, 'attempts' | 'cacheRecovered'>> {
  const response = await checkedFetch(fetchFn, url, {
    cache,
    headers: { Accept: 'application/json' },
  }, descriptor.name, descriptor.dataVersion);
  const bytes = await responseBytes(
    response,
    descriptor.name,
    descriptor.dataVersion,
    attempt,
    Math.min(descriptor.bytes, ASSET_MAX_BYTES),
  );
  if (bytes.byteLength !== descriptor.bytes) {
    throw new DataLoadError('SIZE_MISMATCH', descriptor.name, `${descriptor.name}: response size does not match the manifest`, descriptor.dataVersion, {
      expectedBytes: descriptor.bytes,
      actualBytes: bytes.byteLength,
      attempts: attempt,
    });
  }
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (error) {
    throw new DataLoadError('INVALID_UTF8', descriptor.name, `${descriptor.name}: response is not valid UTF-8`, descriptor.dataVersion, {
      expectedBytes: descriptor.bytes,
      actualBytes: bytes.byteLength,
      attempts: attempt,
    });
  }
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch (error) {
    throw new DataLoadError('INVALID_ASSET', descriptor.name, `${descriptor.name}: response is not valid JSON`, descriptor.dataVersion, {
      expectedBytes: descriptor.bytes,
      actualBytes: bytes.byteLength,
      attempts: attempt,
    });
  }
  let actualSha256: string;
  try {
    actualSha256 = await digestFn(canonicalJsonBytes(value));
  } catch (error) {
    throw new DataLoadError('INTEGRITY_UNAVAILABLE', descriptor.name, `${descriptor.name}: SHA-256 verification is unavailable`, descriptor.dataVersion, {
      expectedSha256: descriptor.sha256,
      expectedBytes: descriptor.bytes,
      actualBytes: bytes.byteLength,
      attempts: attempt,
    });
  }
  if (actualSha256 !== descriptor.sha256) {
    throw new DataLoadError('INTEGRITY_MISMATCH', descriptor.name, `${descriptor.name}: response hash does not match the manifest`, descriptor.dataVersion, {
      expectedSha256: descriptor.sha256,
      actualSha256,
      expectedBytes: descriptor.bytes,
      actualBytes: bytes.byteLength,
      attempts: attempt,
    });
  }
  return {
    value: value as T,
    url,
    expectedSha256: descriptor.sha256,
    actualSha256,
    expectedBytes: descriptor.bytes,
    actualBytes: bytes.byteLength,
  };
}

function retryable(error: unknown): boolean {
  return error instanceof DataLoadError && ['SIZE_MISMATCH', 'INTEGRITY_MISMATCH', 'INVALID_UTF8', 'INVALID_ASSET'].includes(error.code);
}

export async function fetchVerifiedJson<T = unknown>(
  descriptor: JsonAssetDescriptor,
  options: VerifiedJsonFetchOptions = {},
): Promise<VerifiedJsonResult<T>> {
  if (
    !SHA256_PATTERN.test(descriptor.sha256)
    || !Number.isSafeInteger(descriptor.bytes)
    || descriptor.bytes < 0
    || descriptor.bytes > ASSET_MAX_BYTES
  ) {
    throw new DataLoadError('INVALID_MANIFEST', descriptor.name, `${descriptor.name}: invalid integrity descriptor`, descriptor.dataVersion);
  }
  const fetchFn = options.fetchFn || globalThis.fetch;
  if (typeof fetchFn !== 'function') throw new Error('fetchVerifiedJson requires a fetch function');
  const url = versionedAssetUrl(descriptor.path, options.basePath || '/', descriptor.sha256);
  const digestFn = options.digestFn || sha256Bytes;
  try {
    const result = await verifyAttempt<T>(descriptor, url, fetchFn, digestFn, 'force-cache', 1);
    return { ...result, attempts: 1, cacheRecovered: false };
  } catch (error) {
    if (!retryable(error)) throw error;
  }
  const result = await verifyAttempt<T>(descriptor, url, fetchFn, digestFn, 'reload', 2);
  (options.logger || console).warn(`[Darling] ${descriptor.name} recovered after a cache-bypass verification retry`);
  return { ...result, attempts: 2, cacheRecovered: true };
}
