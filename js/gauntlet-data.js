import { byDateDesc, isPlayoffGame, isRegularGame, isSaundersGame, roundOrder, sidesForTeam, sum } from './core-helpers.js';
import { headToHeadContext } from './shared/head-to-head-context.js';

function teamSeasonId(owner, season) {
  return `${owner}:${season}`;
}

function parseTeamSeasonId(id) {
  if (typeof id !== 'string' || !id.trim()) return null;
  const index = id.lastIndexOf(':');
  if (index <= 0 || index >= id.length - 1) return null;
  const owner = id.slice(0, index);
  const season = Number(id.slice(index + 1));
  if (!Number.isFinite(season)) return null;
  return { owner, season };
}

function teamSeasonsForOwner(teamSeasons, owner) {
  return teamSeasons
    .filter(teamSeason => teamSeason.owner === owner)
    .sort((a, b) => b.season - a.season || a.owner.localeCompare(b.owner));
}

function quantile(sortedValues, q) {
  if (!sortedValues.length) return 0;
  if (q <= 0) return sortedValues[0];
  if (q >= 1) return sortedValues[sortedValues.length - 1];
  const pos = (sortedValues.length - 1) * q;
  const lower = Math.floor(pos);
  const upper = Math.ceil(pos);
  if (lower === upper) return sortedValues[lower];
  const weight = pos - lower;
  return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
}

function weightedMean(scoreEvents) {
  const clean = scoreEvents.filter(event => Number.isFinite(event?.score) && Number.isFinite(event?.weight) && event.weight > 0);
  if (!clean.length) return 0;
  const totalWeight = clean.reduce((acc, event) => acc + event.weight, 0);
  if (!totalWeight) return 0;
  return clean.reduce((acc, event) => acc + (event.score * event.weight), 0) / totalWeight;
}

function weightedPopulationStdev(scoreEvents, mean) {
  const clean = scoreEvents.filter(event => Number.isFinite(event?.score) && Number.isFinite(event?.weight) && event.weight > 0);
  if (!clean.length) return 0;
  const totalWeight = clean.reduce((acc, event) => acc + event.weight, 0);
  if (!totalWeight) return 0;
  const variance = clean.reduce((acc, event) => acc + (event.weight * ((event.score - mean) ** 2)), 0) / totalWeight;
  return Math.sqrt(variance);
}

function postseasonWeightForGame(game) {
  if (!isPlayoffGame(game)) return 1;
  const order = Math.max(1, Math.min(4, roundOrder(game.round)));
  return 1 + (order / 4);
}

function recordString(wins, losses, ties) {
  return ties ? `${wins}-${losses}-${ties}` : `${wins}-${losses}`;
}

