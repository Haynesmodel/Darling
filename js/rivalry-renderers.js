import * as core from './core-helpers.js';
import * as render from './render-helpers.js';

function coreFn(name) {
  const fn = core[name];
  if (typeof fn !== 'function') {
    throw new Error(`rivalry-renderers.js requires core-helpers.js before it (${name})`);
  }
  return fn;
}

function renderFn(name) {
  const fn = render[name];
  if (typeof fn !== 'function') {
    throw new Error(`rivalry-renderers.js requires render-helpers.js before it (${name})`);
  }
  return fn;
}

function docOrDefault(doc) {
  return doc || (typeof document !== 'undefined' ? document : null);
}

function esc(value) {
  return renderFn('escapeHtml')(value);
}

function nfmt(value, digits = 2) {
  return renderFn('nfmt')(value, digits);
}

function pairMatches(teamA, teamB, game) {
  return (game.teamA === teamA && game.teamB === teamB) ||
    (game.teamA === teamB && game.teamB === teamA);
}

function formatRecord(w, l, t = 0) {
  return t ? `${w}-${l}-${t}` : `${w}-${l}`;
}

function formatScoreline(a, b) {
  return `${nfmt(a, 2)} - ${nfmt(b, 2)}`;
}

function formatLeaderText(teamA, teamB, result, len) {
  if (!len) return '—';
  if (result === 'T') return `Tie T${len}`;
  return `${result === 'W' ? teamA : teamB} W${len}`;
}

function summarizeMargins(games, teamA, teamB) {
  const sidesForTeamFn = coreFn('sidesForTeam');
  const margins = [];
  const blowoutCounts = { [teamA]: 0, [teamB]: 0 };
  let shootouts = 0;

  for (const g of games) {
    const s = sidesForTeamFn(g, teamA);
    if (!s) continue;
    const margin = Math.abs(s.pf - s.pa);
    margins.push(margin);
    if (margin >= 30) {
      const winner = s.result === 'W' ? teamA : teamB;
      blowoutCounts[winner] = (blowoutCounts[winner] || 0) + 1;
    }
    if (+g.scoreA >= 130 && +g.scoreB >= 130) shootouts += 1;
  }

  if (!margins.length) {
    return {
      averageMargin: null,
      medianMargin: null,
      closestGameCounts: { one: 0, five: 0, ten: 0 },
      blowoutCounts,
      shootouts,
    };
  }

  const sorted = margins.slice().sort((a, b) => a - b);
  const total = margins.reduce((sum, value) => sum + value, 0);
  const mid = Math.floor(sorted.length / 2);
  const medianMargin = (sorted.length % 2)
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;

  return {
    averageMargin: total / margins.length,
    medianMargin,
    closestGameCounts: {
      one: margins.filter(value => value <= 1).length,
      five: margins.filter(value => value <= 5).length,
      ten: margins.filter(value => value <= 10).length,
    },
    blowoutCounts,
    shootouts,
  };
}

function rivalryGames(teamA, teamB, games) {
  if (!teamA || !teamB || teamA === teamB) return [];
  return games
    .filter(g => pairMatches(teamA, teamB, g))
    .slice()
    .sort(coreFn('byDateAsc'));
}

function emptyRecord() {
  return { w: 0, l: 0, t: 0, g: 0, pf: 0, pa: 0 };
}

function updateRecord(record, result, pf, pa) {
  record.g += 1;
  record.pf += pf;
  record.pa += pa;
  if (result === 'W') record.w += 1;
  else if (result === 'L') record.l += 1;
  else record.t += 1;
}

function recordFromGames(teamA, games) {
  const sidesForTeamFn = coreFn('sidesForTeam');
  const out = emptyRecord();
  for (const g of games) {
    const s = sidesForTeamFn(g, teamA);
    if (!s) continue;
    updateRecord(out, s.result, s.pf, s.pa);
  }
  return out;
}

