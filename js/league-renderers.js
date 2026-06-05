import * as core from './core-helpers.js';
import * as render from './render-helpers.js';
function renderFn(name) {
  const fn = render[name];
  if (typeof fn !== 'function') {
    throw new Error(`league-renderers.js requires render-helpers.js before it (${name})`);
  }
  return fn;
}

function coreFn(name) {
  const fn = core[name];
  if (typeof fn !== 'function') {
    throw new Error(`league-renderers.js requires core-helpers.js before it (${name})`);
  }
  return fn;
}

function esc(value) {
  return renderFn('escapeHtml')(value);
}

function emptyPostRow(team) {
  return {
    team,
    dW: 0,
    dL: 0,
    byes: 0,
    champs: 0,
    dPF: 0,
    dPA: 0,
    dN: 0,
    sW: 0,
    sL: 0,
    saundersTitles: 0,
    sPF: 0,
    sPA: 0,
    sN: 0,
  };
}

function leagueSummaryTablesHtml(opts = {}) {
  const nfmt = renderFn('nfmt');
  const leagueGames = opts.leagueGames || [];
  const seasonSummaries = Array.isArray(opts.seasonSummaries) ? opts.seasonSummaries : [];
  const seasons = Array.isArray(opts.seasonAggregates) ? opts.seasonAggregates : [];

  const regByTeam = new Map();
  for (const r of seasons) {
    const t = r.team;
    const cur = regByTeam.get(t) || { team: t, w: 0, l: 0, t: 0, n: 0, pf: 0, pa: 0 };
    cur.w += r.w;
    cur.l += r.l;
    cur.t += r.t;
    cur.n += r.n;
    cur.pf += r.pf;
    cur.pa += r.pa;
    regByTeam.set(t, cur);
  }
  const regRows = Array.from(regByTeam.values()).map(r => {
    const games = r.w + r.l + r.t;
    const winPct = games ? (r.w + 0.5 * r.t) / games : 0;
    const ppg = r.n ? (r.pf / r.n) : 0;
    const oppg = r.n ? (r.pa / r.n) : 0;
    return { team: r.team, rec: `${r.w}-${r.l}${r.t ? '-' + r.t : ''}`, pct: winPct, ppg, oppg };
  }).sort((a, b) => b.pct - a.pct || b.ppg - a.ppg || a.team.localeCompare(b.team));

  const postByTeam = new Map();
  for (const r of seasonSummaries) {
    const t = r.owner;
    const cur = postByTeam.get(t) || emptyPostRow(t);
    cur.dW += (r.playoff_wins || 0);
    cur.dL += (r.playoff_losses || 0);
    cur.byes += (r.bye ? 1 : 0);
    cur.champs += (r.champion ? 1 : 0);
    cur.sW += (r.saunders_wins || 0);
    cur.sL += (r.saunders_losses || 0);
    cur.saundersTitles += (r.saunders ? 1 : 0);
    postByTeam.set(t, cur);
  }

  for (const g of leagueGames) {
    const t = (g.type || '').toLowerCase();
    const mainPO = t && t !== 'regular' && !t.includes('saunders');
    const saunders = t && t.includes('saunders');
    if (!mainPO && !saunders) continue;

    const recA = postByTeam.get(g.teamA) || emptyPostRow(g.teamA);
    if (mainPO) {
      recA.dPF += +g.scoreA;
      recA.dPA += +g.scoreB;
      recA.dN += 1;
    } else {
      recA.sPF += +g.scoreA;
      recA.sPA += +g.scoreB;
      recA.sN += 1;
    }
    postByTeam.set(g.teamA, recA);

    const recB = postByTeam.get(g.teamB) || emptyPostRow(g.teamB);
    if (mainPO) {
      recB.dPF += +g.scoreB;
      recB.dPA += +g.scoreA;
      recB.dN += 1;
    } else {
      recB.sPF += +g.scoreB;
      recB.sPA += +g.scoreA;
      recB.sN += 1;
    }
    postByTeam.set(g.teamB, recB);
  }

  const postRows = Array.from(postByTeam.values()).map(r => {
    const dPPG = r.dN ? (r.dPF / r.dN) : 0;
    const dOPPG = r.dN ? (r.dPA / r.dN) : 0;
    const sPPG = r.sN ? (r.sPF / r.sN) : 0;
    const sOPPG = r.sN ? (r.sPA / r.sN) : 0;
    return {
      team: r.team,
      darlingRec: `${r.dW}-${r.dL}`,
      byes: r.byes,
      champs: r.champs,
      dPPG,
      dOPPG,
      saundersRec: `${r.sW}-${r.sL}`,
      saundersTitles: r.saundersTitles,
      sPPG,
      sOPPG,
    };
  }).sort((a, b) => b.champs - a.champs || b.dPPG - a.dPPG || a.team.localeCompare(b.team));

  const regTable = `
  <div class="mini">
    <div class="mini-title">Regular Season (All-Time)</div>
    <div class="table-wrap mini-table">
      <table>
        <thead><tr><th scope="col">Team</th><th scope="col">Record</th><th scope="col">Win%</th><th scope="col">PPG</th><th scope="col">OPPG</th></tr></thead>
        <tbody>${
          regRows.map(r => `<tr><td>${esc(r.team)}</td><td>${r.rec}</td><td>${nfmt(r.pct * 100, 1)}%</td><td>${nfmt(r.ppg, 2)}</td><td>${nfmt(r.oppg, 2)}</td></tr>`).join('')
          || '<tr><td colspan="5" class="muted">\u2014</td></tr>'
        }</tbody>
      </table>
    </div>
  </div>`;

  const postTable = `
  <div class="mini">
    <div class="mini-title">Post Season (All-Time)</div>
    <div class="table-wrap mini-table">
      <table>
        <thead>
          <tr>
            <th scope="col">Team</th><th scope="col">Darling Record</th><th scope="col">Byes</th><th scope="col">Championships</th>
            <th scope="col">Darling PPG</th><th scope="col">Darling Opp PPG</th>
            <th scope="col">Saunders Record</th><th scope="col">Saunders</th><th scope="col">Saunders PPG</th><th scope="col">Saunders Opp PPG</th>
          </tr>
        </thead>
        <tbody>${
          postRows.map(r => `<tr>
            <td>${esc(r.team)}</td><td>${r.darlingRec}</td><td>${r.byes}</td><td>${r.champs}</td>
            <td>${nfmt(r.dPPG, 2)}</td><td>${nfmt(r.dOPPG, 2)}</td>
            <td>${r.saundersRec}</td><td>${r.saundersTitles}</td>
            <td>${nfmt(r.sPPG, 2)}</td><td>${nfmt(r.sOPPG, 2)}</td>
          </tr>`).join('') || '<tr><td colspan="10" class="muted">\u2014</td></tr>'
        }</tbody>
      </table>
    </div>
  </div>`;

  const finishByTeam = new Map();
  for (const r of seasonSummaries) {
    if (!Number.isFinite(+r.finish)) continue;
    const cur = finishByTeam.get(r.owner) || { team: r.owner, sum: 0, n: 0 };
    cur.sum += +r.finish;
    cur.n += 1;
    finishByTeam.set(r.owner, cur);
  }
  const finishRows = Array.from(finishByTeam.values())
    .map(r => ({ team: r.team, avg: r.n ? (r.sum / r.n) : null, n: r.n }))
    .sort((a, b) => (a.avg ?? Infinity) - (b.avg ?? Infinity) || b.n - a.n || a.team.localeCompare(b.team));

  const finishTable = `
  <div class="mini">
    <div class="mini-title">Average Finish (All-Time)</div>
    <div class="table-wrap mini-table">
      <table>
        <thead><tr><th scope="col">Team</th><th scope="col">Avg Finish</th><th scope="col">Seasons</th></tr></thead>
        <tbody>${
          finishRows.map(r => `<tr><td>${esc(r.team)}</td><td>${nfmt(r.avg, 2)}</td><td>${r.n}</td></tr>`).join('')
          || '<tr><td colspan="3" class="muted">\u2014</td></tr>'
        }</tbody>
      </table>
    </div>
  </div>`;

  return regTable + postTable + finishTable;
}