function buildTeamSeasons(leagueGames = [], seasonSummaries = [], opts = {}) {
  const includePostseason = !!opts.includePostseason;
  const summaryById = new Map(seasonSummaries.map(row => [teamSeasonId(row.owner, row.season), row]));
  const seasons = new Map();

  for (const game of leagueGames) {
    const includeGame = isRegularGame(game) || (includePostseason && isPlayoffGame(game));
    if (!includeGame || isSaundersGame(game)) continue;
    const weight = isPlayoffGame(game) ? postseasonWeightForGame(game) : 1;

    const sides = [
      { owner: game.teamA, score: Number(game.scoreA), oppScore: Number(game.scoreB) },
      { owner: game.teamB, score: Number(game.scoreB), oppScore: Number(game.scoreA) },
    ];

    for (const side of sides) {
      const key = teamSeasonId(side.owner, game.season);
      const existing = seasons.get(key) || {
        id: key,
        owner: side.owner,
        season: Number(game.season),
        scores: [],
        scoreEvents: [],
        wins: 0,
        losses: 0,
        ties: 0,
        pointsAgainst: 0,
      };

      existing.scores.push(side.score);
      existing.scoreEvents.push({
        score: side.score,
        weight,
      });
      existing.pointsAgainst += side.oppScore;
      const result = sidesForTeam(game, side.owner)?.result || 'T';
      if (result === 'W') existing.wins += 1;
      else if (result === 'L') existing.losses += 1;
      else existing.ties += 1;
      seasons.set(key, existing);
    }
  }

  const teamSeasons = [];
  for (const season of seasons.values()) {
    if (!season.scores.length) continue;
    const summary = summaryById.get(season.id) || null;
    const sortedScores = season.scores.slice().sort((a, b) => a - b);
    const mean = weightedMean(season.scoreEvents);
    const stdev = weightedPopulationStdev(season.scoreEvents, mean);
    const useIncludedSeasonTotals = includePostseason;
    const wins = useIncludedSeasonTotals
      ? season.wins
      : (Number.isFinite(summary?.wins) ? Number(summary.wins) : season.wins);
    const losses = useIncludedSeasonTotals
      ? season.losses
      : (Number.isFinite(summary?.losses) ? Number(summary.losses) : season.losses);
    const ties = useIncludedSeasonTotals
      ? season.ties
      : (Number.isFinite(summary?.ties) ? Number(summary.ties) : season.ties);
    const pointsFor = useIncludedSeasonTotals
      ? sum(season.scores)
      : (Number.isFinite(summary?.points_for) ? Number(summary.points_for) : sum(season.scores));
    const pointsAgainst = useIncludedSeasonTotals
      ? season.pointsAgainst
      : (Number.isFinite(summary?.points_against) ? Number(summary.points_against) : season.pointsAgainst);

    teamSeasons.push({
      id: season.id,
      owner: season.owner,
      season: season.season,
      scores: season.scores.slice(),
      scoreEvents: season.scoreEvents.slice(),
      games: season.scores.length,
      mean,
      stdev,
      min: sortedScores[0],
      max: sortedScores[sortedScores.length - 1],
      median: quantile(sortedScores, 0.5),
      p25: quantile(sortedScores, 0.25),
      p75: quantile(sortedScores, 0.75),
      record: recordString(wins, losses, ties),
      wins,
      losses,
      ties,
      finish: Number.isFinite(summary?.finish) ? Number(summary.finish) : null,
      champion: !!summary?.champion,
      saunders: !!summary?.saunders,
      bye: !!summary?.bye,
      pointsFor,
      pointsAgainst,
    });
  }

  return teamSeasons.sort((a, b) => b.season - a.season || a.owner.localeCompare(b.owner));
}

function bestTeamSeason(teamSeasons, owner = null) {
  const rows = owner ? teamSeasonsForOwner(teamSeasons, owner) : teamSeasons.slice();
  if (!rows.length) return null;

  return rows.slice().sort((a, b) => {
    const finishA = Number.isFinite(a.finish) ? a.finish : Number.POSITIVE_INFINITY;
    const finishB = Number.isFinite(b.finish) ? b.finish : Number.POSITIVE_INFINITY;
    if (finishA !== finishB) return finishA - finishB;
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (b.pointsFor !== a.pointsFor) return b.pointsFor - a.pointsFor;
    if (b.season !== a.season) return b.season - a.season;
    return a.owner.localeCompare(b.owner);
  })[0] || null;
}

function describeMeeting(game, ownerA, ownerB) {
  const sideA = sidesForTeam(game, ownerA);
  const sideB = sidesForTeam(game, ownerB);
  if (!sideA || !sideB) return null;

  const combined = Number(game.scoreA) + Number(game.scoreB);
  const margin = sideA.pf - sideB.pf;
  const winner = margin > 0 ? 'A' : margin < 0 ? 'B' : 'T';

  return {
    ...game,
    ownerA,
    ownerB,
    ownerAScore: sideA.pf,
    ownerBScore: sideB.pf,
    combined,
    margin,
    winner,
  };
}

function summarizeMeetings(meetings, ownerA, ownerB) {
  const games = meetings
    .map(game => describeMeeting(game, ownerA, ownerB))
    .filter(Boolean)
    .sort(byDateDesc);

  let winsA = 0;
  let winsB = 0;
  let ties = 0;
  let highestCombined = null;

  for (const game of games) {
    if (game.winner === 'A') winsA += 1;
    else if (game.winner === 'B') winsB += 1;
    else ties += 1;
    if (!highestCombined || game.combined > highestCombined.combined) {
      highestCombined = game;
    }
  }

  return {
    ownerA,
    ownerB,
    games: games.length,
    winsA,
    winsB,
    ties,
    recordA: recordString(winsA, winsB, ties),
    recordB: recordString(winsB, winsA, ties),
    highestCombined,
    mostRecent: games[0] || null,
    meetings: games,
  };
}

export {
  buildTeamSeasons,
  postseasonWeightForGame,
  teamSeasonId,
  parseTeamSeasonId,
  bestTeamSeason,
  teamSeasonsForOwner,
  headToHeadContext,
};
