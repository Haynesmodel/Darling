import * as core from './core-helpers.js';
import * as render from './render-helpers.js';
import * as stats from './stats-helpers.js';
import { queryHistoryGames } from './history-game-query.js';
function coreFn(name) {
  const fn = core[name] || stats[name];
  if (typeof fn !== 'function') {
    throw new Error(`history-renderers.js requires core-helpers.js before it (${name})`);
  }
  return fn;
}

function docOrDefault(doc) {
  return doc || (typeof document !== 'undefined' ? document : null);
}

function renderFn(name) {
  const fn = render[name];
  if (typeof fn !== 'function') {
    throw new Error(`history-renderers.js requires render-helpers.js before it (${name})`);
  }
  return fn;
}

function esc(value) {
  return renderFn('escapeHtml')(value);
}

function formatRunDate(value) {
  return (value && typeof value === 'object') ? value.date : value;
}

function buildTopHighlightsViewModel(team, opts = {}) {
  const allTeams = opts.allTeams || '__ALL__';
  const seasonSummaries = opts.seasonSummaries || [];
  const champNoteFn = opts.champNoteFn || (() => null);
  const saundersNoteFn = opts.saundersNoteFn || (() => null);
  const computeRegularSeasonChampYearsFn = coreFn('computeRegularSeasonChampYears');
  const nfmtFn = renderFn('nfmt');

  if (team === allTeams) {
    return {
      isLeagueView: true,
      chips: [
        {
          title: 'League view',
          main: 'Select a team to see Darlings & Saunders',
          sub: 'Filters still work (e.g., Week 1). See Team Breakdown below.',
        },
      ],
    };
  }

  const rows = seasonSummaries.filter(r => r.owner === team);
  const champYears = rows.filter(r => r.champion).map(r => r.season).sort((a, b) => b - a);
  const sauYears = rows.filter(r => r.saunders === true).map(r => r.season).sort((a, b) => b - a);
  const regYears = computeRegularSeasonChampYearsFn(team, seasonSummaries).sort((a, b) => b - a);
  const avgFinish = rows.filter(r => Number.isFinite(+r.finish));
  const avgFinishValue = avgFinish.length ? avgFinish.reduce((sum, r) => sum + (+r.finish), 0) / avgFinish.length : null;
  const champsDisplay = champYears.map(y => champNoteFn(team, y) ? `${y}*` : `${y}`);
  const sauDisplay = sauYears.map(y => saundersNoteFn(team, y) ? `${y}*` : `${y}`);
  const notes = [];
  champYears.forEach(y => { const n = champNoteFn(team, y); if (n) notes.push(`${y} \u2014 ${n}`); });
  sauYears.forEach(y => { const n = saundersNoteFn(team, y); if (n) notes.push(`${y} \u2014 ${n}`); });

  return {
    isLeagueView: false,
    chips: [
      { title: 'Darlings', main: `${champYears.length}`, sub: champYears.length ? `Years: ${champsDisplay.join(', ')}` : '\u2014' },
      { title: 'Saunders', main: `${sauYears.length}`, sub: sauYears.length ? `Years: ${sauDisplay.join(', ')}` : '\u2014' },
      { title: 'Regular-Season Titles', main: `${regYears.length}`, sub: regYears.length ? `Years: ${regYears.join(', ')}` : '\u2014' },
      { title: 'Avg Finish', main: nfmtFn(avgFinishValue, 2), sub: avgFinish.length ? `Seasons: ${avgFinish.length}` : '\u2014' },
      ...(notes.length ? [{ title: 'Notes', main: '', sub: `* ${notes.join(' \u2022 ')}`, kind: 'notes' }] : []),
    ],
  };
}

