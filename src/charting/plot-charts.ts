import type { PlotOptions } from '@observablehq/plot';
import {
  currentOddsMovementRows,
  currentProjectedSeedRows,
  currentSeedMovementRows,
  dynastyTrendRows,
  gauntletHistogramRows,
  rivalryLeadRows,
  trophyCareerRows,
  type CurrentChartViewInput,
  type DynastyTrendInput,
  type DynastyTrendOptions,
  type HistogramOptions,
  type HistogramResultInput,
  type HistogramTeamSeasonInput,
  type TrophyCareerInput,
} from './chart-data.ts';
import { renderChartEmpty, renderChartError, mountChart } from './chart-runtime.ts';
import type { ChartRequest } from './chart-types.ts';
import { areaY, barX, barY, dot, lineY, plot, ruleX, ruleY, text } from './chart-vendor.ts';
import {
  currentOddsMovementPlotOptions,
  currentProjectedSeedPlotOptions,
  currentSeedMovementPlotOptions,
  dynastyTrendPlotOptions,
  gauntletHistogramPlotOptions,
  rivalryLeadPlotOptions,
  trophyCareerPlotOptions,
  type PlotSpecOptions,
} from './plot-specs.ts';

type MarkType = 'areaY' | 'barX' | 'barY' | 'dot' | 'lineY' | 'ruleX' | 'ruleY' | 'text';

interface RuntimeMark {
  type: MarkType;
  data: Iterable<unknown>;
  title?: string | ((value: unknown) => unknown);
  [key: string]: unknown;
}

interface RuntimeSpec {
  ariaLabel?: string;
  rows?: readonly unknown[];
  marks?: readonly RuntimeMark[];
  [key: string]: unknown;
}

interface RenderOptions {
  requireRows?: boolean;
  emptyMessage?: string;
  ariaLabel?: string;
  className?: string;
}

function isDomHost(host: unknown): host is HTMLElement {
  if (!host || typeof host !== 'object') return false;
  const candidate = host as { append?: unknown; replaceChildren?: unknown };
  return typeof candidate.append === 'function' && typeof candidate.replaceChildren === 'function';
}

