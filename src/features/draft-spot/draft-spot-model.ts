import type {
  DraftSpot,
  DraftSpotOwnerRecommendation,
  DraftSpotRow,
  RecommendationGroup,
} from '../../data/generated/asset-types';
import {
  DRAFT_ALL_OWNERS,
  type DraftMetricDefinition,
  type DraftMetricKey,
  type DraftNormalization,
  type DraftSpotState,
  type DraftSpotUrlState,
  type DraftSpotViewModel,
  type DraftSummary,
} from './draft-spot-types';
import {
  draftOwners,
  draftPicks,
  draftSeasons,
  resolveDraftSpotState,
} from './draft-spot-state';

export const DRAFT_METRICS: Record<DraftMetricKey, DraftMetricDefinition> = {
  avgFinish: { key: 'avgFinish', label: 'Avg Finish', summaryField: 'avg_finish', rowField: 'finish', lowerIsBetter: true, format: 'number' },
  playoffRate: { key: 'playoffRate', label: 'Playoff Rate', summaryField: 'playoff_rate', rowField: 'made_playoffs', lowerIsBetter: false, format: 'percent' },
  topThreeRate: { key: 'topThreeRate', label: 'Top 3 Rate', summaryField: 'top_three_rate', rowField: 'top_three', lowerIsBetter: false, format: 'percent' },
  championships: { key: 'championships', label: 'Championship Count', summaryField: 'championships', rowField: 'champion', lowerIsBetter: false, format: 'count' },
  saundersRate: { key: 'saundersRate', label: 'Saunders Rate', summaryField: 'saunders_rate', rowField: 'saunders', lowerIsBetter: true, format: 'percent' },
  pointsZ: { key: 'pointsZ', label: 'Points z-score', summaryField: 'avg_points_z', rowField: 'points_z', lowerIsBetter: false, format: 'signed' },
  winsAboveAvg: { key: 'winsAboveAvg', label: 'Wins Above Average', summaryField: 'avg_wins_above_avg', rowField: 'wins_above_avg', lowerIsBetter: false, format: 'signed' },
};

export const DRAFT_ZONES = [
  { key: 'early' as const, label: 'Early (1-3)' },
  { key: 'middle' as const, label: 'Middle (4-7)' },
  { key: 'late' as const, label: 'Late (8+)' },
] as const;

const NORMALIZED_DRAFT_SLOTS = 12;

export function draftPickBucket(
  row: DraftSpotRow,
  normalization: DraftNormalization = 'raw',
): number {
  if (normalization === 'raw') return row.draft_pick;
  return Math.round(row.draft_percentile * (NORMALIZED_DRAFT_SLOTS - 1)) + 1;
}

export function draftPositionLabel(
  pick: number | null | undefined,
  normalization: DraftNormalization = 'raw',
): string {
  if (!pick) return 'Draft position';
  return normalization === 'percentile' ? `12-team slot ${pick}` : `Pick ${pick}`;
}

function draftZoneKey(row: DraftSpotRow, normalization: DraftNormalization): DraftSpotRow['zone_key'] {
  if (normalization === 'raw') return row.zone_key;
  const pick = draftPickBucket(row, normalization);
  if (pick <= 3) return 'early';
  if (pick <= 7) return 'middle';
  return 'late';
}

function average(rows: DraftSpotRow[], field: keyof DraftSpotRow): number {
  return rows.length
    ? rows.reduce((total, row) => total + Number(row[field] || 0), 0) / rows.length
    : 0;
}

function booleanRate(rows: DraftSpotRow[], field: keyof DraftSpotRow): number {
  return rows.length ? rows.filter(row => Boolean(row[field])).length / rows.length : 0;
}

