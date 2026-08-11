import type { GauntletHistogramChartRow, GauntletHistogramMean } from '../../charting/chart-types';

const DEFAULT_HISTOGRAM_BINS = 18;
interface HistogramBin { start: number; end: number; count: number }
export interface HistogramResultInput { scoresA?: readonly number[]; scoresB?: readonly number[] }
export interface HistogramTeamSeasonInput { owner: string; season: number; mean: number }
export interface GauntletHistogramPayload {
  rows: GauntletHistogramChartRow[];
  means: GauntletHistogramMean[];
  domain: [number, number];
  maxCount: number;
}

function histogramBins(values: readonly number[], min: number, max: number): HistogramBin[] {
  const clean = values.filter(Number.isFinite);
  if (!clean.length) return [];
  if (min === max) return [{ start: min - 0.5, end: max + 0.5, count: clean.length }];
  const width = (max - min) / DEFAULT_HISTOGRAM_BINS;
  const bins = Array.from({ length: DEFAULT_HISTOGRAM_BINS }, (_, index) => ({
    start: min + index * width,
    end: index === DEFAULT_HISTOGRAM_BINS - 1 ? max : min + (index + 1) * width,
    count: 0,
  }));
  for (const value of clean) bins[Math.max(0, Math.min(DEFAULT_HISTOGRAM_BINS - 1, Math.floor((value - min) / width)))].count += 1;
  return bins;
}

export function gauntletHistogramRows(result: HistogramResultInput | null, teamSeasonA: HistogramTeamSeasonInput | null, teamSeasonB: HistogramTeamSeasonInput | null): GauntletHistogramPayload {
  if (!result || !teamSeasonA || !teamSeasonB) return { rows: [], means: [], domain: [0, 1], maxCount: 0 };
  const scoresA = Array.isArray(result.scoresA) ? result.scoresA.filter(Number.isFinite) : [];
  const scoresB = Array.isArray(result.scoresB) ? result.scoresB.filter(Number.isFinite) : [];
  const combined = scoresA.concat(scoresB);
  if (!combined.length) return { rows: [], means: [], domain: [0, 1], maxCount: 0 };
  const min = Math.min(...combined);
  const max = Math.max(...combined);
  const teams = [
    { key: 'A' as const, scores: scoresA, label: `${teamSeasonA.owner} ${teamSeasonA.season}`, mean: teamSeasonA.mean },
    { key: 'B' as const, scores: scoresB, label: `${teamSeasonB.owner} ${teamSeasonB.season}`, mean: teamSeasonB.mean },
  ];
  const rows = teams.flatMap(team => histogramBins(team.scores, min, max).map(bin => {
    const start = bin.start.toFixed(1);
    const end = bin.end.toFixed(1);
    return { key: team.key, label: team.label, center: (bin.start + bin.end) / 2, count: bin.count, title: `${team.label} ${start}-${end} ${bin.count}` };
  }));
  return {
    rows,
    means: teams.map(team => ({ key: team.key, label: team.label, mean: team.mean, title: `${team.label}: mean ${team.mean.toFixed(1)}` })),
    domain: [min, max],
    maxCount: rows.reduce((maximum, row) => Math.max(maximum, row.count), 0),
  };
}
