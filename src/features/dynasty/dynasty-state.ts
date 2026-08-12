import type { SeasonSummaryRow } from '../../data/generated/asset-types';
import { ALL_DYNASTY_TEAMS, type DynastyMode, type DynastyState } from './dynasty-types.ts';
export { ALL_DYNASTY_TEAMS };

const finite = (value: unknown): number | null => { const n = Number(value); return Number.isFinite(n) ? n : null; };
const dynastyModes = new Set<DynastyMode>(['calculator', 'rolling-3', 'rolling-5', 'selected-range', 'all-time']);
const isDynastyMode = (value: unknown): value is DynastyMode => dynastyModes.has(String(value) as DynastyMode);
export function availableDynastySeasons(rows: readonly Pick<SeasonSummaryRow, 'season'>[]): number[] { return [...new Set(rows.map(row => row.season).filter(Number.isFinite))].sort((a, b) => a - b); }
export function availableDynastyOwners(rows: readonly Pick<SeasonSummaryRow, 'owner'>[]): string[] { return [...new Set(rows.map(row => row.owner).filter(Boolean))].sort((a, b) => a.localeCompare(b)); }
export function normalizeDynastyRange(input: { availableSeasons: readonly number[]; startSeason?: unknown; endSeason?: unknown; requestedStartSeason?: unknown; requestedEndSeason?: unknown; windowSize?: number }): Pick<DynastyState, 'startSeason' | 'endSeason' | 'requestedStartSeason' | 'requestedEndSeason'> {
  const seasons = [...input.availableSeasons].filter(Number.isFinite).sort((a, b) => a - b); const latestStart = seasons[Math.max(0, seasons.length - (input.windowSize || 3))] ?? null; const defaultEnd = seasons.at(-1) ?? null;
  const requestedStart = finite(input.requestedStartSeason) ?? finite(input.startSeason) ?? latestStart; const requestedEnd = finite(input.requestedEndSeason) ?? finite(input.endSeason) ?? defaultEnd;
  if (requestedStart === null || requestedEnd === null || !seasons.length) return { requestedStartSeason: requestedStart, requestedEndSeason: requestedEnd, startSeason: null, endSeason: null };
  const min = seasons[0], max = seasons.at(-1)!; const start = Math.min(Math.max(requestedStart, min), max); const end = Math.min(Math.max(requestedEnd, min), max);
  // Keep URL intent when it is merely outside the available history, but
  // canonicalize a reversed control selection so the emitted state and URL
  // agree with the visible range.
  const orderedRequestedStart = Math.min(requestedStart, requestedEnd);
  const orderedRequestedEnd = Math.max(requestedStart, requestedEnd);
  return { requestedStartSeason: orderedRequestedStart, requestedEndSeason: orderedRequestedEnd, startSeason: Math.min(start, end), endSeason: Math.max(start, end) };
}

export function normalizeDynastyStateChange(input: Partial<DynastyState> & Pick<DynastyState, 'mode' | 'owner'>, seasonSummaries: readonly SeasonSummaryRow[]): DynastyState {
  const seasons = availableDynastySeasons(seasonSummaries);
  const owners = availableDynastyOwners(seasonSummaries);
  const range = normalizeDynastyRange({
    availableSeasons: seasons,
    startSeason: input.startSeason,
    endSeason: input.endSeason,
    requestedStartSeason: input.requestedStartSeason,
    requestedEndSeason: input.requestedEndSeason,
  });
  const fallbackOwner = owners[0] || ALL_DYNASTY_TEAMS;
  const owner = input.mode === 'calculator'
    ? (input.owner && input.owner !== ALL_DYNASTY_TEAMS && owners.includes(input.owner) ? input.owner : fallbackOwner)
    : ALL_DYNASTY_TEAMS;
  const maxMinimum = Math.max(1, seasons.length || 1);
  const minimum = Math.min(maxMinimum, Math.max(1, Math.trunc(Number(input.minSeasons ?? 2)) || 1));
  return {
    mode: input.mode,
    owner,
    ...range,
    minSeasons: minimum,
    includeSaundersPenalty: input.includeSaundersPenalty !== false,
    chartHiddenOwners: [...(input.chartHiddenOwners || [])],
    selectedWindowKey: input.selectedWindowKey ?? null,
    selectedWindowKind: input.selectedWindowKind ?? null,
  };
}
export function resolveDynastyInitialState(input: { seasonSummaries: readonly SeasonSummaryRow[]; urlState?: { dynastyMode?: string | null; dynastyOwner?: string | null; dynastyStart?: number | null; dynastyEnd?: number | null; dynastyMinSeasons?: number | null; dynastySaunders?: boolean | null }; mode?: DynastyMode; owner?: string | null; startSeason?: number | null; endSeason?: number | null; minSeasons?: number; includeSaundersPenalty?: boolean }): DynastyState {
  const seasons = availableDynastySeasons(input.seasonSummaries); const owners = availableDynastyOwners(input.seasonSummaries); const url = input.urlState || {}; const fallbackMode = isDynastyMode(input.mode) ? input.mode : 'all-time'; const requestedMode = isDynastyMode(url.dynastyMode) ? url.dynastyMode : url.dynastyMode ? 'calculator' : fallbackMode; const selectedOwner = requestedMode === 'calculator' ? ((url.dynastyOwner || input.owner || owners[0]) && owners.includes(url.dynastyOwner || input.owner || '') ? (url.dynastyOwner || input.owner || owners[0]) : owners[0] || ALL_DYNASTY_TEAMS) : ALL_DYNASTY_TEAMS; const range = normalizeDynastyRange({ availableSeasons: seasons, startSeason: input.startSeason, endSeason: input.endSeason, requestedStartSeason: url.dynastyStart ?? input.startSeason, requestedEndSeason: url.dynastyEnd ?? input.endSeason }); const fallback = normalizeDynastyRange({ availableSeasons: seasons }); const maxMinimum = Math.max(1, seasons.length || 1); const requestedMinimum = Math.trunc(Number(url.dynastyMinSeasons ?? input.minSeasons ?? 2)); const minSeasons = Math.min(maxMinimum, Math.max(1, Number.isFinite(requestedMinimum) ? requestedMinimum : 1)); return { mode: requestedMode, owner: selectedOwner || ALL_DYNASTY_TEAMS, startSeason: range.startSeason ?? fallback.startSeason, endSeason: range.endSeason ?? fallback.endSeason, requestedStartSeason: range.requestedStartSeason ?? fallback.requestedStartSeason, requestedEndSeason: range.requestedEndSeason ?? fallback.requestedEndSeason, minSeasons, includeSaundersPenalty: url.dynastySaunders ?? input.includeSaundersPenalty ?? true, chartHiddenOwners: [], selectedWindowKey: null, selectedWindowKind: null };
}