export function filterDraftRows(
  rows: DraftSpotRow[],
  filters: Partial<DraftSpotState>,
): DraftSpotRow[] {
  const normalization = filters.normalize || 'raw';
  return rows.filter(row => {
    if (filters.startSeason !== null && filters.startSeason !== undefined && row.season < filters.startSeason) return false;
    if (filters.endSeason !== null && filters.endSeason !== undefined && row.season > filters.endSeason) return false;
    if (filters.owner && filters.owner !== DRAFT_ALL_OWNERS && row.owner !== filters.owner) return false;
    if (filters.selectedPick !== null && filters.selectedPick !== undefined && draftPickBucket(row, normalization) !== filters.selectedPick) return false;
    if ((filters.selectedPick === null || filters.selectedPick === undefined) && filters.selectedZone && draftZoneKey(row, normalization) !== filters.selectedZone) return false;
    return true;
  });
}

function summarize(group: DraftSpotRow[]): Omit<DraftSummary, 'draft_pick' | 'zone_key' | 'zone' | 'avg_pick'> {
  return {
    n: group.length,
    avg_draft_percentile: average(group, 'draft_percentile'),
    avg_finish: average(group, 'finish'),
    avg_finish_score: average(group, 'finish_score'),
    avg_wins_above_avg: average(group, 'wins_above_avg'),
    avg_points_z: average(group, 'points_z'),
    top_three_rate: booleanRate(group, 'top_three'),
    playoff_rate: booleanRate(group, 'made_playoffs'),
    championships: group.filter(row => row.champion).length,
    champion_rate: booleanRate(group, 'champion'),
    saunders_count: group.filter(row => row.saunders).length,
    saunders_rate: booleanRate(group, 'saunders'),
  };
}

export function summarizeDraftPicks(
  rows: DraftSpotRow[],
  normalization: DraftNormalization = 'raw',
): DraftSummary[] {
  const groups = new Map<number, DraftSpotRow[]>();
  rows.forEach(row => {
    const pick = draftPickBucket(row, normalization);
    groups.set(pick, [...(groups.get(pick) || []), row]);
  });
  return [...groups.entries()]
    .sort(([a], [b]) => a - b)
    .map(([draftPick, group]) => ({ draft_pick: draftPick, ...summarize(group) }));
}

export function summarizeDraftZones(
  rows: DraftSpotRow[],
  normalization: DraftNormalization = 'raw',
): DraftSummary[] {
  const groups = new Map<string, DraftSpotRow[]>();
  rows.forEach(row => {
    const zone = draftZoneKey(row, normalization);
    groups.set(zone, [...(groups.get(zone) || []), row]);
  });
  return DRAFT_ZONES.flatMap(zone => {
    const group = groups.get(zone.key) || [];
    return group.length
      ? [{
          zone_key: zone.key,
          zone: zone.label,
          avg_pick: group.reduce((total, row) => total + draftPickBucket(row, normalization), 0) / group.length,
          ...summarize(group),
        }]
      : [];
  });
}

export function draftMetricValue(
  row: DraftSummary | DraftSpotRow,
  metric: DraftMetricKey,
): number {
  const definition = DRAFT_METRICS[metric];
  const summaryValue = (row as unknown as Record<string, unknown>)[definition.summaryField];
  if (summaryValue !== undefined) return Number(summaryValue);
  const rowValue = row[definition.rowField as keyof typeof row];
  return typeof rowValue === 'boolean' ? (rowValue ? 1 : 0) : Number(rowValue || 0);
}

function rankSummaries(rows: DraftSummary[], metric: DraftMetricKey): DraftSummary[] {
  const definition = DRAFT_METRICS[metric];
  return rows.slice().sort((a, b) => {
    const difference = draftMetricValue(a, metric) - draftMetricValue(b, metric);
    if (difference) return definition.lowerIsBetter ? difference : -difference;
    if (a.n !== b.n) return b.n - a.n;
    return (a.draft_pick || DRAFT_ZONES.findIndex(zone => zone.key === a.zone_key))
      - (b.draft_pick || DRAFT_ZONES.findIndex(zone => zone.key === b.zone_key));
  });
}

function qualified(rows: DraftSummary[], minimum: number): DraftSummary[] {
  const qualifiedRows = rows.filter(row => row.n >= minimum);
  return qualifiedRows.length ? qualifiedRows : rows;
}