function resultLabelFromTeamA(result, teamA, teamB) {
  if (result === 'W') return teamA;
  if (result === 'L') return teamB;
  return 'Tie';
}

function computeBestRun(teamA, teamB, games, resultType) {
  const sidesForTeamFn = coreFn('sidesForTeam');
  const ordered = games.slice().sort(coreFn('byDateAsc'));
  let best = null;
  let current = null;

  for (const g of ordered) {
    const s = sidesForTeamFn(g, teamA);
    if (!s) continue;
    if (s.result === resultType) {
      if (!current) {
        current = { result: resultType, len: 0, start: g, end: g };
      }
      current.len += 1;
      current.end = g;
    } else if (current) {
      if (!best || current.len > best.len || (current.len === best.len && current.end.date > best.end.date)) {
        best = current;
      }
      current = null;
    }
  }

  if (current && (!best || current.len > best.len || (current.len === best.len && current.end.date > best.end.date))) {
    best = current;
  }

  return best;
}

function computeCurrentRun(teamA, teamB, games) {
  const sidesForTeamFn = coreFn('sidesForTeam');
  const ordered = games.slice().sort(coreFn('byDateAsc'));
  if (!ordered.length) return null;

  const endGame = ordered[ordered.length - 1];
  const endSide = sidesForTeamFn(endGame, teamA);
  if (!endSide) return null;

  const result = endSide.result;
  let len = 1;
  let start = endGame;

  for (let i = ordered.length - 2; i >= 0; i -= 1) {
    const side = sidesForTeamFn(ordered[i], teamA);
    if (!side || side.result !== result) break;
    len += 1;
    start = ordered[i];
  }

  return {
    result,
    len,
    start,
    end: endGame,
    leader: resultLabelFromTeamA(result, teamA, teamB),
  };
}