function buildSeasonCalloutViewModel(team, opts = {}) {
  const allTeams = opts.allTeams || '__ALL__';
  const selectedSeasons = opts.selectedSeasons instanceof Set ? opts.selectedSeasons : new Set(opts.selectedSeasons || []);
  const seasonSummaries = opts.seasonSummaries || [];
  const champNoteFn = opts.champNoteFn || (() => null);
  const saundersNoteFn = opts.saundersNoteFn || (() => null);
  const fmtPctFn = coreFn('fmtPct');

  if (team === allTeams) return { show: false, html: '', effectKey: null, effectType: null, resetEffect: false };
  if (selectedSeasons.size !== 1) return { show: false, html: '', effectKey: null, effectType: null, resetEffect: true };

  const [onlySeason] = [...selectedSeasons];
  const rec = seasonSummaryLookup(team, onlySeason, seasonSummaries);
  if (!rec) return { show: false, html: '', effectKey: null, effectType: null, resetEffect: false };

  const bits = [];
  if (rec.champion) bits.push(`\ud83c\udfc6 Champion${champNoteFn(team, onlySeason) ? '*' : ''}`);
  if (rec.bye) bits.push('\ud83d\udd25 Top-2 Seed');
  if (rec.saunders) bits.push(`\ud83e\udea6 Saunders${saundersNoteFn(team, onlySeason) ? '*' : ''}`);
  if (rec.playoff_wins || rec.playoff_losses || rec.playoff_ties) {
    bits.push(`Playoffs: ${(rec.playoff_wins || 0)}-${(rec.playoff_losses || 0)}-${(rec.playoff_ties || 0)}`);
  }
  if (rec.saunders_wins || rec.saunders_losses || rec.saunders_ties) {
    bits.push(`Saunders: ${(rec.saunders_wins || 0)}-${(rec.saunders_losses || 0)}-${(rec.saunders_ties || 0)}`);
  }

  const record = `${rec.wins}-${rec.losses}-${rec.ties || 0}`;
  const pct = fmtPctFn(rec.wins, rec.losses, rec.ties || 0);
  const finish = Number.isFinite(+rec.finish) ? `${rec.finish}` : '\u2014';
  const draftPick = Number.isFinite(+rec.draft_pick) ? `#${rec.draft_pick}` : '\u2014';
  const notes = [];
  const cN = champNoteFn(team, onlySeason);
  if (cN) notes.push(`${onlySeason} \u2014 ${cN}`);
  const sN = saundersNoteFn(team, onlySeason);
  if (sN) notes.push(`${onlySeason} \u2014 ${sN}`);
  const effectKey = `${team}|${onlySeason}|${rec.champion ? 'C' : ''}${rec.saunders ? 'S' : ''}`;
  const effectType = rec.champion ? 'champion' : rec.saunders ? 'saunders' : null;

  return {
    show: true,
    team,
    season: onlySeason,
    record,
    pct,
    finish,
    draftPick,
    bits,
    notes,
    effectKey,
    effectType,
    resetEffect: false,
  };
}

function historyGamesTableRowHtml(game, team) {
  const sidesForTeamFn = coreFn('sidesForTeam');
  const normTypeFn = coreFn('normType');
  const normRoundFn = coreFn('normRound');
  const s = sidesForTeamFn(game, team);
  if (!s) return null;
  const type = normTypeFn(game.type);
  const resClass = s.result === 'W' ? 'result-win' : s.result === 'L' ? 'result-loss' : 'result-tie';
  const postClass = (type !== 'Regular') ? 'postseason' : '';
  return `<tr class="${resClass} ${postClass}">
    <td>${esc(game.date)}</td>
    <td>${esc(s.opp)}</td>
    <td>${s.result}</td>
    <td>${s.pf.toFixed(2)} - ${s.pa.toFixed(2)}</td>
    <td>${esc(type)}</td>
    <td>${esc(normRoundFn(game.round))}</td>
    <td>${esc(game.season)}</td>
  </tr>`;
}

