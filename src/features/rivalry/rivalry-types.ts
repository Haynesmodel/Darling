import type { H2HGame, RivalryDefinition, SeasonSummaryRow } from '../../data/generated/asset-types';
import type { RivalryLeadChartRow } from '../../charting/chart-types';

export type RivalryScope = 'allTime' | 'currentSeason' | 'historic';
export type RivalryResult = 'W' | 'L' | 'T';
export type RivalryGame = H2HGame & { _weekByTeam?: Readonly<Record<string, number>> };

export interface RivalryPairOption {
  value: string;
  label: string;
  members: readonly [string, string];
}

export interface RivalryState {
  teamA: string;
  teamB: string;
  scope: RivalryScope;
}

export interface RivalryRecord {
  w: number;
  l: number;
  t: number;
  g: number;
  pf: number;
  pa: number;
}

export interface RivalryRun {
  result: RivalryResult;
  len: number;
  start: RivalryGame;
  end: RivalryGame;
  leader?: string;
}

export interface RivalryMeeting {
  date: string;
  season: number;
  winner: string;
  teamA: string;
  teamB: string;
  scoreA: number;
  scoreB: number;
  pf: number;
  pa: number;
  result: RivalryResult;
  type: string;
  round: string;
  margin?: number;
  total?: number;
  score?: number;
}

export interface RivalryRecordSummary extends RivalryRecord {
  diff: number;
  pct: number;
  recordText: string;
  averageA?: number;
  averageB?: number;
}

export interface RivalrySummary {
  teamA: string;
  teamB: string;
  games: RivalryGame[];
  overall: RivalryRecordSummary & { averageA: number; averageB: number };
  regular: RivalryRecordSummary;
  playoffs: RivalryRecordSummary;
  saunders: RivalryRecordSummary;
  biggestBlowout: RivalryMeeting | null;
  closestGame: RivalryMeeting | null;
  highestCombinedGame: RivalryMeeting | null;
  lowestCombinedGame: RivalryMeeting | null;
  highestTeamAScore: RivalryMeeting | null;
  highestTeamBScore: RivalryMeeting | null;
  currentStreak: RivalryRun | null;
  longestTeamAStreak: RivalryRun | null;
  longestTeamBStreak: RivalryRun | null;
  lastMeeting: RivalryMeeting | null;
}

export interface RivalrySeasonRow {
  season: number;
  games: number;
  w: number;
  l: number;
  t: number;
  pf: number;
  pa: number;
  diff: number;
  notes: string[];
  postseasonWinner: string | null;
  postseasonRounds: string[];
  round: string;
  recordText: string;
}

export interface RivalryGameRow {
  date: string;
  season: number;
  week: number | null;
  type: string;
  round: string;
  result: RivalryResult;
  winner: string;
  score: string;
  margin: number;
  rowClass: string;
  postseasonClass: string;
}

export interface RivalryTapeItem {
  label: string;
  value: string;
  sub: string;
}

export interface RivalryHighlight {
  icon: string;
  label: string;
  value: string;
  sub: string;
  tone: 'blowout' | 'heat' | 'run' | 'spark' | 'stinker';
}

export interface RivalryViewModel {
  teamA: string;
  teamB: string;
  scope: RivalryScope;
  currentSeason: number | null;
  summary: RivalrySummary;
  tape: RivalryTapeItem[];
  highlights: RivalryHighlight[];
  seasonRows: RivalrySeasonRow[];
  gameRows: RivalryGameRow[];
  leadPoints: RivalryLeadChartRow[];
}

export interface RivalryModelInput {
  games: readonly RivalryGame[];
  summaries: readonly SeasonSummaryRow[];
  rivalries: readonly RivalryDefinition[];
}