function summarizeRivalry(teamA, teamB, games) {
  const filtered = rivalryGames(teamA, teamB, games);
  const sidesForTeamFn = coreFn('sidesForTeam');
  const isRegularGameFn = coreFn('isRegularGame');
  const isPlayoffGameFn = coreFn('isPlayoffGame');
  const isSaundersGameFn = coreFn('isSaundersGame');

  const overall = emptyRecord();
  const regular = emptyRecord();
  const playoffs = emptyRecord();
  const saunders = emptyRecord();
  let biggestBlowout = null;
  let closestGame = null;
  let highestCombinedGame = null;
  let lowestCombinedGame = null;
  let highestTeamAScore = null;
  let highestTeamBScore = null;
  let lastMeeting = null;

  for (const g of filtered) {
    const s = sidesForTeamFn(g, teamA);
    if (!s) continue;
    updateRecord(overall, s.result, s.pf, s.pa);

    if (isRegularGameFn(g)) updateRecord(regular, s.result, s.pf, s.pa);
    else if (isSaundersGameFn(g)) updateRecord(saunders, s.result, s.pf, s.pa);
    else if (isPlayoffGameFn(g)) updateRecord(playoffs, s.result, s.pf, s.pa);

    const margin = Math.abs(s.pf - s.pa);
    const combined = +g.scoreA + +g.scoreB;
    const row = {
      date: g.date,
      season: +g.season,
      winner: s.result === 'T' ? 'Tie' : (s.result === 'W' ? teamA : teamB),
      teamA,
      teamB,
      scoreA: +g.scoreA,
      scoreB: +g.scoreB,
      pf: s.pf,
      pa: s.pa,
      result: s.result,
      type: coreFn('normType')(g.type),
      round: coreFn('normRound')(g.round),
    };

    if (!biggestBlowout || margin > biggestBlowout.margin || (margin === biggestBlowout.margin && row.date > biggestBlowout.date)) {
      biggestBlowout = { ...row, margin };
    }
    if (!closestGame || margin < closestGame.margin || (margin === closestGame.margin && row.date > closestGame.date)) {
      closestGame = { ...row, margin };
    }
    if (!highestCombinedGame || combined > highestCombinedGame.total || (combined === highestCombinedGame.total && row.date > highestCombinedGame.date)) {
      highestCombinedGame = { ...row, total: combined };
    }
    if (!lowestCombinedGame || combined < lowestCombinedGame.total || (combined === lowestCombinedGame.total && row.date > lowestCombinedGame.date)) {
      lowestCombinedGame = { ...row, total: combined };
    }
    if (!highestTeamAScore || s.pf > highestTeamAScore.score || (s.pf === highestTeamAScore.score && row.date > highestTeamAScore.date)) {
      highestTeamAScore = { ...row, score: s.pf };
    }
    if (!highestTeamBScore || s.pa > highestTeamBScore.score || (s.pa === highestTeamBScore.score && row.date > highestTeamBScore.date)) {
      highestTeamBScore = { ...row, score: s.pa };
    }
    if (!lastMeeting || row.date > lastMeeting.date) {
      lastMeeting = { ...row };
    }
  }

  const currentStreak = computeCurrentRun(teamA, teamB, filtered);
  const longestTeamAStreak = computeBestRun(teamA, teamB, filtered, 'W');
  const longestTeamBStreak = computeBestRun(teamA, teamB, filtered, 'L');

  const buildSeriesText = (record) => {
    if (!record.g) return '0-0';
    return formatRecord(record.w, record.l, record.t);
  };

  return {
    teamA,
    teamB,
    games: filtered,
    overall: {
      ...overall,
      diff: overall.pf - overall.pa,
      pct: overall.g ? (overall.w + 0.5 * overall.t) / overall.g : 0,
      averageA: overall.g ? overall.pf / overall.g : 0,
      averageB: overall.g ? overall.pa / overall.g : 0,
      recordText: buildSeriesText(overall),
    },
    regular: {
      ...regular,
      diff: regular.pf - regular.pa,
      pct: regular.g ? (regular.w + 0.5 * regular.t) / regular.g : 0,
      recordText: buildSeriesText(regular),
    },
    playoffs: {
      ...playoffs,
      diff: playoffs.pf - playoffs.pa,
      pct: playoffs.g ? (playoffs.w + 0.5 * playoffs.t) / playoffs.g : 0,
      recordText: buildSeriesText(playoffs),
    },
    saunders: {
      ...saunders,
      diff: saunders.pf - saunders.pa,
      pct: saunders.g ? (saunders.w + 0.5 * saunders.t) / saunders.g : 0,
      recordText: buildSeriesText(saunders),
    },
    biggestBlowout,
    closestGame,
    highestCombinedGame,
    lowestCombinedGame,
    highestTeamAScore,
    highestTeamBScore,
    currentStreak,
    longestTeamAStreak,
    longestTeamBStreak,
    lastMeeting,
  };
}

function rivalrySeasonBreakdown(teamA, teamB, games) {
  const filtered = rivalryGames(teamA, teamB, games);
  const bySeason = new Map();
  const sidesForTeamFn = coreFn('sidesForTeam');
  const isRegularGameFn = coreFn('isRegularGame');
  const isPlayoffGameFn = coreFn('isPlayoffGame');
  const isSaundersGameFn = coreFn('isSaundersGame');

  for (const g of filtered) {
    const season = +g.season;
    const s = sidesForTeamFn(g, teamA);
    if (!s) continue;
    const row = bySeason.get(season) || {
      season,
      games: 0,
      w: 0,
      l: 0,
      t: 0,
      pf: 0,
      pa: 0,
      diff: 0,
      notes: [],
      postseasonWinner: null,
    };
    row.games += 1;
    row.pf += s.pf;
    row.pa += s.pa;
    if (s.result === 'W') row.w += 1;
    else if (s.result === 'L') row.l += 1;
    else row.t += 1;

    if (isPlayoffGameFn(g)) {
      const winner = s.result === 'T' ? 'Tie' : (s.result === 'W' ? teamA : teamB);
      row.postseasonWinner = winner;
      if (!row.notes.includes('Playoff meeting')) row.notes.push('Playoff meeting');
    }
    if (isSaundersGameFn(g) && !row.notes.includes('Saunders meeting')) row.notes.push('Saunders meeting');
    if (isRegularGameFn(g) && !row.notes.includes('Regular season')) row.notes.push('Regular season');

    bySeason.set(season, row);
  }

  return [...bySeason.values()]
    .sort((a, b) => b.season - a.season)
    .map(row => {
      const notes = [...row.notes];
      if (row.games && row.w === row.games) notes.unshift('🧹 Sweep');
      else if (row.games && row.l === row.games) notes.unshift('🧹 Swept');
      else if (row.w > 0 && row.l > 0) notes.unshift('Split');
      if (row.postseasonWinner) notes.push(`Postseason winner: ${row.postseasonWinner}`);
      if (row.t) notes.push(`${row.t} tie${row.t === 1 ? '' : 's'}`);
      return {
        ...row,
        diff: row.pf - row.pa,
        recordText: formatRecord(row.w, row.l, row.t),
        notes,
      };
    });
}

