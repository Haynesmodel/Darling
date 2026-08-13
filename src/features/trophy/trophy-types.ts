import type { H2HGame, SeasonSummaryRow } from '../../data/generated/asset-types';

export interface TrophyCountRow {
  team: string;
  count: number;
}

export interface TrophyWeeklyAwards {
  top: TrophyCountRow[];
  low: TrophyCountRow[];
  high150: TrophyCountRow[];
}

export interface TrophySeasonAggregate {
  team: string;
  season: number;
  expWins: number;
  luck: number;
}

export interface TrophyOwnerCareerSource {
  owner: string;
  wins: number;
  losses: number;
  ties: number;
  points_for: number;
  points_against: number;
  weekly_crowns: number;
}

export interface TrophyModelOptions {
  seasonSummaries?: readonly SeasonSummaryRow[];
  leagueGames?: readonly H2HGame[];
  weeklyAwards?: unknown;
  seasonAggregates?: readonly unknown[];
  ownerCareers?: readonly unknown[] | null;
}

export interface TrophyRecord {
  wins: number;
  losses: number;
  ties: number;
}

export interface TrophySeasonLuckRow {
  season: number;
  luck: number;
  games: number;
  expectedWins: number;
}

export interface TrophyGameRow {
  game: H2HGame;
  opponent: string;
  pf: number;
  pa: number;
  margin: number;
  result?: 'W' | 'L' | 'T';
  luckDelta?: number | null;
  xw?: number | null;
}

export interface TrophyOwnerCareerProfile {
  owner: string;
  seasonRows: SeasonSummaryRow[];
  ownerGames: H2HGame[];
  regularGames: H2HGame[];
  playoffGames: H2HGame[];
  saundersGames: H2HGame[];
  totals: {
    regular: TrophyRecord;
    playoffs: TrophyRecord;
    saunders: TrophyRecord;
    pointsFor: number;
    pointsAgainst: number;
    diff: number;
  };
  counts: {
    championships: number;
    regularTitles: number;
    top2Seeds: number;
    wildCards: number;
    saundersTitles: number;
    saundersByes: number;
    weeklyCrowns: number;
    lowScores: number;
    highScores: number;
    sub70Games: number;
    bagels: number;
  };
  years: {
    champions: number[];
    regularTitles: number[];
    top2Seeds: number[];
    wildCards: number[];
    saundersTitles: number[];
    saundersByes: number[];
  };
  rates: {
    regularWinPct: number | null;
    playoffWinPct: number | null;
    saundersWinPct: number | null;
    averageFinish: number | null;
    finishStdDev: number;
  };
  finishes: { count: number; best: number | null; worst: number | null };
  seasonLuckRows: TrophySeasonLuckRow[];
  bestSeason: number | null;
  bestPFSeason: SeasonSummaryRow | null;
  bestDiffSeason: SeasonSummaryRow | null;
  worstDiffSeason: SeasonSummaryRow | null;
  worstFinishSeason: SeasonSummaryRow | null;
  mostUnluckySeason: SeasonSummaryRow | null;
  luckiestSeason: SeasonSummaryRow | null;
  bestGame: TrophyGameRow | null;
  worstGame: TrophyGameRow | null;
  biggestWin: TrophyGameRow | null;
  biggestLoss: TrophyGameRow | null;
  bestPlayoffWin: TrophyGameRow | null;
  worstPlayoffLoss: TrophyGameRow | null;
  bestSaundersWin: TrophyGameRow | null;
}

export interface TrophyRankValue {
  value: number | null;
  rank: number | null;
}

export interface TrophyRankRow extends TrophyRankValue {
  owner: string;
}

export interface TrophyRankMetric {
  rows: TrophyRankRow[];
  byOwner: Map<string, TrophyRankRow>;
}

export type TrophyMetricKey =
  | 'championships'
  | 'winPct'
  | 'avgFinish'
  | 'regularTitles'
  | 'top2Seeds'
  | 'playoffWins'
  | 'weeklyCrowns'
  | 'sub70Games'
  | 'saundersPain'
  | 'finishStdDev'
  | 'playoffWinPct';

export type TrophyOwnerRanks = { owner: string } & Record<TrophyMetricKey, TrophyRankValue>;

export interface TrophyLeagueRanks {
  metrics: Record<TrophyMetricKey, TrophyRankMetric>;
  byOwner: Map<string, TrophyOwnerRanks>;
  profiles: TrophyOwnerCareerProfile[];
}

export interface TrophyIdentity {
  label: string;
  summary: string;
  context: Record<string, number | null>;
}

export interface TrophyHeroHighlight {
  label: string;
  value: string;
  rankText: string;
  icon: string | null;
  type: string;
}

export interface TrophyHero {
  owner: string;
  title: string;
  identityLabel: string;
  summary: string;
  highlights: TrophyHeroHighlight[];
  record: string;
  best: string;
  worst: string;
  rankContext: string;
}

export type TrophyHardwareState = 'earned' | 'empty';

export interface TrophyHardwareItem {
  label: string;
  count: number;
  years: number[];
  rank: number | null;
  context: string;
  tone: string;
  state: TrophyHardwareState;
  icon: string | null;
}

export interface TrophyCareerRow {
  season: number;
  owner: string;
  tier: string;
  label: string;
  record: string;
  finish: string;
  pf: string;
  pa: string;
  diff: string;
  playoffCutoff: number;
  title: string;
}

export interface TrophyListItem {
  key: string;
  sourceKey: string;
  label: string;
  value: string;
  detail: string;
}

export interface TrophyAchievementAndScarLists {
  achievements: TrophyListItem[];
  scars: TrophyListItem[];
  bestAchievement: TrophyListItem | null;
  worstScar: TrophyListItem | null;
}

export interface TrophySignatureSeason {
  season: number;
  badge: string;
  record: string;
  finish: string;
  pf: string;
  pa: string;
  diff: string;
  reason: string;
  summary: string;
}

export interface TrophyOwnerMoment {
  label: string;
  value: string;
  date: string;
  season: number;
  opponent: string;
  scoreline: string;
  note: string;
}

export interface TrophySeasonGameLog {
  date: string;
  week: string;
  opponent: string;
  scoreline: string;
  result: 'W' | 'L' | 'T';
  type: H2HGame['type'];
  round: string;
}

export interface TrophySeasonLedgerRow {
  season: number;
  record: string;
  finish: string;
  pf: string;
  pa: string;
  diff: string;
  notes: string[];
  games: TrophySeasonGameLog[];
}

export interface TrophyViewModel {
  owner: string;
  identity: TrophyIdentity;
  hero: TrophyHero;
  hardwareShelf: TrophyHardwareItem[];
  leagueRanks: TrophyLeagueRanks;
  careerShape: { owner: string; rows: TrophyCareerRow[]; summary: string };
  achievements: TrophyListItem[];
  scars: TrophyListItem[];
  seasonLedger: TrophySeasonLedgerRow[];
}

export interface TrophyPageProps {
  view: TrophyViewModel;
  owners: readonly string[];
  onOwnerChange: (owner: string) => void;
  active: boolean;
  availableSections?: ReadonlySet<string>;
}
