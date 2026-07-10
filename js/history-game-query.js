import { normRound, normType } from './core-helpers.js';

function gameId(game, index) {
  return [game.season, game.date, game.teamA, game.teamB, index].join(':');
}

function perspectiveRow(game, team, opponent, score, opponentScore, index) {
  const result = score > opponentScore ? 'W' : score < opponentScore ? 'L' : 'T';
  return {
    gameId: gameId(game, index),
    season: Number(game.season),
    date: String(game.date || ''),
    team,
    opponent,
    result,
    score: Number(score),
    opponentScore: Number(opponentScore),
    margin: Number(score) - Number(opponentScore),
    combinedScore: Number(score) + Number(opponentScore),
    type: normType(game.type),
    round: normRound(game.round),
    week: game._weekByTeam?.[team] ?? game.week ?? '',
    sourceGame: game,
  };
}

function buildHistoryGameRows(games = [], opts = {}) {
  const selectedTeam = opts.selectedTeam || '__ALL__';
  const allTeams = opts.allTeams || '__ALL__';
  const rows = [];
  games.forEach((game, index) => {
    if (selectedTeam === allTeams || game.teamA === selectedTeam) {
      rows.push(perspectiveRow(game, game.teamA, game.teamB, game.scoreA, game.scoreB, index));
    }
    if (selectedTeam === allTeams || game.teamB === selectedTeam) {
      rows.push(perspectiveRow(game, game.teamB, game.teamA, game.scoreB, game.scoreA, index));
    }
  });
  return rows;
}

const SORTERS = {
  dateDesc: (a, b) => b.date.localeCompare(a.date) || b.season - a.season,
  scoreDesc: (a, b) => b.score - a.score || b.date.localeCompare(a.date),
  scoreAsc: (a, b) => a.score - b.score || b.date.localeCompare(a.date),
  marginDesc: (a, b) => b.margin - a.margin || b.score - a.score,
  marginAsc: (a, b) => a.margin - b.margin || a.score - b.score,
  combinedDesc: (a, b) => b.combinedScore - a.combinedScore || b.date.localeCompare(a.date),
};

function applyHistoryGameQuery(rows = [], query = {}) {
  let result = rows.filter(row => {
    if (query.gameResult && row.result !== query.gameResult) return false;
    if (Number.isFinite(query.gameMinScore) && row.score < query.gameMinScore) return false;
    if (Number.isFinite(query.gameMaxScore) && row.score > query.gameMaxScore) return false;
    return true;
  });
  result = result.slice().sort(SORTERS[query.gameSort] || SORTERS.dateDesc);
  if (Number.isFinite(query.gameLimit) && query.gameLimit > 0) {
    result = result.slice(0, Math.min(100, Math.floor(query.gameLimit)));
  }
  return result;
}

function historyGameQuerySummary(rows = [], query = {}, opts = {}) {
  const allTeams = opts.selectedTeam === (opts.allTeams || '__ALL__');
  const parts = [];
  if (query.gameResult) parts.push(`${query.gameResult === 'W' ? 'wins' : query.gameResult === 'L' ? 'losses' : 'ties'}`);
  if (Number.isFinite(query.gameMinScore)) parts.push(`scores of at least ${query.gameMinScore}`);
  if (Number.isFinite(query.gameMaxScore)) parts.push(`scores of at most ${query.gameMaxScore}`);
  if (query.gameSort && query.gameSort !== 'dateDesc') parts.push(`sorted by ${query.gameSort.replace(/([A-Z])/g, ' $1').toLowerCase()}`);
  if (Number.isFinite(query.gameLimit)) parts.push(`first ${Math.min(100, query.gameLimit)}`);
  const perspective = allTeams ? 'team perspectives' : 'games';
  return `Showing ${rows.length} ${perspective}${parts.length ? `: ${parts.join(', ')}` : ''}.`;
}

function queryHistoryGames(games = [], opts = {}) {
  const rows = buildHistoryGameRows(games, opts);
  const filteredRows = applyHistoryGameQuery(rows, opts.query || {});
  return {
    rows: filteredRows,
    summary: historyGameQuerySummary(filteredRows, opts.query || {}, opts),
  };
}

export {
  applyHistoryGameQuery,
  buildHistoryGameRows,
  historyGameQuerySummary,
  queryHistoryGames,
};
