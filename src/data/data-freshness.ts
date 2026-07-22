import type { CurrentSeasonData, SeasonSummaryRow } from './generated/asset-types';

export const LIVE_SCORE_STALE_AFTER_MS = 30 * 60 * 1000;
export const ACTIVE_DATA_AGING_AFTER_MS = 6 * 24 * 60 * 60 * 1000;
export const ACTIVE_DATA_STALE_AFTER_MS = 8 * 24 * 60 * 60 * 1000;
export const ACTIVE_DATA_CRITICAL_AFTER_MS = 15 * 24 * 60 * 60 * 1000;
export const NEW_SEASON_EXPECTED_MONTH = 8;
export const NEW_SEASON_EXPECTED_DAY = 15;
export const FUTURE_CLOCK_TOLERANCE_MS = 5 * 60 * 1000;

export type DataFreshnessStatus =
  | 'current'
  | 'aging'
  | 'stale'
  | 'live-stale'
  | 'final'
  | 'season-gap'
  | 'unknown';

export interface OptionalAssetFailure {
  asset: string;
  reason: 'http' | 'invalid' | 'integrity' | 'stale-dependency';
  code: string;
}

export interface DataFreshnessAssessment {
  status: DataFreshnessStatus;
  severity: 'ok' | 'notice' | 'warning';
  label: string;
  detail: string;
  generatedAt: string | null;
  ageMs: number | null;
  season: number | null;
  partial: boolean;
  partialAssets: string[];
  nextTransitionAt: string | null;
}

export interface DataFreshnessInput {
  currentSeason: CurrentSeasonData | null;
  seasonSummaries: SeasonSummaryRow[];
  optionalFailures?: OptionalAssetFailure[];
  now?: Date;
}

function summaryComplete(rows: SeasonSummaryRow[], season: number): boolean {
  const matching = rows.filter(row => row.season === season);
  return matching.filter(row => row.champion).length === 1
    && matching.filter(row => row.saunders).length === 1;
}

function latestSummarySeason(rows: SeasonSummaryRow[]): number | null {
  const seasons = rows.map(row => row.season).filter(Number.isFinite);
  return seasons.length ? Math.max(...seasons) : null;
}

function readinessDate(year: number): Date {
  return new Date(Date.UTC(year, NEW_SEASON_EXPECTED_MONTH - 1, NEW_SEASON_EXPECTED_DAY));
}

function isoAfter(generatedMs: number, duration: number): string {
  return new Date(generatedMs + duration).toISOString();
}

function userRelevantPartialAssets(failures: OptionalAssetFailure[]): string[] {
  return Array.from(new Set(
    failures
      .filter(failure => failure.asset !== 'DerivedStats')
      .map(failure => failure.asset),
  )).sort();
}

function applyPartial(
  assessment: Omit<DataFreshnessAssessment, 'partial' | 'partialAssets'>,
  partialAssets: string[],
): DataFreshnessAssessment {
  if (!partialAssets.length) return { ...assessment, partial: false, partialAssets };
  const quietState = assessment.status === 'current' || assessment.status === 'final';
  return {
    ...assessment,
    label: quietState ? 'Snapshot partially available' : assessment.label,
    detail: `${assessment.detail} Unavailable: ${partialAssets.join(', ')}.`,
    severity: quietState ? 'notice' : assessment.severity,
    partial: true,
    partialAssets,
  };
}

function activeAssessment(
  season: number,
  generatedAt: string,
  generatedMs: number,
  ageMs: number,
  finalizing: boolean,
): Omit<DataFreshnessAssessment, 'partial' | 'partialAssets'> {
  const suffix = finalizing ? ' Season recap is awaiting final summary data.' : '';
  if (ageMs <= ACTIVE_DATA_AGING_AFTER_MS) {
    return {
      status: 'current', severity: 'ok', label: 'Data current',
      detail: `The ${season} snapshot is within the weekly update cadence.${suffix}`,
      generatedAt, ageMs, season,
      nextTransitionAt: isoAfter(generatedMs, ACTIVE_DATA_AGING_AFTER_MS),
    };
  }
  if (ageMs <= ACTIVE_DATA_STALE_AFTER_MS) {
    return {
      status: 'aging', severity: 'notice', label: 'Update due soon',
      detail: `The ${season} snapshot is approaching its expected weekly refresh.${suffix}`,
      generatedAt, ageMs, season,
      nextTransitionAt: isoAfter(generatedMs, ACTIVE_DATA_STALE_AFTER_MS),
    };
  }
  const critical = ageMs > ACTIVE_DATA_CRITICAL_AFTER_MS;
  return {
    status: 'stale', severity: 'warning', label: 'Data may be stale',
    detail: `The ${season} snapshot is ${critical ? 'well beyond' : 'beyond'} its expected weekly refresh.${suffix}`,
    generatedAt, ageMs, season, nextTransitionAt: null,
  };
}