function historyGamePerspectiveRowHtml(row, opts = {}) {
  const includeTeam = !!opts.includeTeam;
  const resClass = row.result === 'W' ? 'result-win' : row.result === 'L' ? 'result-loss' : 'result-tie';
  const postClass = row.type !== 'Regular' ? 'postseason' : '';
  return `<tr class="${resClass} ${postClass}">
    ${includeTeam ? `<td>${esc(row.team)}</td>` : ''}
    <td>${esc(row.date)}</td>
    <td>${esc(row.opponent)}</td>
    <td>${row.result}</td>
    <td>${row.score.toFixed(2)} - ${row.opponentScore.toFixed(2)}</td>
    <td>${esc(row.type)}</td>
    <td>${esc(row.round)}</td>
    <td>${esc(row.season)}</td>
  </tr>`;
}

function historyGamesTableHtml(team, games, opts = {}) {
  const allTeams = opts.allTeams || '__ALL__';
  const view = queryHistoryGames(games, {
    selectedTeam: team,
    allTeams,
    query: opts.query || {},
  });
  const includeTeam = team === allTeams;
  if (!view.rows.length) return '';
  return view.rows.map(row => historyGamePerspectiveRowHtml(row, { includeTeam })).join('');
}

function renderGamesTable(team, games, opts = {}) {
  const root = docOrDefault(opts.doc);
  if (!root) return;
  const tbody = root.querySelector('#historyGamesTable tbody');
  if (!tbody) return;
  tbody.innerHTML = historyGamesTableHtml(team, games, opts);
  const allTeams = opts.allTeams || '__ALL__';
  const includeTeam = team === allTeams;
  const teamHeader = root.getElementById('historyGamesTeamHeader');
  if (teamHeader) teamHeader.hidden = !includeTeam;
  const view = queryHistoryGames(games, {
    selectedTeam: team,
    allTeams,
    query: opts.query || {},
  });
  const summary = root.getElementById('historyGamesQuerySummary');
  if (summary) {
    summary.textContent = (includeTeam || opts.query?.gameResult || Number.isFinite(opts.query?.gameMinScore) || Number.isFinite(opts.query?.gameMaxScore) || opts.query?.gameSort || opts.query?.gameLimit)
      ? view.summary
      : '';
  }
}

function weekByWeekRows(team, games, opts = {}) {
  const sidesForTeamFn = coreFn('sidesForTeam');
  const normTypeFn = coreFn('normType');
  const normRoundFn = coreFn('normRound');
  const byDateDescFn = coreFn('byDateDesc');
  const computeExpectedWinForGameFn = opts.computeExpectedWinForGameFn || coreFn('computeExpectedWinForGame');
  const allGames = opts.allGames || games;
  const bySeason = new Map();
  for (const g of games) {
    const arr = bySeason.get(g.season) || [];
    arr.push(g);
    bySeason.set(g.season, arr);
  }

  const rows = [];
  for (const [season, arr] of [...bySeason.entries()].sort((a, b) => b[0] - a[0])) {
    for (const g of arr.sort(byDateDescFn)) {
      const s = sidesForTeamFn(g, team);
      if (!s) continue;
      const type = normTypeFn(g.type);
      const week = (g._weekByTeam && g._weekByTeam[team]) || '';
      const dayGames = allGames.filter(x => +x.season === +g.season && x.date === g.date);
      const allScores = dayGames.flatMap(x => [x.scoreA, x.scoreB]);
      const maxScore = Math.max(...allScores);
      const minScore = Math.min(...allScores);
      const myScore = (g.teamA === team) ? g.scoreA : g.scoreB;
      const isCrown = myScore === maxScore;
      const isTurd = myScore === minScore;
      const xw = computeExpectedWinForGameFn(allGames, team, g);

      rows.push({
        season,
        week,
        date: g.date,
        opp: s.opp,
        result: s.result,
        pf: s.pf,
        pa: s.pa,
        type,
        round: normRoundFn(g.round),
        isCrown,
        isTurd,
        xw,
      });
    }
  }
  return rows;
}

