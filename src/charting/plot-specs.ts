import type {
  CurrentOddsMovementChartRow,
  CurrentProjectedStandingsChartRow,
  CurrentSeedMovementChartRow,
  DynastyTrendChartRow,
  GauntletHistogramChartRow,
  GauntletHistogramMean,
  RivalryLeadChartRow,
  TrophyCareerChartRow,
} from './chart-types.ts';
import { CHART_COLORS, chartTheme, ownerColorScale, type ChartThemeOptions } from './chart-theme.ts';

export interface PlotSpecOptions extends ChartThemeOptions {
  width?: number;
  height?: number;
  marginLeft?: number;
  marginRight?: number;
  marginTop?: number;
  marginBottom?: number;
}

function basePlotOptions(opts: PlotSpecOptions = {}) {
  const theme = chartTheme(opts);
  return {
    width: opts.width || 960,
    height: opts.height || 300,
    marginLeft: opts.marginLeft ?? theme.marginLeft,
    marginRight: opts.marginRight ?? theme.marginRight,
    marginTop: opts.marginTop ?? theme.marginTop,
    marginBottom: opts.marginBottom ?? theme.marginBottom,
    style: {
      background: theme.background,
      color: theme.color,
      fontFamily: theme.fontFamily,
      fontSize: '12px',
      overflow: 'visible',
    },
    grid: true,
  };
}

function formatDynastySeasonTick(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'string' && value.trim()) return value;
  return '';
}

export function dynastyTrendPlotOptions(
  rows: readonly DynastyTrendChartRow[] = [],
  chart: { seasonList?: readonly (number | string)[]; minScore?: number; maxScore?: number } = {},
  opts: PlotSpecOptions = {},
) {
  const color = ownerColorScale(
    rows.map(row => row.owner),
    new Map(rows.flatMap(row => row.color ? [[row.owner, row.color]] : [])),
  );
  const ownerColor = (row: DynastyTrendChartRow) => color(row.owner);
  return {
    ...basePlotOptions({ ...opts, height: opts.height || 340 }),
    ariaLabel: 'All-time dynasty score through the years',
    rows,
    x: { label: 'Season', type: 'point', domain: chart.seasonList || undefined, tickFormat: formatDynastySeasonTick },
    y: { label: 'Cumulative score', domain: [chart.minScore ?? undefined, chart.maxScore ?? undefined] },
    marks: [
      { type: 'ruleY' as const, data: [0], stroke: CHART_COLORS.grid },
      { type: 'lineY' as const, data: rows, x: 'season', y: 'cumulativeScore', z: 'owner', stroke: ownerColor, className: 'dynasty-trend-series' },
      { type: 'dot' as const, data: rows, x: 'season', y: 'cumulativeScore', fill: ownerColor, title: 'title', className: 'dynasty-trend-point' },
    ],
  };
}

export function gauntletHistogramPlotOptions(
  payload: {
    rows?: readonly GauntletHistogramChartRow[];
    means?: readonly GauntletHistogramMean[];
    domain?: readonly [number, number];
    maxCount?: number;
  } = {},
  opts: PlotSpecOptions = {},
) {
  const rows = payload.rows || [];
  const means = payload.means || [];
  const colors = new Map<string | undefined, string>([
    [means[0]?.label, CHART_COLORS.blue],
    [means[1]?.label, CHART_COLORS.amber],
  ]);
  const color = (label: string) => colors.get(label) || CHART_COLORS.slate;
  return {
    ...basePlotOptions({ ...opts, height: opts.height || 260 }),
    ariaLabel: 'Overlaid score distribution histogram',
    rows,
    x: { label: 'Score', domain: payload.domain || undefined },
    y: { label: 'Simulations', domain: [0, Math.max(payload.maxCount || 1, 1)] },
    marks: [
      { type: 'areaY' as const, data: rows, x: 'center', y: 'count', z: 'label', fill: color, fillOpacity: 0.16 },
      { type: 'lineY' as const, data: rows, x: 'center', y: 'count', z: 'label', stroke: color, className: 'gauntlet-histogram-series' },
      { type: 'ruleX' as const, data: means, x: 'mean', stroke: color, title: 'title', className: 'gauntlet-histogram-mean' },
      { type: 'dot' as const, data: rows, x: 'center', y: 'count', fill: color, title: 'title', className: 'gauntlet-histogram-bin' },
    ],
  };
}

export function trophyCareerPlotOptions(rows: readonly TrophyCareerChartRow[] = [], opts: PlotSpecOptions = {}) {
  const maxFinish = Math.max(6, ...rows.map(row => Number(row.finish)).filter(Number.isFinite), 6);
  const tierColor = (row: TrophyCareerChartRow) => ({
    champion: CHART_COLORS.amber,
    playoff: CHART_COLORS.blue,
    saunders: CHART_COLORS.violet,
    miss: CHART_COLORS.red,
  })[row.tier] || CHART_COLORS.slate;
  return {
    ...basePlotOptions({ ...opts, height: opts.height || 310, marginLeft: 48 }),
    ariaLabel: 'Season finish trend',
    rows,
    x: { label: 'Season', type: 'point', domain: rows.map(row => row.season) },
    y: { label: 'Finish', domain: [maxFinish, 1], ticks: [1, 2, 4, 6, maxFinish] },
    marks: [
      { type: 'ruleY' as const, data: [6], stroke: CHART_COLORS.blue, strokeDasharray: '5 5', className: 'trophy-career-playoff-line' },
      { type: 'lineY' as const, data: rows, x: 'season', y: 'finish', stroke: CHART_COLORS.blue, className: 'trophy-career-line' },
      { type: 'dot' as const, data: rows, x: 'season', y: 'finish', fill: tierColor, title: 'title', className: 'trophy-career-point-group' },
      { type: 'text' as const, data: rows, x: 'season', y: 'finish', text: 'finishLabel', dy: -14, className: 'trophy-career-point-label' },
    ],
  };
}

