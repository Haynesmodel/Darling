import { byDateDesc, sidesForTeam } from '../core-helpers.js';

function recordString(wins, losses, ties) {
  return ties ? `${wins}-${losses}-${ties}` : `${wins}-${losses}`;
}

function describeMeeting(game, ownerA, ownerB) {
  const sideA = sidesForTeam(game, ownerA);
  const sideB = sidesForTeam(game, ownerB);
  if (!sideA || !sideB) return null;
  const combined = Number(game.scoreA) + Number(game.scoreB);
  const margin = sideA.pf - sideB.pf;
  return { ...game, ownerA, ownerB, ownerAScore: sideA.pf, ownerBScore: sideB.pf, combined, margin, winner: margin > 0 ? 'A' : margin < 0 ? 'B' : 'T' };
}

function summarizeMeetings(meetings, ownerA, ownerB) {
  const games = meetings.map(game => describeMeeting(game, ownerA, ownerB)).filter(Boolean).sort(byDateDesc);
  let winsA = 0; let winsB = 0; let ties = 0; let highestCombined = null;
  for (const game of games) {
    if (game.winner === 'A') winsA += 1; else if (game.winner === 'B') winsB += 1; else ties += 1;
    if (!highestCombined || game.combined > highestCombined.combined) highestCombined = game;
  }
  return { ownerA, ownerB, games: games.length, winsA, winsB, ties, recordA: recordString(winsA, winsB, ties), recordB: recordString(winsB, winsA, ties), highestCombined, mostRecent: games[0] || null, meetings: games };
}

function headToHeadContext(ownerA, ownerB, leagueGames = [], selectedSeasons = []) {
  const seasonSet = new Set((selectedSeasons || []).map(Number).filter(Number.isFinite));
  const meetings = leagueGames.filter(game => (game.teamA === ownerA && game.teamB === ownerB) || (game.teamA === ownerB && game.teamB === ownerA));
  const selectedGames = seasonSet.size ? meetings.filter(game => seasonSet.has(Number(game.season))) : [];
  return { ownerA, ownerB, selectedSeasons: [...seasonSet].sort((a, b) => a - b), allTime: summarizeMeetings(meetings, ownerA, ownerB), selected: seasonSet.size ? summarizeMeetings(selectedGames, ownerA, ownerB) : null };
}

export { headToHeadContext };
