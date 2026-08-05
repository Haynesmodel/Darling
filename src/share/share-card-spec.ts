import {
  SHARE_CARD_ACCENTS,
  SHARE_CARD_KINDS,
  type ShareCardBuildEnvironment,
  type ShareCardBuildErrorCode,
  type ShareCardBuildResult,
  type ShareCardMetric,
  type ShareCardSpec,
} from './share-card-types';
import {
  SHARE_CARD_TEXT_STYLES,
  shareCardMetricTextWidths,
  shareCardTextFits,
} from '../../js/share-card-svg.js';

const TEXT_LIMITS = {
  id: [1, 96],
  eyebrow: [1, 48],
  title: [1, 90],
  subtitle: [0, 140],
  sourceLabel: [1, 48],
  dataVersion: [1, 96],
  altText: [1, 240],
} as const;
const METRIC_LIMITS = { label: [1, 32], value: [1, 48], detail: [0, 80] } as const;
const controlCharacters = /[\u0000-\u001f\u007f-\u009f]/;

function failure(code: ShareCardBuildErrorCode): ShareCardBuildResult {
  return { ok: false, code, message: 'Card unavailable.' };
}

function text(value: unknown, limits: readonly [number, number]): string | null {
  const raw = String(value ?? '');
  if (controlCharacters.test(raw)) return null;
  const normalized = raw.replace(/\s+/g, ' ').trim();
  return normalized.length >= limits[0] && normalized.length <= limits[1] ? normalized : null;
}

function normalizedBasePath(value: string): string {
  const path = `/${String(value || '/').replace(/^\/+|\/+$/g, '')}`;
  return path === '/' ? '/' : `${path}/`;
}

function canonicalUrl(value: unknown, environment: ShareCardBuildEnvironment): string | null {
  let url: URL;
  try {
    url = new URL(String(value || ''), environment.origin);
  } catch {
    return null;
  }
  const base = normalizedBasePath(environment.basePath);
  if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.origin !== environment.origin) return null;
  if (base !== '/' && url.pathname !== base.slice(0, -1) && !url.pathname.startsWith(base)) return null;
  url.hash = '';
  return url.toString();
}

export function validateShareCardSpec(
  candidate: ShareCardSpec,
  environment: ShareCardBuildEnvironment,
): ShareCardBuildResult {
  if (!SHARE_CARD_KINDS.includes(candidate.kind)) return failure('UNSUPPORTED_KIND');
  if (!SHARE_CARD_ACCENTS.includes(candidate.accent)) return failure('INVALID_TEXT');
  if (candidate.metrics.length > 4) return failure('TOO_MANY_METRICS');
  if (candidate.metrics.length < 2) return failure('INCOMPLETE_DATA');
  const normalized = {} as Record<keyof typeof TEXT_LIMITS, string>;
  for (const [field, limits] of Object.entries(TEXT_LIMITS)) {
    const value = text(candidate[field as keyof ShareCardSpec], limits);
    if (value === null) return failure('INVALID_TEXT');
    normalized[field as keyof typeof TEXT_LIMITS] = value;
  }
  if (
    !shareCardTextFits(normalized.title, 1104, 2, SHARE_CARD_TEXT_STYLES.title)
    || !shareCardTextFits(normalized.subtitle, 1104, 2, SHARE_CARD_TEXT_STYLES.subtitle)
  ) return failure('INVALID_TEXT');
  const metricWidths = shareCardMetricTextWidths(candidate.metrics.length);
  const metrics: ShareCardMetric[] = [];
  for (const metric of candidate.metrics) {
    const label = text(metric.label, METRIC_LIMITS.label);
    const value = text(metric.value, METRIC_LIMITS.value);
    const detail = text(metric.detail, METRIC_LIMITS.detail);
    if (
      label === null
      || value === null
      || detail === null
      || !shareCardTextFits(label, metricWidths.label, 1, SHARE_CARD_TEXT_STYLES.label)
      || !shareCardTextFits(value, metricWidths.value, 1, SHARE_CARD_TEXT_STYLES.metric)
      || !shareCardTextFits(detail, metricWidths.detail, 1, SHARE_CARD_TEXT_STYLES.detail)
    ) {
      return failure('INVALID_TEXT');
    }
    metrics.push(Object.freeze({ label, value, ...(detail ? { detail } : {}) }));
  }
  const url = canonicalUrl(candidate.canonicalUrl, environment);
  if (!url) return failure('INVALID_URL');
  const filename = String(candidate.filename || '');
  if (
    filename.length > 80
    || !/^[a-z0-9]+(?:-[a-z0-9]+)*\.png$/.test(filename)
  ) return failure('INVALID_TEXT');
  const spec = Object.freeze({
    ...candidate,
    ...normalized,
    schemaVersion: 1 as const,
    canonicalUrl: url,
    filename,
    metrics: Object.freeze(metrics),
  });
  return { ok: true, spec };
}
