import {
  DRAFT_ALL_OWNERS,
  DRAFT_METRIC_KEYS,
  DRAFT_MODES,
  DRAFT_ZONE_KEYS,
  type DraftMetricKey,
  type DraftMode,
  type DraftNormalization,
  type DraftSpotState,
  type DraftSpotUrlState,
  type DraftZoneKey,
} from './draft-spot-types';
import type { DraftSpot } from '../../data/generated/asset-types';

export const DEFAULT_DRAFT_STATE: DraftSpotState = {
  owner: DRAFT_ALL_OWNERS,
  mode: 'league',
  startSeason: null,
  endSeason: null,
  metric: 'avgFinish',
  minSample: 1,
  normalize: 'raw',
  selectedPick: null,
  selectedZone: null,
};

function finiteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function zoneKey(value: unknown): DraftZoneKey | null {
  const normalized = String(value || '').toLowerCase();
  return DRAFT_ZONE_KEYS.includes(normalized as DraftZoneKey)
    ? normalized as DraftZoneKey
    : null;
}

export function draftSeasons(asset: DraftSpot): number[] {
  return [...new Set(asset.rows.map(row => row.season))].sort((a, b) => a - b);
}

export function draftOwners(asset: DraftSpot): string[] {
  return [...new Set(asset.rows.map(row => row.owner))].sort((a, b) => a.localeCompare(b));
}

export function draftPicks(asset: DraftSpot): number[] {
  return [...new Set(asset.rows.map(row => row.draft_pick))].sort((a, b) => a - b);
}

export function resolveDraftSpotState(
  asset: DraftSpot,
  requested: (Partial<DraftSpotState> & DraftSpotUrlState) = {},
  current: Partial<DraftSpotState> = {},
): DraftSpotState {
  const seasons = draftSeasons(asset);
  const owners = draftOwners(asset);
  const picks = draftPicks(asset);
  const merged = { ...DEFAULT_DRAFT_STATE, ...current, ...requested };
  const requestedExplicitMode = requested.draftMode ?? requested.mode ?? null;
  const explicitMode = DRAFT_MODES.includes(requestedExplicitMode as DraftMode)
    ? requestedExplicitMode as DraftMode
    : null;
  const requestedStart = finiteNumber(requested.draftStart ?? merged.startSeason);
  const requestedEnd = finiteNumber(requested.draftEnd ?? merged.endSeason);
  const startSeason = requestedStart !== null && seasons.includes(requestedStart)
    ? requestedStart
    : seasons[0] ?? null;
  const endSeason = requestedEnd !== null && seasons.includes(requestedEnd)
    ? requestedEnd
    : seasons.at(-1) ?? null;
  const validRange = startSeason !== null && endSeason !== null && startSeason <= endSeason;
  const requestedOwner = requested.draftOwner ?? merged.owner;
  const requestedMode = requested.draftMode ?? merged.mode;
  const requestedMetric = requested.draftMetric ?? merged.metric;
  const requestedMinSample = finiteNumber(requested.draftMinSample ?? merged.minSample);
  const requestedPick = finiteNumber(requested.draftPick ?? merged.selectedPick);
  const selectedPick = requestedPick !== null && picks.includes(requestedPick) ? requestedPick : null;
  const selectedZone = selectedPick
    ? null
    : zoneKey(requested.draftZone ?? merged.selectedZone);
  let mode: DraftMode = DRAFT_MODES.includes(requestedMode as DraftMode)
    ? requestedMode as DraftMode
    : DEFAULT_DRAFT_STATE.mode;
  if (!explicitMode && selectedPick) mode = 'pick';
  if (!explicitMode && !selectedPick && selectedZone) mode = 'zone';

  return {
    owner: owners.includes(String(requestedOwner)) ? String(requestedOwner) : DRAFT_ALL_OWNERS,
    mode,
    startSeason: validRange ? startSeason : seasons[0] ?? null,
    endSeason: validRange ? endSeason : seasons.at(-1) ?? null,
    metric: DRAFT_METRIC_KEYS.includes(requestedMetric as DraftMetricKey)
      ? requestedMetric as DraftMetricKey
      : DEFAULT_DRAFT_STATE.metric,
    minSample: [1, 2, 3, 5].includes(Number(requestedMinSample))
      ? Number(requestedMinSample) as 1 | 2 | 3 | 5
      : DEFAULT_DRAFT_STATE.minSample,
    normalize: (requested.draftNormalize ?? merged.normalize) === 'percentile'
      ? 'percentile' as DraftNormalization
      : 'raw',
    selectedPick,
    selectedZone,
  };
}

export function draftStateForUrl(state: DraftSpotState): DraftSpotUrlState {
  return {
    draftOwner: state.owner,
    draftMode: state.mode,
    draftStart: state.startSeason,
    draftEnd: state.endSeason,
    draftMetric: state.metric,
    draftMinSample: state.minSample,
    draftNormalize: state.normalize,
    draftPick: state.selectedPick,
    draftZone: state.selectedZone,
  };
}
