import { isRegularGame } from './core-helpers.js';
import { currentSeasonSourceGames, isCompletedGame, weekForGame } from './current-season-data.js';

const score = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) ? Number(value) : null;
const result = (a, b) => a > b ? 'W' : a < b ? 'L' : 'T';
const record = () => ({ W: 0, L: 0, T: 0 });
const add = (row, value) => { row[value] += 1; };

function buildScheduleComparison({ leagueGames = [], currentSeason = null, season = currentSeason?.season, week = currentSeason?.current_week, owner = '', donor = '' } = {}) {
  const games = currentSeasonSourceGames(leagueGames, season, currentSeason).filter(game => Number(game.season) === Number(season));
  const activeSnapshot = Number(currentSeason?.season) === Number(season) ? currentSeason : null;
  const teams = activeSnapshot?.teams ? [...new Set(activeSnapshot.teams.map(team => team.owner).filter(Boolean))]
    : [...new Set(games.filter(isRegularGame).flatMap(game => [game.teamA, game.teamB]).filter(Boolean))].sort();
  const names = Object.fromEntries((activeSnapshot?.teams || []).map(team => [team.owner, team.sleeper_team_name || team.owner]));
  const cutoff = Number(week);
  const byWeek = new Map();
  const excluded = [];
  for (const game of games) {
    if (!isRegularGame(game)) continue;
    const n = Number(weekForGame(game));
    if (!Number.isFinite(n) || n < 1) { excluded.push({ week: '?', reason: 'has an invalid week' }); continue; }
    if (n > cutoff) continue;
    const rows = byWeek.get(n) || [];
    rows.push(game);
    byWeek.set(n, rows);
  }
  const lastObservedWeek = Math.min(cutoff, Math.max(0, ...byWeek.keys()));
  for (let n = 1; n <= lastObservedWeek; n += 1) if (!byWeek.has(n)) byWeek.set(n, []);
  const included = [];
  for (const [n, rows] of [...byWeek].sort(([a], [b]) => a - b)) {
    const seen = new Set();
    let reason = '';
    for (const game of rows) {
      if (['live', 'scheduled'].includes(String(game.status || '').toLowerCase())) reason ||= 'contains live or scheduled games';
      else if (score(game.scoreA) === null || score(game.scoreB) === null || !isCompletedGame(game)) reason ||= 'contains a non-final or scoreless game';
      for (const team of [game.teamA, game.teamB]) {
        if (!teams.includes(team) || seen.has(team) || game.teamA === game.teamB) reason ||= 'has duplicate or unknown teams';
        seen.add(team);
      }
    }
    if (!reason && (seen.size !== teams.length || rows.length * 2 !== teams.length)) reason = 'is missing one or more teams';
    if (reason) excluded.push({ week: n, reason });
    else included.push({ week: n, games: rows });
  }
  const matrix = Object.fromEntries(teams.map(team => [team, Object.fromEntries(teams.map(schedule => [schedule, record()]))]));
  const allPlay = Object.fromEntries(teams.map(team => [team, { weeks: {}, total: record() }]));
  const details = [];
  const selectedTeam = teams.includes(owner) ? owner : teams[0];
  const selectedDonor = teams.includes(donor) ? donor : selectedTeam;
  const gameFor = (weekGames, team) => weekGames.find(game => game.teamA === team || game.teamB === team);
  for (const { week: n, games: weekGames } of included) {
    for (const team of teams) {
      const game = gameFor(weekGames, team);
      const own = game.teamA === team ? score(game.scoreA) : score(game.scoreB);
      const opponent = game.teamA === team ? game.teamB : game.teamA;
      const oppScore = game.teamA === team ? score(game.scoreB) : score(game.scoreA);
      const actualResult = result(own, oppScore);
      const tally = record();
      const beaten = [], tied = [], lostTo = [];
      for (const other of teams) if (other !== team) {
        const otherGame = gameFor(weekGames, other);
        const otherScore = otherGame.teamA === other ? score(otherGame.scoreA) : score(otherGame.scoreB);
        const outcome = result(own, otherScore);
        add(tally, outcome);
        (outcome === 'W' ? beaten : outcome === 'T' ? tied : lostTo).push({ owner: other, score: otherScore });
      }
      allPlay[team].weeks[n] = tally;
      for (const key of ['W', 'L', 'T']) allPlay[team].total[key] += tally[key];
      for (const schedule of teams) {
        const donorGame = gameFor(weekGames, schedule);
        const originalOpponent = donorGame.teamA === schedule ? donorGame.teamB : donorGame.teamA;
        const alternative = originalOpponent === team ? schedule : originalOpponent;
        const alternativeGame = gameFor(weekGames, alternative);
        const alternativeScore = alternativeGame.teamA === alternative ? score(alternativeGame.scoreA) : score(alternativeGame.scoreB);
        const alternativeResult = result(own, alternativeScore);
        add(matrix[team][schedule], alternativeResult);
        if (team === selectedTeam && schedule === selectedDonor) {
          const donorGame = gameFor(weekGames, schedule);
          const originalOpponent = donorGame.teamA === schedule ? donorGame.teamB : donorGame.teamA;
          details.push({ week: n, score: own, opponent, opponentScore: oppScore, result: actualResult, allPlay: tally, beaten, tied, lostTo, donor: schedule, donorOpponent: originalOpponent, alternativeOpponent: alternative, alternativeScore, alternativeResult, collision: originalOpponent === team });
        }
      }
    }
  }
  const counterfactual = record();
  for (const row of details) add(counterfactual, row.alternativeResult);
  return { teams, names, weeks: included.map(row => row.week), excluded, matrix, allPlay, details, counterfactual };
}

export { buildScheduleComparison };
