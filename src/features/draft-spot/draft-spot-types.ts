import type {
  DraftSpot,
  DraftSpotOwnerRecommendation,
  DraftSpotRow,
} from '../../data/generated/asset-types';

export const DRAFT_ALL_OWNERS = '__ALL__';
export const DRAFT_MODES = ['league', 'owner', 'pick', 'zone'] as const;
export const DRAFT_METRIC_KEYS = [
  'avgFinish',
  'playoffRate',
  'topThreeRate',
  'championships',
  'saundersRate',
  'pointsZ',
  'winsAboveAvg',
] as const;
export const DRAFT_ZONE_KEYS = ['early', 'middle', 'late'] as const;

export type DraftMode = typeof DRAFT_MODES[number];
export type DraftMetricKey = typeof DRAFT_METRIC_KEYS[number];
export type DraftZoneKey = typeof DRAFT_ZONE_KEYS[number];
export type DraftNormalization = 'raw' | 'percentile';

export interface DraftMetricDefinition {
  key: DraftMetricKey;
  label: string;
  summaryField: keyof DraftSummary;
  rowField: keyof DraftSpotRow;
  lowerIsBetter: boolean;
  format: 'number' | 'percent' | 'count' | 'signed';
}

export interface DraftSpotState {
  owner: string;
  mode: DraftMode;
  startSeason: number | null;
  endSeason: number | null;
  metric: DraftMetricKey;
  minSample: 1 | 2 | 3 | 5;
  normalize: DraftNormalization;
  selectedPick: number | null;
  selectedZone: DraftZoneKey | null;
}

export interface DraftSpotUrlState {
  draftOwner?: string | null;
  draftMode?: string | null;
  draftStart?: number | null;
  draftEnd?: number | null;
  draftMetric?: string | null;
  draftMinSample?: number | null;
  draftNormalize?: string | null;
  draftPick?: number | null;
  draftZone?: string | null;
}

export interface DraftSummary {
  draft_pick?: number;
  zone_key?: DraftZoneKey;
  zone?: string;
  n: number;
  avg_pick?: number;
  avg_draft_percentile: number;
  avg_finish: number;
  avg_finish_score: number;
  avg_wins_above_avg: number;
  avg_points_z: number;
  top_three_rate: number;
  playoff_rate: number;
  championships: number;
  champion_rate: number;
  saunders_count: number;
  saunders_rate: number;
}

export interface DraftHeroModel {
  title: string;
  subtitle: string;
  read: string;
  bestAvgPick: DraftSummary | null;
  bestPlayoffPick: DraftSummary | null;
  saundersPick: DraftSummary | null;
  bestZone: DraftSummary | null;
  correlation: number;
  pointCorrelation: number;
}

export interface DraftSpotViewModel {
  asset: DraftSpot;
  state: DraftSpotState;
  seasons: number[];
  owners: string[];
  picks: number[];
  rows: DraftSpotRow[];
  baseRows: DraftSpotRow[];
  pickSummary: DraftSummary[];
  zoneSummary: DraftSummary[];
  rankedPicks: DraftSummary[];
  rankedZones: DraftSummary[];
  selectedPickSummary: DraftSummary | null;
  selectedZoneSummary: DraftSummary | null;
  detailRows: DraftSpotRow[];
  ownerProfile: {
    owner: string;
    rows: DraftSpotRow[];
    recommendation: DraftSpotOwnerRecommendation | null;
  } | null;
  ownerRecommendations: DraftSpotOwnerRecommendation[];
  hero: DraftHeroModel;
}

export interface DraftSpotMountOptions {
  mount: HTMLElement;
  assetPath: string;
  assetSha256: string;
  assetBytes: number;
  sourceHash: string;
  dataVersion: string;
  state?: Partial<DraftSpotState> & DraftSpotUrlState;
  onStateChange?: (state: DraftSpotState) => void;
  onReady?: (state: DraftSpotState) => void;
}

export interface DarlingDraftSpotRuntime {
  mount(options: Omit<DraftSpotMountOptions, 'mount'> & { mountId?: string }): Promise<void>;
  unmount(): void;
}

declare global {
  interface Window {
    darlingDraftSpot?: DarlingDraftSpotRuntime;
  }
}