function rivalryGameRows(teamA, teamB, games) {
  const filtered = rivalryGames(teamA, teamB, games);
  const sidesForTeamFn = coreFn('sidesForTeam');
  const byDateDescFn = coreFn('byDateDesc');

  return filtered
    .slice()
    .sort(byDateDescFn)
    .map(g => {
      const s = sidesForTeamFn(g, teamA);
      if (!s) return null;
      const winner = s.result === 'T' ? 'Tie' : (s.result === 'W' ? teamA : teamB);
      return {
        date: g.date,
        season: +g.season,
        week: g._weekByTeam && Number.isFinite(+g._weekByTeam[teamA]) ? +g._weekByTeam[teamA] : null,
        type: coreFn('normType')(g.type),
        round: coreFn('normRound')(g.round),
        result: s.result,
        winner,
        score: formatScoreline(s.pf, s.pa),
        margin: Math.abs(s.pf - s.pa),
        rowClass: s.result === 'W' ? 'result-win' : s.result === 'L' ? 'result-loss' : 'result-tie',
        postseasonClass: coreFn('normType')(g.type) !== 'Regular' ? 'postseason' : '',
      };
    })
    .filter(Boolean);
}

function buildRivalryViewModel(teamA, teamB, games) {
  const summary = summarizeRivalry(teamA, teamB, games);
  const seasonRows = rivalrySeasonBreakdown(teamA, teamB, games);
  const gameRows = rivalryGameRows(teamA, teamB, games);
  const marginStats = summarizeMargins(summary.games, teamA, teamB);
  const teamRunLabel = (team) => `Longest ${team} Run`;
  const leaderLabel = summary.overall.w > summary.overall.l
    ? `${teamA} leads`
    : summary.overall.l > summary.overall.w
      ? `${teamB} leads`
      : 'Series tied';
  const scoreLeaderLabel = summary.overall.averageA > summary.overall.averageB
    ? `${teamA} leads`
    : summary.overall.averageB > summary.overall.averageA
      ? `${teamB} leads`
      : 'Even';

  const tape = [
    { label: 'Series Record', value: summary.overall.recordText || '—', sub: summary.overall.g ? leaderLabel : '' },
    { label: 'Point Differential', value: `${summary.overall.diff >= 0 ? '+' : ''}${nfmt(summary.overall.diff, 2)}`, sub: summary.overall.g ? leaderLabel : '' },
    { label: 'Average Score', value: `${nfmt(summary.overall.averageA, 2)} - ${nfmt(summary.overall.averageB, 2)}`, sub: summary.overall.g ? scoreLeaderLabel : '' },
    {
      label: 'Biggest Blowout',
      value: summary.biggestBlowout ? formatScoreline(summary.biggestBlowout.pf, summary.biggestBlowout.pa) : '—',
      sub: summary.biggestBlowout
        ? `${summary.biggestBlowout.winner} on ${summary.biggestBlowout.date}`
        : '',
    },
    { label: 'Regular Season', value: summary.regular.recordText || '—', sub: '' },
    { label: 'Playoffs', value: summary.playoffs.recordText || '—', sub: '' },
    { label: 'Saunders', value: summary.saunders.recordText || '—', sub: '' },
    { label: 'Current Streak', value: formatLeaderText(teamA, teamB, summary.currentStreak?.result || 'T', summary.currentStreak?.len || 0), sub: summary.currentStreak ? `${summary.currentStreak.start.date} to ${summary.currentStreak.end.date}` : '' },
    { label: teamRunLabel(teamA), value: formatLeaderText(teamA, teamB, summary.longestTeamAStreak?.result || 'T', summary.longestTeamAStreak?.len || 0), sub: summary.longestTeamAStreak ? `${summary.longestTeamAStreak.start.date} to ${summary.longestTeamAStreak.end.date}` : '' },
    { label: teamRunLabel(teamB), value: formatLeaderText(teamA, teamB, summary.longestTeamBStreak?.result || 'T', summary.longestTeamBStreak?.len || 0), sub: summary.longestTeamBStreak ? `${summary.longestTeamBStreak.start.date} to ${summary.longestTeamBStreak.end.date}` : '' },
    { label: 'Margin Avg / Median', value: marginStats.averageMargin === null ? '—' : `${nfmt(marginStats.averageMargin, 2)} / ${nfmt(marginStats.medianMargin, 2)}`, sub: '' },
    { label: '30+ Point Wins', value: `${teamA} ${marginStats.blowoutCounts[teamA] || 0} / ${teamB} ${marginStats.blowoutCounts[teamB] || 0}`, sub: '' },
    { label: 'Shootouts', value: `${marginStats.shootouts}`, sub: 'Both teams 130+' },
    { label: 'Last Meeting', value: summary.lastMeeting ? `${summary.lastMeeting.winner === 'Tie' ? 'Tied' : summary.lastMeeting.winner} ${formatScoreline(summary.lastMeeting.pf, summary.lastMeeting.pa)}` : '—', sub: summary.lastMeeting ? summary.lastMeeting.date : '' },
  ];

  return {
    teamA,
    teamB,
    summary,
    tape,
    seasonRows,
    gameRows,
  };
}

