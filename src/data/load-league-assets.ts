import { dedupeGames, deriveWeeksInPlace } from '../../js/core-helpers.js';
import { DataLoadError } from './data-errors';
import {
  SUPPORTED_DERIVED_GENERATOR_VERSION,
  SUPPORTED_MANIFEST_VERSION,
  SUPPORTED_SCHEMA_VERSION,
} from './data-version';
import type {
  AssetManifest,
  CurrentSeasonData,
  DerivedStats,
  H2HGame,
  RivalryDefinition,
  SeasonSummaryRow,
} from './generated/asset-types';
import {
  formatValidatorErrors,
  getValidatorErrors,
  isAssetManifest,
  isCurrentSeason,
  isDerivedStats,
  isH2H,
  isRivalries,
  isSeasonSummary,
} from './generated/asset-validators';
import type { ValidatorName } from './generated/asset-validators';

export interface DataDiagnostics {
  dataVersion: string;
  manifestVersion: number;
  activeSeason: number | null;
  latestCompletedWeek: number | null;
  loadedAssets: string[];
  optionalAssetFailures: string[];
}

export interface LoadedLeagueAssets {
  rawGames: H2HGame[];
  leagueGames: H2HGame[];
  derivedWeeksSet: Set<number>;
  seasonSummaries: SeasonSummaryRow[];
  rivalries: RivalryDefinition[];
  currentSeason: CurrentSeasonData | null;
  derivedStats: DerivedStats | null;
  manifest: AssetManifest;
  dataVersion: string;
  diagnostics: DataDiagnostics;
}

interface LoaderOptions {
  fetchFn?: typeof fetch;
  basePath?: string;
  logger?: Pick<Console, 'warn' | 'error'>;
}

function assetUrl(path: string, basePath: string): string {
  const base = basePath.endsWith('/') ? basePath : `${basePath}/`;
  return `${base}${path.replace(/^\//, '')}`;
}

async function fetchUnknown(fetchFn: typeof fetch, url: string, asset: string, dataVersion: string | null): Promise<unknown> {
  const response = await fetchFn(url);
  if (!response.ok) throw new DataLoadError('HTTP_ERROR', asset, `${asset}: HTTP ${response.status}`, dataVersion);
  try {
    return await response.json() as unknown;
  } catch (error) {
    throw new DataLoadError('INVALID_ASSET', asset, `${asset}: invalid JSON (${(error as Error).message})`, dataVersion);
  }
}

function assertVersionSupport(manifest: AssetManifest): void {
  if (manifest.manifest_version !== SUPPORTED_MANIFEST_VERSION) {
    throw new DataLoadError('UNSUPPORTED_VERSION', 'asset-manifest.json', `Unsupported manifest version ${manifest.manifest_version}`, manifest.data_version);
  }
  const unsupported = Object.entries(manifest.schema_versions).find(([, version]) => version !== SUPPORTED_SCHEMA_VERSION);
  if (unsupported) {
    throw new DataLoadError('UNSUPPORTED_VERSION', unsupported[0], `Unsupported ${unsupported[0]} schema version ${unsupported[1]}`, manifest.data_version);
  }
  if (manifest.derived_generator_version !== SUPPORTED_DERIVED_GENERATOR_VERSION) {
    throw new DataLoadError('UNSUPPORTED_VERSION', 'DerivedStats', `Unsupported derived generator version ${manifest.derived_generator_version}`, manifest.data_version);
  }
}

function validateRequired<T>(value: unknown, asset: ValidatorName, guard: (input: unknown) => input is T, version: string): T {
  if (guard(value)) return value;
  throw new DataLoadError('INVALID_ASSET', asset, formatValidatorErrors(asset, getValidatorErrors(asset)), version);
}

function normalizeHistoricalGames(games: H2HGame[]): H2HGame[] {
  return games.map(game => ({ ...game, round: game.round ?? '' }));
}

function normalizeCurrentSeason(current: CurrentSeasonData): CurrentSeasonData {
  return {
    ...current,
    games: current.games.map(game => ({ ...game, round: game.round || '' })),
  };
}

function runtimeSemanticCheck(games: H2HGame[], current: CurrentSeasonData | null, version: string): void {
  const invalid = games.find(game => game.teamA === game.teamB);
  if (invalid) throw new DataLoadError('SEMANTIC_ERROR', 'H2H', `Invalid self-matchup in ${invalid.season} week ${invalid.week}`, version);
  if (current?.games.some(game => game.season !== current.season)) {
    throw new DataLoadError('SEMANTIC_ERROR', 'CurrentSeason', 'A current-season game has the wrong season', version);
  }
}

