const { DERIVED_GENERATOR_VERSION } = require('./constants.cjs');
const { sha256Json } = require('./canonical-json.cjs');

function isRegular(game) {
  return String(game.type).toLowerCase() === 'regular';
}

function isPlayoff(game) {
  return String(game.type).toLowerCase() === 'playoff';
}

function sideFor(game, team) {
  if (game.teamA === team) return { pf: game.scoreA, pa: game.scoreB };
  if (game.teamB === team) return { pf: game.scoreB, pa: game.scoreA };
  return null;
}

function resultFor(game, team) {
  const side = sideFor(game, team);
  if (!side) return null;
  return side.pf > side.pa ? 'W' : side.pf < side.pa ? 'L' : 'T';
}

function expectedWinIndex(games) {
  const index = new Map();
  for (const game of games) {
    if (!isRegular(game)) continue;
    const key = `${game.season}|${game.date}`;
    if (!index.has(key)) index.set(key, []);
    index.get(key).push({ team: game.teamA, score: game.scoreA }, { team: game.teamB, score: game.scoreB });
  }
  return index;
}

function expectedWinForGame(index, team, game) {
  if (!isRegular(game)) return null;
  const side = sideFor(game, team);
  const scores = index.get(`${game.season}|${game.date}`) || [];
  if (!side || scores.length < 2) return null;
  let below = 0;
  let tied = 0;
  let total = 0;
  for (const entry of scores) {
    if (entry.team === team) continue;
    total += 1;
    if (entry.score < side.pf) below += 1;
    else if (entry.score === side.pf) tied += 1;
  }
  return total ? (below + (0.5 * tied)) / total : null;
}

function computeSeasonAggregates(games, summaries) {
  const map = new Map();
  const expectedIndex = expectedWinIndex(games);
  for (const summary of summaries) {
    map.set(`${summary.owner}|${summary.season}`, {
      team: summary.owner, season: summary.season, w: 0, l: 0, t: 0, n: 0,
      pf: 0, pa: 0, actWins: 0, expWins: 0,
    });
  }
  for (const game of games) {
    if (!isRegular(game)) continue;
    for (const team of [game.teamA, game.teamB]) {
      const side = sideFor(game, team);
      const key = `${team}|${game.season}`;
      const row = map.get(key) || { team, season: game.season, w: 0, l: 0, t: 0, n: 0, pf: 0, pa: 0, actWins: 0, expWins: 0 };
      row.n += 1;
      row.pf += side.pf;
      row.pa += side.pa;
      if (side.pf > side.pa) { row.w += 1; row.actWins += 1; }
      else if (side.pf < side.pa) row.l += 1;
      else { row.t += 1; row.actWins += 0.5; }
      const expected = expectedWinForGame(expectedIndex, team, game);
      if (expected !== null) row.expWins += expected;
      map.set(key, row);
    }
  }
  return [...map.values()].map(row => {
    const recordGames = row.w + row.l + row.t;
    return {
      ...row,
      pct: recordGames ? (row.w + (0.5 * row.t)) / recordGames : 0,
      ppg: row.n ? row.pf / row.n : 0,
      oppg: row.n ? row.pa / row.n : 0,
      luck: row.actWins - row.expWins,
      diff: row.pf - row.pa,
    };
  }).sort((a, b) => a.season - b.season || a.team.localeCompare(b.team));
}

function computeHeadToHeadPairs(games) {
  const map = new Map();
  for (const game of games) {
    for (const [team, opp, pf, pa] of [
      [game.teamA, game.teamB, game.scoreA, game.scoreB],
      [game.teamB, game.teamA, game.scoreB, game.scoreA],
    ]) {
      const key = `${team}|${opp}`;
      const row = map.get(key) || { team, opp, w: 0, l: 0, t: 0, g: 0 };
      row.g += 1;
      if (pf > pa) row.w += 1;
      else if (pf < pa) row.l += 1;
      else row.t += 1;
      map.set(key, row);
    }
  }
  return [...map.values()].map(row => ({ ...row, pct: (row.w + (0.5 * row.t)) / row.g }))
    .sort((a, b) => a.team.localeCompare(b.team) || a.opp.localeCompare(b.opp));
}

function countRows(map) {
  return [...map].map(([team, count]) => ({ team, count })).sort((a, b) => a.team.localeCompare(b.team));
}

