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
  assert.deepEqual(zones.map(row => `${row.zone_key}:${row.n}`), ['early:3', 'middle:4', 'late:5']);
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
