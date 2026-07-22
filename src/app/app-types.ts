import type { LoadedLeagueAssets } from '../data/load-league-assets';
import type { DarlingTableRuntime } from '../tables/table-types';
import type { FeatureId } from './feature-contract';
import type { DataFreshnessRuntime } from '../components/data-freshness/DataFreshnessBadge';

export type LeagueDataSnapshot = Readonly<LoadedLeagueAssets>;
export type AppRoute = ReturnType<typeof import('../../js/state-helpers.js').parseUrlState> & { tab: FeatureId };

export interface LeagueSelectors {
  seasonAggregates(): unknown[];
  weeklyAwards(): unknown;
  teams(): string[];
  headToHeadPairs(minGames?: number): unknown[];
  teamSeasons(includePostseason?: boolean): unknown[];
}

export interface NavigationService {
  parse(search?: string): AppRoute;
  update(options: Record<string, unknown>): string;
  runWithoutPush<T>(callback: () => T | Promise<T>): Promise<T>;
  runReplacing<T>(callback: () => T | Promise<T>): Promise<T>;
}

export interface HeaderService {
  team(owner: string): void;
  feature(title: string, owner?: string | null, documentTitle?: string): void;
}

export interface ThemeContextService {
  owner(owner?: string | null, seasonMode?: string): void;
  rivalry(ownerA?: string | null, ownerB?: string | null, seasonMode?: string): void;
  league(seasonMode?: string): void;
}

export interface FeatureStatusService {
  loading(id: FeatureId, label: string): void;
  ready(id: FeatureId): void;
  error(id: FeatureId, label: string, error: unknown, retry: () => void): void;
  dataLoading(): void;
  dataError(error: unknown): void;
  clearGlobal(): void;
}

export interface AppDiagnostics {
  readonly activeFeature: FeatureId | null;
  readonly activationCount: number;
  readonly features: Readonly<Record<FeatureId, unknown>>;
}

export interface AppContext {
  readonly data: LeagueDataSnapshot;
  readonly selectors: LeagueSelectors;
  readonly router: NavigationService;
  readonly header: HeaderService;
  readonly theme: ThemeContextService;
  readonly status: FeatureStatusService;
  readonly tables: DarlingTableRuntime;
  readonly freshness: DataFreshnessRuntime;
  readonly diagnostics: AppDiagnostics;
  readonly document: Document;
  readonly window: Window;
}
