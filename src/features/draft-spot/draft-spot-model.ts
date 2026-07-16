import type { DraftSpot, DraftSpotRow } from '../../data/generated/asset-types';
import {
  DRAFT_ALL_OWNERS,
  type DraftMetricDefinition,
  type DraftMetricKey,
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
];

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
  return rows.filter(row => {
    if (filters.startSeason !== null && filters.startSeason !== undefined && row.season < filters.startSeason) return false;
    if (filters.endSeason !== null && filters.endSeason !== undefined && row.season > filters.endSeason) return false;
    if (filters.owner && filters.owner !== DRAFT_ALL_OWNERS && row.owner !== filters.owner) return false;
    if (filters.selectedPick !== null && filters.selectedPick !== undefined && row.draft_pick !== filters.selectedPick) return false;
    if ((filters.selectedPick === null || filters.selectedPick === undefined) && filters.selectedZone && row.zone_key !== filters.selectedZone) return false;
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

export function summarizeDraftPicks(rows: DraftSpotRow[]): DraftSummary[] {
  const groups = new Map<number, DraftSpotRow[]>();
  rows.forEach(row => groups.set(row.draft_pick, [...(groups.get(row.draft_pick) || []), row]));
  return [...groups.entries()]
    .sort(([a], [b]) => a - b)
    .map(([draftPick, group]) => ({ draft_pick: draftPick, ...summarize(group) }));
}

export function summarizeDraftZones(rows: DraftSpotRow[]): DraftSummary[] {
  const groups = new Map<string, DraftSpotRow[]>();
  rows.forEach(row => groups.set(row.zone_key, [...(groups.get(row.zone_key) || []), row]));
  return DRAFT_ZONES.flatMap(zone => {
    const group = groups.get(zone.key) || [];
    return group.length
      ? [{
          zone_key: zone.key,
          zone: zone.label,
          avg_pick: average(group, 'draft_pick'),
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

function applyMode(
  state: DraftSpotState,
  pickSummary: DraftSummary[],
  zoneSummary: DraftSummary[],
): DraftSpotState {
  if (state.mode === 'pick') {
    return {
      ...state,
      selectedPick: state.selectedPick
        || rankSummaries(qualified(pickSummary, state.minSample), state.metric)[0]?.draft_pick
        || null,
      selectedZone: null,
    };
  }
  if (state.mode === 'zone') {
    return {
      ...state,
      selectedPick: null,
      selectedZone: state.selectedZone
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
  const baseRows = filterDraftRows(asset.rows, {
    owner: resolved.owner,
    startSeason: resolved.startSeason,
    endSeason: resolved.endSeason,
  });
  const pickSummary = summarizeDraftPicks(baseRows);
  const zoneSummary = summarizeDraftZones(baseRows);
  const state = applyMode(resolved, pickSummary, zoneSummary);
  const rows = filterDraftRows(baseRows, state);
  const rankedPicks = rankSummaries(qualified(pickSummary, state.minSample), state.metric);
  const rankedZones = rankSummaries(qualified(zoneSummary, state.minSample), state.metric);
  const ownerProfile = state.owner === DRAFT_ALL_OWNERS
    ? null
    : {
        owner: state.owner,
        rows: baseRows.filter(row => row.owner === state.owner).sort((a, b) => a.season - b.season),
        recommendation: asset.owner_recommendations.find(row => row.owner === state.owner) || null,
      };
  const seasons = [...new Set(baseRows.map(row => row.season))].sort((a, b) => a - b);
  const title = state.mode === 'pick' && state.selectedPick
    ? `Pick ${state.selectedPick} Draft Spot`
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
    ownerRecommendations: state.owner === DRAFT_ALL_OWNERS
      ? asset.owner_recommendations
      : asset.owner_recommendations.filter(row => row.owner === state.owner),
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
      correlation: asset.correlations.draft_percentile_finish_score,
      pointCorrelation: asset.correlations.draft_percentile_points_z,
    },
  };
}
