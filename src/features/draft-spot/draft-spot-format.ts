import { DRAFT_METRICS } from './draft-spot-model';
import type { DraftMetricKey, DraftSpotState, DraftSummary } from './draft-spot-types';

export function formatNumber(value: unknown, digits = 1): string {
  return Number.isFinite(Number(value)) ? Number(value).toFixed(digits) : '—';
}

export function formatPercent(value: unknown, digits = 0): string {
  return Number.isFinite(Number(value)) ? `${(Number(value) * 100).toFixed(digits)}%` : '—';
}

export function formatSigned(value: unknown, digits = 2): string {
  if (!Number.isFinite(Number(value))) return '—';
  const number = Number(value);
  return `${number >= 0 ? '+' : ''}${number.toFixed(digits)}`;
}

export function formatMetric(value: number, metric: DraftMetricKey): string {
  const format = DRAFT_METRICS[metric].format;
  if (format === 'percent') return formatPercent(value);
  if (format === 'count') return String(Math.round(value));
  if (format === 'signed') return formatSigned(value);
  return formatNumber(value);
}

export function draftSummaryContext(summary: DraftSummary, state: DraftSpotState): string {
  if (state.normalize === 'percentile') {
    return `Avg draft percentile ${formatPercent(summary.avg_draft_percentile)}`;
  }
  if (summary.avg_pick !== undefined) return `Avg pick ${formatNumber(summary.avg_pick)}`;
  return summary.draft_pick ? `Pick ${summary.draft_pick}` : '';
}

export function outcomeLabel(row: {
  champion: boolean;
  saunders: boolean;
  made_playoffs: boolean;
  top_three: boolean;
}): string {
  if (row.champion) return 'Champion';
  if (row.saunders) return 'Saunders';
  if (row.top_three) return 'Top 3';
  if (row.made_playoffs) return 'Playoffs';
  return 'Missed playoffs';
}