function leagueFunFactsAllTeamsHtml(opts = {}) {
  const nfmt = renderFn('nfmt');
  const seasons = Array.isArray(opts.seasonAggregates) ? opts.seasonAggregates : [];
  const minGames = opts.minGames || 8;
  const winStreak = opts.winStreak || null;
  const lossStreak = opts.lossStreak || null;
  const headToHeadPairs = Array.isArray(opts.headToHeadPairs) ? opts.headToHeadPairs : [];
  const topWeeklyScores = Array.isArray(opts.topWeeklyScores) ? opts.topWeeklyScores : [];

  const valid = seasons.filter(r => r.n >= minGames);
  const bestRec = valid.slice().sort((a, b) => b.pct - a.pct || b.w - a.w)[0] || null;
  const worstRec = valid.slice().sort((a, b) => a.pct - b.pct || a.w - b.w)[0] || null;
  const bestDiff = valid.slice().sort((a, b) => (b.diff - a.diff) || b.season - a.season)[0] || null;
  const worstDiff = valid.slice().sort((a, b) => (a.diff - b.diff) || a.season - b.season)[0] || null;
  const bestVs = headToHeadPairs.slice().sort((a, b) => b.pct - a.pct || b.g - a.g)[0] || null;
  const top = topWeeklyScores[0] || null;
  const fmtRec = (r) => r ? `${r.w}-${r.l}${r.t ? '-' + r.t : ''}` : '\u2014';
  const runDate = (v) => (v && typeof v === 'object') ? v.date : v;

  const tile = (label, val, sub = '') => `
  <div class="stat">
    <div class="label">${esc(label)}</div>
    <div class="value">${esc(val)}</div>
    ${sub ? `<div class="label" style="margin-top:4px">${esc(sub)}</div>` : ''}
  </div>
`;

  return [
    tile('Best Single-Season Record', bestRec ? `${fmtRec(bestRec)}` : '\u2014', bestRec ? `${bestRec.team} \u2022 ${bestRec.season} \u2022 ${nfmt(bestRec.pct * 100, 1)}%` : ''),
    tile('Worst Single-Season Record', worstRec ? `${fmtRec(worstRec)}` : '\u2014', worstRec ? `${worstRec.team} \u2022 ${worstRec.season} \u2022 ${nfmt(worstRec.pct * 100, 1)}%` : ''),
    tile(
      'Best Season Point Diff',
      bestDiff ? `${(+bestDiff.diff >= 0 ? '+' : '')}${nfmt(bestDiff.diff, 0)}` : '\u2014',
      bestDiff ? `${bestDiff.team} \u2022 ${bestDiff.season} \u2022 PF ${nfmt(bestDiff.pf, 0)} / PA ${nfmt(bestDiff.pa, 0)}` : ''
    ),
    tile(
      'Worst Season Point Diff',
      worstDiff ? `${(+worstDiff.diff >= 0 ? '+' : '')}${nfmt(worstDiff.diff, 0)}` : '\u2014',
      worstDiff ? `${worstDiff.team} \u2022 ${worstDiff.season} \u2022 PF ${nfmt(worstDiff.pf, 0)} / PA ${nfmt(worstDiff.pa, 0)}` : ''
    ),
    tile('Longest Winning Streak', winStreak ? `${winStreak.len}` : '\u2014', winStreak ? `${winStreak.team} (${runDate(winStreak.start)} \u2192 ${runDate(winStreak.end)})` : ''),
    tile('Longest Losing Streak', lossStreak ? `${lossStreak.len}` : '\u2014', lossStreak ? `${lossStreak.team} (${runDate(lossStreak.start)} \u2192 ${runDate(lossStreak.end)})` : ''),
    tile(
      'Best Record vs Single Opponent',
      bestVs ? `${nfmt(bestVs.pct * 100, 1)}%` : '\u2014',
      bestVs ? `${bestVs.team} vs ${bestVs.opp} \u2022 ${bestVs.w}-${bestVs.l}${bestVs.t ? '-' + bestVs.t : ''} (${bestVs.g} gms)` : ''
    ),
    tile('Highest Scoring Single Game', top ? `${nfmt(top.pf, 2)}` : '\u2014', top ? `${top.team} vs ${top.opp} (${top.date})` : ''),
  ].join('');
}

