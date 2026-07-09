import test from 'node:test';
import assert from 'node:assert/strict';

import * as chartVendor from '../js/charting/vendor/charting-vendor.js';
import {
  currentProjectedSeedPlotOptions,
  currentSeedMovementPlotOptions,
  dynastyTrendPlotOptions,
  gauntletHistogramPlotOptions,
  rivalryLeadPlotOptions,
  trophyCareerPlotOptions,
} from '../js/charting/plot-specs.js';

const { Plot } = chartVendor;

test('local chart vendor bundle exposes only Plot APIs', () => {
  assert.equal(typeof Plot.plot, 'function');
  assert.deepEqual(Object.keys(chartVendor), ['Plot']);
});

test('plot specs are deterministic plain option objects', () => {
  const dynastyRows = [
    { owner: 'Joe', season: 2024, cumulativeScore: 5, color: '#2563eb', title: 'Joe 2024' },
    { owner: 'Joe', season: 2025, cumulativeScore: 12, color: '#2563eb', title: 'Joe 2025' },
  ];
  const dynasty = dynastyTrendPlotOptions(dynastyRows, { seasonList: [2024, 2025], minScore: 0, maxScore: 14 });
  assert.equal(dynasty.marks[1].type, 'lineY');
  assert.deepEqual(dynasty.x.domain, [2024, 2025]);

  const gauntlet = gauntletHistogramPlotOptions({
    rows: [{ label: 'Joe 2025', center: 100, count: 2, title: 'bin' }],
    means: [{ label: 'Joe 2025', mean: 101, title: 'mean' }],
    domain: [90, 120],
    maxCount: 2,
  });
  assert.equal(gauntlet.marks.some(mark => mark.type === 'ruleX'), true);

  const trophy = trophyCareerPlotOptions([{ season: 2024, finish: 1, finishLabel: '1', tier: 'champion', title: 'champ' }]);
  assert.equal(trophy.y.domain[1], 1);

  const rivalry = rivalryLeadPlotOptions([{ index: 1, lead: 1, result: 'W', title: 'lead' }], { teamA: 'Joe', teamB: 'Joel' });
  assert.deepEqual(rivalry.y.domain, [-1, 1]);

  const movement = currentSeedMovementPlotOptions([{ owner: 'Joe', seedChange: 2, projectedSeed: 1, title: 'move' }]);
  assert.equal(movement.marks[1].type, 'barX');
  assert.equal(movement.marks[2].dx, 10);

  const projection = currentProjectedSeedPlotOptions([{ owner: 'Joe', projectedRank: 1, projectedRecord: '9-5', title: 'seed' }]);
  assert.equal(projection.marks[0].type, 'dot');
});
