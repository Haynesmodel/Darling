import type { H2HGame, SeasonSummaryRow } from '../../data/generated/asset-types';

export interface TrophyModelOptions {
  seasonSummaries?: readonly SeasonSummaryRow[];
  leagueGames?: readonly H2HGame[];
  weeklyAwards?: unknown;
  seasonAggregates?: readonly unknown[];
  ownerCareers?: readonly unknown[] | null;
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

export interface TrophyViewModel {
  owner: string;
  identity: { label: string; summary: string; context: Record<string, number | null> };
  hero: {
    owner: string;
    title: string;
    identityLabel: string;
    summary: string;
    highlights: Array<{ label: string; value: string; rankText: string; icon: string | null; type: string }>;
    record: string;
    best: string;
    worst: string;
    rankContext: string;
  };
  hardwareShelf: Array<{ label: string; count: number; years: number[]; rank: number | null; context: string; tone: string; icon: string | null }>;
  leagueRanks: {
    metrics: Record<string, { rows: Array<{ owner: string; value: number | null; rank: number | null }> }>;
    byOwner: Map<string, Record<string, { value: number | null; rank: number | null }>>;
    profiles: unknown[];
  };
  careerShape: { owner: string; rows: TrophyCareerRow[]; summary: string };
  achievements: Array<{ label: string; value: string; detail: string }>;
  scars: Array<{ label: string; value: string; detail: string }>;
  seasonLedger: Array<{ season: number; record: string; finish: string; pf: string; pa: string; diff: string; notes: string[] }>;
}

export interface TrophyPageProps {
  view: TrophyViewModel;
  owners: readonly string[];
  onOwnerChange: (owner: string) => void;
  active: boolean;
  availableSections?: ReadonlySet<string>;
}