function leagueFunListsAllTeamsHtml(opts = {}) {
  const nfmt = renderFn('nfmt');
  const fmtTrimmed = renderFn('fmtTrimmed');
  const isRegularGame = coreFn('isRegularGame');
  const leagueGames = opts.leagueGames || [];
  const seasonSummaries = Array.isArray(opts.seasonSummaries) ? opts.seasonSummaries : [];
  const seasons = Array.isArray(opts.seasonAggregates) ? opts.seasonAggregates : [];
  const highs = Array.isArray(opts.highs) ? opts.highs : [];
  const lows = Array.isArray(opts.lows) ? opts.lows : [];
  const streaks = Array.isArray(opts.streaks) ? opts.streaks : [];
  const streaksLoss = Array.isArray(opts.streaksLoss) ? opts.streaksLoss : [];
  const weeklyAwards = opts.weeklyAwards || { top: [], low: [], high150: [] };
  const sub70 = Array.isArray(opts.sub70) ? opts.sub70 : [];
  const h2hPairs = Array.isArray(opts.headToHeadPairs) ? opts.headToHeadPairs : [];
  const limit = opts.limit || 10;

  const isTwoWeek2014 = (g) => (+g.season === 2014) && !isRegularGame(g);
  const isPlayoff = (g) => {
    const t = (g.type || '').toLowerCase();
    return t && t !== 'regular' && !t.includes('saunders');
  };
  const fmtRunDate = (v) => (v && typeof v === 'object') ? v.date : v;
  const s2 = fmtTrimmed;

  const rowHigh = (r) => `<tr><td>${s2(r.pf)}\u2013${s2(r.pa)}</td><td>${esc(r.team)} vs ${esc(r.opp)}</td><td>${esc(r.date)}</td></tr>`;
  const rowLow = rowHigh;
  const rowStk = (r) => `<tr><td>${r.len}</td><td>${esc(r.team)}</td><td>${esc(fmtRunDate(r.start))} \u2192 ${esc(fmtRunDate(r.end))}</td></tr>`;
  const rowCount = (r) => `<tr><td>${esc(r.team)}</td><td>${r.count}</td></tr>`;
  const rowLuckSeason = (r) => `<tr><td>${esc(r.team)}</td><td>${esc(r.season)}</td><td>${Number.isFinite(+r.luck) ? (+r.luck).toFixed(2) : '\u2014'}</td></tr>`;
  const rowRec = (r) => `<tr><td>${esc(r.team)}</td><td>${esc(r.season)}</td><td>${r.w}-${r.l}${r.t ? '-' + r.t : ''}</td></tr>`;
  const rowPPG = (r) => `<tr><td>${esc(r.team)}</td><td>${esc(r.season)}</td><td>${nfmt(r.ppg, 2)}</td><td>${r.n}</td></tr>`;
  const rowOPPG = (r) => `<tr><td>${esc(r.team)}</td><td>${esc(r.season)}</td><td>${nfmt(r.oppg, 2)}</td><td>${r.n}</td></tr>`;

  const weekScores = new Map();
  for (const g of leagueGames) {
    if (!isRegularGame(g)) continue;
    const d = g.date;
    if (!weekScores.has(d)) weekScores.set(d, []);
    weekScores.get(d).push({ team: g.teamA, score: +g.scoreA });
    weekScores.get(d).push({ team: g.teamB, score: +g.scoreB });
  }
  const dates = Array.from(weekScores.keys()).sort((a, b) => a.localeCompare(b));
  const lowestByDate = new Map();
  for (const d of dates) {
    const arr = weekScores.get(d) || [];
    if (!arr.length) {
      lowestByDate.set(d, new Set());
      continue;
    }
    const min = Math.min(...arr.map(x => x.score));
    lowestByDate.set(d, new Set(arr.filter(x => x.score === min).map(x => x.team)));
  }
  const teams = new Set();
  for (const g of leagueGames) {
    teams.add(g.teamA);
    teams.add(g.teamB);
  }
  const noLowRuns = [];
  for (const team of teams) {
    let cur = 0;
    let start = null;
    for (let i = 0; i < dates.length; i++) {
      const d = dates[i];
      const arr = weekScores.get(d) || [];
      const played = arr.some(x => x.team === team);
      if (!played) continue;
      const isLow = lowestByDate.get(d)?.has(team);
      if (!isLow) {
        if (cur === 0) start = d;
        cur++;
      } else if (cur > 0) {
        noLowRuns.push({ team, len: cur, start, end: dates[i - 1] || d });
        cur = 0;
        start = null;
      }
    }
    if (cur > 0) noLowRuns.push({ team, len: cur, start, end: dates[dates.length - 1] });
  }
  const topNoLows = noLowRuns
    .sort((a, b) => b.len - a.len || b.end.localeCompare(a.end) || a.team.localeCompare(b.team))
    .slice(0, limit);
  const rowNoLow = (r) => `<tr><td>${r.len}</td><td>${esc(r.team)}</td><td>${esc(r.start)} \u2192 ${esc(r.end)}</td></tr>`;

  const rivalWins = new Map();
  const rivalLosses = new Map();
  for (const g of leagueGames) {
    const a = g.teamA, b = g.teamB, sa = +g.scoreA, sb = +g.scoreB;
    if (sa === sb) continue;
    const awin = sa > sb;
    const keyAB = `${a}|${b}`, keyBA = `${b}|${a}`;
    if (awin) {
      rivalWins.set(keyAB, (rivalWins.get(keyAB) || 0) + 1);
      rivalLosses.set(keyBA, (rivalLosses.get(keyBA) || 0) + 1);
    } else {
      rivalWins.set(keyBA, (rivalWins.get(keyBA) || 0) + 1);
      rivalLosses.set(keyAB, (rivalLosses.get(keyAB) || 0) + 1);
    }
  }
  const rivalBestPairs = [];
  for (const t of teams) {
    let bestOpp = null;
    let bestW = 0;
    let bestRec = { w: 0, l: 0 };
    for (const o of teams) {
      if (o === t) continue;
      const w = rivalWins.get(`${t}|${o}`) || 0;
      const l = rivalLosses.get(`${t}|${o}`) || 0;
      const curPct = w / (w + l || 1);
      const bestPct = bestRec.w / (bestRec.w + bestRec.l || 1);
      if (w > bestW || (w === bestW && curPct > bestPct)) {
        bestW = w;
        bestOpp = o;
        bestRec = { w, l };
      }
    }
    if (bestOpp) rivalBestPairs.push({ team: t, opp: bestOpp, wins: bestRec.w, losses: bestRec.l });
  }
  const topRivals = rivalBestPairs
    .sort((a, b) => b.wins - a.wins || (a.team + a.opp).localeCompare(b.team + b.opp))
    .slice(0, limit);
  const rowRival = (r) => `<tr><td>${r.wins}</td><td>${esc(r.team)}</td><td>${esc(r.opp)}</td><td>${r.wins}-${r.losses}</td></tr>`;

  const luckPool = seasons.filter(r => r.n >= 8 && Number.isFinite(+r.luck));
  const luckiestSeasons = [...luckPool].sort((a, b) => b.luck - a.luck || b.season - a.season).slice(0, limit);
  const unluckiestSeasons = [...luckPool].sort((a, b) => a.luck - b.luck || a.season - b.season).slice(0, limit);
  const validSeasons = seasons.filter(r => r.n >= 8);
  const bestSeasonsByRec = [...validSeasons]
    .sort((a, b) => b.pct - a.pct || b.w - a.w || a.l - b.l || b.season - a.season)
    .slice(0, limit);
  const worstSeasonsByRec = [...validSeasons]
    .sort((a, b) => a.pct - b.pct || a.w - b.w || b.l - a.l || a.season - b.season)
    .slice(0, limit);
  const mostPPG = [...seasons].sort((a, b) => b.ppg - a.ppg || b.season - a.season).slice(0, limit);
  const byOPPGDesc = [...seasons].sort((a, b) => b.oppg - a.oppg || b.season - a.season).slice(0, limit);
  const byOPPGAsc = [...seasons].sort((a, b) => a.oppg - b.oppg || a.season - b.season).slice(0, limit);
  const topW = (weeklyAwards.top || []).slice().sort((a, b) => b.count - a.count || a.team.localeCompare(b.team)).slice(0, limit);
  const lowW = (weeklyAwards.low || []).slice().sort((a, b) => b.count - a.count || a.team.localeCompare(b.team)).slice(0, limit);
  const high150 = (weeklyAwards.high150 || []).slice().sort((a, b) => b.count - a.count || a.team.localeCompare(b.team)).slice(0, limit);
  const sub70Rows = sub70.slice().sort((a, b) => b.count - a.count || a.team.localeCompare(b.team)).slice(0, limit);

  const combinedGames = [];
  const mostPtsInLoss = [];
  const fewestPtsInWin = [];
  for (const g of leagueGames) {
    if (!isRegularGame(g)) continue;
    const total = (+g.scoreA) + (+g.scoreB);
    combinedGames.push({ teamA: g.teamA, teamB: g.teamB, total, scoreA: +g.scoreA, scoreB: +g.scoreB, date: g.date });
    const aWins = g.scoreA > g.scoreB;
    const bWins = g.scoreB > g.scoreA;
    if (aWins) {
      fewestPtsInWin.push({ winner: g.teamA, loser: g.teamB, wScore: +g.scoreA, lScore: +g.scoreB, date: g.date });
      mostPtsInLoss.push({ winner: g.teamA, loser: g.teamB, wScore: +g.scoreA, lScore: +g.scoreB, date: g.date });
    } else if (bWins) {
      fewestPtsInWin.push({ winner: g.teamB, loser: g.teamA, wScore: +g.scoreB, lScore: +g.scoreA, date: g.date });
      mostPtsInLoss.push({ winner: g.teamB, loser: g.teamA, wScore: +g.scoreB, lScore: +g.scoreA, date: g.date });
    }
  }
  const topCombined = combinedGames.sort((a, b) => b.total - a.total || a.date.localeCompare(b.date)).slice(0, limit);
  const rowCombined = (r) => `<tr><td>${s2(r.total)}</td><td>${s2(r.scoreA)}\u2013${s2(r.scoreB)}</td><td>${esc(r.teamA)} vs ${esc(r.teamB)}</td><td>${esc(r.date)}</td></tr>`;
  const topUnluckyGames = mostPtsInLoss.sort((a, b) => b.lScore - a.lScore || a.date.localeCompare(b.date)).slice(0, limit);
  const topLuckyGames = fewestPtsInWin.sort((a, b) => a.wScore - b.wScore || a.date.localeCompare(b.date)).slice(0, limit);
  const rowLuckGame = (r) => `<tr><td>${s2(r.wScore)}\u2013${s2(r.lScore)}</td><td>${esc(r.winner)} vs ${esc(r.loser)}</td><td>${esc(r.date)}</td></tr>`;

  const playoffSingles = [];
  const playoffMargins = [];
  const avgMarginBySeason = new Map();
  const champions = new Set();
  for (const r of seasonSummaries) {
    if (r.champion) champions.add(`${r.owner}|${r.season}`);
  }
  for (const g of leagueGames) {
    if (!isPlayoff(g)) continue;
    if (isTwoWeek2014(g)) continue;
    playoffSingles.push({ team: g.teamA, opp: g.teamB, pf: +g.scoreA, oppf: +g.scoreB, date: g.date, season: +g.season });
    playoffSingles.push({ team: g.teamB, opp: g.teamA, pf: +g.scoreB, oppf: +g.scoreA, date: g.date, season: +g.season });
    const aWins = g.scoreA > g.scoreB;
    const bWins = g.scoreB > g.scoreA;
    if (aWins || bWins) {
      const winner = aWins ? g.teamA : g.teamB;
      const loser = aWins ? g.teamB : g.teamA;
      const wScore = aWins ? +g.scoreA : +g.scoreB;
      const lScore = aWins ? +g.scoreB : +g.scoreA;
      playoffMargins.push({ winner, loser, margin: wScore - lScore, date: g.date, season: +g.season, wScore, lScore });
    }
    const season = +g.season;
    const keyA = `${g.teamA}|${season}`;
    if (champions.has(keyA)) {
      const curA = avgMarginBySeason.get(keyA) || { team: g.teamA, season, sum: 0, games: 0 };
      curA.sum += (+g.scoreA - +g.scoreB);
      curA.games += 1;
      avgMarginBySeason.set(keyA, curA);
    }
    const keyB = `${g.teamB}|${season}`;
    if (champions.has(keyB)) {
      const curB = avgMarginBySeason.get(keyB) || { team: g.teamB, season, sum: 0, games: 0 };
      curB.sum += (+g.scoreB - +g.scoreA);
      curB.games += 1;
      avgMarginBySeason.set(keyB, curB);
    }
  }
  const topPlayoffSingles = playoffSingles.sort((a, b) => b.pf - a.pf || b.season - a.season).slice(0, limit);
  const topPlayoffBlowouts = playoffMargins.sort((a, b) => b.margin - a.margin || b.season - a.season).slice(0, limit);
  const topAvgWinDiff = Array.from(avgMarginBySeason.values())
    .map(r => ({ ...r, avg: r.games ? (r.sum / r.games) : 0 }))
    .sort((a, b) => b.avg - a.avg || b.season - a.season)
    .slice(0, limit);
  const rowPOHigh = (r) => `<tr><td>${s2(r.pf)}\u2013${s2(r.oppf ?? 0)}</td><td>${esc(r.team)} vs ${esc(r.opp)}</td><td>${esc(r.date)}</td></tr>`;
  const rowPOBlow = (r) => `<tr><td>${s2(r.margin)}</td><td>${s2(r.wScore)}\u2013${s2(r.lScore)}</td><td>${esc(r.winner)} vs ${esc(r.loser)}</td><td>${esc(r.date)}</td></tr>`;
  const rowAvgPO = (r) => `<tr><td>${esc(r.team)}</td><td>${esc(r.season)}</td><td>${nfmt(r.avg, 2)}</td><td>${r.games}</td></tr>`;

  const mini = (title, headings, rows, emptyCols) => `
  <div class="mini">
    <div class="mini-title">${esc(title)}</div>
    <div class="table-wrap mini-table">
      <table>
        <thead><tr>${headings.map(h => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead>
        <tbody>${rows || `<tr><td colspan="${emptyCols}" class="muted">\u2014</td></tr>`}</tbody>
      </table>
    </div>
  </div>`;

  return [
    mini('Best Regular Seasons', ['Team', 'Season', 'Record'], bestSeasonsByRec.map(rowRec).join(''), 3),
    mini('Worst Regular Seasons', ['Team', 'Season', 'Record'], worstSeasonsByRec.map(rowRec).join(''), 3),
    mini('Highest Scoring Regular Seasons', ['Team', 'Season', 'PPG', 'G'], mostPPG.map(rowPPG).join(''), 4),
    mini('Most Dominant Playoff Runs', ['Team', 'Season', 'Avg Margin', 'PO Games'], topAvgWinDiff.map(rowAvgPO).join(''), 4),
    mini('Highest Scoring Performances', ['Score', 'Matchup', 'Date'], highs.map(rowHigh).join(''), 3),
    mini('Lowest Scoring Performances', ['Score', 'Matchup', 'Date'], lows.map(rowLow).join(''), 3),
    mini('Longest Winning Streaks', ['Length', 'Team', 'Range'], streaks.map(rowStk).join(''), 3),
    mini('Longest Losing Streaks', ['Length', 'Team', 'Range'], streaksLoss.map(rowStk).join(''), 3),
    mini('Most PPG Allowed', ['Team', 'Season', 'OPPG', 'G'], byOPPGDesc.map(rowOPPG).join(''), 4),
    mini('Fewest PPG Allowed', ['Team', 'Season', 'OPPG', 'G'], byOPPGAsc.map(rowOPPG).join(''), 4),
    mini('Most Dominant Rivalries', ['Team', 'Opponent', 'Win %', 'Record (G)'], h2hPairs.slice().sort((a, b) => b.pct - a.pct || b.g - a.g).slice(0, limit).map(r =>
      `<tr><td>${esc(r.team)}</td><td>${esc(r.opp)}</td><td>${nfmt(r.pct * 100, 1)}%</td><td>${r.w}-${r.l}${r.t ? '-' + r.t : ''} (${r.g})</td></tr>`
    ).join(''), 4),
    mini('Most Weekly Top Scores', ['Team', 'Awards'], topW.map(rowCount).join(''), 2),
    mini('Most Weekly Bottom Scores', ['Team', 'Awards'], lowW.map(rowCount).join(''), 2),
    mini('Most 150+ Point Games', ['Team', 'Games'], high150.map(rowCount).join(''), 2),
    mini('Most Sub-70 Point Games', ['Team', 'Games'], sub70Rows.map(rowCount).join(''), 2),
    mini('Best Playoff Performances', ['Score', 'Matchup', 'Date'], topPlayoffSingles.map(rowPOHigh).join(''), 3),
    mini('Biggest Playoff Blowouts', ['Margin', 'Score', 'Matchup', 'Date'], topPlayoffBlowouts.map(rowPOBlow).join(''), 4),
    mini('Lowest Scoring Wins', ['Score', 'Matchup', 'Date'], topLuckyGames.map(rowLuckGame).join(''), 3),
    mini('Highest Scoring Losses', ['Score', 'Matchup', 'Date'], topUnluckyGames.map(rowLuckGame).join(''), 3),
    mini('Most Combined Points', ['Points', 'Score', 'Matchup', 'Date'], topCombined.map(rowCombined).join(''), 4),
    mini('Luckiest Regular Seasons', ['Team', 'Season', 'Luck'], luckiestSeasons.map(rowLuckSeason).join(''), 3),
    mini('Unluckiest Regular Seasons', ['Team', 'Season', 'Luck'], unluckiestSeasons.map(rowLuckSeason).join(''), 3),
    mini('Most Consecutive Weeks Not Lowest', ['Length', 'Team', 'Range'], topNoLows.map(rowNoLow).join(''), 3),
    mini('Most Rival Wins', ['Wins', 'Team', 'Opponent', 'Record'], topRivals.map(rowRival).join(''), 4),
  ].join('');
}

