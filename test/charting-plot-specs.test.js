import test from 'node:test';
import assert from 'node:assert/strict';

import * as chartVendor from '../js/charting/vendor/charting-vendor.js';
import {
  currentOddsMovementPlotOptions,
  currentProjectedSeedPlotOptions,
  currentSeedMovementPlotOptions,
  dynastyTrendPlotOptions,
  gauntletHistogramPlotOptions,
  rivalryLeadPlotOptions,
  trophyCareerPlotOptions,
} from '../js/charting/plot-specs.js';
import {
  renderCurrentOddsMovementPlot,
  renderCurrentProjectedStandingsPlot,
  renderCurrentSeedMovementPlot,
  renderDynastyTrendPlot,
  renderGauntletHistogramPlot,
  renderRivalryLeadPlot,
  renderTrophyCareerPlot,
} from '../js/charting/plot-charts.js';
import {
  clearChart,
  mountChart,
  renderChartEmpty,
  renderChartError,
} from '../js/charting/chart-runtime.js';

const APPROVED_EXPORTS = [
  'areaY',
  'barX',
  'barY',
  'dot',
  'lineY',
  'plot',
  'ruleX',
  'ruleY',
  'text',
];

test('local chart vendor exposes exactly the approved Plot functions', () => {
  assert.deepEqual(Object.keys(chartVendor).sort(), APPROVED_EXPORTS);
  APPROVED_EXPORTS.forEach(name => assert.equal(typeof chartVendor[name], 'function', name));
  assert.equal('Plot' in chartVendor, false);
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

  const odds = currentOddsMovementPlotOptions([{ owner: 'Joe', playoffChange: 25, title: 'odds' }]);
  assert.equal(odds.marks[1].type, 'barX');
});

function createChartHost() {
  const children = [];
  return {
    children,
    dataset: {},
    ownerDocument: {
      createElement(tagName) {
        return { tagName, className: '', textContent: '' };
      },
    },
    append(child) {
      children.push(child);
    },
    removeAttribute() {},
    replaceChildren(...nextChildren) {
      children.splice(0, children.length, ...nextChildren);
    },
  };
}

test('chart adapters render their feature-specific empty states', () => {
  const cases = [
    [host => renderDynastyTrendPlot(host), 'No dynasty trend data available.'],
    [host => renderGauntletHistogramPlot(host), 'No simulation data available.'],
    [host => renderTrophyCareerPlot(host), 'No seasons recorded.'],
    [host => renderRivalryLeadPlot(host), 'No recorded games between these teams.'],
    [host => renderCurrentSeedMovementPlot(host), 'No movement available.'],
    [host => renderCurrentProjectedStandingsPlot(host), 'No projection available.'],
    [host => renderCurrentOddsMovementPlot(host), 'No playoff odds movement available.'],
  ];

  cases.forEach(([render, message]) => {
    const host = createChartHost();
    assert.equal(render(host), null);
    assert.equal(host.dataset.chartState, 'empty');
    assert.equal(host.children.length, 1);
    assert.equal(host.children[0].className, 'chart-empty');
    assert.equal(host.children[0].textContent, message);
  });
});

test('chart runtime mounts accessible SVGs and contains empty and error states', () => {
  assert.equal(clearChart(null), undefined);
  assert.equal(mountChart(null, null), null);
  assert.equal(renderChartEmpty(null), undefined);
  assert.equal(renderChartError(null, new Error('ignored')), undefined);

  const noDocumentHost = {
    dataset: {},
    append() {},
    removeAttribute() {},
    replaceChildren() {},
  };
  assert.equal(renderChartEmpty(noDocumentHost), undefined);
  assert.equal(renderChartError(noDocumentHost, new Error('ignored')), undefined);

  const emptyHost = createChartHost();
  assert.equal(mountChart(emptyHost, null, { emptyMessage: 'Nothing to chart.' }), null);
  assert.equal(emptyHost.dataset.chartState, 'empty');
  assert.equal(emptyHost.children[0].textContent, 'Nothing to chart.');

  const removedLabels = [];
  const attributes = new Map();
  const classes = [];
  const nestedLabel = { removeAttribute: name => removedLabels.push(name) };
  const svg = {
    classList: { add: name => classes.push(name) },
    querySelectorAll: () => [nestedLabel],
    setAttribute: (name, value) => attributes.set(name, value),
  };
  const readyHost = createChartHost();
  assert.equal(mountChart(readyHost, svg, {
    ariaLabel: 'A tested chart',
    className: 'tested-chart',
  }), svg);
  assert.deepEqual(classes, ['tested-chart']);
  assert.equal(attributes.get('aria-label'), 'A tested chart');
  assert.equal(attributes.get('role'), 'img');
  assert.deepEqual(removedLabels, ['aria-label']);
  assert.equal(readyHost.dataset.chartState, 'ready');
  assert.deepEqual(readyHost.children, [svg]);

  const errorHost = createChartHost();
  renderChartError(errorHost, new Error('Plot failed'), 'Unable to render.');
  assert.equal(errorHost.dataset.chartState, 'error');
  assert.equal(errorHost.children[0].className, 'chart-error');
  assert.equal(errorHost.children[0].textContent, 'Unable to render.');
  assert.equal(errorHost.children[0].title, 'Plot failed');

  const messageLessErrorHost = createChartHost();
  renderChartError(messageLessErrorHost, null);
  assert.equal(messageLessErrorHost.children[0].title, undefined);
});