function weekByWeekTableRowHtml(row) {
  const nfmtFn = renderFn('nfmt');
  const resClass = row.result === 'W' ? 'result-win' : row.result === 'L' ? 'result-loss' : 'result-tie';
  const postClass = (row.type !== 'Regular') ? 'postseason' : '';
  const badges = `
    ${row.isCrown ? '<span class="badge-emoji" title="Top score league-wide this week">&#x1f451;</span>' : ''}
    ${row.isTurd ? '<span class="badge-emoji big" title="Lowest score league-wide this week">&#x1f4a9;</span>' : ''}
  `;
  return `<tr class="${resClass} ${postClass}">
    <td>${esc(row.season)}</td>
    <td>${row.week || ''}</td>
    <td>${esc(row.date)}</td>
    <td>${esc(row.opp)}</td>
    <td>${row.result}</td>
    <td class="score-cell">${nfmtFn(row?.pf, 2)} - ${row.pa.toFixed(2)} ${badges}</td>
    <td>${(row.xw === null || row.xw === undefined) ? '\u2014' : row.xw.toFixed(2)}</td>
    <td>${esc(row.type)}</td>
    <td>${esc(row.round || '')}</td>
  </tr>`;
}

function weekByWeekTableHtml(team, games, opts = {}) {
  const allTeams = opts.allTeams || '__ALL__';
  if (team === allTeams) {
    return '<tr><td colspan="9" class="muted">Select a team to see week-by-week games.</td></tr>';
  }
  return weekByWeekRows(team, games, opts)
    .map(weekByWeekTableRowHtml)
    .join('');
}

function renderWeekByWeek(team, games, opts = {}) {
  const root = docOrDefault(opts.doc);
  if (!root) return;
  const tbody = root.querySelector('#weekTable tbody');
  if (!tbody) return;
  tbody.innerHTML = weekByWeekTableHtml(team, games, opts);
}

function seasonOutcomeNarrative(team, games, roundPrefix = '') {
  if (!games.length) return '';
  const sidesForTeamFn = coreFn('sidesForTeam');
  const normRoundFn = coreFn('normRound');
  const roundOrderFn = coreFn('roundOrder');
  const ordered = games
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date) || roundOrderFn(a.round) - roundOrderFn(b.round));
  const narrative = [];
  for (const g of ordered) {
    const s = sidesForTeamFn(g, team);
    if (!s) continue;
    const opp = s.opp;
    let round = normRoundFn(g.round) || (roundPrefix ? `${roundPrefix} Round` : 'Playoffs');
    if (roundPrefix) round = round.replace(/^saunders\s+/i, '').trim();
    if (s.result === 'W') narrative.push(`Defeated ${opp} in ${round}`);
    else if (s.result === 'L') narrative.push(`Lost in ${round} to ${opp}`);
    else narrative.push(`Tied ${opp} in ${round}`);
  }
  return narrative.join(', ');
}

function seasonRecapOutcome(team, summaryRow, allGames) {
  const isPlayoffGameFn = coreFn('isPlayoffGame');
  const isSaundersGameFn = coreFn('isSaundersGame');
  const season = +summaryRow.season;
  const playoffGames = allGames.filter(g => +g.season === season && (g.teamA === team || g.teamB === team) && isPlayoffGameFn(g));
  const saundersGames = allGames.filter(g => +g.season === season && (g.teamA === team || g.teamB === team) && isSaundersGameFn(g));
  const bagelNote = (summaryRow.bagels_earned === null || summaryRow.bagels_earned === undefined)
    ? ''
    : ` \u2022 Bagels earned \ud83e\udd6f: ${summaryRow.bagels_earned}`;
  const playoffNarr = seasonOutcomeNarrative(team, playoffGames);
  if (playoffNarr) return `${playoffNarr}${bagelNote}`;
  const saundersNarr = seasonOutcomeNarrative(team, saundersGames, 'Saunders');
  if (saundersNarr) return `${saundersNarr}${bagelNote}`;
  if (summaryRow.bye) return `Top-2 Seed${bagelNote}`;
  if (bagelNote) return `Bagels earned \ud83e\udd6f: ${summaryRow.bagels_earned}`;
  return '\u2014';
}

