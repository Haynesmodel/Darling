import { CHART_COLORS, chartTheme, ownerColorScale } from './chart-theme.js';

function basePlotOptions(opts = {}) {
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

function dynastyTrendPlotOptions(rows = [], chart = {}, opts = {}) {
  const color = ownerColorScale(rows.map(row => row.owner), new Map(rows.map(row => [row.owner, row.color]).filter(([, value]) => value)));
  return {
    ...basePlotOptions({ ...opts, height: opts.height || 340 }),
    ariaLabel: 'All-time dynasty score through the years',
    rows,
    x: { label: 'Season', type: 'point', domain: chart.seasonList || undefined },
    y: { label: 'Cumulative score', domain: [chart.minScore ?? undefined, chart.maxScore ?? undefined] },
    color,
    marks: [
      { type: 'ruleY', data: [0], stroke: CHART_COLORS.grid },
      { type: 'lineY', data: rows, x: 'season', y: 'cumulativeScore', z: 'owner', stroke: color, className: 'dynasty-trend-series' },
      { type: 'dot', data: rows, x: 'season', y: 'cumulativeScore', fill: color, title: 'title', className: 'dynasty-trend-point' },
    ],
  };
}

function gauntletHistogramPlotOptions(payload = {}, opts = {}) {
  const rows = payload.rows || [];
  const means = payload.means || [];
  const colors = new Map([
    [means[0]?.label, CHART_COLORS.blue],
    [means[1]?.label, CHART_COLORS.amber],
  ]);
  const color = label => colors.get(label) || CHART_COLORS.slate;
  return {
    ...basePlotOptions({ ...opts, height: opts.height || 260 }),
    ariaLabel: 'Overlaid score distribution histogram',
    rows,
    means,
    x: { label: 'Score', domain: payload.domain || undefined },
    y: { label: 'Simulations', domain: [0, Math.max(payload.maxCount || 1, 1)] },
    color,
    marks: [
      { type: 'areaY', data: rows, x: 'center', y: 'count', z: 'label', fill: color, fillOpacity: 0.16 },
      { type: 'lineY', data: rows, x: 'center', y: 'count', z: 'label', stroke: color, className: 'gauntlet-histogram-series' },
      { type: 'ruleX', data: means, x: 'mean', stroke: color, title: 'title', className: 'gauntlet-histogram-mean' },
      { type: 'dot', data: rows, x: 'center', y: 'count', fill: color, title: 'title', className: 'gauntlet-histogram-bin' },
    ],
  };
}

function trophyCareerPlotOptions(rows = [], opts = {}) {
  const maxFinish = Math.max(6, ...rows.map(row => Number(row.finish)).filter(Number.isFinite), 6);
  const tierColor = row => ({
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
    color: tierColor,
    marks: [
      { type: 'ruleY', data: [6], stroke: CHART_COLORS.blue, strokeDasharray: '5 5', className: 'trophy-career-playoff-line' },
      { type: 'lineY', data: rows, x: 'season', y: 'finish', stroke: CHART_COLORS.blue, className: 'trophy-career-line' },
      { type: 'dot', data: rows, x: 'season', y: 'finish', fill: tierColor, title: 'title', className: 'trophy-career-point-group' },
      { type: 'text', data: rows, x: 'season', y: 'finish', text: 'finishLabel', dy: -14, className: 'trophy-career-point-label' },
    ],
  };
}

function rivalryLeadPlotOptions(rows = [], view = {}, opts = {}) {
  const maxAbsLead = Math.max(1, ...rows.map(row => Math.abs(Number(row.lead))).filter(Number.isFinite));
  const resultColor = row => row.result === 'W' ? CHART_COLORS.green : row.result === 'L' ? CHART_COLORS.red : CHART_COLORS.slate;
  return {
    ...basePlotOptions({ ...opts, height: opts.height || 250, marginLeft: 120, marginBottom: 58 }),
    ariaLabel: 'Series lead over time relative to .500',
    rows,
    x: { label: 'Game', domain: [1, Math.max(rows.length, 1)], ticks: rows.filter(row => row.index === 1 || row.index % 5 === 0).map(row => row.index) },
    y: { label: 'Series lead', domain: [-maxAbsLead, maxAbsLead], ticks: [-maxAbsLead, 0, maxAbsLead] },
    color: resultColor,
    teamA: view.teamA,
    teamB: view.teamB,
    maxAbsLead,
    marks: [
      { type: 'ruleY', data: [0], stroke: CHART_COLORS.slate, strokeDasharray: '4 4', className: 'rivalry-trend-zero' },
      { type: 'lineY', data: rows, x: 'index', y: 'lead', stroke: CHART_COLORS.blue, className: 'rivalry-trend-path' },
      { type: 'dot', data: rows, x: 'index', y: 'lead', fill: resultColor, title: 'title', className: 'rivalry-trend-dot' },
    ],
  };
}

function currentSeedMovementPlotOptions(rows = [], opts = {}) {
  const color = row => row.isSelected ? CHART_COLORS.violet : row.seedChange > 0 ? CHART_COLORS.green : row.seedChange < 0 ? CHART_COLORS.red : CHART_COLORS.slate;
  const positiveLabelRows = rows.filter(row => row.seedChange >= 0);
  const negativeLabelRows = rows.filter(row => row.seedChange < 0);
  return {
    ...basePlotOptions({ ...opts, height: opts.height || 240, marginLeft: 112, marginBottom: 36 }),
    ariaLabel: 'Live seed movement by owner',
    rows,
    x: { label: 'Seed change' },
    y: { label: null, domain: rows.map(row => row.owner) },
    color,
    marks: [
      { type: 'ruleX', data: [0], stroke: CHART_COLORS.slate },
      { type: 'barX', data: rows, x: 'seedChange', y: 'owner', fill: color, title: 'title', className: 'current-seed-movement-bar' },
      { type: 'text', data: positiveLabelRows, x: 'seedChange', y: 'owner', text: row => `${row.projectedSeed}`, dx: 10, className: 'current-seed-movement-label' },
      { type: 'text', data: negativeLabelRows, x: 'seedChange', y: 'owner', text: row => `${row.projectedSeed}`, dx: -10, className: 'current-seed-movement-label' },
    ],
  };
}

function currentProjectedSeedPlotOptions(rows = [], opts = {}) {
  const color = row => row.isSelected ? CHART_COLORS.violet : CHART_COLORS.blue;
  return {
    ...basePlotOptions({ ...opts, height: opts.height || 260, marginLeft: 112, marginBottom: 40 }),
    ariaLabel: 'Projected standings seed by owner',
    rows,
    x: { label: 'Projected seed', domain: [Math.max(...rows.map(row => row.projectedRank), 1), 1], ticks: rows.map(row => row.projectedRank).filter(Number.isFinite) },
    y: { label: null, domain: rows.map(row => row.owner) },
    color,
    marks: [
      { type: 'dot', data: rows, x: 'projectedRank', y: 'owner', r: 7, fill: color, title: 'title', className: 'current-projected-seed-dot' },
      { type: 'text', data: rows, x: 'projectedRank', y: 'owner', text: 'projectedRecord', dx: 14, className: 'current-projected-seed-label' },
    ],
  };
}

export {
  currentProjectedSeedPlotOptions,
  currentSeedMovementPlotOptions,
  dynastyTrendPlotOptions,
  gauntletHistogramPlotOptions,
  rivalryLeadPlotOptions,
  trophyCareerPlotOptions,
};