export async function loadLeagueAssets(options: LoaderOptions = {}): Promise<LoadedLeagueAssets> {
  const fetchFn = options.fetchFn || globalThis.fetch;
  if (typeof fetchFn !== 'function') throw new Error('loadLeagueAssets requires a fetch function');
  const basePath = options.basePath || import.meta.env.BASE_URL || '/';
  const logger = options.logger || console;
  const manifestValue = await fetchUnknown(fetchFn, assetUrl('assets/asset-manifest.json', basePath), 'asset-manifest.json', null);
  if (!isAssetManifest(manifestValue)) {
    throw new DataLoadError('INVALID_MANIFEST', 'asset-manifest.json', formatValidatorErrors('asset-manifest.json', getValidatorErrors('AssetManifest')), null);
  }
  const manifest = manifestValue;
  assertVersionSupport(manifest);
  const version = manifest.data_version;
  const loadedAssets = ['asset-manifest.json'];
  const optionalAssetFailures: string[] = [];

  const requiredPromise = Promise.all([
    fetchUnknown(fetchFn, assetUrl(manifest.assets.H2H.path, basePath), 'H2H', version),
    fetchUnknown(fetchFn, assetUrl(manifest.assets.SeasonSummary.path, basePath), 'SeasonSummary', version),
  ]);

  async function optional<T>(name: ValidatorName, path: string, guard: (value: unknown) => value is T): Promise<T | null> {
    try {
      const value = await fetchUnknown(fetchFn, assetUrl(path, basePath), name, version);
      if (!guard(value)) throw new DataLoadError('INVALID_ASSET', name, formatValidatorErrors(name, getValidatorErrors(name)), version);
      loadedAssets.push(name);
      return value;
    } catch (error) {
      optionalAssetFailures.push(name);
      logger.warn(`[Darling] Optional ${name} unavailable: ${(error as Error).message}`);
      return null;
    }
  }

  const [required, rivalriesValue, currentValue, derivedValue] = await Promise.all([
    requiredPromise,
    optional('Rivalries', manifest.assets.Rivalries.path, isRivalries),
    optional('CurrentSeason', manifest.assets.CurrentSeason.path, isCurrentSeason),
    optional('DerivedStats', manifest.derived.path, isDerivedStats),
  ]);
  const h2h = validateRequired(required[0], 'H2H', isH2H, version);
  const seasonSummary = validateRequired(required[1], 'SeasonSummary', isSeasonSummary, version);
  loadedAssets.push('H2H', 'SeasonSummary');
  const rawGames = normalizeHistoricalGames(h2h);
  const leagueGames = dedupeGames(rawGames as never[]) as H2HGame[];
  const derivedWeeksSet = deriveWeeksInPlace(leagueGames as never[]) as Set<number>;
  const currentSeason = currentValue ? normalizeCurrentSeason(currentValue) : null;
  let derivedStats = derivedValue;
  if (derivedStats && Object.entries(manifest.derived.source_hashes).some(([name, hash]) => derivedStats?.source_hashes[name as keyof DerivedStats['source_hashes']] !== hash)) {
    derivedStats = null;
    optionalAssetFailures.push('DerivedStats');
    const index = loadedAssets.indexOf('DerivedStats');
    if (index >= 0) loadedAssets.splice(index, 1);
    logger.warn('[Darling] Optional DerivedStats unavailable: source dependency hashes do not match the manifest');
  }
  runtimeSemanticCheck(leagueGames, currentSeason, version);
  const finalizedWeeks = currentSeason?.games.filter(game => game.status === 'final').map(game => game.week) || [];
  const diagnostics: DataDiagnostics = {
    dataVersion: version,
    manifestVersion: manifest.manifest_version,
    activeSeason: currentSeason?.season ?? null,
    latestCompletedWeek: finalizedWeeks.length ? Math.max(...finalizedWeeks) : null,
    loadedAssets: loadedAssets.slice().sort(),
    optionalAssetFailures,
  };
  return {
    rawGames,
    leagueGames,
    derivedWeeksSet,
    seasonSummaries: seasonSummary,
    rivalries: rivalriesValue || [],
    currentSeason,
    derivedStats,
    manifest,
    dataVersion: version,
    diagnostics,
  };
}