function computeWeeklyAwards(games, threshold = 150) {
  const byDate = new Map();
  for (const game of games) {
    if (!isRegular(game)) continue;
    if (!byDate.has(game.date)) byDate.set(game.date, []);
    byDate.get(game.date).push({ team: game.teamA, score: game.scoreA }, { team: game.teamB, score: game.scoreB });
  }
  const top = new Map();
  const low = new Map();
  const high = new Map();
  for (const rows of byDate.values()) {
    rows.sort((a, b) => b.score - a.score);
    top.set(rows[0].team, (top.get(rows[0].team) || 0) + 1);
    const last = rows.at(-1);
    low.set(last.team, (low.get(last.team) || 0) + 1);
    for (const row of rows) if (row.score >= threshold) high.set(row.team, (high.get(row.team) || 0) + 1);
  }
  return { top: countRows(top), low: countRows(low), high150: countRows(high) };
}

function scoreRows(games) {
  const rows = [];
  for (const game of games) {
    if (game.season === 2014 && !isRegular(game)) continue;
    rows.push(
      { team: game.teamA, pf: game.scoreA, pa: game.scoreB, opp: game.teamB, date: game.date, season: game.season },
      { team: game.teamB, pf: game.scoreB, pa: game.scoreA, opp: game.teamA, date: game.date, season: game.season }
    );
  }
  return rows;
}

function computeSubThreshold(games, threshold = 70) {
  const counts = new Map();
  for (const row of scoreRows(games.filter(isRegular))) {
    if (row.pf < threshold) counts.set(row.team, (counts.get(row.team) || 0) + 1);
  }
  return countRows(counts);
}

function collectStreaks(games, team, result) {
  const teamGames = games.filter(game => game.teamA === team || game.teamB === team)
    .sort((a, b) => a.date.localeCompare(b.date));
  const runs = [];
  let start = null;
  let length = 0;
  for (let index = 0; index < teamGames.length; index += 1) {
    const game = teamGames[index];
    if (resultFor(game, team) === result) {
      if (!length) start = game;
      length += 1;
    } else if (length) {
      runs.push({ team, len: length, start, end: teamGames[index - 1] });
      start = null;
      length = 0;
    }
  }
  if (length) runs.push({ team, len: length, start, end: teamGames.at(-1) });
  return runs;
}

function gameRef(game) {
  return { season: game.season, week: game.week, date: game.date };
}

function computeStreaks(games, owners, result) {
  return owners.flatMap(owner => collectStreaks(games, owner, result))
    .sort((a, b) => b.len - a.len || b.end.date.localeCompare(a.end.date) || a.team.localeCompare(b.team))
    .slice(0, 25)
    .map(row => ({ team: row.team, len: row.len, start: gameRef(row.start), end: gameRef(row.end) }));
}

function quantile(sorted, q) {
  if (!sorted.length) return 0;
  const position = (sorted.length - 1) * q;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] * (1 - (position - lower)) + sorted[upper] * (position - lower);
}

function roundOrder(round) {
  const value = String(round || '').toLowerCase();
  if (value.includes('wild')) return 1;
  if (value.includes('semi')) return 2;
  if (value.includes('champ') || value.includes('final')) return 4;
  return 1;
}

