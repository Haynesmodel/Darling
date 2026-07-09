import { Plot } from './vendor/charting-vendor.js';
import {
  currentProjectedSeedRows,
  currentSeedMovementRows,
  dynastyTrendRows,
  gauntletHistogramRows,
  rivalryLeadRows,
  trophyCareerRows,
} from './chart-data.js';
import {
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

function channelValue(mark, key) {
  const value = mark[key];
  if (typeof value === 'function') return value;
  if (typeof value === 'string') return value;
  return value;
}

function titleChannel(mark) {
  if (!mark.title) return undefined;
  if (typeof mark.title === 'function') return mark.title;
  return d => d?.[mark.title] ?? '';
}

function markOptions(mark) {
  const options = {
    x: channelValue(mark, 'x'),
    y: channelValue(mark, 'y'),
    z: channelValue(mark, 'z'),
    r: channelValue(mark, 'r'),
    text: channelValue(mark, 'text'),
    dx: typeof mark.dx === 'function' ? undefined : mark.dx,
    dy: mark.dy,
    fill: mark.fill,
    fillOpacity: mark.fillOpacity,
    stroke: mark.stroke,
    strokeWidth: mark.strokeWidth,
    strokeDasharray: mark.strokeDasharray,
    title: titleChannel(mark),
    className: mark.className,
  };
  return Object.fromEntries(Object.entries(options).filter(([, value]) => value !== undefined));
}

function plotMark(mark) {
  const options = markOptions(mark);
  if (mark.type === 'areaY') return Plot.areaY(mark.data, options);
  if (mark.type === 'barX') return Plot.barX(mark.data, options);
  if (mark.type === 'dot') return Plot.dot(mark.data, options);
  if (mark.type === 'lineY') return Plot.lineY(mark.data, options);
  if (mark.type === 'ruleX') return Plot.ruleX(mark.data, options);
  if (mark.type === 'ruleY') return Plot.ruleY(mark.data, options);
  if (mark.type === 'text') return Plot.text(mark.data, options);
  return null;
}

function toPlotOptions(spec) {
  return {
    width: spec.width,
    height: spec.height,
    marginLeft: spec.marginLeft,
    marginRight: spec.marginRight,
    marginTop: spec.marginTop,
    marginBottom: spec.marginBottom,
    style: spec.style,
    grid: spec.grid,
    x: spec.x,
    y: spec.y,
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
    const svg = Plot.plot(toPlotOptions(spec));
    return mountChart(host, svg, {
      ariaLabel: opts.ariaLabel || spec.ariaLabel,
      className: opts.className,
    });
  } catch (error) {
    renderChartError(host, error);
    return null;
  }
}

function renderDynastyTrendPlot(host, chart = {}, opts = {}) {
  const rows = dynastyTrendRows(chart, opts);
  const spec = dynastyTrendPlotOptions(rows, chart, opts);
  return renderSpec(host, spec, {
    ariaLabel: spec.ariaLabel,
    className: 'dynasty-trend-svg',
    emptyMessage: (chart.series || []).length ? 'All teams are hidden. Click a team in the key to bring it back.' : 'No dynasty trend data available.',
  });
}

function renderGauntletHistogramPlot(host, result, teamSeasonA, teamSeasonB, opts = {}) {
  const payload = gauntletHistogramRows(result, teamSeasonA, teamSeasonB, opts);
  const spec = gauntletHistogramPlotOptions(payload, opts);
  return renderSpec(host, spec, {
    ariaLabel: spec.ariaLabel,
    className: 'gauntlet-histogram-svg',
    emptyMessage: 'No simulation data available.',
  });
}

function renderTrophyCareerPlot(host, view = {}, opts = {}) {
  const rows = trophyCareerRows(view);
  const spec = trophyCareerPlotOptions(rows, opts);
  return renderSpec(host, spec, {
    ariaLabel: spec.ariaLabel,
    className: 'trophy-career-svg',
    emptyMessage: 'No seasons recorded.',
  });
}

function renderRivalryLeadPlot(host, view = {}, opts = {}) {
  const rows = rivalryLeadRows(view, opts.points || []);
  const spec = rivalryLeadPlotOptions(rows, view, opts);
  return renderSpec(host, spec, {
    ariaLabel: spec.ariaLabel,
    className: 'rivalry-trend-svg',
    emptyMessage: 'No recorded games between these teams.',
  });
}

function renderCurrentSeedMovementPlot(host, view = {}, opts = {}) {
  const rows = currentSeedMovementRows(view).slice(0, opts.limit || 8);
  const spec = currentSeedMovementPlotOptions(rows, opts);
  return renderSpec(host, spec, {
    ariaLabel: spec.ariaLabel,
    className: 'current-seed-movement-svg',
    emptyMessage: 'No movement available.',
  });
}

function renderCurrentProjectedStandingsPlot(host, view = {}, opts = {}) {
  const rows = currentProjectedSeedRows(view);
  const spec = currentProjectedSeedPlotOptions(rows, opts);
  return renderSpec(host, spec, {
    ariaLabel: spec.ariaLabel,
    className: 'current-projected-standings-svg',
    emptyMessage: 'No projection available.',
  });
}

export {
  renderCurrentProjectedStandingsPlot,
  renderCurrentSeedMovementPlot,
  renderDynastyTrendPlot,
  renderGauntletHistogramPlot,
  renderRivalryLeadPlot,
  renderTrophyCareerPlot,
};
