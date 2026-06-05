function compareIsoDateAsc(a, b) {
  return String(a).localeCompare(String(b));
}

function compareIsoDateDesc(a, b) {
  return String(b).localeCompare(String(a));
}

function sum(values) {
  return values.reduce((a, b) => a + b, 0);
}

function unique(values) {
  return [...new Set(values)];
}

function byDateAsc(a, b) {
  return String(a.date).localeCompare(String(b.date));
}

function byDateDesc(a, b) {
  return String(b.date).localeCompare(String(a.date));
}

function fmtPct(w, l, t) {
  const g = w + l + t;
  return g ? (((w + 0.5 * t) / g) * 100).toFixed(1) + '%' : '0.0%';
}

function csvEscape(s) {
  return String(s).replace(/"/g, '""');
}

function normType(t) {
  return (t && t.trim()) ? t : 'Regular';
}

function normRound(r) {
  return r || '';
}

function sidesForTeam(g, team) {
  let pf, pa, opp;
  if (g.teamA === team) { pf = g.scoreA; pa = g.scoreB; opp = g.teamB; }
  else if (g.teamB === team) { pf = g.scoreB; pa = g.scoreA; opp = g.teamA; }
  else return null;
  let result = 'T';
  if (pf > pa) result = 'W';
  else if (pf < pa) result = 'L';
  return { pf, pa, opp, result };
}

function isSaundersGame(g) {
  const t = normType(g.type).toLowerCase();
  const r = normRound(g.round).toLowerCase();
  return t === 'saunders' || r.includes('saunders');
}

function isRegularGame(g) {
  return normType(g.type) === 'Regular';
}

function isPlayoffGame(g) {
  return !isRegularGame(g) && !isSaundersGame(g);
}

function roundOrder(roundStr = '') {
  const r = (roundStr || '').toLowerCase().trim();
  const sau = r.includes('saunders');
  const ply = !sau && (r.includes('wild') || r.includes('quarter') || r.includes('semi') || r.includes('final') || r.includes('champ'));
  if (ply) {
    if (r.includes('wild')) return 1;
    if (r.includes('quarter')) return 2;
    if (r.includes('semi')) return 3;
    if (r.includes('champ') || r === 'final' || r.endsWith('final')) return 4;
    return 90;
  }
  if (sau) {
    if (r.includes('round 1')) return 1;
    if (r.includes('final')) return 2;
    return 95;
  }
  if (r.includes('third')) return 80;
  return 99;
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

function isRestrictive(selSet, uniArr) {
  if (!uniArr.length) return false;
  if (selSet.size === 0) return false;
  if (selSet.size === uniArr.length) return false;
  return true;
}
export {
  compareIsoDateAsc,
  compareIsoDateDesc,
  sum,
  unique,
  byDateAsc,
  byDateDesc,
  fmtPct,
  csvEscape,
  normType,
  normRound,
  sidesForTeam,
  isSaundersGame,
  isRegularGame,
  isPlayoffGame,
  roundOrder,
  canonicalGameKey,
  dedupeGames,
  deriveWeeksInPlace,
  computeRegularSeasonChampYears,
  isRestrictive
};