function titleChannel(mark: RuntimeMark): ((value: unknown) => string) | undefined {
  if (!mark.title) return undefined;
  if (typeof mark.title === 'function') {
    const title = mark.title;
    return value => String(title(value) || '');
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

function toPlotOptions(spec: RuntimeSpec): PlotOptions {
  const { ariaLabel: _ariaLabel, rows: _rows, marks = [], ...options } = spec;
  return { ...options, marks: marks.map(plotMark) } as unknown as PlotOptions;
}

function normalizePlotAccessibility<T extends Element>(svg: T): T {
  svg.querySelectorAll?.('g[aria-label]:not([role])').forEach(group => group.setAttribute('role', 'group'));
  return svg;
}

function renderSpec(host: unknown, spec: RuntimeSpec, opts: RenderOptions = {}): Element | null {
  if (!isDomHost(host)) return null;
  const rows = spec.rows || [];
  if (!rows.length && opts.requireRows !== false) {
    renderChartEmpty(host, opts.emptyMessage || 'No chart data available.');
    return null;
  }
  try {
    return mountChart(host, normalizePlotAccessibility(plot(toPlotOptions(spec))), {
      ariaLabel: opts.ariaLabel || spec.ariaLabel,
      className: opts.className,
    });
  } catch (error) {
    renderChartError(host, error);
    return null;
  }
}

function renderPrepared(host: unknown, spec: RuntimeSpec, className: string, emptyMessage: string): Element | null {
  return renderSpec(host, spec, { ariaLabel: spec.ariaLabel, className, emptyMessage });
}

export function renderDynastyTrendPlot(
  host: unknown,
  chart: DynastyTrendInput & { seasonList?: readonly (number | string)[]; minScore?: number; maxScore?: number } = {},
  opts: DynastyTrendOptions & PlotSpecOptions = {},
): Element | null {
  const rows = dynastyTrendRows(chart, opts);
  const spec = dynastyTrendPlotOptions(rows, chart, opts) as unknown as RuntimeSpec;
  return renderPrepared(host, spec, 'dynasty-trend-svg', (chart.series || []).length ? 'All teams are hidden. Click a team in the key to bring it back.' : 'No dynasty trend data available.');
}

export function renderGauntletHistogramPlot(
  host: unknown,
  result?: HistogramResultInput | null,
  teamSeasonA?: HistogramTeamSeasonInput | null,
  teamSeasonB?: HistogramTeamSeasonInput | null,
  opts: HistogramOptions & PlotSpecOptions = {},
): Element | null {
  const payload = gauntletHistogramRows(result, teamSeasonA, teamSeasonB, opts);
  return renderPrepared(host, gauntletHistogramPlotOptions(payload, opts) as unknown as RuntimeSpec, 'gauntlet-histogram-svg', 'No simulation data available.');
}

export function renderTrophyCareerPlot(host: unknown, view: TrophyCareerInput = {}, opts: PlotSpecOptions = {}): Element | null {
  const rows = trophyCareerRows(view);
  return renderPrepared(host, trophyCareerPlotOptions(rows, opts) as unknown as RuntimeSpec, 'trophy-career-svg', 'No seasons recorded.');
}

export function renderRivalryLeadPlot(
  host: unknown,
  view: { teamA?: string; teamB?: string } = {},
  opts: PlotSpecOptions & { points?: Parameters<typeof rivalryLeadRows>[1] } = {},
): Element | null {
  const rows = rivalryLeadRows(view, opts.points || []);
  return renderPrepared(host, rivalryLeadPlotOptions(rows, view, opts) as unknown as RuntimeSpec, 'rivalry-trend-svg', 'No recorded games between these teams.');
}

export function renderCurrentSeedMovementPlot(
  host: unknown,
  view: CurrentChartViewInput = {},
  opts: PlotSpecOptions & { limit?: number } = {},
): Element | null {
  const rows = currentSeedMovementRows(view).slice(0, opts.limit || 8);
  return renderPrepared(host, currentSeedMovementPlotOptions(rows, opts) as unknown as RuntimeSpec, 'current-seed-movement-svg', 'No movement available.');
}

export function renderCurrentProjectedStandingsPlot(host: unknown, view: CurrentChartViewInput = {}, opts: PlotSpecOptions = {}): Element | null {
  const rows = currentProjectedSeedRows(view);
  return renderPrepared(host, currentProjectedSeedPlotOptions(rows, opts) as unknown as RuntimeSpec, 'current-projected-standings-svg', 'No projection available.');
}

export function renderCurrentOddsMovementPlot(
  host: unknown,
  view: CurrentChartViewInput = {},
  opts: PlotSpecOptions & { limit?: number } = {},
): Element | null {
  const rows = currentOddsMovementRows(view).slice(0, opts.limit || 8);
  return renderPrepared(host, currentOddsMovementPlotOptions(rows, opts) as unknown as RuntimeSpec, 'current-odds-movement-svg', 'No playoff odds movement available.');
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

function renderRequestSpec(host: HTMLElement, spec: RuntimeSpec, className: string): void {
  const svg = normalizePlotAccessibility(plot(toPlotOptions(spec)));
  svg.classList.add(className);
  svg.setAttribute('aria-label', spec.ariaLabel || 'Chart');
  svg.setAttribute('role', 'img');
  host.replaceChildren(svg);
}

export function renderChart(host: HTMLElement, request: ChartRequest): void {
  switch (request.kind) {
    case 'current-seed-movement':
      renderRequestSpec(host, currentSeedMovementPlotOptions([...request.data.rows]) as unknown as RuntimeSpec, 'current-seed-movement-svg');
      return;
    case 'current-odds-movement':
      renderRequestSpec(host, currentOddsMovementPlotOptions([...request.data.rows]) as unknown as RuntimeSpec, 'current-odds-movement-svg');
      return;
    case 'current-projected-standings':
      renderRequestSpec(host, currentProjectedSeedPlotOptions([...request.data.rows]) as unknown as RuntimeSpec, 'current-projected-standings-svg');
      return;
    case 'rivalry-lead':
      renderRequestSpec(host, rivalryLeadPlotOptions([...request.data.rows], request.data) as unknown as RuntimeSpec, 'rivalry-trend-svg');
      return;
    case 'trophy-career':
      renderRequestSpec(host, trophyCareerPlotOptions([...request.data.rows]) as unknown as RuntimeSpec, 'trophy-career-svg');
      return;
    case 'dynasty-trend':
      renderRequestSpec(host, dynastyTrendPlotOptions(request.data.rows.filter(row => !row.hidden), request.data) as unknown as RuntimeSpec, 'dynasty-trend-svg');
      return;
    case 'draft-picks':
      renderRequestSpec(host, draftSpec(request), 'draft-pick-chart-svg');
      return;
    case 'draft-zones':
      renderRequestSpec(host, draftSpec(request), 'draft-zone-chart-svg');
      return;
    case 'gauntlet-histogram':
      renderRequestSpec(host, gauntletHistogramPlotOptions(request.data) as unknown as RuntimeSpec, 'gauntlet-histogram-svg');
      return;
    default: {
      const exhaustive: never = request;
      return exhaustive;
    }
  }
}
