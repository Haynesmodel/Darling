export type OwnerHubUnavailableReason =
  | 'no-current-season'
  | 'owner-not-current'
  | 'no-history'
  | 'no-draft-history'
  | 'no-rivalry'
  | 'no-curse';

export interface OwnerHubLink {
  label: string;
  href: string;
}

export interface OwnerHubIdentity {
  owner: string;
  displayName: string | null;
  teamName: string | null;
  completedSeasons: number;
  phase: string;
}

export interface OwnerHubRightNow {
  heading: string;
  summary: string;
  detail: string | null;
  href: string;
}

export interface OwnerHubLegacy {
  record: string;
  winPct: number | null;
  championships: number;
  saundersTitles: number;
  playoffRecord: string;
  bestFinish: number | null;
  averageFinish: number | null;
}

export interface OwnerHubFormGame {
  opponent: string;
  result: 'W' | 'L' | 'T';
  score: string;
  type: string;
  when: string;
}

export interface OwnerHubDynastyDirection {
  direction: 'improving' | 'declining' | 'mixed' | 'insufficient history';
  finishes: { season: number; finish: number }[];
}

export interface OwnerHubDraftIdentity {
  samples: number;
  averagePick: number;
  earliestPick: number;
  latestPick: number;
  mostRecent: { season: number; pick: number };
  href: string;
}

export interface OwnerHubRivalries {
  configured: { name: string; opponents: string[] }[];
  mostPlayed: { opponent: string; record: string; games: number; href: string } | null;
}

export interface OwnerHubCurses {
  counts: { active: number; cold: number; broken: number };
  top: { title: string; status: string; severity: number | null } | null;
  href: string;
}

export interface OwnerHubModel {
  identity: OwnerHubIdentity;
  rightNow: OwnerHubRightNow | null;
  legacy: OwnerHubLegacy | null;
  recentForm: { games: OwnerHubFormGame[]; streak: string } | null;
  dynastyDirection: OwnerHubDynastyDirection;
  draftIdentity: OwnerHubDraftIdentity | null;
  rivalries: OwnerHubRivalries | null;
  curses: OwnerHubCurses | null;
  actions: OwnerHubLink[];
  availability: Partial<Record<'rightNow' | 'legacy' | 'recentForm' | 'draftIdentity' | 'rivalries' | 'curses', OwnerHubUnavailableReason>>;
}
