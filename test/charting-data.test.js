import test from 'node:test';
import assert from 'node:assert/strict';

import {
  currentOddsMovementRows,
  currentProjectedSeedRows,
  currentSeedMovementRows,
  dynastyTrendRows,
  gauntletHistogramRows,
  rivalryLeadRows,
  trophyCareerRows,
} from '../js/charting/chart-data.js';

test('dynastyTrendRows flattens visible owner series and honors hidden owners', () => {
  const rows = dynastyTrendRows({
    hiddenOwners: ['Shap'],
    series: [
      {
        owner: 'Joe',
        color: '#2563eb',
        finalScore: 12,
        points: [{ season: 2024, seasonScore: 5, cumulativeScore: 5 }, { season: 2025, seasonScore: 7, cumulativeScore: 12 }],
      },
      {
        owner: 'Shap',
        color: '#f59e0b',
        finalScore: 9,
        points: [{ season: 2024, seasonScore: 9, cumulativeScore: 9 }],
      },
    ],
  });

  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map(row => row.owner), ['Joe', 'Joe']);
  assert.equal(rows[1].cumulativeScore, 12);
});

test('gauntletHistogramRows creates tidy bins and mean markers', () => {
  const payload = gauntletHistogramRows(
    { scoresA: [100, 110, 120], scoresB: [90, 95, 105] },
    { owner: 'Joe', season: 2025, mean: 110 },
    { owner: 'Joel', season: 2025, mean: 96.67 },
    { bins: 3 }
  );

  assert.equal(payload.means.length, 2);
  assert.equal(payload.rows.some(row => row.owner === 'Joe' && row.count > 0), true);
  assert.deepEqual(payload.domain, [90, 120]);
  assert.equal(payload.maxCount > 0, true);
});

test('trophy, rivalry, and current-season chart rows preserve labels and selected owner state', () => {
  const trophy = trophyCareerRows({
    careerShape: {
      rows: [
        { season: 2024, finish: '1', label: 'Champion', tier: 'champion', record: '10-4', playoffCutoff: 6 },
        { season: 2025, finish: '8', label: 'Mid-table', tier: 'mid', record: '6-8', playoffCutoff: 6 },
      ],
    },
  });
  assert.equal(trophy[0].tier, 'champion');
  assert.equal(trophy[1].tier, 'miss');

  const rivalry = rivalryLeadRows({ teamA: 'Joe', teamB: 'Joel' }, [
    { date: '2025-09-07', lead: 1, result: 'W', winner: 'Joe', score: '110 - 100' },
    { date: '2025-09-14', lead: 0, result: 'L', winner: 'Joel', score: '100 - 90' },
  ]);
  assert.equal(rivalry[0].spread, 'Joe + 1');
  assert.match(rivalry[1].title, /Series spread: Tied/);

  const view = {
    commandCenter: {
      selectedOwner: 'Joe',
      liveMovement: [{ owner: 'Joe', previousSeed: 4, projectedSeed: 2, seedChange: 2, projectedRecord: '8-6' }],
      projectedStandings: [{ owner: 'Joel', projectedRank: 1, currentSeed: 2, seedChange: 1, projectedPointsFor: 1500, projectedRecord: '9-5', currentRecord: '8-6' }],
    },
  };
  assert.equal(currentSeedMovementRows(view)[0].isSelected, true);
  assert.equal(currentProjectedSeedRows(view)[0].isSelected, false);

  view.commandCenter.odds = {
    movement: [{
      owner: 'Joe',
      previousPlayoffOdds: 0.4,
      playoffOdds: 0.65,
      playoffChange: 0.25,
    }],
  };
  assert.equal(currentOddsMovementRows(view)[0].playoffChange, 25);
  assert.equal(currentOddsMovementRows(view)[0].isSelected, true);
});
