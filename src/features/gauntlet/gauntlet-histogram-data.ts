const DEFAULT_HISTOGRAM_BINS = 18;
interface HistogramBin { start: number; end: number; count: number }
export interface HistogramResultInput { scoresA?: readonly number[]; scoresB?: readonly number[] }
export interface HistogramTeamSeasonInput { owner: string; season: number; mean: number }
export interface GauntletHistogramPayload {
  rows: Array<{ label: string; center: number; count: number }>;
  means: Array<{ label: string; mean: number }>;
  domain: [number, number];
  maxCount: number;
}

function histogramBins(values: readonly number[], min: number, max: number): HistogramBin[] {
  const clean = values.filter(Number.isFinite);
  if (!clean.length) return [];
  const count = DEFAULT_HISTOGRAM_BINS;
  if (min === max) return [{ start: min - 0.5, end: max + 0.5, count: clean.length }];
  const width = (max - min) / count;
  const bins = Array.from({ length: count }, (_, index) => ({ start: min + index * width, end: index === count - 1 ? max : min + (index + 1) * width, count: 0 }));
  for (const value of clean) bins[Math.max(0, Math.min(count - 1, Math.floor((value - min) / width)))].count += 1;
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
  const teams = [{ teamSeason: teamSeasonA, scores: scoresA }, { teamSeason: teamSeasonB, scores: scoresB }];
  const rows = teams.flatMap(team => histogramBins(team.scores, min, max).map(bin => ({
    label: `${team.teamSeason.owner} ${team.teamSeason.season}`,
    center: (bin.start + bin.end) / 2,
    count: bin.count,
  })));
  return {
    rows,
    means: teams.map(team => ({ label: `${team.teamSeason.owner} ${team.teamSeason.season}`, mean: team.teamSeason.mean })),
    domain: [min, max],
    maxCount: rows.reduce((maximum, row) => Math.max(maximum, row.count), 0),
  };
}