export function assessDataFreshness(input: DataFreshnessInput): DataFreshnessAssessment {
  const now = input.now || new Date();
  const nowMs = now.getTime();
  const failures = input.optionalFailures || [];
  const partialAssets = userRelevantPartialAssets(failures);
  const current = input.currentSeason;
  const latestSummary = latestSummarySeason(input.seasonSummaries);
  const season = current?.season ?? latestSummary;
  const generatedAt = current?.generated_at || null;
  const generatedMs = generatedAt ? Date.parse(generatedAt) : Number.NaN;
  const rawAge = generatedAt ? nowMs - generatedMs : null;
  const ageMs = rawAge === null || !Number.isFinite(rawAge) ? null : Math.max(0, rawAge);

  if (!Number.isFinite(nowMs) || (generatedAt && (!Number.isFinite(generatedMs) || generatedMs - nowMs > FUTURE_CLOCK_TOLERANCE_MS))) {
    return applyPartial({
      status: 'unknown', severity: 'warning', label: 'Freshness unknown',
      detail: 'The snapshot update time could not be verified.', generatedAt, ageMs: null, season,
      nextTransitionAt: null,
    }, partialAssets);
  }

  const expected = Number.isFinite(nowMs) ? readinessDate(now.getUTCFullYear()) : null;
  const latestDataSeason = Math.max(current?.season || 0, latestSummary || 0) || null;
  if (expected && now >= expected && latestDataSeason !== null && latestDataSeason < now.getUTCFullYear()) {
    return applyPartial({
      status: 'season-gap', severity: 'warning', label: `${now.getUTCFullYear()} data not available`,
      detail: `A ${now.getUTCFullYear()} current-season snapshot is expected but has not been published.`,
      generatedAt, ageMs, season: latestDataSeason, nextTransitionAt: null,
    }, partialAssets);
  }

  if (!current) {
    if (latestSummary !== null && summaryComplete(input.seasonSummaries, latestSummary)) {
      return applyPartial({
        status: 'final', severity: 'ok', label: `${latestSummary} season final`,
        detail: `The latest available season summary for ${latestSummary} is complete.`,
        generatedAt: null, ageMs: null, season: latestSummary,
        nextTransitionAt: expected && now < expected && latestSummary < now.getUTCFullYear() ? expected.toISOString() : null,
      }, partialAssets);
    }
    return applyPartial({
      status: 'unknown', severity: 'warning', label: 'Freshness unknown',
      detail: 'No current-season snapshot is available.', generatedAt: null, ageMs: null, season,
      nextTransitionAt: null,
    }, partialAssets);
  }

  if (ageMs === null) {
    return applyPartial({
      status: 'unknown', severity: 'warning', label: 'Freshness unknown',
      detail: 'The current-season snapshot has no reliable update time.', generatedAt, ageMs: null,
      season: current.season, nextTransitionAt: null,
    }, partialAssets);
  }

  const hasLive = current.games.some(game => game.status === 'live');
  if (hasLive) {
    const stale = ageMs > LIVE_SCORE_STALE_AFTER_MS;
    return applyPartial({
      status: stale ? 'live-stale' : 'current', severity: stale ? 'warning' : 'ok',
      label: stale ? 'Live scores may be behind' : 'Data current',
      detail: stale ? 'Live-labelled scores are older than 30 minutes.' : 'Live-labelled scores were updated within 30 minutes.',
      generatedAt, ageMs, season: current.season,
      nextTransitionAt: stale ? null : isoAfter(generatedMs, LIVE_SCORE_STALE_AFTER_MS),
    }, partialAssets);
  }

  const allFinal = current.games.length > 0 && current.games.every(game => game.status === 'final');
  const complete = summaryComplete(input.seasonSummaries, current.season);
  if (allFinal && complete) {
    return applyPartial({
      status: 'final', severity: 'ok', label: `${current.season} season final`,
      detail: `All ${current.season} games are final and the season summary is complete.`,
      generatedAt, ageMs, season: current.season,
      nextTransitionAt: expected && now < expected && current.season < now.getUTCFullYear() ? expected.toISOString() : null,
    }, partialAssets);
  }

  return applyPartial(activeAssessment(current.season, generatedAt, generatedMs, ageMs, allFinal && !complete), partialAssets);
}
