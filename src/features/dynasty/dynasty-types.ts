import type { H2HGame, SeasonSummaryRow } from '../../data/generated/asset-types';
import type { DynastyTrendChartRow } from '../../charting/chart-types';

export type DynastyMode = 'calculator' | 'rolling-3' | 'rolling-5' | 'selected-range' | 'all-time';
export const ALL_DYNASTY_TEAMS = '__ALL__';

export interface DynastyState {
  mode: DynastyMode;
  owner: string;
  startSeason: number | null;
  endSeason: number | null;
  requestedStartSeason: number | null;
  requestedEndSeason: number | null;
  minSeasons: number;
  includeSaundersPenalty: boolean;
  chartHiddenOwners: string[];
  selectedWindowKey: string | null;
  selectedWindowKind: 'playoffs' | 'saunders' | null;
}

export interface DynastyScoreComponents {
  regularSeason: number;
  winRatePrecision: number;
  postseason: number;
  hardware: number;
  scoringDominance: number;
  consistency: number;
  penalties: number;
}

export interface DynastySeasonProfile {
  owner: string; season: number; wins: number; losses: number; ties: number; games: number; winPct: number;
  finish: number | null; pointsFor: number; pointsAgainst: number; pointDiff: number;
  playoffWins: number; playoffLosses: number; saundersWins: number; saundersLosses: number;
  champion: boolean; saunders: boolean; bye: boolean; wildCard: boolean; saundersBye: boolean;
  bagelsEarned: number | null; leagueSize: number; regularSeasonTitle: boolean;
  pointsForRank: number | null; pointDiffRank: number | null; seasonScore: number; seasonComponents: DynastyScoreComponents;
}

export interface DynastyScore {
  owner: string; requestedStartSeason: number | null; requestedEndSeason: number | null;
  scoredStartSeason: number | null; scoredEndSeason: number | null; requestedSeasonCount: number;
  scoredSeasonCount: number; coverageRatio: number; championships: number; regularSeasonTitles: number;
  playoffWins: number; playoffLosses: number; saundersWins: number; saundersLosses: number;
  topHalfFinishes: number; bottomFinishes: number; saundersTitles: number; saundersByes: number;
  wins: number; losses: number; ties: number; games: number; winPct: number; pointDiff: number;
  pointsFor: number; pointsAgainst: number; averageFinish: number | null; components: DynastyScoreComponents;
  score: number; seasons: DynastySeasonProfile[]; regularWins?: number; regularTies?: number;
  rankInPeriod?: number; percentileInPeriod?: number; totalOwners?: number; playoffWinsRank?: number | null;
  pointDiffRank?: number | null; winPctRank?: number | null; avgFinishRank?: number | null;
  label: string; explanation: string[]; windowSize?: number; windowStartSeason?: number; windowEndSeason?: number; windowLabel?: string;
}

export interface DynastyHeatmapCell { season: number; score: number | null; heat: number | null; profile: DynastySeasonProfile | null }
export interface DynastyHeatmapRow { owner: string; cells: DynastyHeatmapCell[] }
export interface DynastyHeatmapModel { seasonList: number[]; rows: DynastyHeatmapRow[]; minScore: number; maxScore: number }
export interface DynastyTrendSeries { owner: string; color: string; finalScore: number; points: DynastyTrendChartRow[] }
export interface DynastyTrendModel { seasonList: number[]; series: DynastyTrendSeries[]; minScore: number; maxScore: number; hiddenOwners?: string[] }
export interface DynastyBestWindows { windowSize: number; windowSizeLabel: string; topOverall: DynastyScore[]; byOwner: DynastyScore[] }
export interface DynastySlumps { windowSize: number; lowestScores: DynastyScore[]; worstAverageFinish: DynastyScore[]; mostSaundersPain: DynastyScore[]; biggestDrops: Array<{ owner: string; previousWindow: DynastyScore; currentWindow: DynastyScore; delta: number }>; worstSingleSeasons: DynastySeasonProfile[] }
export interface DynastyViewModel {
  controls: { mode: DynastyMode; owner: string; startSeason: number | null; endSeason: number | null; requestedStartSeason: number | null; requestedEndSeason: number | null; minSeasons: number; includeSaundersPenalty: boolean };
  selectedScore: DynastyScore | null; comparisonRows: DynastyScore[]; periodScores: DynastyScore[];
  rollingThreeWindows: DynastyScore[]; rollingFiveWindows: DynastyScore[]; bestWindows: DynastyBestWindows;
  slumps: DynastySlumps; heatmap: DynastyHeatmapModel; trendChart: DynastyTrendModel; seasonProfiles: DynastySeasonProfile[];
}
export interface DynastyModelInput { leagueGames: readonly H2HGame[]; seasonSummaries: readonly SeasonSummaryRow[]; seasonAggregates?: readonly Record<string, unknown>[] | null; mode?: DynastyMode; owner?: string | null; startSeason?: number | null; endSeason?: number | null; requestedStartSeason?: number | null; requestedEndSeason?: number | null; minSeasons?: number; includeSaundersPenalty?: boolean }
