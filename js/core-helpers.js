(function (global) {
  function compareIsoDateAsc(a, b) {
    return String(a).localeCompare(String(b));
  }

  function compareIsoDateDesc(a, b) {
    return String(b).localeCompare(String(a));
  }

  function canonicalGameKey(g) {
    const t1 = g.teamA;
    const t2 = g.teamB;
    const s1 = +g.scoreA;
    const s2 = +g.scoreB;
    const type = String(g.type || '').trim().toLowerCase();
    const round = String(g.round || '').trim().toLowerCase();
    if (t1 < t2) return `${g.season}|${g.date}|${type}|${round}|${t1}|${s1.toFixed(3)}|${t2}|${s2.toFixed(3)}`;
    return `${g.season}|${g.date}|${type}|${round}|${t2}|${s2.toFixed(3)}|${t1}|${s1.toFixed(3)}`;
  }

  function dedupeGames(games) {
    const seen = new Set();
    const out = [];
    for (const g of games) {
      const key = canonicalGameKey(g);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(g);
    }
    return out;
  }

  function deriveWeeksInPlace(games) {
    const weeksSeen = new Set();
    games.forEach(g => { g._weekByTeam = {}; });
    const seasons = [...new Set(games.map(g => g.season))];
    for (const season of seasons) {
      const teams = [...new Set(games.filter(g => g.season === season).flatMap(g => [g.teamA, g.teamB]))];
      for (const team of teams) {
        const teamGames = games
          .filter(g => g.season === season && (g.teamA === team || g.teamB === team))
          .sort((a, b) => compareIsoDateAsc(a.date, b.date));
        const seenDates = new Set();
        let idx = 0;
        for (const g of teamGames) {
          if (seenDates.has(g.date)) {
            g._weekByTeam[team] = g._weekByTeam[team] ?? idx;
            continue;
          }
          idx += 1;
          g._weekByTeam[team] = idx;
          seenDates.add(g.date);
          weeksSeen.add(idx);
        }
      }
    }
    return weeksSeen;
  }

  function computeRegularSeasonChampYears(owner, summaries) {
    const bySeason = new Map();
    for (const r of summaries) {
      const arr = bySeason.get(r.season) || [];
      arr.push(r);
      bySeason.set(r.season, arr);
    }
    const out = [];
    for (const [season, rows] of bySeason.entries()) {
      const maxW = Math.max(...rows.map(r => r.wins || 0));
      const winners = rows.filter(r => r.wins === maxW).map(r => r.owner);
      if (winners.includes(owner)) out.push(+season);
    }
    return out.sort((a, b) => a - b);
  }

  const api = {
    compareIsoDateAsc,
    compareIsoDateDesc,
    canonicalGameKey,
    dedupeGames,
    deriveWeeksInPlace,
    computeRegularSeasonChampYears,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  Object.assign(global, api);
})(typeof globalThis !== 'undefined' ? globalThis : window);