export function rivalryLeadPlotOptions(
  rows: readonly RivalryLeadChartRow[] = [],
  _view: { teamA?: string; teamB?: string } = {},
  opts: PlotSpecOptions = {},
) {
  const maxAbsLead = Math.max(1, ...rows.map(row => Math.abs(Number(row.lead))).filter(Number.isFinite));
  const resultColor = (row: RivalryLeadChartRow) => row.result === 'W' ? CHART_COLORS.green : row.result === 'L' ? CHART_COLORS.red : CHART_COLORS.slate;
  return {
    ...basePlotOptions({ ...opts, height: opts.height || 250, marginLeft: 120, marginBottom: 58 }),
    ariaLabel: 'Series lead over time relative to .500',
    rows,
    x: { label: 'Game', domain: [1, Math.max(rows.length, 1)], ticks: rows.filter(row => row.index === 1 || row.index % 5 === 0).map(row => row.index) },
    y: { label: 'Series lead', domain: [-maxAbsLead, maxAbsLead], ticks: [-maxAbsLead, 0, maxAbsLead] },
    marks: [
      { type: 'ruleY' as const, data: [0], stroke: CHART_COLORS.slate, strokeDasharray: '4 4', className: 'rivalry-trend-zero' },
      { type: 'lineY' as const, data: rows, x: 'index', y: 'lead', stroke: CHART_COLORS.blue, className: 'rivalry-trend-path' },
      { type: 'dot' as const, data: rows, x: 'index', y: 'lead', fill: resultColor, title: 'title', className: 'rivalry-trend-dot' },
    ],
  };
}

export function currentSeedMovementPlotOptions(rows: readonly CurrentSeedMovementChartRow[] = [], opts: PlotSpecOptions = {}) {
  const color = (row: CurrentSeedMovementChartRow) => row.isSelected ? CHART_COLORS.violet : row.seedChange > 0 ? CHART_COLORS.green : row.seedChange < 0 ? CHART_COLORS.red : CHART_COLORS.slate;
  const positiveLabelRows = rows.filter(row => row.seedChange >= 0);
  const negativeLabelRows = rows.filter(row => row.seedChange < 0);
  return {
    ...basePlotOptions({ ...opts, height: opts.height || 240, marginLeft: 112, marginBottom: 36 }),
    ariaLabel: 'Live seed movement by owner',
    rows,
    x: { label: 'Seed change' },
    y: { label: null, domain: rows.map(row => row.owner) },
    marks: [
      { type: 'ruleX' as const, data: [0], stroke: CHART_COLORS.slate },
      { type: 'barX' as const, data: rows, x: 'seedChange', y: 'owner', fill: color, title: 'title', className: 'current-seed-movement-bar' },
      { type: 'text' as const, data: positiveLabelRows, x: 'seedChange', y: 'owner', text: (row: CurrentSeedMovementChartRow) => `${row.projectedSeed}`, dx: 10, className: 'current-seed-movement-label' },
      { type: 'text' as const, data: negativeLabelRows, x: 'seedChange', y: 'owner', text: (row: CurrentSeedMovementChartRow) => `${row.projectedSeed}`, dx: -10, className: 'current-seed-movement-label' },
    ],
  };
}

export function currentProjectedSeedPlotOptions(rows: readonly CurrentProjectedStandingsChartRow[] = [], opts: PlotSpecOptions = {}) {
  const color = (row: CurrentProjectedStandingsChartRow) => row.isSelected ? CHART_COLORS.violet : CHART_COLORS.blue;
  return {
    ...basePlotOptions({ ...opts, height: opts.height || 260, marginLeft: 112, marginBottom: 40 }),
    ariaLabel: 'Projected standings seed by owner',
    rows,
    x: { label: 'Projected seed', domain: [Math.max(...rows.map(row => row.projectedRank), 1), 1], ticks: rows.map(row => row.projectedRank).filter(Number.isFinite) },
    y: { label: null, domain: rows.map(row => row.owner) },
    marks: [
      { type: 'dot' as const, data: rows, x: 'projectedRank', y: 'owner', r: 7, fill: color, title: 'title', className: 'current-projected-seed-dot' },
      { type: 'text' as const, data: rows, x: 'projectedRank', y: 'owner', text: 'projectedRecord', dx: 14, className: 'current-projected-seed-label' },
    ],
  };
}

export function currentOddsMovementPlotOptions(rows: readonly CurrentOddsMovementChartRow[] = [], opts: PlotSpecOptions = {}) {
  const color = (row: CurrentOddsMovementChartRow) => row.isSelected ? CHART_COLORS.violet : row.playoffChange > 0 ? CHART_COLORS.green : row.playoffChange < 0 ? CHART_COLORS.red : CHART_COLORS.slate;
  return {
    ...basePlotOptions({ ...opts, height: opts.height || 240, marginLeft: 112, marginBottom: 40 }),
    ariaLabel: 'Playoff odds movement by owner',
    rows,
    x: { label: 'Percentage-point change' },
    y: { label: null, domain: rows.map(row => row.owner) },
    marks: [
      { type: 'ruleX' as const, data: [0], stroke: CHART_COLORS.slate },
      { type: 'barX' as const, data: rows, x: 'playoffChange', y: 'owner', fill: color, title: 'title', className: 'current-odds-movement-bar' },
    ],
  };
}
