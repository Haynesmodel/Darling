import type { CurrentSeasonData, H2HGame, SeasonSummaryRow } from './generated/asset-types';
import { isSeasonSummaryComplete, latestCompleteSeason } from './season-recap';

export type SeasonPresentationPhase =
  | 'preseason'
  | 'regular-season'
  | 'postseason'
  | 'finalizing'
  | 'offseason'
  | 'historical-fallback';

export interface SeasonPresentationState {
  phase: SeasonPresentationPhase;
  season: number | null;
  spotlightWeek: number | null;
  isLive: boolean;
  summaryComplete: boolean;
  source: 'current-season' | 'historical';
}

function spotlightWeek(games: CurrentSeasonData['games'], fallback: number | null): number | null {
  const weeks = [...new Set(games.map(game => Number(game.week)).filter(Number.isFinite))].sort((a, b) => a - b);
  if (!weeks.length) return null;
  const live = games.filter(game => game.status === 'live').map(game => Number(game.week)).filter(Number.isFinite);
  if (live.length) return Math.max(...live);
  if (Number.isFinite(Number(fallback)) && weeks.includes(Number(fallback))) return Number(fallback);
  const finals = games.filter(game => game.status === 'final').map(game => Number(game.week)).filter(Number.isFinite);
  const latestFinal = finals.length ? Math.max(...finals) : null;
  const future = games
    .filter(game => game.status === 'scheduled' && (latestFinal === null || Number(game.week) > latestFinal))
    .map(game => Number(game.week))
    .filter(Number.isFinite);
  if (future.length) return Math.min(...future);
  if (finals.length) return Math.max(...finals);
  return Math.min(...weeks);
}

function latestHistoricalSeason(leagueGames: H2HGame[], seasonSummaries: SeasonSummaryRow[]): number | null {
  const seasons = [
    ...leagueGames.map(game => Number(game.season)),
    ...seasonSummaries.map(row => Number(row.season)),
  ].filter(Number.isFinite);
  return seasons.length ? Math.max(...seasons) : null;
}

function historicalState(
  season: number | null,
  seasonSummaries: SeasonSummaryRow[],
  phase: SeasonPresentationPhase = 'historical-fallback',
): SeasonPresentationState {
  return {
    phase,
    season,
    spotlightWeek: null,
    isLive: false,
    summaryComplete: season !== null && isSeasonSummaryComplete(seasonSummaries, season),
    source: 'historical',
  };
}

export function resolveSeasonPresentation(input: {
  selectedSeason?: number | null;
  currentSeason: CurrentSeasonData | null;
  seasonSummaries: SeasonSummaryRow[];
  leagueGames: H2HGame[];
}): SeasonPresentationState {
  const { currentSeason, seasonSummaries, leagueGames } = input;
  const selected = input.selectedSeason !== null
    && input.selectedSeason !== undefined
    && Number.isFinite(Number(input.selectedSeason))
    ? Number(input.selectedSeason)
    : null;
  const currentSeasonNumber = Number.isFinite(Number(currentSeason?.season)) ? Number(currentSeason?.season) : null;

  if (selected !== null && selected !== currentSeasonNumber) {
    return historicalState(selected, seasonSummaries);
  }

  if (!currentSeason || currentSeasonNumber === null) {
    const completeSeason = latestCompleteSeason(seasonSummaries);
    if (completeSeason !== null) return historicalState(completeSeason, seasonSummaries, 'offseason');
    return historicalState(selected ?? latestHistoricalSeason(leagueGames, seasonSummaries), seasonSummaries);
  }

  const games = Array.isArray(currentSeason.games) ? currentSeason.games : [];
  if (!games.length) {
    if (selected === currentSeasonNumber) {
      return historicalState(currentSeasonNumber, seasonSummaries);
    }
    const completeSeason = latestCompleteSeason(seasonSummaries);
    if (completeSeason !== null) return historicalState(completeSeason, seasonSummaries, 'offseason');
    return historicalState(latestHistoricalSeason(leagueGames, seasonSummaries), seasonSummaries);
  }

  const season = currentSeasonNumber;
  const week = spotlightWeek(games, currentSeason.current_week);
  const isLive = games.some(game => game.status === 'live');
  const allFinal = games.every(game => game.status === 'final');
  const scheduledOrLive = games.some(game => game.status === 'scheduled' || game.status === 'live');
  const summaryComplete = isSeasonSummaryComplete(seasonSummaries, season);

  if (allFinal) {
    return {
      phase: summaryComplete ? 'offseason' : 'finalizing',
      season,
      spotlightWeek: week,
      isLive: false,
      summaryComplete,
      source: 'current-season',
    };
  }

  if (games.every(game => game.status === 'scheduled')) {
    return {
      phase: 'preseason',
      season,
      spotlightWeek: week,
      isLive: false,
      summaryComplete,
      source: 'current-season',
    };
  }

  if (scheduledOrLive) {
    const regularSeasonMax = Number(currentSeason.playoff_rules?.regular_season_max_week
      ?? currentSeason.regular_season_max_week);
    const spotlightGames = week === null ? games : games.filter(game => Number(game.week) === week);
    const postseason = (Number.isFinite(regularSeasonMax) && Number(week) > regularSeasonMax)
      || spotlightGames.some(game => game.type !== 'Regular' || Boolean(String(game.round || '').trim()));
    return {
      phase: postseason ? 'postseason' : 'regular-season',
      season,
      spotlightWeek: week,
      isLive,
      summaryComplete,
      source: 'current-season',
    };
  }

  return historicalState(season, seasonSummaries);
}

export function defaultCurrentViewForPhase(
  phase: SeasonPresentationPhase,
): 'command' | 'recap' {
  return ['regular-season', 'postseason'].includes(phase) ? 'command' : 'recap';
}

export function seasonPresentationAllowsOdds(
  state: SeasonPresentationState,
  selectedView: string,
): boolean {
  return state.phase === 'regular-season'
    && ['command', 'standings'].includes(selectedView);
}
