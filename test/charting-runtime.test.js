import test from 'node:test';
import assert from 'node:assert/strict';
import esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { chartRequestHasData } from '../src/charting/chart-types.ts';

let directory;
let renderChart;

const plotSpecStub = `
const marks = [
  { type: 'areaY', data: [{ value: 1 }], title: 'value', dx: () => 1, optional: undefined },
  { type: 'barX', data: [{ value: null }], title: 'value' },
  { type: 'barY', data: [{ value: 2 }], title: value => value.missing },
  { type: 'dot', data: [{ value: 3 }] },
  { type: 'lineY', data: [{ value: 4 }] },
  { type: 'ruleX', data: [{ value: 5 }] },
  { type: 'ruleY', data: [{ value: 6 }] },
  { type: 'text', data: [{ value: 7 }] },
];
const spec = rows => ({ ariaLabel: rows.length ? 'Runtime chart' : '', rows, marks });
export const currentOddsMovementPlotOptions = spec;
export const currentProjectedSeedPlotOptions = spec;
export const currentSeedMovementPlotOptions = spec;
export const dynastyTrendPlotOptions = spec;
export const gauntletHistogramPlotOptions = data => spec(data.rows);
export const rivalryLeadPlotOptions = spec;
export const trophyCareerPlotOptions = spec;
`;

const vendorStub = `
export const calls = [];
const mark = type => (data, options) => {
  calls.push({ type, data: [...data], options });
  if (typeof options.title === 'function') {
    calls.push({ type: type + '-title', values: [options.title(data[0])] });
  }
  return { type, data, options };
};
export const areaY = mark('areaY');
export const barX = mark('barX');
export const barY = mark('barY');
export const dot = mark('dot');
export const lineY = mark('lineY');
export const ruleX = mark('ruleX');
export const ruleY = mark('ruleY');
export const text = mark('text');
export const plot = options => {
  const svg = {
    options,
    classes: [],
    attributes: {},
    setAttribute(name, value) { this.attributes[name] = value; },
  };
  svg.classList = { add(value) { svg.classes.push(value); } };
  return svg;
};
`;

test.before(async () => {
  const root = process.cwd();
  const bundles = path.join(root, 'coverage', 'test-bundles');
  fs.mkdirSync(bundles, { recursive: true });
  directory = fs.mkdtempSync(path.join(bundles, 'chart-runtime-'));
  const outfile = path.join(directory, 'chart-runtime.mjs');
  await esbuild.build({
    entryPoints: [path.join(root, 'src/charting/plot-charts.ts')],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node24',
    sourcemap: 'inline',
    sourcesContent: true,
    logLevel: 'silent',
    plugins: [{
      name: 'chart-runtime-stubs',
      setup(build) {
        build.onResolve({ filter: /plot-specs\.ts$/ }, () => ({ path: 'plot-specs', namespace: 'test-stub' }));
        build.onResolve({ filter: /chart-vendor\.ts$/ }, () => ({ path: 'chart-vendor', namespace: 'test-stub' }));
        build.onLoad({ filter: /.*/, namespace: 'test-stub' }, args => ({
          contents: args.path === 'plot-specs' ? plotSpecStub : vendorStub,
          loader: 'js',
        }));
      },
    }],
  });
  ({ renderChart } = await import(`${pathToFileURL(outfile).href}?${Date.now()}`));
});

test.after(() => fs.rmSync(directory, { recursive: true, force: true }));

function request(kind) {
  const rows = [{ label: 'One', value: 1, title: 'One: 1' }];
  if (kind === 'rivalry-lead') return { kind, data: { rows, teamA: 'A', teamB: 'B' } };
  if (kind === 'dynasty-trend') return { kind, data: { rows, seasonList: [2025] } };
  if (kind === 'draft-picks') return { kind, data: { rows, xLabel: 'Pick', yLabel: 'Count', ariaLabel: 'Picks' } };
  if (kind === 'draft-zones') return { kind, data: { rows, yLabel: 'Count', ariaLabel: 'Zones' } };
  if (kind === 'gauntlet-histogram') return { kind, data: { rows, means: [], domain: [0, 1], maxCount: 1 } };
  return { kind, data: { rows } };
}

test('chart runtime dispatches every typed request and replaces the host with an accessible plot', () => {
  const kinds = [
    'current-seed-movement',
    'current-odds-movement',
    'current-projected-standings',
    'rivalry-lead',
    'trophy-career',
    'dynasty-trend',
    'draft-picks',
    'draft-zones',
    'gauntlet-histogram',
  ];
  for (const kind of kinds) {
    const host = { child: null, replaceChildren(child) { this.child = child; } };
    renderChart(host, request(kind));
    assert.equal(host.child.attributes.role, 'img');
    assert.ok(host.child.attributes['aria-label']);
    assert.equal(host.child.classes.length, 1);
    assert.ok(host.child.options.marks.length > 0);
  }
});

test('chart data availability is uniform across every request kind', () => {
  const kinds = [
    'current-seed-movement', 'current-odds-movement', 'current-projected-standings',
    'rivalry-lead', 'trophy-career', 'dynasty-trend', 'draft-picks', 'draft-zones',
    'gauntlet-histogram',
  ];
  for (const kind of kinds) {
    assert.equal(chartRequestHasData(request(kind)), true);
    const empty = request(kind);
    empty.data.rows = [];
    assert.equal(chartRequestHasData(empty), false);
  }
});
