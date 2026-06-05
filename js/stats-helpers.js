import * as core from './core-helpers.js';
function coreFn(name) {
  const fn = core[name];
  if (typeof fn !== 'function') {
    throw new Error(`stats-helpers.js requires core-helpers.js before it (${name})`);
  }
  return fn;
}

function computeSubThresholdGamesPerTeam(games, threshold) {
  const isRegularGameFn = coreFn('isRegularGame');
  const count = new Map();
  for (const g of games) {
    if (!isRegularGameFn(g)) continue;
    if (+g.scoreA < threshold) count.set(g.teamA, (count.get(g.teamA) || 0) + 1);
    if (+g.scoreB < threshold) count.set(g.teamB, (count.get(g.teamB) || 0) + 1);
  }
  return Array.from(count.entries()).map(([team, cnt]) => ({ team, count: cnt }));
}

function collectStreakRunsForTeam(games, team, resultType) {
  const sidesForTeamFn = coreFn('sidesForTeam');
  const tg = games
    .map(g => ({ g, s: sidesForTeamFn(g, team) }))
    .filter(x => x.s)
    .sort((a, b) => a.g.date.localeCompare(b.g.date));

  const runs = [];
  let cur = 0;
  let start = null;
  for (let i = 0; i < tg.length; i++) {
    const { g, s } = tg[i];
    if (s.result === resultType) {
      if (cur === 0) start = g;
      cur++;
      continue;
    }
    if (cur > 0) {
      runs.push({ team, len: cur, start, end: tg[i - 1].g });
      cur = 0;
      start = null;
    }
  }
  if (cur > 0) {
    runs.push({ team, len: cur, start, end: tg[tg.length - 1].g });
  }
  return runs;
}

function bestStreakForTeam(games, team, resultType) {
  let best = null;
  for (const run of collectStreakRunsForTeam(games, team, resultType)) {
    if (!best || run.len > best.len) best = run;
  }
  return best;
}

function computeLongestTeamStreaks(games, teams, resultType, n = 10) {
  const results = [];
  for (const team of teams) {
    const best = bestStreakForTeam(games, team, resultType);
    if (best) results.push(best);
  }
  return results
    .sort((a, b) => b.len - a.len || a.team.localeCompare(b.team))
    .slice(0, n);
}

const expectedWinScoreIndexCache = new WeakMap();

function expectedWinScoreIndex(allGames) {
  const isRegularGameFn = coreFn('isRegularGame');
  if (expectedWinScoreIndexCache.has(allGames)) return expectedWinScoreIndexCache.get(allGames);
  const index = new Map();
  for (const x of allGames) {
    if (!isRegularGameFn(x)) continue;
    const key = `${+x.season}|${x.date}`;
    if (!index.has(key)) index.set(key, []);
    index.get(key).push({ team: x.teamA, score: +x.scoreA });
    index.get(key).push({ team: x.teamB, score: +x.scoreB });
  }
  expectedWinScoreIndexCache.set(allGames, index);
  return index;
}

function computeExpectedWinForGame(allGames, team, g) {
  const isRegularGameFn = coreFn('isRegularGame');
  if (!isRegularGameFn(g)) return null;
  const scoreList = expectedWinScoreIndex(allGames).get(`${+g.season}|${g.date}`) || [];
  if (!scoreList.length) return null;

  const myScore = (g.teamA === team) ? g.scoreA : (g.teamB === team ? g.scoreB : null);
  if (myScore === null) return null;

  let below = 0, tied = 0, totalTeams = 0;
  for (const s of scoreList) {
    if (s.team === team) continue;
    totalTeams++;
    if (s.score < myScore) below++;
    else if (s.score === myScore) tied++;
  }
  if (totalTeams <= 0) return null;
  return (below + 0.5 * tied) / totalTeams;
}

function computeSeasonAggregatesAllTeams(games, summaries = []) {
  const isRegularGameFn = coreFn('isRegularGame');
  const map = new Map();

  if (Array.isArray(summaries)) {
    for (const r of summaries) {
      const key = `${r.owner}|${r.season}`;
      if (!map.has(key)) {
        map.set(key, {
          team: r.owner, season: +r.season,
          w: 0, l: 0, t: 0, n: 0, pf: 0, pa: 0, actWins: 0, expWins: 0,
        });
      }
    }
  }

  for (const g of games) {
    if (!isRegularGameFn(g)) continue;
    const season = +g.season;
    for (const side of [
      { team: g.teamA, pf: +g.scoreA, pa: +g.scoreB, won: g.scoreA > g.scoreB, lost: g.scoreA < g.scoreB },
      { team: g.teamB, pf: +g.scoreB, pa: +g.scoreA, won: g.scoreB > g.scoreA, lost: g.scoreB < g.scoreA },
    ]) {
      const key = `${side.team}|${season}`;
      if (!map.has(key)) {
        map.set(key, {
          team: side.team, season,
          w: 0, l: 0, t: 0, n: 0, pf: 0, pa: 0, actWins: 0, expWins: 0,
        });
      }
      const r = map.get(key);
      r.n += 1;
      r.pf += side.pf;
      r.pa += side.pa;
      if (side.won) { r.w += 1; r.actWins += 1; }
      else if (side.lost) { r.l += 1; }
      else { r.t += 1; r.actWins += 0.5; }
      const xw = computeExpectedWinForGame(games, side.team, g);
      if (xw !== null) r.expWins += xw;
    }
  }

  return Array.from(map.values()).map(r => {
    const seasonGames = r.w + r.l + r.t;
    const pct = seasonGames ? (r.w + 0.5 * r.t) / seasonGames : 0;
    const ppg = r.n ? (r.pf / r.n) : 0;
    const oppg = r.n ? (r.pa / r.n) : 0;
    const luck = r.actWins - r.expWins;
    const diff = r.pf - r.pa;
    return { ...r, pct, ppg, oppg, luck, diff };
  });
}

