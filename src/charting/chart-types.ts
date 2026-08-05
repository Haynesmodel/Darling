export interface CurrentSeedMovementChartRow {
  owner: string;
  previousSeed: number | null;
  projectedSeed: number | null;
  seedChange: number;
  projectedRecord: string;
  isSelected: boolean;
  title: string;
}

export interface CurrentOddsMovementChartRow {
  owner: string;
  playoffChange: number;
  currentPlayoffOdds: number;
  previousPlayoffOdds: number;
  isSelected: boolean;
  title: string;
}

export interface CurrentProjectedStandingsChartRow {
  owner: string;
  projectedRank: number;
  currentSeed: number | null;
  seedChange: number;
  projectedPointsFor: number;
  projectedRecord: string;
  currentRecord: string;
  isSelected: boolean;
  title: string;
}

export interface RivalryLeadChartRow {
  date: string;
  season: number;
  index: number;
  lead: number;
  result: 'W' | 'L' | 'T';
  winner: string;
  score: string;
  type: string;
  round: string;
  spread: string;
  teamA: string;
  teamB: string;
  title: string;
}

export interface TrophyCareerChartRow {
  season: number;
  finish: number;
  finishLabel: string;
  playoffCutoff: number;
  madePlayoffs: boolean;
  champion: boolean;
  saunders: boolean;
  tier: 'champion' | 'playoff' | 'saunders' | 'miss';
  title: string;
}

export interface DynastyTrendChartRow {
  owner: string;
  season: number | string;
  seasonIndex: number;
  seasonScore: number;
  cumulativeScore: number;
  finalScore: number;
  color?: string;
  hidden: boolean;
  title: string;
}

export interface DraftChartRow {
  label: string;
  value: number;
  title: string;
}

export interface GauntletHistogramChartRow {
  key: 'A' | 'B';
  owner?: string;
  season?: number;
  label: string;
  binIndex?: number;
  start?: number;
  end?: number;
  center: number;
  count: number;
  rangeLabel?: string;
  mean?: number;
  title: string;
}

export interface GauntletHistogramMean {
  key: 'A' | 'B';
  owner?: string;
  season?: number;
  label: string;
  mean: number;
  title: string;
}

export type ChartRequest =
  | { kind: 'current-seed-movement'; data: { rows: readonly CurrentSeedMovementChartRow[] } }
  | { kind: 'current-odds-movement'; data: { rows: readonly CurrentOddsMovementChartRow[] } }
  | { kind: 'current-projected-standings'; data: { rows: readonly CurrentProjectedStandingsChartRow[] } }
  | { kind: 'rivalry-lead'; data: { rows: readonly RivalryLeadChartRow[]; teamA: string; teamB: string } }
  | { kind: 'trophy-career'; data: { rows: readonly TrophyCareerChartRow[] } }
  | { kind: 'dynasty-trend'; data: { rows: readonly DynastyTrendChartRow[]; seasonList: readonly (number | string)[]; minScore?: number; maxScore?: number } }
  | { kind: 'draft-picks'; data: { rows: readonly DraftChartRow[]; xLabel: string; yLabel: string; ariaLabel: string } }
  | { kind: 'draft-zones'; data: { rows: readonly DraftChartRow[]; yLabel: string; ariaLabel: string } }
  | { kind: 'gauntlet-histogram'; data: { rows: readonly GauntletHistogramChartRow[]; means: readonly GauntletHistogramMean[]; domain: readonly [number, number]; maxCount: number } };

export type ChartState = 'idle' | 'loading' | 'ready' | 'empty' | 'error';

export interface ChartRuntimeModule {
  renderChart(host: HTMLElement, request: ChartRequest): void;
}

export function chartRequestHasData(request: ChartRequest): boolean {
  switch (request.kind) {
    case 'current-seed-movement':
    case 'current-odds-movement':
    case 'current-projected-standings':
    case 'rivalry-lead':
    case 'trophy-career':
    case 'dynasty-trend':
    case 'draft-picks':
    case 'draft-zones':
    case 'gauntlet-histogram':
      return request.data.rows.length > 0;
    default: {
      const exhaustive: never = request;
      return exhaustive;
    }
  }
}
