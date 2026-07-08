const DRAFT_ALL_OWNERS = '__ALL__';

const DRAFT_ZONES = Object.freeze([
  { key: 'early', label: 'Early (1-3)' },
  { key: 'middle', label: 'Middle (4-7)' },
  { key: 'late', label: 'Late (8+)' },
]);

const DRAFT_VIEW_MODES = Object.freeze([
  { key: 'league', label: 'League' },
  { key: 'owner', label: 'Owner' },
  { key: 'pick', label: 'Pick' },
  { key: 'zone', label: 'Zone' },
]);

const DRAFT_METRICS = Object.freeze({
  avgFinish: {
    key: 'avgFinish',
    label: 'Avg Finish',
    summaryField: 'avg_finish',
    rowField: 'finish',
    lowerIsBetter: true,
  },
  playoffRate: {
    key: 'playoffRate',
    label: 'Playoff Rate',
    summaryField: 'playoff_rate',
    rowField: 'made_playoffs',
    lowerIsBetter: false,
  },
  topThreeRate: {
    key: 'topThreeRate',
    label: 'Top 3 Rate',
    summaryField: 'top_three_rate',
    rowField: 'top_three',
    lowerIsBetter: false,
  },
  championships: {
    key: 'championships',
    label: 'Championship Count',
    summaryField: 'championships',
    rowField: 'champion',
    lowerIsBetter: false,
  },
  saundersRate: {
    key: 'saundersRate',
    label: 'Saunders Rate',
    summaryField: 'saunders_rate',
    rowField: 'saunders',
    lowerIsBetter: true,
  },
  pointsZ: {
    key: 'pointsZ',
    label: 'Points z-score',
    summaryField: 'avg_points_z',
    rowField: 'points_z',
    lowerIsBetter: false,
  },
  winsAboveAvg: {
    key: 'winsAboveAvg',
    label: 'Wins Above Average',
    summaryField: 'avg_wins_above_avg',
    rowField: 'wins_above_avg',
    lowerIsBetter: false,
  },
});

const DEFAULT_DRAFT_STATE = Object.freeze({
  owner: DRAFT_ALL_OWNERS,
  mode: 'league',
  metric: 'avgFinish',
  minSample: 1,
  normalize: 'raw',
  selectedPick: null,
  selectedZone: null,
});

function isFiniteNumber(value) {
  return Number.isFinite(Number(value));
}

function numberOrNull(value) {
  return isFiniteNumber(value) ? Number(value) : null;
}

function zoneKey(value) {
  const normalized = String(value || '').toLowerCase();
  if (['early', 'middle', 'late'].includes(normalized)) return normalized;
  if (normalized.includes('early')) return 'early';
  if (normalized.includes('middle')) return 'middle';
  if (normalized.includes('late')) return 'late';
  return null;
}

function zoneLabel(key) {
  return DRAFT_ZONES.find(zone => zone.key === key)?.label || key || '';
}

function normalizeDraftRow(row = {}) {
  const resolvedZoneKey = row.zone_key || zoneKey(row.zone) || zoneKey(row.zone_label);
  return {
    ...row,
    season: Number(row.season),
    draft_pick: Number(row.draft_pick),
    team_count: Number(row.team_count),
    zone_key: resolvedZoneKey,
    zone: row.zone || zoneLabel(resolvedZoneKey),
    wins: Number(row.wins),
    losses: Number(row.losses),
    ties: Number(row.ties),
    finish: Number(row.finish),
    points_for: Number(row.points_for),
    points_against: Number(row.points_against),
    win_pct: Number(row.win_pct),
    finish_score: Number(row.finish_score),
    draft_percentile: Number(row.draft_percentile),
    points_rank: Number(row.points_rank),
    points_score: Number(row.points_score),
    points_z: Number(row.points_z),
    wins_above_avg: Number(row.wins_above_avg),
    champion: !!row.champion,
    saunders: !!row.saunders,
    made_playoffs: !!row.made_playoffs,
    top_three: !!row.top_three,
  };
}

function normalizeDraftAsset(asset) {
  if (!asset || typeof asset !== 'object') return null;
  const rows = Array.isArray(asset.rows) ? asset.rows.map(normalizeDraftRow) : [];
  return {
    ...asset,
    rows,
    pick_summary: Array.isArray(asset.pick_summary) ? asset.pick_summary : [],
    zone_summary: Array.isArray(asset.zone_summary) ? asset.zone_summary : [],
    owner_recommendations: Array.isArray(asset.owner_recommendations) ? asset.owner_recommendations : [],
  };
}

