import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildDraftSpotModel,
  draftMetricValue,
  filterDraftRows,
  rankDraftPicks,
  resolveDraftSpotState,
  summarizeDraftPicks,
  summarizeDraftZones,
} from '../js/draft-spot-data.js';
import { draftSpotPath, readJson } from './test-helpers.js';

const asset = readJson(draftSpotPath);

test('DraftSpot asset covers expected seasons, picks, and rows', () => {
  assert.equal(asset.team_seasons, 92);
  assert.equal(asset.season_range.start, 2017);
  assert.equal(asset.season_range.end, 2025);
  assert.equal(asset.rows.some(row => row.season < 2017), false);
  assert.equal(asset.pick_summary.find(row => row.draft_pick === 11).n, 1);
  assert.equal(asset.pick_summary.find(row => row.draft_pick === 12).n, 1);
  assert.equal(typeof asset.pick_summary[0].playoff_rate, 'number');
  assert.equal(asset.owner_recommendations.every(row => row.confidence), true);
});

test('filterDraftRows filters by season, owner, pick, and zone', () => {
  const rows = asset.rows;
  const recentJoe = filterDraftRows(rows, {
    owner: 'Joe',
    startSeason: 2021,
    endSeason: 2025,
  });
  assert.deepEqual(recentJoe.map(row => row.season), [2021, 2022, 2023, 2024, 2025]);
  assert.equal(recentJoe.every(row => row.owner === 'Joe'), true);

  const pickTen = filterDraftRows(rows, { selectedPick: 10 });
  assert.equal(pickTen.length, 9);
  assert.equal(pickTen.every(row => row.draft_pick === 10), true);

  const late = filterDraftRows(rows, { selectedZone: 'late' });
  assert.equal(late.length, 29);
  assert.equal(late.every(row => row.zone_key === 'late'), true);
});

test('summaries recompute from filtered rows', () => {
  const rows = filterDraftRows(asset.rows, { startSeason: 2025, endSeason: 2025 });
  const picks = summarizeDraftPicks(rows);
  const zones = summarizeDraftZones(rows);

  assert.equal(picks.length, 12);
  assert.equal(picks.every(row => row.n === 1), true);
  assert.equal(Number.isFinite(picks[0].avg_draft_percentile), true);
  assert.deepEqual(zones.map(row => `${row.zone_key}:${row.n}`), ['early:3', 'middle:4', 'late:5']);
  assert.equal(Number.isFinite(zones[0].avg_draft_percentile), true);
  assert.equal(Number.isFinite(zones[0].championships), true);
});

test('ranking honors metric direction and sample fallback', () => {
  const summaries = [
    { draft_pick: 1, n: 3, avg_finish: 2, playoff_rate: 0.25, saunders_rate: 0.5 },
    { draft_pick: 2, n: 3, avg_finish: 4, playoff_rate: 0.75, saunders_rate: 0.25 },
  ];
  assert.equal(rankDraftPicks(summaries, 'avgFinish')[0].draft_pick, 1);
  assert.equal(rankDraftPicks(summaries, 'playoffRate')[0].draft_pick, 2);
  assert.equal(rankDraftPicks(summaries, 'saundersRate')[0].draft_pick, 2);
  assert.equal(draftMetricValue(summaries[0], 'avgFinish'), 2);
});

test('resolveDraftSpotState safely falls back from invalid URL state', () => {
  const resolved = resolveDraftSpotState(asset, {
    draftOwner: 'NotReal',
    draftStart: 2014,
    draftEnd: 2025,
    draftMetric: 'notMetric',
    draftPick: 200,
    draftZone: 'middle',
    draftMinSample: 99,
    draftNormalize: 'percentile',
  });
  assert.equal(resolved.owner, '__ALL__');
  assert.equal(resolved.startSeason, 2017);
  assert.equal(resolved.endSeason, 2025);
  assert.equal(resolved.metric, 'avgFinish');
  assert.equal(resolved.selectedPick, null);
  assert.equal(resolved.selectedZone, 'middle');
  assert.equal(resolved.minSample, 1);
  assert.equal(resolved.normalize, 'percentile');
});

test('buildDraftSpotModel returns selected pick and owner profile view models', () => {
  const model = buildDraftSpotModel(asset, {
    state: {
      owner: 'Joe',
      startSeason: 2017,
      endSeason: 2025,
      selectedPick: 6,
      metric: 'playoffRate',
      minSample: 2,
    },
  });

  assert.equal(model.state.owner, 'Joe');
  assert.equal(model.rows.every(row => row.owner === 'Joe' && row.draft_pick === 6), true);
  assert.equal(model.selectedPickSummary.draft_pick, 6);
  assert.equal(model.ownerProfile.owner, 'Joe');
  assert.equal(model.ownerProfile.rows.length, 9);
  assert.equal(model.rankedPicks[0].n >= 2, true);
});

test('buildDraftSpotModel applies mode-specific pick and zone selections', () => {
  const pickMode = buildDraftSpotModel(asset, {
    state: {
      mode: 'pick',
      startSeason: 2017,
      endSeason: 2025,
      metric: 'playoffRate',
      minSample: 2,
    },
  });
  assert.equal(pickMode.state.mode, 'pick');
  assert.equal(Number.isFinite(pickMode.state.selectedPick), true);
  assert.equal(pickMode.state.selectedZone, null);
  assert.equal(pickMode.rows.every(row => row.draft_pick === pickMode.state.selectedPick), true);

  const zoneMode = buildDraftSpotModel(asset, {
    state: {
      mode: 'zone',
      startSeason: 2017,
      endSeason: 2025,
      metric: 'avgFinish',
      minSample: 2,
    },
  });
  assert.equal(zoneMode.state.mode, 'zone');
  assert.equal(zoneMode.state.selectedPick, null);
  assert.ok(['early', 'middle', 'late'].includes(zoneMode.state.selectedZone));
  assert.equal(zoneMode.rows.every(row => row.zone_key === zoneMode.state.selectedZone), true);

  const leagueMode = buildDraftSpotModel(asset, {
    state: {
      mode: 'league',
      startSeason: 2017,
      endSeason: 2025,
      selectedPick: 10,
      selectedZone: 'late',
    },
  });
  assert.equal(leagueMode.state.selectedPick, null);
  assert.equal(leagueMode.state.selectedZone, null);
  assert.equal(leagueMode.rows.length, leagueMode.baseRows.length);
});

test('championship metric ranks zones by championship counts', () => {
  const model = buildDraftSpotModel(asset, {
    state: {
      metric: 'championships',
      startSeason: 2017,
      endSeason: 2025,
    },
  });
  const late = model.zoneSummary.find(row => row.zone_key === 'late');
  assert.equal(late.championships, 5);
  assert.equal(model.rankedZones[0].zone_key, 'late');
  assert.equal(model.rankedZones[0].championships, 5);
});