function buildTeamSeasons(games, summaries, includePostseason = false) {
  const summaryById = new Map(summaries.map(row => [`${row.owner}:${row.season}`, row]));
  const map = new Map();
  for (const game of games) {
    if (!(isRegular(game) || (includePostseason && isPlayoff(game)))) continue;
    const weight = isPlayoff(game) ? 1 + (Math.max(1, Math.min(4, roundOrder(game.round))) / 4) : 1;
    for (const team of [game.teamA, game.teamB]) {
      const side = sideFor(game, team);
      const id = `${team}:${game.season}`;
      const row = map.get(id) || { id, owner: team, season: game.season, scores: [], scoreEvents: [], wins: 0, losses: 0, ties: 0, pointsAgainst: 0 };
      row.scores.push(side.pf);
      row.scoreEvents.push({ score: side.pf, weight });
      row.pointsAgainst += side.pa;
      const result = resultFor(game, team);
      if (result === 'W') row.wins += 1;
      else if (result === 'L') row.losses += 1;
      else row.ties += 1;
      map.set(id, row);
    }
  }
  return [...map.values()].map(row => {
    const summary = summaryById.get(row.id);
    const sorted = row.scores.slice().sort((a, b) => a - b);
    const totalWeight = row.scoreEvents.reduce((sum, event) => sum + event.weight, 0);
    const mean = row.scoreEvents.reduce((sum, event) => sum + (event.score * event.weight), 0) / totalWeight;
    const variance = row.scoreEvents.reduce((sum, event) => sum + (event.weight * ((event.score - mean) ** 2)), 0) / totalWeight;
    const wins = includePostseason ? row.wins : summary?.wins ?? row.wins;
    const losses = includePostseason ? row.losses : summary?.losses ?? row.losses;
    const ties = includePostseason ? row.ties : summary?.ties ?? row.ties;
    const pointsFor = includePostseason ? row.scores.reduce((sum, score) => sum + score, 0) : summary?.points_for ?? row.scores.reduce((sum, score) => sum + score, 0);
    const pointsAgainst = includePostseason ? row.pointsAgainst : summary?.points_against ?? row.pointsAgainst;
    return {
      id: row.id, owner: row.owner, season: row.season, scores: row.scores,
      ...(includePostseason ? { scoreEvents: row.scoreEvents } : {}),
      games: row.scores.length, mean, stdev: Math.sqrt(variance), min: sorted[0], max: sorted.at(-1),
      median: quantile(sorted, 0.5), p25: quantile(sorted, 0.25), p75: quantile(sorted, 0.75),
      record: ties ? `${wins}-${losses}-${ties}` : `${wins}-${losses}`,
      wins, losses, ties, finish: Number.isFinite(summary?.finish) ? summary.finish : null,
      champion: !!summary?.champion, saunders: !!summary?.saunders, bye: !!summary?.bye,
      pointsFor, pointsAgainst,
    };
  }).sort((a, b) => b.season - a.season || a.owner.localeCompare(b.owner));
}

function computeOwnerCareers(owners, summaries, aggregates, awards) {
  const crowns = new Map(awards.top.map(row => [row.team, row.count]));
  return owners.map(owner => {
    const rows = summaries.filter(row => row.owner === owner);
    const regular = aggregates.filter(row => row.team === owner);
    return {
      owner,
      seasons: rows.length,
      games: regular.reduce((sum, row) => sum + row.n, 0),
      wins: rows.reduce((sum, row) => sum + row.wins, 0),
      losses: rows.reduce((sum, row) => sum + row.losses, 0),
      ties: rows.reduce((sum, row) => sum + row.ties, 0),
      points_for: rows.reduce((sum, row) => sum + row.points_for, 0),
      points_against: rows.reduce((sum, row) => sum + row.points_against, 0),
      championships: rows.filter(row => row.champion).length,
      saunders_titles: rows.filter(row => row.saunders).length,
      weekly_crowns: crowns.get(owner) || 0,
    };
  });
}

function buildDerivedStats({ H2H, SeasonSummary, Rivalries }) {
  const owners = [...new Set([
    ...SeasonSummary.map(row => row.owner),
    ...H2H.flatMap(game => [game.teamA, game.teamB]),
  ])].sort();
  const seasons = [...new Set([
    ...SeasonSummary.map(row => row.season),
    ...H2H.map(game => game.season),
  ])].sort((a, b) => a - b);
  const seasonAggregates = computeSeasonAggregates(H2H, SeasonSummary);
  const weeklyAwards = computeWeeklyAwards(H2H);
  const scores = scoreRows(H2H);
  return {
    schema_version: 1,
    derived_generator_version: DERIVED_GENERATOR_VERSION,
    source_hashes: {
      H2H: sha256Json(H2H),
      SeasonSummary: sha256Json(SeasonSummary),
      Rivalries: sha256Json(Rivalries),
    },
    owners,
    seasons,
    season_aggregates: seasonAggregates,
    head_to_head_pairs: computeHeadToHeadPairs(H2H),
    weekly_awards: weeklyAwards,
    records: {
      top_scores: scores.slice().sort((a, b) => b.pf - a.pf || a.team.localeCompare(b.team)).slice(0, 25),
      bottom_scores: scores.slice().sort((a, b) => a.pf - b.pf || a.team.localeCompare(b.team)).slice(0, 25),
      sub_70: computeSubThreshold(H2H),
    },
    streaks: {
      wins: computeStreaks(H2H, owners, 'W'),
      losses: computeStreaks(H2H, owners, 'L'),
    },
    owner_careers: computeOwnerCareers(owners, SeasonSummary, seasonAggregates, weeklyAwards),
    team_seasons: buildTeamSeasons(H2H, SeasonSummary, false),
  };
}

module.exports = {
  buildDerivedStats,
  buildTeamSeasons,
  computeHeadToHeadPairs,
  computeSeasonAggregates,
  computeStreaks,
  computeWeeklyAwards,
  expectedWinForGame,
  expectedWinIndex,
};
