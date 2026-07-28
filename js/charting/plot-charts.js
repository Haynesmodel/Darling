import {
  areaY,
  barX,
  dot,
  lineY,
  plot,
  ruleX,
  ruleY,
  text,
} from './vendor/charting-vendor.js';
import {
  currentOddsMovementRows,
  currentProjectedSeedRows,
  currentSeedMovementRows,
  dynastyTrendRows,
  gauntletHistogramRows,
  rivalryLeadRows,
  trophyCareerRows,
} from './chart-data.js';
import {
  currentOddsMovementPlotOptions,
  currentProjectedSeedPlotOptions,
  currentSeedMovementPlotOptions,
  dynastyTrendPlotOptions,
  gauntletHistogramPlotOptions,
  rivalryLeadPlotOptions,
  trophyCareerPlotOptions,
} from './plot-specs.js';
import {
  mountChart,
  renderChartEmpty,
  renderChartError,
} from './chart-runtime.js';

function isDomHost(host) {
  return !!host && typeof host.append === 'function' && typeof host.replaceChildren === 'function';
}

function titleChannel(mark) {
  if (!mark.title) return undefined;
  if (typeof mark.title === 'function') return mark.title;
  return d => d?.[mark.title] ?? '';
}

function markOptions(mark) {
  const { type, data, ...options } = mark;
  if (typeof options.dx === 'function') delete options.dx;
  options.title = titleChannel(mark);
  return Object.fromEntries(Object.entries(options).filter(([, value]) => value !== undefined));
}

const markFactories = { areaY, barX, dot, lineY, ruleX, ruleY, text };

function plotMark(mark) {
  return markFactories[mark.type]?.(mark.data, markOptions(mark)) || null;
}

function toPlotOptions(spec) {
  const {
    ariaLabel,
    rows,
    ...options
  } = spec;
  return {
    ...options,
    marks: (spec.marks || []).map(plotMark).filter(Boolean),
  };
}

function renderSpec(host, spec, opts = {}) {
  if (!isDomHost(host)) return null;
  const rows = spec.rows || [];
  if (!rows.length && opts.requireRows !== false) {
    renderChartEmpty(host, opts.emptyMessage || 'No chart data available.');
    return null;
  }
  try {
    const svg = plot(toPlotOptions(spec));
    return mountChart(host, svg, {
      ariaLabel: opts.ariaLabel || spec.ariaLabel,
      className: opts.className,
    });
  } catch (error) {
    renderChartError(host, error);
    return null;
  }
}

function renderPrepared(host, spec, className, emptyMessage) {
  return renderSpec(host, spec, { ariaLabel: spec.ariaLabel, className, emptyMessage });
}

function renderDynastyTrendPlot(host, chart = {}, opts = {}) {
  const rows = dynastyTrendRows(chart, opts);
  const spec = dynastyTrendPlotOptions(rows, chart, opts);
  return renderPrepared(host, spec, 'dynasty-trend-svg', (chart.series || []).length ? 'All teams are hidden. Click a team in the key to bring it back.' : 'No dynasty trend data available.');
}

function renderGauntletHistogramPlot(host, result, teamSeasonA, teamSeasonB, opts = {}) {
  const payload = gauntletHistogramRows(result, teamSeasonA, teamSeasonB, opts);
  const spec = gauntletHistogramPlotOptions(payload, opts);
  return renderPrepared(host, spec, 'gauntlet-histogram-svg', 'No simulation data available.');
}

function renderTrophyCareerPlot(host, view = {}, opts = {}) {
  const rows = trophyCareerRows(view);
  const spec = trophyCareerPlotOptions(rows, opts);
  return renderPrepared(host, spec, 'trophy-career-svg', 'No seasons recorded.');
}

function renderRivalryLeadPlot(host, view = {}, opts = {}) {
  const rows = rivalryLeadRows(view, opts.points || []);
  const spec = rivalryLeadPlotOptions(rows, view, opts);
  return renderPrepared(host, spec, 'rivalry-trend-svg', 'No recorded games between these teams.');
}

function renderCurrentSeedMovementPlot(host, view = {}, opts = {}) {
  const rows = currentSeedMovementRows(view).slice(0, opts.limit || 8);
  const spec = currentSeedMovementPlotOptions(rows, opts);
  return renderPrepared(host, spec, 'current-seed-movement-svg', 'No movement available.');
}

function renderCurrentProjectedStandingsPlot(host, view = {}, opts = {}) {
  const rows = currentProjectedSeedRows(view);
  const spec = currentProjectedSeedPlotOptions(rows, opts);
  return renderPrepared(host, spec, 'current-projected-standings-svg', 'No projection available.');
}

function renderCurrentOddsMovementPlot(host, view = {}, opts = {}) {
  const rows = currentOddsMovementRows(view).slice(0, opts.limit || 8);
  const spec = currentOddsMovementPlotOptions(rows, opts);
  return renderPrepared(host, spec, 'current-odds-movement-svg', 'No playoff odds movement available.');
}

export {
  renderCurrentOddsMovementPlot,
  renderCurrentProjectedStandingsPlot,
  renderCurrentSeedMovementPlot,
  renderDynastyTrendPlot,
  renderGauntletHistogramPlot,
  renderRivalryLeadPlot,
  renderTrophyCareerPlot,
};
