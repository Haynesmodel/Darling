import type { CurrentSeasonData, H2HGame, RivalryDefinition, SeasonSummaryRow } from '../../data/generated/asset-types';

export type PulsePhase = 'preseason' | 'regular-season' | 'postseason' | 'finalizing' | 'offseason' | 'historical-fallback';

export interface PulseSeasonState {
  phase: PulsePhase;
  season: number | null;
  spotlightWeek: number | null;
  isLive: boolean;
  summaryComplete: boolean;
}

export interface PulseLink { label: string; href: string }

export interface PulseHeroModel {
  phase: PulsePhase;
  season: number | null;
  eyebrow: string;
  title: string;
  summary: string;
  badge: 'Live' | 'Scheduled' | 'Final' | 'Offseason' | 'Data limited';
  generatedAt: string | null;
  primaryAction?: PulseLink;
  secondaryAction?: PulseLink;
}

export interface PulseMatchupModel {
  ownerA: string;
  ownerB: string;
  scoreA: number | null;
  scoreB: number | null;
  status: 'Scheduled' | 'Live' | 'Final';
  type: string;
  round: string;
  result: string;
  currentHref: string;
  rivalryHref: string;
}

export interface PulseStandingModel {
  owner: string;
  seed: number;
  record: string;
  previousSeed?: number;
  change?: number;
  movementLabel?: string;
}

export interface PulseStandingsSection {
  mode: 'live-projection' | 'completed-week' | 'current-table';
  heading: string;
  rows: PulseStandingModel[];
  href: string;
}

export interface PulseFeaturedMatchup {
  heading: 'Featured rivalry' | 'Matchup to watch';
  name: string;
  note: string;
  ownerA: string;
  ownerB: string;
  series: string;
  latestResult: string;
  href: string;
}

export interface PulseCurseModel {
  heading: 'Active curse' | 'Curse watch';
  title: string;
  summary: string;
  status: string;
  severity: string;
  sample: string;
  href: string;
}

export interface PulseRecordModel {
  label: string;
  title: string;
  owner: string;
  opponent: string;
  scoreline: string;
  value: string;
  date: string;
  href: string;
}

export interface PulseSuperlative { label: string; value: string; detail: string; href?: string }

export interface PulseYearInReview {
  season: number;
  champion: string;
  runnerUp: string | null;
  saunders: string;
  championshipResult: string | null;
  finalStandings: Array<{ finish: number; owner: string; record: string; pointsFor: number }>;
  superlatives: PulseSuperlative[];
}

export interface LeaguePulseViewModel {
  state: PulseSeasonState;
  hero: PulseHeroModel;
  matchups: PulseMatchupModel[];
  standings: PulseStandingsSection | null;
  yearInReview: PulseYearInReview | null;
  featuredMatchup: PulseFeaturedMatchup | null;
  curse: PulseCurseModel | null;
  record: PulseRecordModel | null;
  quickLinks: PulseLink[];
  dataNote: { generatedAt: string | null; dataVersion: string; usedFallbacks: string[] };
}

export interface PulseModelData {
  leagueGames: H2HGame[];
  seasonSummaries: SeasonSummaryRow[];
  rivalries: RivalryDefinition[];
  currentSeason: CurrentSeasonData | null;
  derivedStats?: unknown;
  dataVersion: string;
}
