export {
  gauntletHistogramRows,
  histogramBins,
  type HistogramOptions,
  type HistogramResultInput,
  type HistogramTeamSeasonInput,
} from './gauntlet-histogram-data.ts';
import type {
  CurrentOddsMovementChartRow,
  CurrentProjectedStandingsChartRow,
  CurrentSeedMovementChartRow,
  DynastyTrendChartRow,
  RivalryLeadChartRow,
  TrophyCareerChartRow,
} from './chart-types.ts';
import { formatDynastyScore } from '../data/dynasty-formatters.ts';

function toFinite<T>(value: unknown, fallback: T): number | T {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

interface DynastyPointInput {
  season: number | string;
  seasonScore?: unknown;
  cumulativeScore?: unknown;
  profile?: unknown;
}

interface DynastySeriesInput {
  owner: string;
  color?: string;
  finalScore?: unknown;
  hidden?: boolean;
  points?: readonly DynastyPointInput[];
}

export interface DynastyTrendInput {
  hiddenOwners?: readonly string[];
  series?: readonly DynastySeriesInput[];
}

export interface DynastyTrendOptions {
  hiddenOwners?: readonly string[];
  includeHidden?: boolean;
}

export type DynastyTrendDataRow = DynastyTrendChartRow & { profile: unknown | null };

export function dynastyTrendRows(
  chart: DynastyTrendInput = {},
  opts: DynastyTrendOptions = {},
): DynastyTrendDataRow[] {
  const hiddenSet = new Set([
    ...(Array.isArray(chart.hiddenOwners) ? chart.hiddenOwners : []),
    ...(Array.isArray(opts.hiddenOwners) ? opts.hiddenOwners : []),
  ].filter(Boolean));
  return (chart.series || [])
    .map(series => ({ ...series, hidden: hiddenSet.has(series.owner) || series.hidden === true }))
    .flatMap(series => (series.points || []).map((point, index) => ({
      owner: series.owner,
      season: toFinite(point.season, point.season),
      seasonIndex: index,
      seasonScore: toFinite(point.seasonScore, 0),
      cumulativeScore: toFinite(point.cumulativeScore, 0),
      finalScore: toFinite(series.finalScore, 0),
      color: series.color,
      hidden: series.hidden,
      profile: point.profile || null,
      title: `${series.owner}: ${formatDynastyScore(toFinite(point.cumulativeScore, 0))} through ${point.season}`,
    })))
    .filter(row => opts.includeHidden || !row.hidden);
}

interface TrophyCareerInputRow {
  season: number;
  finish?: unknown;
  playoffCutoff?: unknown;
  tier?: string;
  label?: string;
  title?: string;
}

export interface TrophyCareerInput {
  careerShape?: { rows?: readonly TrophyCareerInputRow[] } | null;
}

export type TrophyCareerDataRow = TrophyCareerChartRow & TrophyCareerInputRow & { index: number };

export function trophyCareerRows(view: TrophyCareerInput = {}): TrophyCareerDataRow[] {
  return (Array.isArray(view.careerShape?.rows) ? view.careerShape.rows : []).map((row, index) => {
    const finish = toFinite(row.finish, null);
    const cutoff = toFinite(row.playoffCutoff, 6);
    const champion = row.tier === 'champion' || /champion/i.test(row.label || '');
    const saunders = row.tier === 'saunders' || /saunders/i.test(row.label || '');
    const madePlayoffs = finish !== null && finish <= cutoff;
    const tier = champion ? 'champion' : saunders ? 'saunders' : madePlayoffs ? 'playoff' : 'miss';
    return {
      ...row,
      index,
      season: row.season,
      finish: finish ?? cutoff,
      finishLabel: finish === null ? '-' : `${finish}`,
      playoffCutoff: cutoff,
      madePlayoffs,
      champion,
      saunders,
      tier,
      title: row.title || `${row.season}: Finish ${finish ?? '-'}`,
    };
  });
}

interface RivalryLeadPointInput {
  date: string;
  season?: number;
  lead?: unknown;
  result?: 'W' | 'L' | 'T';
  winner?: string;
  score?: string;
  type?: string;
  round?: string;
}

export function rivalryLeadRows(
  view: { teamA?: string; teamB?: string } = {},
  points: readonly RivalryLeadPointInput[] = [],
): RivalryLeadChartRow[] {
  const teamA = view.teamA || '';
  const teamB = view.teamB || '';
  return points.map((point, index) => {
    const lead = toFinite(point.lead, 0);
    const spread = lead > 0 ? `${teamA} + ${lead}` : lead < 0 ? `${teamB} + ${Math.abs(lead)}` : 'Tied';
    return {
      date: point.date,
      season: point.season || 0,
      index: index + 1,
      lead,
      result: point.result || 'T',
      winner: point.winner || 'Tie',
      score: point.score || '',
      type: point.type || '',
      round: point.round || '',
      spread,
      teamA,
      teamB,
      title: `${point.date} | ${point.winner || 'Tie'} ${point.score || ''} | Series spread: ${spread}`,
    };
  });
}

interface CurrentSeedInput {
  owner: string;
  previousSeed?: unknown;
  projectedSeed?: unknown;
  seedChange?: unknown;
  projectedRecord?: string;
}

interface CurrentProjectionInput {
  owner: string;
  projectedRank?: unknown;
  currentSeed?: unknown;
  seedChange?: unknown;
  projectedPointsFor?: unknown;
  projectedRecord?: string;
  currentRecord?: string;
}

interface CurrentOddsInput {
  owner: string;
  playoffChange?: unknown;
  playoffOdds?: unknown;
  previousPlayoffOdds?: unknown;
}

export interface CurrentChartViewInput {
  commandCenter?: {
    selectedOwner?: string;
    liveMovement?: readonly CurrentSeedInput[];
    projectedStandings?: readonly CurrentProjectionInput[];
    odds?: { movement?: readonly CurrentOddsInput[] } | null;
  } | null;
}

export function currentSeedMovementRows(view: CurrentChartViewInput = {}): CurrentSeedMovementChartRow[] {
  const selectedOwner = view.commandCenter?.selectedOwner || '';
  return (view.commandCenter?.liveMovement || []).map(row => {
    const seedChange = toFinite(row.seedChange, 0);
    return {
      owner: row.owner,
      previousSeed: toFinite(row.previousSeed, null),
      projectedSeed: toFinite(row.projectedSeed, null),
      seedChange,
      projectedRecord: row.projectedRecord || '',
      isSelected: Boolean(selectedOwner && row.owner === selectedOwner),
      title: `${row.owner}: seed ${row.previousSeed} to ${row.projectedSeed}; ${seedChange > 0 ? 'up' : seedChange < 0 ? 'down' : 'no change'} ${Math.abs(seedChange)}`,
    };
  });
}

export function currentProjectedSeedRows(view: CurrentChartViewInput = {}): CurrentProjectedStandingsChartRow[] {
  const selectedOwner = view.commandCenter?.selectedOwner || '';
  return (view.commandCenter?.projectedStandings || []).map(row => ({
    owner: row.owner,
    projectedRank: toFinite(row.projectedRank, 0),
    currentSeed: toFinite(row.currentSeed, null),
    seedChange: toFinite(row.seedChange, 0),
    projectedPointsFor: toFinite(row.projectedPointsFor, 0),
    projectedRecord: row.projectedRecord || '',
    currentRecord: row.currentRecord || '',
    isSelected: Boolean(selectedOwner && row.owner === selectedOwner),
    title: `${row.owner}: projected seed ${row.projectedRank}, ${row.projectedRecord || ''}, ${Number(row.projectedPointsFor || 0).toFixed(1)} PF`,
  }));
}

export function currentOddsMovementRows(view: CurrentChartViewInput = {}): CurrentOddsMovementChartRow[] {
  const selectedOwner = view.commandCenter?.selectedOwner || '';
  return (view.commandCenter?.odds?.movement || []).map(row => ({
    owner: row.owner,
    playoffChange: toFinite(row.playoffChange, 0) * 100,
    currentPlayoffOdds: toFinite(row.playoffOdds, 0),
    previousPlayoffOdds: toFinite(row.previousPlayoffOdds, 0),
    isSelected: Boolean(selectedOwner && row.owner === selectedOwner),
    title: `${row.owner}: playoff odds ${Math.round(Number(row.previousPlayoffOdds || 0) * 100)}% to ${Math.round(Number(row.playoffOdds || 0) * 100)}%`,
  })).sort((a, b) => Math.abs(b.playoffChange) - Math.abs(a.playoffChange) || a.owner.localeCompare(b.owner));
}
