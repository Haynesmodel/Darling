export const SHARE_CARD_KINDS = [
  'matchup',
  'rivalry',
  'dynasty',
  'trophy',
  'draft',
  'weekly-recap',
  'season-recap',
] as const;
export const SHARE_CARD_ACCENTS = ['gold', 'red', 'blue', 'green', 'purple'] as const;

export type ShareCardKind = typeof SHARE_CARD_KINDS[number];
export type ShareCardAccent = typeof SHARE_CARD_ACCENTS[number];
export type ShareCardBuildErrorCode =
  | 'INCOMPLETE_DATA'
  | 'INVALID_URL'
  | 'INVALID_TEXT'
  | 'UNSUPPORTED_KIND'
  | 'TOO_MANY_METRICS';

export interface ShareCardMetric {
  readonly label: string;
  readonly value: string;
  readonly detail?: string;
}

export interface ShareCardSpec {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly kind: ShareCardKind;
  readonly eyebrow: string;
  readonly title: string;
  readonly subtitle?: string;
  readonly metrics: readonly ShareCardMetric[];
  readonly canonicalUrl: string;
  readonly sourceLabel: string;
  readonly dataVersion: string;
  readonly altText: string;
  readonly accent: ShareCardAccent;
  readonly filename: string;
}

export type ShareCardBuildResult =
  | { readonly ok: true; readonly spec: ShareCardSpec }
  | { readonly ok: false; readonly code: ShareCardBuildErrorCode; readonly message: string };

export interface ShareCardBuildEnvironment {
  readonly origin: string;
  readonly basePath: string;
}
