export type SearchCategory = 'navigate' | 'owner' | 'season' | 'rivalry' | 'game-query' | 'record' | 'command';

export type SearchFocusTarget = 'top' | 'overview' | 'games' | 'standings' | 'playoff-picture';
export type SearchCommand = 'theme-system' | 'theme-light' | 'theme-dark' | 'export-history';

export type SearchAction =
  | { kind: 'navigate'; url: string; focus?: SearchFocusTarget }
  | { kind: 'command'; command: SearchCommand };

export interface SearchDocument {
  id: string;
  category: SearchCategory;
  title: string;
  subtitle: string;
  keywords: string[];
  priority: number;
  action: SearchAction;
}

export interface SearchResult extends SearchDocument {
  score: number;
  matchedTerms: string[];
  interpretation?: string;
}

export type SearchIntent =
  | { kind: 'owner-season'; owner: string; season?: number; gameType?: string }
  | { kind: 'rivalry'; ownerA: string; ownerB: string }
  | { kind: 'season-type'; season: number; gameType: string }
  | { kind: 'score-threshold'; owner?: string; season?: number; min?: number; max?: number }
  | { kind: 'game-extreme'; metric: 'largest-loss-margin' | 'largest-win-margin' | 'highest-score' | 'lowest-score'; owner?: string; season?: number }
  | { kind: 'game-filter'; owner?: string; season?: number; result: 'W' | 'L' | 'T' }
  | { kind: 'feature'; feature: 'history' | 'current' | 'playoff-picture' | 'trophy' | 'dynasty' | 'draft' | 'gauntlet'; owner?: string }
  | { kind: 'draft-pick'; pick: number }
  | { kind: 'draft-zone'; zone: 'early' | 'middle' | 'late' }
  | { kind: 'draft-owner'; owner: string }
  | { kind: 'command'; command: SearchCommand };

export interface LeagueGame {
  season: number;
  date: string;
  teamA: string;
  teamB: string;
  scoreA: number;
  scoreB: number;
  type?: string;
  round?: string;
}

export interface SearchHydrationData {
  leagueGames: LeagueGame[];
  seasonSummaries: Array<{ owner: string; season: number }>;
  rivalries?: Array<{ members?: string[] }>;
  currentSeason?: {
    teams?: Array<{ owner: string; display_name?: string; sleeper_team_name?: string }>;
  } | null;
}

export interface SearchRuntimeSnapshot {
  hydrated: boolean;
  documents: SearchDocument[];
  recentCount: number;
}

export interface DarlingSearchRuntime {
  getSnapshot(): SearchRuntimeSnapshot;
  hydrate(data: SearchHydrationData): void;
  search(query: string): SearchResult[];
  execute(result: SearchResult): void;
  clearRecent(): void;
  subscribe(listener: (snapshot: SearchRuntimeSnapshot) => void): () => void;
}

declare global {
  interface Window {
    darlingSearch?: DarlingSearchRuntime;
    darlingTheme?: {
      setColorSchemePreference?(preference: 'system' | 'light' | 'dark'): void;
    };
  }
}