function recommendationGroup(
  label: string,
  rows: DraftSpotRow[],
  extra: Partial<RecommendationGroup> = {},
): RecommendationGroup {
  return {
    label,
    n: rows.length,
    avg_finish: average(rows, 'finish'),
    avg_finish_score: average(rows, 'finish_score'),
    playoffs: rows.filter(row => row.made_playoffs).length,
    top_three: rows.filter(row => row.top_three).length,
    titles: rows.filter(row => row.champion).length,
    saunders: rows.filter(row => row.saunders).length,
    ...extra,
  };
}

function compareRecommendationGroups(a: RecommendationGroup, b: RecommendationGroup): number {
  return b.avg_finish_score - a.avg_finish_score
    || b.titles - a.titles
    || b.top_three - a.top_three
    || b.playoffs - a.playoffs
    || Number(a.draft_pick || 0) - Number(b.draft_pick || 0);
}

function confidenceForSample(size: number): DraftSpotOwnerRecommendation['confidence'] {
  if (size >= 5) return 'strong';
  if (size >= 3) return 'medium';
  if (size >= 2) return 'small';
  return 'league-wide fallback';
}

export function buildOwnerRecommendation(
  owner: string,
  ownerRows: DraftSpotRow[],
  leagueRows: DraftSpotRow[],
  normalization: DraftNormalization = 'raw',
): DraftSpotOwnerRecommendation | null {
  if (!ownerRows.length) return null;
  const pickGroups = new Map<number, DraftSpotRow[]>();
  const zoneGroups = new Map<DraftSpotRow['zone_key'], DraftSpotRow[]>();
  ownerRows.forEach(row => {
    const pick = draftPickBucket(row, normalization);
    const zone = draftZoneKey(row, normalization);
    pickGroups.set(pick, [...(pickGroups.get(pick) || []), row]);
    zoneGroups.set(zone, [...(zoneGroups.get(zone) || []), row]);
  });
  const pickRecords = [...pickGroups.entries()]
    .sort(([a], [b]) => a - b)
    .map(([pick, rows]) => recommendationGroup(
      draftPositionLabel(pick, normalization),
      rows,
      { draft_pick: pick },
    ));
  const zoneRecords = DRAFT_ZONES.flatMap(zone => {
    const rows = zoneGroups.get(zone.key) || [];
    return rows.length
      ? [recommendationGroup(zone.label, rows, { zone_key: zone.key, zone: zone.label })]
      : [];
  });
  const bestPick = pickRecords.slice().sort(compareRecommendationGroups)[0];
  const bestZone = zoneRecords.slice().sort(compareRecommendationGroups)[0];
  const bestRepeatPick = pickRecords.filter(row => row.n >= 2).sort(compareRecommendationGroups)[0] || null;
  const bestRepeatZone = zoneRecords.filter(row => row.n >= 2).sort(compareRecommendationGroups)[0] || null;
  const worstZone = zoneRecords.length > 1
    ? zoneRecords.slice().sort((a, b) => a.avg_finish_score - b.avg_finish_score || b.saunders - a.saunders)[0]
    : null;

  let target;
  let recommendation;
  if (ownerRows.length === 1) {
    const only = ownerRows[0];
    const leagueBest = summarizeDraftPicks(leagueRows, normalization)
      .slice()
      .sort((a, b) => b.avg_finish_score - a.avg_finish_score
        || b.playoff_rate - a.playoff_rate
        || b.championships - a.championships
        || Number(a.draft_pick) - Number(b.draft_pick))[0];
    const fallbackLabel = draftPositionLabel(leagueBest?.draft_pick || bestPick.draft_pick, normalization);
    target = `League-wide fallback: ${fallbackLabel}`;
    recommendation = `Only one owner-specific sample: ${draftPositionLabel(draftPickBucket(only, normalization), normalization)} in ${only.season}, finish ${only.finish}. Use league-wide history first; ${fallbackLabel} has the best observed finish score.`;
  } else if (
    bestRepeatPick
    && bestRepeatPick.n >= 3
    && bestRepeatPick.avg_finish_score >= bestZone.avg_finish_score - 0.03
  ) {
    target = bestRepeatPick.label;
    recommendation = `Target ${bestRepeatPick.label} specifically. Repeat sample: avg finish ${bestRepeatPick.avg_finish.toFixed(1)}, playoffs ${bestRepeatPick.playoffs}/${bestRepeatPick.n}, titles ${bestRepeatPick.titles}.`;
  } else if (bestPick.n === 1 && bestRepeatZone) {
    target = `${bestPick.label} upside; ${bestRepeatZone.label} repeat zone`;
    recommendation = `Best single result is ${bestPick.label}, but the sturdier area is ${bestRepeatZone.label} (avg finish ${bestRepeatZone.avg_finish.toFixed(1)}, n=${bestRepeatZone.n}).`;
  } else {
    target = bestZone.label;
    recommendation = `Target ${bestZone.label}. It is this owner's best observed zone: avg finish ${bestZone.avg_finish.toFixed(1)}, playoffs ${bestZone.playoffs}/${bestZone.n}, titles ${bestZone.titles}.`;
  }

  let caution = worstZone
    ? `Weakest area: ${worstZone.label} (avg finish ${worstZone.avg_finish.toFixed(1)}, n=${worstZone.n}).`
    : 'No clear avoid zone yet.';
  if (ownerRows.length <= 2) caution = `${caution} Sample is too small for a firm owner-specific read.`;

  return {
    owner,
    target,
    recommendation,
    caution,
    best_pick: bestPick,
    best_zone: bestZone,
    history: ownerRows.slice().sort((a, b) => a.season - b.season).map(row => ({
      season: row.season,
      draft_pick: row.draft_pick,
      finish: row.finish,
      champion: row.champion,
      saunders: row.saunders,
      made_playoffs: row.made_playoffs,
    })),
    confidence: confidenceForSample(ownerRows.length),
  };
}