function rivalryHeadlineHtml(view) {
  if (!view.summary.overall.g) {
    return `
      <div class="rivalry-headline">
        <div class="rivalry-title">${esc(view.teamA)} vs ${esc(view.teamB)}</div>
        <div class="rivalry-subtitle">No recorded games between ${esc(view.teamA)} and ${esc(view.teamB)}.</div>
      </div>
    `;
  }

  const overall = view.summary.overall;
  const seriesText = overall.w > overall.l
    ? `${esc(view.teamA)} leads ${formatRecord(overall.w, overall.l, overall.t)}`
    : overall.l > overall.w
      ? `${esc(view.teamB)} leads ${formatRecord(overall.l, overall.w, overall.t)}`
      : `Series tied ${formatRecord(overall.w, overall.l, overall.t)}`;
  const current = view.summary.currentStreak
    ? `${esc(formatLeaderText(view.teamA, view.teamB, view.summary.currentStreak.result, view.summary.currentStreak.len))} from ${esc(view.summary.currentStreak.start.date)} to ${esc(view.summary.currentStreak.end.date)}`
    : 'No current streak';
  const lastMeeting = view.summary.lastMeeting
    ? `${view.summary.lastMeeting.winner === 'Tie' ? 'Tied' : esc(view.summary.lastMeeting.winner)} ${formatScoreline(view.summary.lastMeeting.pf, view.summary.lastMeeting.pa)} on ${esc(view.summary.lastMeeting.date)}`
    : 'No meeting';

  return `
    <div class="rivalry-headline">
      <div class="rivalry-title">${esc(view.teamA)} vs ${esc(view.teamB)}</div>
      <div class="rivalry-subtitle">${seriesText}</div>
      <div class="rivalry-line">${formatScoreline(overall.pf, overall.pa)} total points</div>
      <div class="rivalry-line">Regular ${esc(view.summary.regular.recordText || '0-0')} | Playoffs ${esc(view.summary.playoffs.recordText || '0-0')} | Saunders ${esc(view.summary.saunders.recordText || '0-0')}</div>
      <div class="rivalry-line">Current streak: ${current} | Last meeting: ${lastMeeting}</div>
    </div>
  `;
}

