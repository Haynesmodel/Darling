import * as core from './core-helpers.js';
function coreFn(name) {
  const fn = core[name];
  if (typeof fn !== 'function') {
    throw new Error(`facet-helpers.js requires core-helpers.js before it (${name})`);
  }
  return fn;
}

function teamOptions(seasonSummaries, leagueGames, allTeams = '__ALL__') {
  const uniqueFn = coreFn('unique');
  const ts = uniqueFn(seasonSummaries.map(r => r.owner));
  const tg = uniqueFn(leagueGames.flatMap(g => [g.teamA, g.teamB]));
  const teams = uniqueFn([...ts, ...tg]).sort();
  return [{ value: allTeams, label: 'All Teams (League)' }, ...teams.map(t => ({ value: t, label: t }))];
}

function seasonOptions(leagueGames) {
  return coreFn('unique')(leagueGames.map(g => g.season)).sort((a, b) => b - a);
}

function weekOptions(derivedWeeksSet) {
  const arr = Array.from(derivedWeeksSet).filter(n => Number.isFinite(n)).sort((a, b) => a - b);
  return arr.length ? arr : [1];
}

function opponentOptions(leagueGames, team, allTeams = '__ALL__') {
  const allTeamsList = coreFn('unique')(leagueGames.flatMap(g => [g.teamA, g.teamB])).sort();
  if (team === allTeams) return allTeamsList;
  return allTeamsList.filter(o => o !== team);
}

function typeOptions(leagueGames) {
  const normTypeFn = coreFn('normType');
  return coreFn('unique')(leagueGames.map(g => normTypeFn(g.type))).sort();
}

function roundOptionsOrdered(leagueGames) {
  const normRoundFn = coreFn('normRound');
  const roundOrderFn = coreFn('roundOrder');
  const rounds = coreFn('unique')(leagueGames.map(g => normRoundFn(g.round)).filter(Boolean));
  return rounds.sort((a, b) => {
    const da = roundOrderFn(a);
    const db = roundOrderFn(b);
    if (da !== db) return da - db;
    return a.localeCompare(b);
  });
}
export {
  teamOptions,
  seasonOptions,
  weekOptions,
  opponentOptions,
  typeOptions,
  roundOptionsOrdered
};