function pearson(rows: DraftSpotRow[], x: keyof DraftSpotRow, y: keyof DraftSpotRow): number {
  if (rows.length < 2) return 0;
  const xMean = average(rows, x);
  const yMean = average(rows, y);
  const numerator = rows.reduce((sum, row) => sum + (Number(row[x]) - xMean) * (Number(row[y]) - yMean), 0);
  const xSpread = Math.sqrt(rows.reduce((sum, row) => sum + ((Number(row[x]) - xMean) ** 2), 0));
  const ySpread = Math.sqrt(rows.reduce((sum, row) => sum + ((Number(row[y]) - yMean) ** 2), 0));
  return xSpread && ySpread ? numerator / (xSpread * ySpread) : 0;
}

function applyMode(
  state: DraftSpotState,
  pickSummary: DraftSummary[],
  zoneSummary: DraftSummary[],
): DraftSpotState {
  if (state.mode === 'pick') {
    const requestedPick = state.selectedPick && pickSummary.some(row => row.draft_pick === state.selectedPick)
      ? state.selectedPick
      : null;
    return {
      ...state,
      selectedPick: requestedPick
        || rankSummaries(qualified(pickSummary, state.minSample), state.metric)[0]?.draft_pick
        || null,
      selectedZone: null,
    };
  }
  if (state.mode === 'zone') {
    const requestedZone = state.selectedZone && zoneSummary.some(row => row.zone_key === state.selectedZone)
      ? state.selectedZone
      : null;
    return {
      ...state,
      selectedPick: null,
      selectedZone: requestedZone
        || rankSummaries(qualified(zoneSummary, state.minSample), state.metric)[0]?.zone_key
        || null,
    };
  }
  return { ...state, selectedPick: null, selectedZone: null };
}

