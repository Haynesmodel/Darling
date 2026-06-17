import { byDateAsc, byDateDesc, isPlayoffGame, isRegularGame, sidesForTeam } from './core-helpers.js';
import { headToHeadContext } from './gauntlet-data.js';

function numeric(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function latestLeagueSeason(leagueGames = [], seasonSummaries = [], currentSeason = null) {
  const seasons = [
    numeric(currentSeason?.season),
    ...leagueGames.map(game => numeric(game?.season)),
    ...seasonSummaries.map(row => numeric(row?.season)),
  ].filter(Number.isFinite);
  return seasons.length ? Math.max(...seasons) : null;
}

function currentSeasonSourceGames(leagueGames = [], season = null, currentSeason = null) {
  const assetSeason = numeric(currentSeason?.season);
  const target = numeric(season) ?? assetSeason;
  if (currentSeason && Number.isFinite(assetSeason) && assetSeason === target && Array.isArray(currentSeason.games)) {
    return currentSeason.games;
  }
  return currentSeasonGames(leagueGames, target);
}

function currentSeasonGames(leagueGames = [], season = latestLeagueSeason(leagueGames)) {
  const target = numeric(season);
  if (!Number.isFinite(target)) return [];
  return leagueGames.filter(game => numeric(game?.season) === target);
}

function weekForGame(game, owner = null) {
  if (owner && Number.isFinite(Number(game?._weekByTeam?.[owner]))) {
    return Number(game._weekByTeam[owner]);
  }
  if (Number.isFinite(Number(game?.week))) return Number(game.week);
  const derivedWeeks = Object.values(game?._weekByTeam || {})
    .map(Number)
    .filter(Number.isFinite);
  return derivedWeeks.length ? Math.max(...derivedWeeks) : null;
}

function currentSeasonWeeks(leagueGames = [], season = latestLeagueSeason(leagueGames), currentSeason = null) {
  return [...new Set(currentSeasonSourceGames(leagueGames, season, currentSeason)
    .map(game => weekForGame(game))
    .filter(Number.isFinite))]
    .sort((a, b) => a - b);
}

function latestCompletedWeek(leagueGames = [], season = latestLeagueSeason(leagueGames), currentSeason = null) {
  if (Number.isFinite(Number(currentSeason?.current_week)) && Number(currentSeason.season) === Number(season)) {
    return Number(currentSeason.current_week);
  }
  const weeks = currentSeasonWeeks(
    currentSeasonSourceGames(leagueGames, season, currentSeason).filter(isRegularGame),
    season,
    null
  );
  return weeks.length ? weeks[weeks.length - 1] : null;
}

function gamesForSeasonWeek(leagueGames = [], season, week, currentSeason = null) {
  const targetSeason = numeric(season);
  const targetWeek = numeric(week);
  if (!Number.isFinite(targetSeason) || !Number.isFinite(targetWeek)) return [];
  return currentSeasonSourceGames(leagueGames, targetSeason, currentSeason)
    .filter(game => numeric(game?.season) === targetSeason && weekForGame(game) === targetWeek)
    .slice()
    .sort((a, b) => byDateAsc(a, b) || String(a.teamA).localeCompare(String(b.teamA)) || String(a.teamB).localeCompare(String(b.teamB)));
}

function ownersForSeason(leagueGames = [], seasonSummaries = [], season = latestLeagueSeason(leagueGames, seasonSummaries), currentSeason = null) {
  const target = numeric(season);
  const owners = new Set();
  for (const row of seasonSummaries) {
    if (numeric(row?.season) === target && row.owner) owners.add(row.owner);
  }
  for (const game of currentSeasonSourceGames(leagueGames, target, currentSeason)) {
    if (game.teamA) owners.add(game.teamA);
    if (game.teamB) owners.add(game.teamB);
  }
  return [...owners].sort((a, b) => a.localeCompare(b));
}

function emptyStanding(owner, season) {
  return {
    owner,
    season,
    games: 0,
    wins: 0,
    losses: 0,
    ties: 0,
    pointsFor: 0,
    pointsAgainst: 0,
    differential: 0,
    pct: 0,
    streak: '',
    rank: null,
  };
}

function formatRecord(wins, losses, ties = 0) {
  return ties ? `${wins}-${losses}-${ties}` : `${wins}-${losses}`;
}

function resultStreakForOwner(games, owner) {
  const ordered = games
    .filter(game => sidesForTeam(game, owner))
    .slice()
    .sort(byDateAsc);
  if (!ordered.length) return '';
  const last = sidesForTeam(ordered[ordered.length - 1], owner)?.result || 'T';
  let count = 0;
  for (let i = ordered.length - 1; i >= 0; i -= 1) {
    const side = sidesForTeam(ordered[i], owner);
    if (!side || side.result !== last) break;
    count += 1;
  }
  return `${last}${count}`;
}

function hasPlayedScore(game) {
  return Number.isFinite(Number(game?.scoreA)) && Number.isFinite(Number(game?.scoreB));
}

function isCompletedGame(game) {
  const status = String(game?.status || '').toLowerCase();
  if (status === 'scheduled') return false;
  if (status === 'final' || status === 'complete' || status === 'completed') return hasPlayedScore(game);
  return hasPlayedScore(game) && !(Number(game.scoreA) === 0 && Number(game.scoreB) === 0);
}

function buildCurrentSeasonStandings({ leagueGames = [], seasonSummaries = [], currentSeason = null, season = latestLeagueSeason(leagueGames, seasonSummaries, currentSeason) } = {}) {
  const target = numeric(season);
  if (!Number.isFinite(target)) return [];
  const rows = new Map(ownersForSeason(leagueGames, seasonSummaries, target, currentSeason).map(owner => [owner, emptyStanding(owner, target)]));
  const regularGames = currentSeasonSourceGames(leagueGames, target, currentSeason).filter(isRegularGame).filter(isCompletedGame);

  for (const game of regularGames) {
    for (const owner of [game.teamA, game.teamB]) {
      if (!rows.has(owner)) rows.set(owner, emptyStanding(owner, target));
      const side = sidesForTeam(game, owner);
      if (!side) continue;
      const row = rows.get(owner);
      row.games += 1;
      row.pointsFor += side.pf;
      row.pointsAgainst += side.pa;
      if (side.result === 'W') row.wins += 1;
      else if (side.result === 'L') row.losses += 1;
      else row.ties += 1;
    }
  }

  const out = [...rows.values()].map(row => ({
    ...row,
    record: formatRecord(row.wins, row.losses, row.ties),
    differential: row.pointsFor - row.pointsAgainst,
    pct: row.games ? (row.wins + 0.5 * row.ties) / row.games : 0,
    streak: resultStreakForOwner(regularGames, row.owner),
  })).sort((a, b) => (
    b.pct - a.pct ||
    b.pointsFor - a.pointsFor ||
    b.differential - a.differential ||
    a.owner.localeCompare(b.owner)
  ));

  out.forEach((row, idx) => { row.rank = idx + 1; });
  return out;
}

function pairMatches(game, teamA, teamB) {
  return (game.teamA === teamA && game.teamB === teamB) ||
    (game.teamA === teamB && game.teamB === teamA);
}

function previousMeeting(leagueGames, teamA, teamB, beforeGame) {
  return leagueGames
    .filter(game => pairMatches(game, teamA, teamB))
    .filter(game => {
      if (!beforeGame) return true;
      if (String(game.date) < String(beforeGame.date)) return true;
      if (String(game.date) !== String(beforeGame.date)) return false;
      return numeric(game.season) < numeric(beforeGame.season);
    })
    .slice()
    .sort(byDateDesc)[0] || null;
}

function formForOwner(leagueGames, owner, season, week, currentSeason = null, limit = 3) {
  const targetWeek = numeric(week);
  return currentSeasonSourceGames(leagueGames, season, currentSeason)
    .filter(isRegularGame)
    .filter(isCompletedGame)
    .filter(game => sidesForTeam(game, owner))
    .filter(game => {
      const gameWeek = weekForGame(game, owner);
      return !Number.isFinite(targetWeek) || !Number.isFinite(gameWeek) || gameWeek <= targetWeek;
    })
    .slice()
    .sort(byDateDesc)
    .slice(0, limit)
    .map(game => sidesForTeam(game, owner)?.result || 'T')
    .reverse()
    .join('');
}

function dedupeContextGames(games = []) {
  const seen = new Set();
  const out = [];
  for (const game of games) {
    const key = [
      Number(game.season),
      Number(weekForGame(game) || game.week || 0),
      ...[game.teamA, game.teamB].sort(),
    ].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(game);
  }
  return out;
}

function buildCurrentMatchupRows({ leagueGames = [], seasonSummaries = [], currentSeason = null, season = latestLeagueSeason(leagueGames, seasonSummaries, currentSeason), week = latestCompletedWeek(leagueGames, season, currentSeason) } = {}) {
  const sourceGames = currentSeasonSourceGames(leagueGames, season, currentSeason);
  const contextGames = dedupeContextGames([
    ...leagueGames.filter(game => numeric(game.season) !== numeric(season)),
    ...sourceGames,
  ]);
  const standings = new Map(buildCurrentSeasonStandings({ leagueGames, seasonSummaries, currentSeason, season }).map(row => [row.owner, row]));
  return gamesForSeasonWeek(leagueGames, season, week, currentSeason)
    .map(game => {
      const allTimeContext = headToHeadContext(game.teamA, game.teamB, contextGames);
      const historicGames = leagueGames.filter(row => numeric(row.season) < numeric(season));
      const historicContext = headToHeadContext(game.teamA, game.teamB, historicGames);
      const currentSeasonContext = headToHeadContext(game.teamA, game.teamB, sourceGames, [season]);
      const sideA = sidesForTeam(game, game.teamA);
      const sideB = sidesForTeam(game, game.teamB);
      return {
        season: numeric(game.season),
        week: weekForGame(game, game.teamA) || weekForGame(game, game.teamB) || weekForGame(game),
        date: game.date,
        teamA: game.teamA,
        teamB: game.teamB,
        scoreA: numeric(game.scoreA),
        scoreB: numeric(game.scoreB),
        type: game.type || '',
        round: game.round || '',
        status: game.status || '',
        resultA: sideA?.result || 'T',
        resultB: sideB?.result || 'T',
        standingA: standings.get(game.teamA) || emptyStanding(game.teamA, numeric(season)),
        standingB: standings.get(game.teamB) || emptyStanding(game.teamB, numeric(season)),
        allTimeContext,
        historicContext,
        currentSeasonContext,
        lastMeeting: previousMeeting(contextGames, game.teamA, game.teamB, game),
        playoffMeetings: contextGames.filter(row => pairMatches(row, game.teamA, game.teamB) && isPlayoffGame(row)).length,
        currentFormA: formForOwner(leagueGames, game.teamA, season, week, currentSeason),
        currentFormB: formForOwner(leagueGames, game.teamB, season, week, currentSeason),
        rivalryUrl: `?tab=rivalry&rivalryTeamA=${encodeURIComponent(game.teamA)}&rivalryTeamB=${encodeURIComponent(game.teamB)}`,
      };
    });
}

function bestAndWorstGamesForOwner(games, owner) {
  const rows = games
    .map(game => {
      const side = sidesForTeam(game, owner);
      if (!side) return null;
      return { game, ...side, margin: side.pf - side.pa };
    })
    .filter(Boolean);
  return {
    bestWin: rows.filter(row => row.result === 'W').sort((a, b) => b.margin - a.margin || byDateDesc(a.game, b.game))[0] || null,
    worstLoss: rows.filter(row => row.result === 'L').sort((a, b) => a.margin - b.margin || byDateDesc(a.game, b.game))[0] || null,
  };
}

function buildTeamCurrentSeasonSnapshot({ owner, leagueGames = [], seasonSummaries = [], currentSeason = null, season = latestLeagueSeason(leagueGames, seasonSummaries, currentSeason) } = {}) {
  const standings = buildCurrentSeasonStandings({ leagueGames, seasonSummaries, currentSeason, season });
  const standing = standings.find(row => row.owner === owner) || emptyStanding(owner, numeric(season));
  const sortedByPf = standings.slice().sort((a, b) => b.pointsFor - a.pointsFor || a.owner.localeCompare(b.owner));
  const sortedByPa = standings.slice().sort((a, b) => b.pointsAgainst - a.pointsAgainst || a.owner.localeCompare(b.owner));
  const games = currentSeasonSourceGames(leagueGames, season, currentSeason).filter(isRegularGame).filter(isCompletedGame);
  const extremes = bestAndWorstGamesForOwner(games, owner);
  return {
    owner,
    season: numeric(season),
    standing,
    scoringRank: sortedByPf.findIndex(row => row.owner === owner) + 1 || null,
    opponentScoringRank: sortedByPa.findIndex(row => row.owner === owner) + 1 || null,
    bestWin: extremes.bestWin,
    worstLoss: extremes.worstLoss,
  };
}

export {
  buildCurrentMatchupRows,
  buildCurrentSeasonStandings,
  buildTeamCurrentSeasonSnapshot,
  currentSeasonGames,
  currentSeasonSourceGames,
  currentSeasonWeeks,
  gamesForSeasonWeek,
  isCompletedGame,
  latestCompletedWeek,
  latestLeagueSeason,
  weekForGame,
};