function seasonRecapRows(team, seasonSummaries, opts = {}) {
  const isRestrictiveFn = coreFn('isRestrictive');
  const selectedSeasons = opts.selectedSeasons instanceof Set ? opts.selectedSeasons : new Set(opts.selectedSeasons || []);
  const universeSeasons = opts.universeSeasons || [];
  let rows = seasonSummaries.filter(r => r.owner === team);
  if (isRestrictiveFn(selectedSeasons, universeSeasons)) {
    rows = rows.filter(r => selectedSeasons.has(+r.season));
  }
  return rows.sort((a, b) => b.season - a.season);
}

function seasonRecapTableRowHtml(team, summaryRow, allGames) {
  const fmtPctFn = coreFn('fmtPct');
  const outcome = seasonRecapOutcome(team, summaryRow, allGames);
  const draftPick = Number.isFinite(+summaryRow.draft_pick) ? `#${summaryRow.draft_pick}` : '\u2014';
  return `
  <tr>
    <td>${esc(summaryRow.season)}</td>
    <td>${esc(draftPick)}</td>
    <td>${summaryRow.wins}-${summaryRow.losses}-${summaryRow.ties || 0}</td>
    <td>${fmtPctFn(summaryRow.wins, summaryRow.losses, summaryRow.ties || 0)}</td>
    <td>${Number.isFinite(+summaryRow.finish) ? summaryRow.finish : '\u2014'}</td>
    <td>${summaryRow.champion ? '\ud83d\udc51 ' : summaryRow.saunders ? '\ud83d\udca9 ' : ''}${esc(outcome)}</td>
  </tr>
`;
}

function seasonRecapTableHtml(team, seasonSummaries, opts = {}) {
  const allTeams = opts.allTeams || '__ALL__';
  const allGames = opts.allGames || [];
  if (team === allTeams) {
    return '<tr><td colspan="6" class="muted">Select a team to see season recap.</td></tr>';
  }
  return seasonRecapRows(team, seasonSummaries, opts)
    .map(r => seasonRecapTableRowHtml(team, r, allGames))
    .join('');
}

function renderSeasonRecap(team, seasonSummaries, opts = {}) {
  const root = docOrDefault(opts.doc);
  if (!root) return;
  const tbody = root.querySelector('#seasonRecapTable tbody');
  if (!tbody) return;
  tbody.innerHTML = seasonRecapTableHtml(team, seasonSummaries, opts);
}

function avgFinishForTeam(team, seasonSummaries) {
  const rows = seasonSummaries.filter(r => r.owner === team && Number.isFinite(+r.finish));
  if (!rows.length) return null;
  return rows.reduce((a, b) => a + (+b.finish), 0) / rows.length;
}

function topHighlightsHtml(team, opts = {}) {
  const vm = buildTopHighlightsViewModel(team, opts);
  const nfmtFn = renderFn('nfmt');

  if (vm.isLeagueView) {
    return `
    <div class="overview-chip">
      <h4>League view</h4>
      <div class="big">Select a team to see Darlings &amp; Saunders</div>
      <div class="sub">Filters still work (e.g., Week 1). See Team Breakdown below.</div>
    </div>`;
  }
  const chip = (title, main, sub = '', extraClass = '') => `
  <div class="overview-chip ${extraClass}">
    <h4>${esc(title)}</h4>
    ${main ? `<div class="big">${esc(main)}</div>` : ''}
    ${sub ? `<div class="sub">${esc(sub)}</div>` : ''}
  </div>
`;

  return [
    ...vm.chips.map(chipTile => chip(
      chipTile.title,
      chipTile.kind === 'notes' ? '' : (chipTile.main || '\u2014'),
      chipTile.sub || '\u2014',
      chipTile.title === 'Darlings' ? 'champs' : chipTile.title === 'Saunders' ? 'sau' : chipTile.title === 'Regular-Season Titles' ? 'regs' : chipTile.title === 'Avg Finish' ? 'avg-finish' : ''
    )),
  ].join('');
}

