import type {
  ShareCardAccent,
  ShareCardBuildEnvironment,
  ShareCardBuildResult,
  ShareCardKind,
  ShareCardMetric,
  ShareCardSpec,
} from './share-card-types';
import { validateShareCardSpec } from './share-card-spec';

export interface ShareStoryFacts {
  readonly id: string;
  readonly title: string;
  readonly eyebrow: string;
  readonly subtitle?: string;
  readonly metrics: readonly ShareCardMetric[];
  readonly canonicalHref: string;
  readonly sourceLabel: string;
  readonly dataVersion: string;
  readonly altText: string;
  readonly accent?: ShareCardAccent;
  readonly complete?: boolean;
}

const accents: Record<ShareCardKind, ShareCardAccent> = {
  matchup: 'red',
  rivalry: 'red',
  dynasty: 'purple',
  trophy: 'gold',
  draft: 'green',
  'weekly-recap': 'blue',
  'season-recap': 'gold',
};

function safeId(value: string): string {
  return value.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 56) || 'card';
}

export function buildShareCard(
  kind: ShareCardKind,
  facts: ShareStoryFacts,
  environment: ShareCardBuildEnvironment,
): ShareCardBuildResult {
  if (facts.complete === false) {
    return { ok: false, code: 'INCOMPLETE_DATA', message: 'Card unavailable.' };
  }
  const spec: ShareCardSpec = {
    schemaVersion: 1,
    id: `${kind}:${facts.id}`,
    kind,
    eyebrow: facts.eyebrow,
    title: facts.title,
    subtitle: facts.subtitle,
    metrics: facts.metrics,
    canonicalUrl: facts.canonicalHref,
    sourceLabel: facts.sourceLabel,
    dataVersion: facts.dataVersion,
    altText: facts.altText,
    accent: facts.accent || accents[kind],
    filename: `darling-${kind}-${safeId(facts.id)}.png`,
  };
  return validateShareCardSpec(spec, environment);
}
