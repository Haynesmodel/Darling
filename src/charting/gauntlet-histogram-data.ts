import type { GauntletHistogramChartRow, GauntletHistogramMean } from './chart-types';

const DEFAULT_HISTOGRAM_BINS = 18;

export interface HistogramBin {
  start: number;
  end: number;
  count: number;
}

export interface HistogramOptions {
  min?: number;
  max?: number;
  bins?: number;
}

export interface HistogramResultInput {
  scoresA?: readonly number[];
  scoresB?: readonly number[];
}

export interface HistogramTeamSeasonInput {
  owner: string;
  season: number;
  mean: number;
}

export interface GauntletHistogramPayload {
  rows: GauntletHistogramChartRow[];
  means: GauntletHistogramMean[];
  domain: [number, number];
  maxCount: number;
}

export function histogramBins(values: readonly number[], options: HistogramOptions = {}): HistogramBin[] {
  const clean = values.filter(Number.isFinite);
  if (!clean.length) return [];

  const binCount = Math.max(1, Math.min(50, Math.floor(Number.isFinite(options.bins) ? Number(options.bins) : DEFAULT_HISTOGRAM_BINS)));
  const min = Number.isFinite(options.min) ? Number(options.min) : Math.min(...clean);
  const max = Number.isFinite(options.max) ? Number(options.max) : Math.max(...clean);
  if (min === max) return [{ start: min - 0.5, end: max + 0.5, count: clean.length }];

  const width = (max - min) / binCount;
  const bins = Array.from({ length: binCount }, (_, index) => ({
    start: min + index * width,
    end: index === binCount - 1 ? max : min + (index + 1) * width,
    count: 0,
  }));
  for (const value of clean) {
    const index = Math.max(0, Math.min(binCount - 1, Math.floor((value - min) / width)));
    bins[index].count += 1;
  }
  return bins;
}

export function gauntletHistogramRows(
  result?: HistogramResultInput | null,
  teamSeasonA?: HistogramTeamSeasonInput | null,
  teamSeasonB?: HistogramTeamSeasonInput | null,
  options: HistogramOptions = {},
): GauntletHistogramPayload {
  if (!result || !teamSeasonA || !teamSeasonB) {
    return { rows: [], means: [], domain: [0, 1], maxCount: 0 };
  }
  const scoresA = Array.isArray(result.scoresA) ? result.scoresA.filter(Number.isFinite) : [];
  const scoresB = Array.isArray(result.scoresB) ? result.scoresB.filter(Number.isFinite) : [];
  const combined = scoresA.concat(scoresB);
  if (!combined.length) return { rows: [], means: [], domain: [0, 1], maxCount: 0 };

  const min = Number.isFinite(options.min) ? Number(options.min) : Math.min(...combined);
  const max = Number.isFinite(options.max) ? Number(options.max) : Math.max(...combined);
  const binCount = Number.isFinite(options.bins) ? Number(options.bins) : DEFAULT_HISTOGRAM_BINS;
  const teams = [
    { key: 'A' as const, teamSeason: teamSeasonA, scores: scoresA },
    { key: 'B' as const, teamSeason: teamSeasonB, scores: scoresB },
  ];
  const rows = teams.flatMap(team => histogramBins(team.scores, { bins: binCount, min, max }).map((bin, index) => ({
    key: team.key,
    owner: team.teamSeason.owner,
    season: team.teamSeason.season,
    label: `${team.teamSeason.owner} ${team.teamSeason.season}`,
    binIndex: index,
    start: bin.start,
    end: bin.end,
    center: (bin.start + bin.end) / 2,
    count: bin.count,
    rangeLabel: `${bin.start.toFixed(1)}-${bin.end.toFixed(1)}`,
    mean: team.teamSeason.mean,
    title: `${team.teamSeason.owner} ${team.teamSeason.season}: ${bin.count} simulations from ${bin.start.toFixed(1)} to ${bin.end.toFixed(1)}`,
  })));
  return {
    rows,
    means: teams.map(team => ({
      key: team.key,
      owner: team.teamSeason.owner,
      season: team.teamSeason.season,
      label: `${team.teamSeason.owner} ${team.teamSeason.season}`,
      mean: team.teamSeason.mean,
      title: `${team.teamSeason.owner} ${team.teamSeason.season} mean ${Number(team.teamSeason.mean).toFixed(1)}`,
    })),
    domain: [min, max],
    maxCount: rows.reduce((maximum, row) => Math.max(maximum, row.count), 0),
  };
}