function renderTopHighlights(team, opts = {}) {
  const root = docOrDefault(opts.doc);
  if (!root) return;
  const grid = root.getElementById('teamOverviewGrid');
  if (!grid) return;
  grid.innerHTML = topHighlightsHtml(team, opts);
}

function seasonSummaryLookup(team, season, seasonSummaries) {
  return seasonSummaries.find(r => r.owner === team && +r.season === +season) || null;
}

function seasonCalloutView(team, opts = {}) {
  const vm = buildSeasonCalloutViewModel(team, opts);
  if (!vm.show) return { html: '', effectKey: vm.effectKey, effectType: vm.effectType, resetEffect: vm.resetEffect };

  return {
    html: `<div class="callout">
    <div>${esc(vm.team)} in <strong>${esc(vm.season)}</strong></div>
    <div>Record: <strong>${esc(vm.record)}</strong> (${esc(vm.pct)})</div>
    <div>Finish: <strong>${esc(vm.finish)}</strong></div>
    <div>Draft Pick: <strong>${esc(vm.draftPick)}</strong></div>
    <div>${esc(vm.bits.join(' \u2022 ') || '\u2014')}</div>
    ${vm.notes.length ? `<div class="muted" style="margin-top:6px;font-size:12px">* ${esc(vm.notes.join(' \u2022 '))}</div>` : ''}
  </div>`,
    effectKey: vm.effectKey,
    effectType: vm.effectType,
    resetEffect: false,
  };
}

function asSet(value) {
  return value instanceof Set ? value : new Set(value || []);
}

function groupMatched(members, selectedOpponents, selfTeam = null) {
  const selOppLower = new Set([...selectedOpponents].map(s => s.toLowerCase()));
  const memExSelf = (selfTeam ? members.filter(m => m !== selfTeam) : members.slice()).map(m => m.toLowerCase());
  if (memExSelf.length === 0) return false;
  return memExSelf.every(m => selOppLower.has(m));
}

function exactSetMatch(members, selectedOpponents, selfTeam = null) {
  const selSet = new Set([...selectedOpponents].map(s => s.toLowerCase()));
  const memExSelf = selfTeam ? members.filter(m => m !== selfTeam) : members.slice();
  const groupSet = new Set(memExSelf.map(m => m.toLowerCase()));
  if (selSet.size !== groupSet.size) return false;
  for (const m of groupSet) {
    if (!selSet.has(m)) return false;
  }
  return true;
}

function isFxEligible(rivalry) {
  const t = (rivalry.type || 'group').toLowerCase();
  return t === 'group' || (t === 'pair' && rivalry.slug && (rivalry.slug === 'nuss-rishi' || rivalry.slug === 'singer-nuss'));
}

function aggregateVsOpps(team, games, members) {
  const sidesForTeamFn = coreFn('sidesForTeam');
  let w = 0, l = 0, t = 0, pf = 0, pa = 0, n = 0;
  const memLower = members.map(m => m.toLowerCase());
  for (const g of games) {
    const s = sidesForTeamFn(g, team);
    if (!s) continue;
    if (!memLower.includes(s.opp.toLowerCase())) continue;
    if (s.result === 'W') w++;
    else if (s.result === 'L') l++;
    else t++;
    pf += s.pf;
    pa += s.pa;
    n++;
  }
  return { w, l, t, n, ppg: n ? pf / n : 0, oppg: n ? pa / n : 0 };
}

