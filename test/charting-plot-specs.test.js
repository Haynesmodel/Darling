import test from 'node:test';
import assert from 'node:assert/strict';

import * as chartVendor from '../src/charting/chart-vendor.ts';
import {
  currentOddsMovementPlotOptions,
  currentProjectedSeedPlotOptions,
  currentSeedMovementPlotOptions,
  dynastyTrendPlotOptions,
  gauntletHistogramPlotOptions,
  rivalryLeadPlotOptions,
  trophyCareerPlotOptions,
} from '../src/charting/plot-specs.ts';
import {
  renderCurrentOddsMovementPlot,
  renderCurrentProjectedStandingsPlot,
  renderCurrentSeedMovementPlot,
  renderDynastyTrendPlot,
  renderGauntletHistogramPlot,
  renderRivalryLeadPlot,
  renderTrophyCareerPlot,
} from '../src/charting/plot-charts.ts';
import {
  clearChart,
  mountChart,
  renderChartEmpty,
  renderChartError,
} from '../src/charting/chart-runtime.ts';
import { CHART_COLORS, chartFont, chartTheme, ownerColorScale } from '../src/charting/chart-theme.ts';

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
  ['areaY', 'barX', 'barY', 'dot', 'lineY', 'ruleX', 'ruleY', 'text'].forEach(name => {
    assert.ok(chartVendor[name]([], {}), name);
  });
});

test('plot specs are deterministic plain option objects', () => {
  const dynastyRows = [
    { owner: 'Joe', season: 2024, cumulativeScore: 5, color: '#2563eb', title: 'Joe 2024' },
    { owner: 'Joe', season: 2025, cumulativeScore: 12, color: '#2563eb', title: 'Joe 2025' },
    { owner: 'Shap', season: 2025, cumulativeScore: 8, color: '#f59e0b', title: 'Shap 2025' },
  ];
  const dynasty = dynastyTrendPlotOptions(dynastyRows, { seasonList: [2024, 2025], minScore: 0, maxScore: 14 });
  assert.equal(dynasty.marks[1].type, 'lineY');
  assert.deepEqual(dynasty.x.domain, [2024, 2025]);
  assert.equal(dynasty.marks[1].stroke(dynastyRows[0]), '#2563eb');
  assert.equal(dynasty.marks[1].stroke(dynastyRows[2]), '#f59e0b');
  assert.equal(dynasty.marks[2].fill(dynastyRows[2]), '#f59e0b');
  assert.equal(dynasty.x.tickFormat(2014), '2014');
  assert.equal(dynasty.x.tickFormat('2025'), '2025');
  assert.equal(dynasty.x.tickFormat(Number.NaN), '');

  const gauntlet = gauntletHistogramPlotOptions({
    rows: [{ label: 'Joe 2025', center: 100, count: 2, title: 'bin' }],
    means: [{ label: 'Joe 2025', mean: 101, title: 'mean' }],
    domain: [90, 120],
    maxCount: 2,
  });
  assert.equal(gauntlet.marks.some(mark => mark.type === 'ruleX'), true);
  assert.equal(gauntlet.marks[0].fill('Joe 2025'), CHART_COLORS.blue);
  assert.equal(gauntlet.marks[0].fill('Missing'), CHART_COLORS.slate);

  const trophy = trophyCareerPlotOptions([{ season: 2024, finish: 1, finishLabel: '1', tier: 'champion', title: 'champ' }]);
  assert.equal(trophy.y.domain[1], 1);
  assert.equal(trophy.marks[2].fill({ tier: 'champion' }), CHART_COLORS.amber);
  assert.equal(trophy.marks[2].fill({ tier: 'miss' }), CHART_COLORS.red);

  const rivalry = rivalryLeadPlotOptions([{ index: 1, lead: 1, result: 'W', title: 'lead' }], { teamA: 'Joe', teamB: 'Joel' });
  assert.deepEqual(rivalry.y.domain, [-1, 1]);
  assert.equal(rivalry.marks[2].fill({ result: 'W' }), CHART_COLORS.green);
  assert.equal(rivalry.marks[2].fill({ result: 'L' }), CHART_COLORS.red);
  assert.equal(rivalry.marks[2].fill({ result: 'T' }), CHART_COLORS.slate);

  const movement = currentSeedMovementPlotOptions([{ owner: 'Joe', seedChange: 2, projectedSeed: 1, title: 'move' }]);
  assert.equal(movement.marks[1].type, 'barX');
  assert.equal(movement.marks[2].dx, 10);
  assert.equal(movement.marks[1].fill({ isSelected: true, seedChange: 0 }), CHART_COLORS.violet);
  assert.equal(movement.marks[1].fill({ isSelected: false, seedChange: -1 }), CHART_COLORS.red);
  assert.equal(movement.marks[2].text({ projectedSeed: 1 }), '1');

  const projection = currentProjectedSeedPlotOptions([{ owner: 'Joe', projectedRank: 1, projectedRecord: '9-5', title: 'seed' }]);
  assert.equal(projection.marks[0].type, 'dot');
  assert.equal(projection.marks[0].fill({ isSelected: false }), CHART_COLORS.blue);

  const odds = currentOddsMovementPlotOptions([{ owner: 'Joe', playoffChange: 25, title: 'odds' }]);
  assert.equal(odds.marks[1].type, 'barX');
  assert.equal(odds.marks[1].fill({ isSelected: false, playoffChange: 25 }), CHART_COLORS.green);
  assert.equal(odds.marks[1].fill({ isSelected: false, playoffChange: 0 }), CHART_COLORS.slate);
});

test('chart theme reads CSS variables and keeps deterministic owner colors', () => {
  const previous = globalThis.getComputedStyle;
  globalThis.getComputedStyle = element => ({
    fontFamily: element.kind === 'body' ? 'Test Sans' : '',
    getPropertyValue(name) {
      return name === '--text' ? ' rgb(1, 2, 3) ' : '';
    },
  });
  try {
    const doc = { documentElement: { kind: 'root' }, body: { kind: 'body' } };
    assert.equal(chartFont(doc), 'Test Sans');
    const theme = chartTheme({ doc });
    assert.equal(theme.color, 'rgb(1, 2, 3)');
    assert.equal(theme.muted, CHART_COLORS.muted);
    const colors = ownerColorScale(['Joel', 'Joe', 'Joe'], new Map([['Joe', '#abcdef']]));
    assert.equal(colors('Joe'), '#abcdef');
    assert.equal(colors('Joel'), CHART_COLORS.amber);
    assert.equal(colors('Unknown'), colors('Unknown'));
  } finally {
    if (previous) globalThis.getComputedStyle = previous;
    else delete globalThis.getComputedStyle;
  }
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

  const attributes = new Map();
  const classes = [];
  const svg = {
    classList: { add: name => classes.push(name) },
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
