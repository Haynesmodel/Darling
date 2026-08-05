import type { PlotOptions } from '@observablehq/plot';
import {
  currentOddsMovementPlotOptions,
  currentProjectedSeedPlotOptions,
  currentSeedMovementPlotOptions,
  dynastyTrendPlotOptions,
  gauntletHistogramPlotOptions,
  rivalryLeadPlotOptions,
  trophyCareerPlotOptions,
} from '../../js/charting/plot-specs.js';
import type { ChartRequest } from './chart-types';
import { areaY, barX, barY, dot, lineY, plot, ruleX, ruleY, text } from './chart-vendor';

interface RuntimeMark {
  type: 'areaY' | 'barX' | 'barY' | 'dot' | 'lineY' | 'ruleX' | 'ruleY' | 'text';
  data: Iterable<unknown>;
  title?: string | ((value: Record<string, unknown>) => string);
  [key: string]: unknown;
}

interface RuntimeSpec {
  ariaLabel?: string;
  rows?: readonly unknown[];
  marks?: readonly RuntimeMark[];
  [key: string]: unknown;
}

function titleChannel(mark: RuntimeMark): ((value: unknown) => string) | undefined {
  if (!mark.title) return undefined;
  if (typeof mark.title === 'function') {
    const title = mark.title;
    return value => title(value as Record<string, unknown>) || '';
  }
  const property = mark.title;
  return value => {
    if (!value || typeof value !== 'object') return '';
    const found = (value as Record<string, unknown>)[property];
    return found === null || found === undefined ? '' : String(found);
  };
}

function markOptions(mark: RuntimeMark): Record<string, unknown> {
  const { type: _type, data: _data, ...options } = mark;
  if (typeof options.dx === 'function') delete options.dx;
  options.title = titleChannel(mark);
  return Object.fromEntries(Object.entries(options).filter(([, value]) => value !== undefined));
}

function plotMark(mark: RuntimeMark): unknown {
  const options = markOptions(mark);
  switch (mark.type) {
    case 'areaY': return areaY(mark.data, options as Parameters<typeof areaY>[1]);
    case 'barX': return barX(mark.data, options as Parameters<typeof barX>[1]);
    case 'barY': return barY(mark.data, options as Parameters<typeof barY>[1]);
    case 'dot': return dot(mark.data, options as Parameters<typeof dot>[1]);
    case 'lineY': return lineY(mark.data, options as Parameters<typeof lineY>[1]);
    case 'ruleX': return ruleX(mark.data, options as Parameters<typeof ruleX>[1]);
    case 'ruleY': return ruleY(mark.data, options as Parameters<typeof ruleY>[1]);
    case 'text': return text(mark.data, options as Parameters<typeof text>[1]);
    default: {
      const exhaustive: never = mark.type;
      return exhaustive;
    }
  }
}

function renderSpec(host: HTMLElement, spec: RuntimeSpec, className: string): void {
  const { ariaLabel, rows: _rows, marks = [], ...options } = spec;
  const plotOptions = { ...options, marks: marks.map(plotMark) } as unknown as PlotOptions;
  const svg = plot(plotOptions);
  svg.classList.add(className);
  svg.setAttribute('aria-label', ariaLabel || 'Chart');
  svg.setAttribute('role', 'img');
  host.replaceChildren(svg);
}

function draftSpec(request: Extract<ChartRequest, { kind: 'draft-picks' | 'draft-zones' }>): RuntimeSpec {
  const pick = request.kind === 'draft-picks';
  return {
    height: pick ? 240 : 220,
    marginLeft: pick ? 48 : 56,
    ariaLabel: request.data.ariaLabel,
    rows: request.data.rows,
    x: { label: pick ? request.data.xLabel : 'Draft zone' },
    y: { label: request.data.yLabel },
    marks: [{ type: 'barY', data: request.data.rows, x: 'label', y: 'value', fill: 'var(--accent-primary)', title: 'title' }],
  };
}

export function renderChart(host: HTMLElement, request: ChartRequest): void {
  switch (request.kind) {
    case 'current-seed-movement':
      renderSpec(host, currentSeedMovementPlotOptions([...request.data.rows]) as RuntimeSpec, 'current-seed-movement-svg');
      return;
    case 'current-odds-movement':
      renderSpec(host, currentOddsMovementPlotOptions([...request.data.rows]) as RuntimeSpec, 'current-odds-movement-svg');
      return;
    case 'current-projected-standings':
      renderSpec(host, currentProjectedSeedPlotOptions([...request.data.rows]) as RuntimeSpec, 'current-projected-standings-svg');
      return;
    case 'rivalry-lead':
      renderSpec(host, rivalryLeadPlotOptions([...request.data.rows], request.data) as RuntimeSpec, 'rivalry-trend-svg');
      return;
    case 'trophy-career':
      renderSpec(host, trophyCareerPlotOptions([...request.data.rows]) as RuntimeSpec, 'trophy-career-svg');
      return;
    case 'dynasty-trend':
      renderSpec(host, dynastyTrendPlotOptions([...request.data.rows], request.data) as RuntimeSpec, 'dynasty-trend-svg');
      return;
    case 'draft-picks':
      renderSpec(host, draftSpec(request), 'draft-pick-chart-svg');
      return;
    case 'draft-zones':
      renderSpec(host, draftSpec(request), 'draft-zone-chart-svg');
      return;
    case 'gauntlet-histogram':
      renderSpec(host, gauntletHistogramPlotOptions(request.data) as RuntimeSpec, 'gauntlet-histogram-svg');
      return;
    default: {
      const exhaustive: never = request;
      return exhaustive;
    }
  }
}
