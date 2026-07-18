import {
  computeHeadToHeadPairs,
  computeSeasonAggregatesAllTeams,
  computeTeamsFromLeagueGames,
  computeWeeklyAwards,
} from '../../../js/stats-helpers.js';
import { buildTeamSeasons } from '../../../js/gauntlet-data.js';
import type { LeagueDataSnapshot, LeagueSelectors } from '../app-types';

export function createLeagueSelectors(data: LeagueDataSnapshot): LeagueSelectors {
  let seasonAggregates: unknown[] | null = null;
  let awards: unknown = null;
  let teams: string[] | null = null;
  const pairs = new Map<number, unknown[]>();
  const seasons = new Map<boolean, unknown[]>();
  return {
    seasonAggregates() {
      seasonAggregates ||= computeSeasonAggregatesAllTeams(data.leagueGames, data.seasonSummaries);
      return seasonAggregates;
    },
    weeklyAwards() {
      awards ||= computeWeeklyAwards(data.leagueGames, 150);
      return awards;
    },
    teams() {
      teams ||= computeTeamsFromLeagueGames(data.leagueGames);
      return teams;
    },
    headToHeadPairs(minGames = 5) {
      if (!pairs.has(minGames)) pairs.set(minGames, computeHeadToHeadPairs(data.leagueGames, minGames));
      return pairs.get(minGames) || [];
    },
    teamSeasons(includePostseason = false) {
      if (!seasons.has(includePostseason)) seasons.set(includePostseason, buildTeamSeasons(data.leagueGames, data.seasonSummaries, { includePostseason }));
      return seasons.get(includePostseason) || [];
    },
  };
}