function opponentBreakdownRows(team, games, opts = {}) {
  const allTeams = opts.allTeams || '__ALL__';
  const selectedWeeks = asSet(opts.selectedWeeks);
  const universeWeeks = opts.universeWeeks || [];
  const isRestrictiveFn = coreFn('isRestrictive');
  const sidesForTeamFn = coreFn('sidesForTeam');

  if (team === allTeams) {
    const map = new Map();
    const useWeek = isRestrictiveFn(selectedWeeks, universeWeeks);
    for (const g of games) {
      const sides = [
        { team: g.teamA, pf: g.scoreA, pa: g.scoreB, win: g.scoreA > g.scoreB, tie: g.scoreA === g.scoreB },
        { team: g.teamB, pf: g.scoreB, pa: g.scoreA, win: g.scoreB > g.scoreA, tie: g.scoreB === g.scoreA },
      ];
      for (const side of sides) {
        if (useWeek) {
          const w = (g._weekByTeam && g._weekByTeam[side.team]) || null;
          if (!w || !selectedWeeks.has(w)) continue;
        }
        const r = map.get(side.team) || { w: 0, l: 0, t: 0, pf: 0, pa: 0, n: 0 };
        if (side.tie) r.t++;
        else if (side.win) r.w++;
        else r.l++;
        r.pf += side.pf;
        r.pa += side.pa;
        r.n++;
        map.set(side.team, r);
      }
    }
    return [...map.entries()].map(([rowTeam, r]) => ({
      label: rowTeam,
      team: rowTeam,
      ...r,
      pct: (r.w + 0.5 * r.t) / Math.max(1, (r.w + r.l + r.t)),
      ppg: r.n ? (r.pf / r.n) : 0,
      oppg: r.n ? (r.pa / r.n) : 0,
    })).sort((a, b) => b.pct - a.pct || b.w - a.w || a.l - b.l || a.team.localeCompare(b.team));
  }

  const map = new Map();
  for (const g of games) {
    const s = sidesForTeamFn(g, team);
    if (!s) continue;
    const r = map.get(s.opp) || { w: 0, l: 0, t: 0, pf: 0, pa: 0, n: 0 };
    if (s.result === 'W') r.w++;
    else if (s.result === 'L') r.l++;
    else r.t++;
    r.pf += s.pf;
    r.pa += s.pa;
    r.n++;
    map.set(s.opp, r);
  }
  return [...map.entries()].map(([opp, r]) => ({
    label: opp,
    opp,
    ...r,
    pct: (r.w + 0.5 * r.t) / Math.max(1, (r.w + r.l + r.t)),
    ppg: r.n ? (r.pf / r.n) : 0,
    oppg: r.n ? (r.pa / r.n) : 0,
  })).sort((a, b) => b.pct - a.pct || b.w - a.w || a.l - b.l || a.opp.localeCompare(b.opp));
}

function opponentBreakdownTableHtml(team, games, opts = {}) {
  const fmtPctFn = coreFn('fmtPct');
  const nfmtFn = renderFn('nfmt');
  return opponentBreakdownRows(team, games, opts).map(r => `
    <tr>
      <td>${esc(r.label)}</td>
      <td>${r.w}-${r.l}-${r.t}</td>
      <td>${fmtPctFn(r.w, r.l, r.t)}</td>
      <td>${nfmtFn(r?.ppg, 2)}</td>
      <td>${r.oppg.toFixed(2)}</td>
      <td>${r.n}</td>
    </tr>
  `).join('');
}