function draftSeasons(asset) {
  return [...new Set((asset?.rows || []).map(row => Number(row.season)).filter(Number.isFinite))].sort((a, b) => a - b);
}

function draftOwners(asset) {
  return [...new Set((asset?.rows || []).map(row => row.owner).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function draftPicks(asset) {
  return [...new Set((asset?.rows || []).map(row => Number(row.draft_pick)).filter(Number.isFinite))].sort((a, b) => a - b);
}

function filterDraftRows(rows = [], filters = {}) {
  const owner = filters.owner || DRAFT_ALL_OWNERS;
  const startSeason = numberOrNull(filters.startSeason);
  const endSeason = numberOrNull(filters.endSeason);
  const selectedPick = numberOrNull(filters.selectedPick ?? filters.pick);
  const selectedZone = zoneKey(filters.selectedZone ?? filters.zone);

  return rows.filter(row => {
    if (startSeason !== null && row.season < startSeason) return false;
    if (endSeason !== null && row.season > endSeason) return false;
    if (owner && owner !== DRAFT_ALL_OWNERS && row.owner !== owner) return false;
    if (selectedPick !== null && row.draft_pick !== selectedPick) return false;
    if (selectedPick === null && selectedZone && row.zone_key !== selectedZone) return false;
    return true;
  });
}

function avg(rows, field) {
  if (!rows.length) return 0;
  return rows.reduce((total, row) => total + Number(row[field] || 0), 0) / rows.length;
}

function boolRate(rows, field) {
  if (!rows.length) return 0;
  return rows.filter(row => !!row[field]).length / rows.length;
}

function summarizeDraftPicks(rows = []) {
  const groups = new Map();
  rows.forEach(row => {
    const group = groups.get(row.draft_pick) || [];
    group.push(row);
    groups.set(row.draft_pick, group);
  });
  return [...groups.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([draftPick, group]) => ({
      draft_pick: draftPick,
      n: group.length,
      avg_finish: avg(group, 'finish'),
      avg_finish_score: avg(group, 'finish_score'),
      avg_wins_above_avg: avg(group, 'wins_above_avg'),
      avg_points_z: avg(group, 'points_z'),
      top_three_rate: boolRate(group, 'top_three'),
      playoff_rate: boolRate(group, 'made_playoffs'),
      championships: group.filter(row => row.champion).length,
      champion_rate: boolRate(group, 'champion'),
      saunders_count: group.filter(row => row.saunders).length,
      saunders_rate: boolRate(group, 'saunders'),
    }));
}

function summarizeDraftZones(rows = []) {
  const groups = new Map();
  rows.forEach(row => {
    const group = groups.get(row.zone_key) || [];
    group.push(row);
    groups.set(row.zone_key, group);
  });
  return DRAFT_ZONES
    .map(zone => {
      const group = groups.get(zone.key) || [];
      if (!group.length) return null;
      return {
        zone_key: zone.key,
        zone: zone.label,
        n: group.length,
        avg_pick: avg(group, 'draft_pick'),
        avg_finish: avg(group, 'finish'),
        avg_finish_score: avg(group, 'finish_score'),
        avg_wins_above_avg: avg(group, 'wins_above_avg'),
        avg_points_z: avg(group, 'points_z'),
        top_three_rate: boolRate(group, 'top_three'),
        playoff_rate: boolRate(group, 'made_playoffs'),
        champion_rate: boolRate(group, 'champion'),
        saunders_rate: boolRate(group, 'saunders'),
      };
    })
    .filter(Boolean);
}

function draftMetricValue(rowOrSummary, metric = 'avgFinish') {
  const def = DRAFT_METRICS[metric] || DRAFT_METRICS.avgFinish;
  if (Object.prototype.hasOwnProperty.call(rowOrSummary || {}, def.summaryField)) {
    return Number(rowOrSummary[def.summaryField]);
  }
  const value = rowOrSummary?.[def.rowField];
  if (typeof value === 'boolean') return value ? 1 : 0;
  return Number(value || 0);
}

function rankDraftPicks(summary = [], metric = 'avgFinish') {
  const def = DRAFT_METRICS[metric] || DRAFT_METRICS.avgFinish;
  return [...summary].sort((a, b) => {
    const av = draftMetricValue(a, metric);
    const bv = draftMetricValue(b, metric);
    if (av !== bv) return def.lowerIsBetter ? av - bv : bv - av;
    if ((b.n || 0) !== (a.n || 0)) return (b.n || 0) - (a.n || 0);
    return (a.draft_pick || 0) - (b.draft_pick || 0);
  });
}

function rankDraftZones(summary = [], metric = 'avgFinish') {
  const def = DRAFT_METRICS[metric] || DRAFT_METRICS.avgFinish;
  return [...summary].sort((a, b) => {
    const av = metric === 'championships' ? Number(a.champion_rate || 0) : draftMetricValue(a, metric);
    const bv = metric === 'championships' ? Number(b.champion_rate || 0) : draftMetricValue(b, metric);
    if (av !== bv) return def.lowerIsBetter ? av - bv : bv - av;
    if ((b.n || 0) !== (a.n || 0)) return (b.n || 0) - (a.n || 0);
    return DRAFT_ZONES.findIndex(zone => zone.key === a.zone_key) - DRAFT_ZONES.findIndex(zone => zone.key === b.zone_key);
  });
}

function buildOwnerDraftProfile(owner, rows = [], recommendations = []) {
  if (!owner || owner === DRAFT_ALL_OWNERS) return null;
  const ownerRows = rows.filter(row => row.owner === owner).sort((a, b) => a.season - b.season);
  const recommendation = recommendations.find(row => row.owner === owner) || null;
  const pickSummary = summarizeDraftPicks(ownerRows);
  const zoneSummary = summarizeDraftZones(ownerRows);
  return {
    owner,
    rows: ownerRows,
    recommendation,
    pickSummary,
    zoneSummary,
  };
}

function safePick(pick, picks) {
  const parsed = numberOrNull(pick);
  return parsed !== null && picks.includes(parsed) ? parsed : null;
}

function resolveDraftSpotState(assetInput, urlState = {}, currentState = {}) {
  const asset = normalizeDraftAsset(assetInput);
  const seasons = draftSeasons(asset);
  const owners = draftOwners(asset);
  const picks = draftPicks(asset);
  const minSeason = seasons[0] || null;
  const maxSeason = seasons[seasons.length - 1] || null;
  const merged = {
    ...DEFAULT_DRAFT_STATE,
    ...(currentState || {}),
    ...(urlState || {}),
  };

  let startSeason = numberOrNull(merged.draftStart ?? merged.startSeason);
  let endSeason = numberOrNull(merged.draftEnd ?? merged.endSeason);
  if (!startSeason || !seasons.includes(startSeason)) startSeason = minSeason;
  if (!endSeason || !seasons.includes(endSeason)) endSeason = maxSeason;
  if (startSeason !== null && endSeason !== null && startSeason > endSeason) {
    startSeason = minSeason;
    endSeason = maxSeason;
  }

  const requestedOwner = merged.draftOwner ?? merged.owner;
  const owner = owners.includes(requestedOwner)
    ? requestedOwner
    : DRAFT_ALL_OWNERS;
  const requestedMetric = merged.draftMetric ?? merged.metric;
  const requestedMode = merged.draftMode ?? merged.mode;
  const requestedMinSample = merged.draftMinSample ?? merged.minSample;
  const metric = DRAFT_METRICS[requestedMetric] ? requestedMetric : DEFAULT_DRAFT_STATE.metric;
  const mode = DRAFT_VIEW_MODES.some(item => item.key === requestedMode) ? requestedMode : DEFAULT_DRAFT_STATE.mode;
  const minSample = [1, 2, 3, 5].includes(Number(requestedMinSample))
    ? Number(requestedMinSample)
    : DEFAULT_DRAFT_STATE.minSample;
  const normalize = (merged.draftNormalize ?? merged.normalize) === 'percentile' ? 'percentile' : 'raw';
  const selectedPick = safePick(merged.draftPick ?? merged.selectedPick, picks);
  const selectedZone = selectedPick ? null : zoneKey(merged.draftZone ?? merged.selectedZone);

  return {
    owner,
    mode,
    startSeason,
    endSeason,
    metric,
    minSample,
    normalize,
    selectedPick,
    selectedZone,
  };
}

function qualified(summary, minSample) {
  const rows = summary.filter(row => Number(row.n || 0) >= minSample);
  return rows.length ? rows : summary;
}

function buildHeroModel(baseRows, pickSummary, zoneSummary, state, asset) {
  const minSample = Number(state.minSample || 1);
  const qualifiedPicks = qualified(pickSummary, minSample);
  const bestAvgPick = rankDraftPicks(qualifiedPicks, 'avgFinish')[0] || null;
  const bestPlayoffPick = rankDraftPicks(qualifiedPicks, 'playoffRate')[0] || null;
  const saundersPick = [...qualifiedPicks].sort((a, b) => {
    if ((b.saunders_rate || 0) !== (a.saunders_rate || 0)) return (b.saunders_rate || 0) - (a.saunders_rate || 0);
    return (b.saunders_count || 0) - (a.saunders_count || 0);
  })[0] || null;
  const bestZone = rankDraftZones(qualified(zoneSummary, minSample), 'avgFinish')[0] || null;
  const seasons = [...new Set(baseRows.map(row => row.season))].sort((a, b) => a - b);
  return {
    title: state.owner && state.owner !== DRAFT_ALL_OWNERS ? `${state.owner}'s Draft Spot Profile` : 'Draft Spot Explorer',
    subtitle: seasons.length ? `${seasons[0]}-${seasons[seasons.length - 1]}, ${baseRows.length} owner-seasons` : 'No draft rows',
    bestAvgPick,
    bestPlayoffPick,
    saundersPick,
    bestZone,
    correlation: asset?.correlations?.draft_percentile_finish_score ?? 0,
    pointCorrelation: asset?.correlations?.draft_percentile_points_z ?? 0,
    read: 'Draft slot has real league folklore value here, but the scoring correlation is weak. Treat the board as receipts, not destiny.',
  };
}

function buildDraftSpotModel(assetInput, opts = {}) {
  const asset = normalizeDraftAsset(assetInput);
  const state = resolveDraftSpotState(asset, opts.state || opts.urlState || {}, opts.currentState || {});
  const baseRows = filterDraftRows(asset?.rows || [], {
    owner: state.owner,
    startSeason: state.startSeason,
    endSeason: state.endSeason,
  });
  const rows = filterDraftRows(baseRows, {
    selectedPick: state.selectedPick,
    selectedZone: state.selectedZone,
  });
  const pickSummary = summarizeDraftPicks(baseRows);
  const zoneSummary = summarizeDraftZones(baseRows);
  const rankedPicks = rankDraftPicks(qualified(pickSummary, state.minSample), state.metric);
  const rankedZones = rankDraftZones(qualified(zoneSummary, state.minSample), state.metric);
  const selectedPickSummary = state.selectedPick ? pickSummary.find(row => row.draft_pick === state.selectedPick) || null : null;
  const selectedZoneSummary = state.selectedZone ? zoneSummary.find(row => row.zone_key === state.selectedZone) || null : null;
  const pickDetailRows = state.selectedPick
    ? filterDraftRows(baseRows, { selectedPick: state.selectedPick })
    : state.selectedZone
      ? filterDraftRows(baseRows, { selectedZone: state.selectedZone })
      : [];
  const ownerProfile = buildOwnerDraftProfile(state.owner, baseRows, asset?.owner_recommendations || []);
  const allOwnerRecommendations = asset?.owner_recommendations || [];

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
    selectedPickSummary,
    selectedZoneSummary,
    pickDetailRows,
    ownerProfile,
    ownerRecommendations: state.owner === DRAFT_ALL_OWNERS
      ? allOwnerRecommendations
      : allOwnerRecommendations.filter(row => row.owner === state.owner),
    hero: buildHeroModel(baseRows, pickSummary, zoneSummary, state, asset),
  };
}

export {
  DRAFT_ALL_OWNERS,
  DRAFT_METRICS,
  DRAFT_VIEW_MODES,
  DRAFT_ZONES,
  buildDraftSpotModel,
  buildOwnerDraftProfile,
  draftMetricValue,
  filterDraftRows,
  normalizeDraftAsset,
  rankDraftPicks,
  resolveDraftSpotState,
  summarizeDraftPicks,
  summarizeDraftZones,
};
