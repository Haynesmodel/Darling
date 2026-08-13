import test from 'node:test';
import assert from 'node:assert/strict';

import {
  currentOddsMovementRows,
  currentProjectedSeedRows,
  currentSeedMovementRows,
  dynastyTrendRows,
  gauntletHistogramRows,
  histogramBins,
  rivalryLeadRows,
  trophyCareerRows,
} from '../src/charting/chart-data.ts';
import { gauntletHistogramRows as featureGauntletHistogramRows } from '../src/features/gauntlet/gauntlet-histogram-data.ts';

test('dynastyTrendRows flattens visible owner series and honors hidden owners', () => {
  const rows = dynastyTrendRows({
    hiddenOwners: ['Shap'],
    series: [
      {
        owner: 'Joe',
        color: '#2563eb',
        finalScore: 12,
        points: [{ season: 2024, seasonScore: 5, cumulativeScore: 5 }, { season: 2025, seasonScore: 2, cumulativeScore: 7 }],
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
  assert.equal(rows[1].cumulativeScore, 7);
  assert.equal(rows[1].title, 'Joe: 7 through 2025');
});

test('dynastyTrendRows handles absent, invalid, hidden, and profiled point data', () => {
  assert.deepEqual(dynastyTrendRows(), []);
  assert.deepEqual(dynastyTrendRows({ hiddenOwners: null, series: null }, { hiddenOwners: null }), []);

  const rows = dynastyTrendRows({
    hiddenOwners: ['Joe'],
    series: [
      {
        owner: 'Joe',
        hidden: true,
        points: [{ season: 'bad', seasonScore: 'bad', cumulativeScore: Infinity, profile: { season: 2025 } }],
      },
      { owner: 'Empty' },
    ],
  }, { hiddenOwners: ['Joe'], includeHidden: true });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].season, 'bad');
  assert.equal(rows[0].seasonScore, 0);
  assert.equal(rows[0].cumulativeScore, 0);
  assert.equal(rows[0].finalScore, 0);
  assert.deepEqual(rows[0].profile, { season: 2025 });
  assert.equal(rows[0].title, 'Joe: 0 through bad');
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

test('gauntlet histogram data handles empty, constant, bounded, and custom-bin inputs', () => {
  assert.deepEqual(histogramBins([]), []);
  assert.deepEqual(histogramBins([7, 7, Number.NaN]), [{ start: 6.5, end: 7.5, count: 2 }]);

  const bounded = histogramBins([-5, 0, 5, 10, 15], { bins: 2, min: 0, max: 10 });
  assert.deepEqual(bounded.map(bin => bin.count), [2, 3]);
  assert.equal(histogramBins([1, 2], { bins: 100 }).length, 50);
  assert.equal(histogramBins([1, 2], { bins: 0 }).length, 1);

  assert.deepEqual(gauntletHistogramRows(null, null, null), {
    rows: [], means: [], domain: [0, 1], maxCount: 0,
  });
  assert.deepEqual(gauntletHistogramRows(
    { scoresA: [], scoresB: [] },
    { owner: 'A', season: 2025, mean: 0 },
    { owner: 'B', season: 2025, mean: 0 },
  ), { rows: [], means: [], domain: [0, 1], maxCount: 0 });

  const custom = gauntletHistogramRows(
    { scoresA: [1, 2, Number.NaN], scoresB: [8, 9] },
    { owner: 'A', season: 2025, mean: 1.5 },
    { owner: 'B', season: 2025, mean: 8.5 },
    { bins: 2, min: 0, max: 10 },
  );
  assert.deepEqual(custom.domain, [0, 10]);
  assert.equal(custom.rows.length, 4);
});

test('feature-local gauntlet histogram data preserves typed titles across edge inputs', () => {
  const teams = [
    { owner: 'Joe', season: 2025, mean: 10 },
    { owner: 'Joel', season: 2025, mean: 10 },
  ];
  assert.deepEqual(featureGauntletHistogramRows(null, teams[0], teams[1]), {
    rows: [], means: [], domain: [0, 1], maxCount: 0,
  });
  assert.deepEqual(featureGauntletHistogramRows({}, teams[0], teams[1]), {
    rows: [], means: [], domain: [0, 1], maxCount: 0,
  });
  const constant = featureGauntletHistogramRows({ scoresA: [10, Number.NaN], scoresB: [10] }, teams[0], teams[1]);
  assert.equal(constant.rows.length, 2);
  assert.match(constant.rows[0].title, /Joe 2025/);
  assert.match(constant.means[1].title, /Joel 2025/);
  const oneSided = featureGauntletHistogramRows({ scoresA: [8], scoresB: [] }, teams[0], teams[1]);
  assert.equal(oneSided.rows.length, 1);
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
  const fallbackRivalry = rivalryLeadRows({ teamA: 'Joe', teamB: 'Joel' }, [{ date: '2025-09-21', lead: -2 }])[0];
  assert.deepEqual(
    [fallbackRivalry.season, fallbackRivalry.result, fallbackRivalry.winner, fallbackRivalry.score, fallbackRivalry.type, fallbackRivalry.round, fallbackRivalry.spread],
    [0, 'T', 'Tie', '', '', '', 'Joel + 2'],
  );

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