function opponentBreakdownView(team, games, opts = {}) {
  const allTeams = opts.allTeams || '__ALL__';
  const rivalries = Array.isArray(opts.rivalries) ? opts.rivalries : [];
  const selectedOpponents = asSet(opts.selectedOpponents);
  const universeOpponents = opts.universeOpponents || [];
  const isRestrictiveFn = coreFn('isRestrictive');
  const fmtPctFn = coreFn('fmtPct');
  const oppRestrictive = isRestrictiveFn(selectedOpponents, universeOpponents);

  const view = {
    title: team === allTeams ? 'Team Breakdown' : 'Opponent Breakdown',
    firstCol: team === allTeams ? 'Team' : 'Opponent',
    tableHtml: opponentBreakdownTableHtml(team, games, opts),
    calloutsHtml: '',
    shouldUpdateBackdrop: false,
    backdropSlug: null,
    triggerSlug: null,
  };

  if (!rivalries.length) return view;
  view.shouldUpdateBackdrop = true;

  if (team === allTeams) {
    const statGroups = rivalries.filter(r => (r.type || 'group').toLowerCase() === 'group' && groupMatched(r.members, selectedOpponents, null));
    if (statGroups.length) {
      view.calloutsHtml = statGroups.map(r => `
        <div class="callout">
          <div>\ud83d\udc40 <strong>${esc(r.name)}</strong></div>
        </div>
      `).join('');
    }
    if (oppRestrictive) {
      const exact = rivalries.filter(r => isFxEligible(r) && exactSetMatch(r.members, selectedOpponents, null));
      if (exact.length) {
        exact.sort((a, b) => b.members.length - a.members.length);
        const top = exact[0];
        if (top.slug) {
          view.backdropSlug = top.slug;
          view.triggerSlug = top.slug;
        }
      }
    }
    return view;
  }

  const active = [];
  const groups = rivalries.filter(r => (r.type || 'group').toLowerCase() === 'group');
  for (const grp of groups) {
    if (oppRestrictive && groupMatched(grp.members, selectedOpponents, team)) {
      const vsMembers = grp.members.filter(m => m !== team);
      const s = aggregateVsOpps(team, games, vsMembers);
      active.push(`
        <div class="callout">
          <div>\ud83c\udff7\ufe0f <strong>${esc(grp.name)}</strong> \u2014 ${s.w}-${s.l}-${s.t} (${fmtPctFn(s.w, s.l, s.t)})</div>
          <div class="muted" style="margin-top:4px;font-size:12px">
            Members: ${esc(vsMembers.join(', '))} \u2022 PPG: ${s.ppg.toFixed(2)} \u2022 OPPG: ${s.oppg.toFixed(2)}
            <span> \u2022 (within current filters)</span>
          </div>
        </div>
      `);
    }
  }
  view.calloutsHtml = active.join('');

  const exact = rivalries
    .filter(r => isFxEligible(r))
    .filter(r => oppRestrictive && exactSetMatch(r.members, selectedOpponents, team));
  if (exact.length) {
    exact.sort((a, b) => b.members.length - a.members.length);
    const top = exact[0];
    if (top.slug) {
      view.backdropSlug = top.slug;
      view.triggerSlug = top.slug;
    }
  }

  return view;
}
export {
  buildTopHighlightsViewModel,
  buildSeasonCalloutViewModel,
  historyGamesTableRowHtml,
  historyGamePerspectiveRowHtml,
  historyGamesTableHtml,
  renderGamesTable,
  weekByWeekRows,
  weekByWeekTableRowHtml,
  weekByWeekTableHtml,
  renderWeekByWeek,
  seasonOutcomeNarrative,
  seasonRecapOutcome,
  seasonRecapRows,
  seasonRecapTableRowHtml,
  seasonRecapTableHtml,
  renderSeasonRecap,
  avgFinishForTeam,
  topHighlightsHtml,
  renderTopHighlights,
  seasonSummaryLookup,
  seasonCalloutView,
  groupMatched,
  exactSetMatch,
  isFxEligible,
  aggregateVsOpps,
  opponentBreakdownRows,
  opponentBreakdownTableHtml,
  opponentBreakdownView
};
