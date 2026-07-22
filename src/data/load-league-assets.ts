import { dedupeGames, deriveWeeksInPlace } from '../../js/core-helpers.js';
import { DataLoadError } from './data-errors';
import { assessDataFreshness, type DataFreshnessAssessment, type OptionalAssetFailure } from './data-freshness';
import {
  fetchManifestJson,
  fetchVerifiedJson,
  type JsonAssetDescriptor,
  type VerifiedJsonResult,
} from './verified-json-fetch';
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
  optionalFailures: OptionalAssetFailure[];
  integrity: {
    algorithm: 'SHA-256';
    urlVersioning: 'asset-sha256-query';
    manifestCache: 'no-store';
    verifiedAssets: string[];
    recoveredAssets: string[];
    failedOptionalAssets: string[];
  };
  freshness: DataFreshnessAssessment;
  loadedAt: string;
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
  digestFn?: (bytes: Uint8Array) => Promise<string>;
  now?: Date;
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
  const manifestValue = await fetchManifestJson('assets/asset-manifest.json', { fetchFn, basePath });
  if (!isAssetManifest(manifestValue)) {
    throw new DataLoadError('INVALID_MANIFEST', 'asset-manifest.json', formatValidatorErrors('asset-manifest.json', getValidatorErrors('AssetManifest')), null);
  }
  const manifest = manifestValue;
  assertVersionSupport(manifest);
  const version = manifest.data_version;
  const loadedAssets = ['asset-manifest.json'];
  const optionalAssetFailures: string[] = [];
  const optionalFailures: OptionalAssetFailure[] = [];
  const verifiedAssets: string[] = [];
  const recoveredAssets: string[] = [];
  const failedOptionalAssets: string[] = [];

  function descriptor(name: string, entry: { path: string; sha256: string; bytes: number }): JsonAssetDescriptor {
    return { name, path: entry.path, sha256: entry.sha256, bytes: entry.bytes, dataVersion: version };
  }

  async function verified<T>(entry: JsonAssetDescriptor): Promise<VerifiedJsonResult<T>> {
    const result = await fetchVerifiedJson<T>(entry, {
      fetchFn,
      basePath,
      digestFn: options.digestFn,
      logger,
    });
    verifiedAssets.push(entry.name);
    if (result.cacheRecovered) recoveredAssets.push(entry.name);
    return result;
  }

  const requiredPromise = Promise.all([
    verified<unknown>(descriptor('H2H', manifest.assets.H2H)),
    verified<unknown>(descriptor('SeasonSummary', manifest.assets.SeasonSummary)),
  ]);

  function failureReason(error: unknown): OptionalAssetFailure['reason'] {
    if (!(error instanceof DataLoadError)) return 'invalid';
    if (error.code === 'HTTP_ERROR') return 'http';
    if (['INTEGRITY_MISMATCH', 'SIZE_MISMATCH', 'INVALID_UTF8', 'INTEGRITY_UNAVAILABLE'].includes(error.code)) return 'integrity';
    return 'invalid';
  }

  async function optional<T>(name: ValidatorName, entry: JsonAssetDescriptor, guard: (value: unknown) => value is T): Promise<T | null> {
    try {
      const result = await verified<unknown>(entry);
      const value = result.value;
      if (!guard(value)) throw new DataLoadError('INVALID_ASSET', name, formatValidatorErrors(name, getValidatorErrors(name)), version);
      loadedAssets.push(name);
      return value;
    } catch (error) {
      optionalAssetFailures.push(name);
      failedOptionalAssets.push(name);
      optionalFailures.push({
        asset: name,
        reason: failureReason(error),
        code: error instanceof DataLoadError ? error.code : 'UNKNOWN_ERROR',
      });
      logger.warn(`[Darling] Optional ${name} unavailable: ${(error as Error).message}`);
      return null;
    }
  }

  const [required, rivalriesValue, currentValue, derivedValue] = await Promise.all([
    requiredPromise,
    optional('Rivalries', descriptor('Rivalries', manifest.assets.Rivalries), isRivalries),
    optional('CurrentSeason', descriptor('CurrentSeason', manifest.assets.CurrentSeason), isCurrentSeason),
    optional('DerivedStats', descriptor('DerivedStats', manifest.derived), isDerivedStats),
  ]);
  const h2h = validateRequired(required[0].value, 'H2H', isH2H, version);
  const seasonSummary = validateRequired(required[1].value, 'SeasonSummary', isSeasonSummary, version);
  loadedAssets.push('H2H', 'SeasonSummary');
  const rawGames = normalizeHistoricalGames(h2h);
  const leagueGames = dedupeGames(rawGames as never[]) as H2HGame[];
  const derivedWeeksSet = deriveWeeksInPlace(leagueGames as never[]) as Set<number>;
  const currentSeason = currentValue ? normalizeCurrentSeason(currentValue) : null;
  let derivedStats = derivedValue;
  if (derivedStats && Object.entries(manifest.derived.source_hashes).some(([name, hash]) => derivedStats?.source_hashes[name as keyof DerivedStats['source_hashes']] !== hash)) {
    derivedStats = null;
    optionalAssetFailures.push('DerivedStats');
    optionalFailures.push({ asset: 'DerivedStats', reason: 'stale-dependency', code: 'SEMANTIC_ERROR' });
    failedOptionalAssets.push('DerivedStats');
    const index = loadedAssets.indexOf('DerivedStats');
    if (index >= 0) loadedAssets.splice(index, 1);
    logger.warn('[Darling] Optional DerivedStats unavailable: source dependency hashes do not match the manifest');
  }
  runtimeSemanticCheck(leagueGames, currentSeason, version);
  const finalizedWeeks = currentSeason?.games.filter(game => game.status === 'final').map(game => game.week) || [];
  optionalAssetFailures.sort();
  optionalFailures.sort((a, b) => a.asset.localeCompare(b.asset) || a.reason.localeCompare(b.reason));
  optionalFailures.forEach(Object.freeze);
  const freshness = assessDataFreshness({
    currentSeason,
    seasonSummaries: seasonSummary,
    optionalFailures,
    now: options.now,
  });
  const integrity = Object.freeze({
    algorithm: 'SHA-256' as const,
    urlVersioning: 'asset-sha256-query' as const,
    manifestCache: 'no-store' as const,
    verifiedAssets: Object.freeze(verifiedAssets.slice().sort()) as unknown as string[],
    recoveredAssets: Object.freeze(recoveredAssets.slice().sort()) as unknown as string[],
    failedOptionalAssets: Object.freeze(failedOptionalAssets.slice().sort()) as unknown as string[],
  });
  const diagnostics: DataDiagnostics = {
    dataVersion: version,
    manifestVersion: manifest.manifest_version,
    activeSeason: currentSeason?.season ?? null,
    latestCompletedWeek: finalizedWeeks.length ? Math.max(...finalizedWeeks) : null,
    loadedAssets: loadedAssets.slice().sort(),
    optionalAssetFailures,
    optionalFailures,
    integrity,
    freshness,
    loadedAt: new Date().toISOString(),
  };
  Object.freeze(diagnostics.loadedAssets);
  Object.freeze(diagnostics.optionalAssetFailures);
  Object.freeze(diagnostics.optionalFailures);
  Object.freeze(diagnostics.freshness.partialAssets);
  Object.freeze(diagnostics.freshness);
  Object.freeze(diagnostics);
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