function teamFunFactsView(team, games, opts = {}) {
  const nfmt = renderFn('nfmt');
  const sidesForTeam = coreFn('sidesForTeam');
  const normType = coreFn('normType');
  const byDateAsc = coreFn('byDateAsc');
  const unique = coreFn('unique');
  const isRegularGame = coreFn('isRegularGame');
  const leagueGames = opts.leagueGames || games;
  const seasonSummaries = Array.isArray(opts.seasonSummaries) ? opts.seasonSummaries : [];
  const seasonAggregates = Array.isArray(opts.seasonAggregates) ? opts.seasonAggregates : [];
  const winStreak = opts.winStreak || null;
  const lossStreak = opts.lossStreak || null;
  const luckSummary = opts.luckSummary || {};
  const blowoutMargin = opts.blowoutMargin || 29;
  const highScoreThreshold = opts.highScoreThreshold || 150;
  const closeGameMargin = opts.closeGameMargin || 5;

  const isTwoWeek2014 = (g) => (+g.season === 2014) && !isRegularGame(g);
  const weekLabelFor = (g) => {
    const wk = g._weekByTeam && g._weekByTeam[team];
    return wk ? `Wk ${wk} ${g.season}` : `${g.season}`;
  };

  let hi = null;
  let blow = null;
  let loss = null;
  let crowns = 0, turds = 0;
  let closeW = 0, closeL = 0, closeT = 0, blowouts = 0;
  let blowoutLosses = 0;
  let high150 = 0;
  const perGame = [];
  const orderedAsc = games.slice().sort(byDateAsc);

  for (const g of orderedAsc) {
    const s = sidesForTeam(g, team);
    if (!s) continue;

    if (!isTwoWeek2014(g) && (!hi || s.pf > hi.pf)) hi = { pf: s.pf, pa: s.pa, date: g.date, opp: s.opp };

    if (s.result === 'W') {
      const margin = s.pf - s.pa;
      if (!blow || margin > blow.margin) blow = { margin, date: g.date, opp: s.opp, pf: s.pf, pa: s.pa };
    }
    if (s.result === 'L') {
      const margin = s.pa - s.pf;
      if (!loss || margin > loss.margin) loss = { margin, date: g.date, opp: s.opp, pf: s.pf, pa: s.pa };
    }

    if (!isTwoWeek2014(g)) {
      perGame.push({
        pf: s.pf,
        pa: s.pa,
        date: g.date,
        opp: s.opp,
        season: +g.season,
        type: normType(g.type),
        g,
      });
    }
  }

  const hi5 = perGame.slice().sort((a, b) => b.pf - a.pf || b.date.localeCompare(a.date)).slice(0, 5);
  const lo5 = perGame.slice().sort((a, b) => a.pf - b.pf || a.date.localeCompare(b.date)).slice(0, 5);

  const datesPlayed = unique(orderedAsc.map(g => (sidesForTeam(g, team) ? g.date : null)).filter(Boolean));
  for (const d of datesPlayed) {
    const dayGames = leagueGames.filter(x => x.date === d);
    if (dayGames.some(isTwoWeek2014)) continue;
    const maxScore = Math.max(...dayGames.flatMap(x => [x.scoreA, x.scoreB]));
    const minScore = Math.min(...dayGames.flatMap(x => [x.scoreA, x.scoreB]));
    const meGame = orderedAsc.find(x => x.date === d && sidesForTeam(x, team));
    const meScore = meGame ? (meGame.teamA === team ? meGame.scoreA : meGame.scoreB) : -Infinity;
    if (meScore === maxScore) crowns++;
    if (meScore === minScore) turds++;
  }

  for (const g of orderedAsc) {
    const s = sidesForTeam(g, team);
    if (!s) continue;
    const margin = Math.abs(s.pf - s.pa);
    if (margin < closeGameMargin) {
      if (s.result === 'W') closeW++;
      else if (s.result === 'L') closeL++;
      else closeT++;
    }
    if (s.result === 'W' && (s.pf - s.pa) >= blowoutMargin) blowouts++;
    if (s.result === 'L' && (s.pa - s.pf) >= blowoutMargin) blowoutLosses++;
    if (s.pf >= highScoreThreshold) high150++;
  }

  const teamSeasons = seasonAggregates.filter(r => r.team === team && r.n > 0 && +r.season !== 2014);
  const bestPPG = teamSeasons.slice().sort((a, b) => b.ppg - a.ppg || b.season - a.season)[0] || null;
  const bestOPPG = teamSeasons.slice().sort((a, b) => a.oppg - b.oppg || b.season - a.season)[0] || null;
  const byeYears = seasonSummaries.filter(r => r.owner === team && r.bye).map(r => r.season).sort((a, b) => b - a);
  const antiByeYears = seasonSummaries.filter(r => r.owner === team && r.saunders_bye).map(r => r.season).sort((a, b) => b - a);
  const lwSub = winStreak && winStreak.start && winStreak.end ? `${winStreak.start.date} \u2192 ${winStreak.end.date} (${weekLabelFor(winStreak.start)} \u2192 ${weekLabelFor(winStreak.end)})` : '';
  const llSub = lossStreak && lossStreak.start && lossStreak.end ? `${lossStreak.start.date} \u2192 ${lossStreak.end.date} (${weekLabelFor(lossStreak.start)} \u2192 ${weekLabelFor(lossStreak.end)})` : '';
  const { exp, act, luck } = luckSummary;

  const tile = (label, val, sub = '') => `<div class="stat"><div class="label">${esc(label)}</div><div class="value">${esc(val)}</div>${sub ? `<div class="label" style="margin-top:4px">${esc(sub)}</div>` : ''}</div>`;
  const factsHtml = [
    tile('Highest Score', hi ? hi.pf.toFixed(2) : '\u2014', hi ? `${hi.date} vs ${hi.opp} (${hi.pa.toFixed(2)} allowed)` : ''),
    tile('Biggest Blowout', blow ? `+${blow.margin.toFixed(2)}` : '\u2014', blow ? `${blow.date} vs ${blow.opp} (${blow.pf.toFixed(2)}\u2013${blow.pa.toFixed(2)})` : ''),
    tile('Biggest Loss', loss ? `-${loss.margin.toFixed(2)}` : '\u2014', loss ? `${loss.date} vs ${loss.opp} (${loss.pf.toFixed(2)}\u2013${loss.pa.toFixed(2)})` : ''),
    tile('Longest Win Streak', winStreak ? winStreak.len : 0, lwSub || '\u2014'),
    tile('Longest Losing Streak', lossStreak ? lossStreak.len : 0, llSub || '\u2014'),
    tile('Top-Week Crowns', crowns || 0, crowns ? 'Led league in points on those dates' : ''),
    tile('Bottom-Week Turds', turds || 0, turds ? 'Lowest score league-wide on those dates' : ''),
    tile('Close Games Record (<5)', `${closeW}-${closeL}${closeT ? `-${closeT}` : ''}`, (closeW + closeL + closeT) ? `${closeW + closeL + closeT} games` : '\u2014'),
    tile('Most PPG Season', bestPPG ? nfmt(bestPPG.ppg, 2) : '\u2014', bestPPG ? `${bestPPG.season}` : '\u2014'),
    tile('Lowest OPPG Season', bestOPPG ? nfmt(bestOPPG.oppg, 2) : '\u2014', bestOPPG ? `${bestOPPG.season}` : '\u2014'),
    tile('Blowout Wins (29+)', blowouts, blowouts ? 'Wins by 29+ points' : '\u2014'),
    tile('Blowout Losses (29+)', blowoutLosses, blowoutLosses ? 'Losses by 29+ points' : '\u2014'),
    tile('150+ Point Games', high150, high150 ? 'Single-team scores \u2265150' : '\u2014'),
    tile('Luck (Actual \u2212 Expected)', luck ? (luck > 0 ? `+${luck.toFixed(2)}` : luck.toFixed(2)) : (luck === 0 ? '0.00' : '\u2014'),
      (Number.isFinite(exp) ? `Actual: ${act.toFixed(2)} \u2022 Expected: ${exp.toFixed(2)} (regular season only)` : '\u2014')),
    tile('Byes', byeYears.length, byeYears.length ? `Years: ${byeYears.join(', ')}` : '\u2014'),
    tile('Anti-Byes', antiByeYears.length, antiByeYears.length ? `Years: ${antiByeYears.join(', ')}` : '\u2014'),
  ].join('');

  const row = (r) => `<tr>
  <td>${nfmt(r?.pf, 2)} \u2013 ${r.pa.toFixed(2)}</td>
  <td>${esc(r.opp)}</td>
  <td>${esc(r.date)}</td>
</tr>`;
  const listsHtml = `
  <div class="mini">
    <div class="mini-title">Top 5 Highest Scoring Games</div>
    <div class="table-wrap mini-table">
      <table>
        <thead><tr><th scope="col">Score</th><th scope="col">Opponent</th><th scope="col">Date</th></tr></thead>
        <tbody>${hi5.map(row).join('') || '<tr><td colspan="3" class="muted">\u2014</td></tr>'}</tbody>
      </table>
    </div>
  </div>
  <div class="mini">
    <div class="mini-title">Bottom 5 Lowest Scoring Games</div>
    <div class="table-wrap mini-table">
      <table>
        <thead><tr><th scope="col">Score</th><th scope="col">Opponent</th><th scope="col">Date</th></tr></thead>
        <tbody>${lo5.map(row).join('') || '<tr><td colspan="3" class="muted">\u2014</td></tr>'}</tbody>
      </table>
    </div>
  </div>
`;

  return { factsHtml, listsHtml };
}
export {
  leagueSummaryTablesHtml,
  leagueFunFactsAllTeamsHtml,
  leagueFunListsAllTeamsHtml,
  teamFunFactsView
};