function rivalryTapeHtml(view) {
  return view.tape.map(tile => `
    <div class="stat rivalry-stat">
      <div class="label">${esc(tile.label)}</div>
      <div class="value">${esc(tile.value)}</div>
      ${tile.sub ? `<div class="sub">${esc(tile.sub)}</div>` : ''}
    </div>
  `).join('');
}

function rivalrySeasonTableHtml(view) {
  if (!view.seasonRows.length) {
    return '<tr><td colspan="6" class="muted">No recorded games between these teams.</td></tr>';
  }
  return view.seasonRows.map(row => `
    <tr class="${row.games ? '' : 'muted'}">
      <td>${esc(row.season)}</td>
      <td>${esc(row.recordText)}</td>
      <td>${nfmt(row.pf, 2)}</td>
      <td>${nfmt(row.pa, 2)}</td>
      <td>${row.diff >= 0 ? '+' : ''}${nfmt(row.diff, 2)}</td>
      <td>${esc(row.notes.join(' • ') || '—')}</td>
    </tr>
  `).join('');
}

function rivalryGameTableHtml(view) {
  if (!view.gameRows.length) {
    return '<tr><td colspan="8" class="muted">No recorded games between these teams.</td></tr>';
  }
  return view.gameRows.map(row => `
    <tr class="${row.rowClass} ${row.postseasonClass}">
      <td>${esc(row.date)}</td>
      <td>${esc(row.season)}</td>
      <td>${row.week ?? '—'}</td>
      <td>${esc(row.type)}</td>
      <td>${esc(row.round || '—')}</td>
      <td>${esc(row.winner)}</td>
      <td>${esc(row.score)}</td>
      <td>${row.margin.toFixed(2)}</td>
    </tr>
  `).join('');
}

function renderRivalryHeadline(view, opts = {}) {
  const doc = docOrDefault(opts.doc);
  if (!doc) return;
  const el = doc.getElementById('rivalryHeadline');
  if (!el) return;
  el.innerHTML = rivalryHeadlineHtml(view);
}

function renderRivalryTape(view, opts = {}) {
  const doc = docOrDefault(opts.doc);
  if (!doc) return;
  const el = doc.getElementById('rivalryTapeGrid');
  if (!el) return;
  el.innerHTML = rivalryTapeHtml(view);
}

function renderRivalrySeasonTable(view, opts = {}) {
  const doc = docOrDefault(opts.doc);
  if (!doc) return;
  const tbody = doc.querySelector('#rivalrySeasonTable tbody');
  if (!tbody) return;
  tbody.innerHTML = rivalrySeasonTableHtml(view);
}

function renderRivalryGameTable(view, opts = {}) {
  const doc = docOrDefault(opts.doc);
  if (!doc) return;
  const tbody = doc.querySelector('#rivalryGameTable tbody');
  if (!tbody) return;
  tbody.innerHTML = rivalryGameTableHtml(view);
}

export {
  buildRivalryViewModel,
  computeBestRun,
  computeCurrentRun,
  formatLeaderText,
  formatRecord,
  formatScoreline,
  pairMatches,
  recordFromGames,
  rivalryGameRows,
  rivalryGames,
  rivalryHeadlineHtml,
  rivalrySeasonBreakdown,
  rivalrySeasonTableHtml,
  rivalryGameTableHtml,
  rivalryTapeHtml,
  renderRivalryGameTable,
  renderRivalryHeadline,
  renderRivalrySeasonTable,
  renderRivalryTape,
  summarizeRivalry,
};
