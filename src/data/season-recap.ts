import type { H2HGame, SeasonSummaryRow } from './generated/asset-types';

export interface SeasonRecapStanding {
  finish: number;
  owner: string;
  record: string;
  pointsFor: number;
}

export interface SeasonRecap {
  season: number;
  complete: boolean;
  champion: string | null;
  runnerUp: string | null;
  saunders: string | null;
  championshipResult: string | null;
  finalStandings: SeasonRecapStanding[];
}

function record(row: SeasonSummaryRow): string {
  return `${row.wins}-${row.losses}${row.ties ? `-${row.ties}` : ''}`;
}

function score(value: number): string {
  return Number(value).toLocaleString('en-US', { maximumFractionDigits: 2 });
}

export function seasonSummaryRows(
  seasonSummaries: SeasonSummaryRow[],
  season: number,
): SeasonSummaryRow[] {
  return seasonSummaries
    .filter(row => Number(row.season) === Number(season))
    .slice()
    .sort((a, b) => Number(a.finish) - Number(b.finish) || a.owner.localeCompare(b.owner));
}

export function isSeasonSummaryComplete(
  seasonSummaries: SeasonSummaryRow[],
  season: number,
): boolean {
  const rows = seasonSummaryRows(seasonSummaries, season);
  return rows.filter(row => row.champion).length === 1
    && rows.filter(row => row.saunders).length === 1;
}

export function latestCompleteSeason(seasonSummaries: SeasonSummaryRow[]): number | null {
  const seasons = [...new Set(seasonSummaries.map(row => Number(row.season)).filter(Number.isFinite))]
    .sort((a, b) => b - a);
  return seasons.find(season => isSeasonSummaryComplete(seasonSummaries, season)) ?? null;
}

export function resolveSeasonRecap(input: {
  season: number | null;
  seasonSummaries: SeasonSummaryRow[];
  leagueGames: H2HGame[];
}): SeasonRecap | null {
  if (input.season === null || input.season === undefined || !Number.isFinite(Number(input.season))) return null;
  const season = Number(input.season);
  const rows = seasonSummaryRows(input.seasonSummaries, season);
  const complete = isSeasonSummaryComplete(input.seasonSummaries, season);
  const champion = complete ? rows.find(row => row.champion) || null : null;
  const saunders = complete ? rows.find(row => row.saunders) || null : null;
  const runnerUp = rows.find(row => Number(row.finish) === 2) || null;
  const championship = input.leagueGames
    .filter(game => Number(game.season) === season && String(game.round || '').toLowerCase().includes('championship'))
    .slice()
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))[0] || null;

  return {
    season,
    complete,
    champion: champion?.owner || null,
    runnerUp: runnerUp?.owner || null,
    saunders: saunders?.owner || null,
    championshipResult: championship
      ? `${championship.teamA} ${score(championship.scoreA)}–${score(championship.scoreB)} ${championship.teamB}`
      : null,
    finalStandings: rows.map(row => ({
      finish: row.finish,
      owner: row.owner,
      record: record(row),
      pointsFor: row.points_for,
    })),
  };
}