function computeHeadToHeadPairs(games, minGames = 5) {
  const map = new Map();
  for (const g of games) {
    const keyA = `${g.teamA}|${g.teamB}`;
    const keyB = `${g.teamB}|${g.teamA}`;
    if (!map.has(keyA)) map.set(keyA, { team: g.teamA, opp: g.teamB, w: 0, l: 0, t: 0, g: 0 });
    if (!map.has(keyB)) map.set(keyB, { team: g.teamB, opp: g.teamA, w: 0, l: 0, t: 0, g: 0 });
    const a = map.get(keyA); a.g += 1;
    if (g.scoreA > g.scoreB) a.w += 1;
    else if (g.scoreA < g.scoreB) a.l += 1;
    else a.t += 1;
    const b = map.get(keyB); b.g += 1;
    if (g.scoreB > g.scoreA) b.w += 1;
    else if (g.scoreB < g.scoreA) b.l += 1;
    else b.t += 1;
  }
  return Array.from(map.values())
    .filter(r => r.g >= minGames)
    .map(r => ({ ...r, pct: (r.w + 0.5 * r.t) / r.g }));
}

function computeWeeklyAwards(games, highScoreThreshold) {
  const isRegularGameFn = coreFn('isRegularGame');
  const byDate = new Map();
  for (const g of games) {
    if (!isRegularGameFn(g)) continue;
    const d = g.date;
    if (!byDate.has(d)) byDate.set(d, []);
    byDate.get(d).push({ team: g.teamA, score: g.scoreA });
    byDate.get(d).push({ team: g.teamB, score: g.scoreB });
  }
  const topCount = new Map(), lowCount = new Map(), highCount = new Map();
  for (const arr of byDate.values()) {
    if (!arr.length) continue;
    arr.sort((a, b) => b.score - a.score);
    const top = arr[0];
    const low = arr[arr.length - 1];
    topCount.set(top.team, (topCount.get(top.team) || 0) + 1);
    lowCount.set(low.team, (lowCount.get(low.team) || 0) + 1);
    for (const { team, score } of arr) {
      if (score >= highScoreThreshold) highCount.set(team, (highCount.get(team) || 0) + 1);
    }
  }
  const toRows = (m) => Array.from(m.entries()).map(([team, count]) => ({ team, count }));
  return { top: toRows(topCount), low: toRows(lowCount), high150: toRows(highCount) };
}

function computeTeamsFromLeagueGames(games) {
  const set = new Set();
  for (const g of games) {
    if (g.teamA) set.add(g.teamA);
    if (g.teamB) set.add(g.teamB);
  }
  return Array.from(set).sort();
}

function computeLeagueRowsSingleWeeks(games) {
  const isRegularGameFn = coreFn('isRegularGame');
  const rows = [];
  for (const g of games) {
    if (+g.season === 2014 && !isRegularGameFn(g)) continue;
    rows.push({ team: g.teamA, pf: g.scoreA, pa: g.scoreB, opp: g.teamB, date: g.date, season: Number(g.season || g.year) || null, g });
    rows.push({ team: g.teamB, pf: g.scoreB, pa: g.scoreA, opp: g.teamA, date: g.date, season: Number(g.season || g.year) || null, g });
  }
  return rows;
}

function computeTopNWeeklyScoresAllTeams(games, n = 5) {
  return computeLeagueRowsSingleWeeks(games)
    .sort((a, b) => b.pf - a.pf || a.team.localeCompare(b.team))
    .slice(0, n);
}

function computeBottomNWeeklyScoresAllTeams(games, n = 5) {
  return computeLeagueRowsSingleWeeks(games)
    .sort((a, b) => a.pf - b.pf || a.team.localeCompare(b.team))
    .slice(0, n);
}

function computeLongestStreaksGlobal(games, teams, resultType, n = 10) {
  const runs = [];
  for (const team of teams) {
    runs.push(...collectStreakRunsForTeam(games, team, resultType));
  }
  return runs
    .sort((a, b) => b.len - a.len || b.end.date.localeCompare(a.end.date) || a.team.localeCompare(b.team))
    .slice(0, n);
}

function computeLuckSummary(allGames, team, games) {
  const isRegularGameFn = coreFn('isRegularGame');
  const sidesForTeamFn = coreFn('sidesForTeam');
  const regGames = games.filter(g => isRegularGameFn(g) && (g.teamA === team || g.teamB === team));
  let exp = 0, act = 0;
  for (const g of regGames) {
    const s = sidesForTeamFn(g, team);
    const xw = computeExpectedWinForGame(allGames, team, g);
    if (xw !== null) exp += xw;
    if (s && s.result === 'W') act += 1;
    if (s && s.result === 'T') act += 0.5;
  }
  return { exp, act, luck: act - exp };
}
export {
  computeSubThresholdGamesPerTeam,
  collectStreakRunsForTeam,
  bestStreakForTeam,
  computeLongestTeamStreaks,
  expectedWinScoreIndex,
  computeExpectedWinForGame,
  computeSeasonAggregatesAllTeams,
  computeHeadToHeadPairs,
  computeWeeklyAwards,
  computeTeamsFromLeagueGames,
  computeLeagueRowsSingleWeeks,
  computeTopNWeeklyScoresAllTeams,
  computeBottomNWeeklyScoresAllTeams,
  computeLongestStreaksGlobal,
  computeLuckSummary
};