export function buildDraftSpotModel(
  asset: DraftSpot,
  requested: (Partial<DraftSpotState> & DraftSpotUrlState) = {},
  current: Partial<DraftSpotState> = {},
): DraftSpotViewModel {
  const resolved = resolveDraftSpotState(asset, requested, current);
  const rangeRows = filterDraftRows(asset.rows, {
    startSeason: resolved.startSeason,
    endSeason: resolved.endSeason,
  });
  const baseRows = filterDraftRows(rangeRows, { owner: resolved.owner });
  const pickSummary = summarizeDraftPicks(baseRows, resolved.normalize);
  const zoneSummary = summarizeDraftZones(baseRows, resolved.normalize);
  const state = applyMode(resolved, pickSummary, zoneSummary);
  const rows = filterDraftRows(baseRows, state);
  const rankedPicks = rankSummaries(qualified(pickSummary, state.minSample), state.metric);
  const rankedZones = rankSummaries(qualified(zoneSummary, state.minSample), state.metric);
  const recommendationOwners = state.owner === DRAFT_ALL_OWNERS
    ? [...new Set(rangeRows.map(row => row.owner))].sort((a, b) => a.localeCompare(b))
    : [state.owner];
  const ownerRecommendations = recommendationOwners.flatMap(owner => {
    const recommendation = buildOwnerRecommendation(
      owner,
      rangeRows.filter(row => row.owner === owner),
      rangeRows,
      state.normalize,
    );
    return recommendation ? [recommendation] : [];
  });
  const recommendationByOwner = new Map(ownerRecommendations.map(row => [row.owner, row]));
  const ownerProfile = state.owner === DRAFT_ALL_OWNERS
    ? null
    : {
        owner: state.owner,
        rows: baseRows.filter(row => row.owner === state.owner).sort((a, b) => a.season - b.season),
        recommendation: recommendationByOwner.get(state.owner) || null,
      };
  const seasons = [...new Set(baseRows.map(row => row.season))].sort((a, b) => a - b);
  const title = state.mode === 'pick' && state.selectedPick
    ? `${draftPositionLabel(state.selectedPick, state.normalize)} Draft Spot`
    : state.mode === 'zone' && state.selectedZone
      ? `${DRAFT_ZONES.find(zone => zone.key === state.selectedZone)?.label} Draft Spot`
      : state.owner !== DRAFT_ALL_OWNERS
        ? `${state.owner}'s Draft Spot Profile`
        : 'Draft Spot Explorer';
  const bestAvgPick = rankSummaries(qualified(pickSummary, state.minSample), 'avgFinish')[0] || null;
  const bestPlayoffPick = rankSummaries(qualified(pickSummary, state.minSample), 'playoffRate')[0] || null;
  const saundersPick = qualified(pickSummary, state.minSample)
    .slice()
    .sort((a, b) => b.saunders_rate - a.saunders_rate || b.saunders_count - a.saunders_count)[0]
    || null;

  return {
    asset,
    state,
    seasons: draftSeasons(asset),
    owners: draftOwners(asset),
    picks: draftPicks(asset),
    rows,
    baseRows,
    pickSummary,
    zoneSummary,
    rankedPicks,
    rankedZones,
    selectedPickSummary: state.selectedPick
      ? pickSummary.find(row => row.draft_pick === state.selectedPick) || null
      : null,
    selectedZoneSummary: state.selectedZone
      ? zoneSummary.find(row => row.zone_key === state.selectedZone) || null
      : null,
    detailRows: state.selectedPick || state.selectedZone ? rows : [],
    ownerProfile,
    ownerRecommendations,
    hero: {
      title,
      subtitle: seasons.length
        ? `${state.mode[0].toUpperCase()}${state.mode.slice(1)} mode · ${seasons[0]}–${seasons.at(-1)} · ${baseRows.length} owner-seasons`
        : 'No draft rows match the current filters',
      read: 'These are observed league results, not causal draft-slot predictions. Sample size and team-count normalization stay visible throughout.',
      bestAvgPick,
      bestPlayoffPick,
      saundersPick,
      bestZone: rankSummaries(qualified(zoneSummary, state.minSample), 'avgFinish')[0] || null,
      correlation: pearson(baseRows, 'draft_percentile', 'finish_score'),
      pointCorrelation: pearson(baseRows, 'draft_percentile', 'points_z'),
    },
  };
}
