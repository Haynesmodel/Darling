(function (global) {
  function coreFn(name) {
    const fn = global[name];
    if (typeof fn !== 'function') {
      throw new Error(`history-renderers.js requires core-helpers.js before it (${name})`);
    }
    return fn;
  }

  function docOrDefault(doc) {
    return doc || (typeof document !== 'undefined' ? document : null);
  }

  function renderFn(name) {
    const fn = global[name];
    if (typeof fn !== 'function') {
      throw new Error(`history-renderers.js requires render-helpers.js before it (${name})`);
    }
    return fn;
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
      <td>${game.date}</td>
      <td>${s.opp}</td>
      <td>${s.result}</td>
      <td>${s.pf.toFixed(2)} - ${s.pa.toFixed(2)}</td>
      <td>${type}</td>
      <td>${normRoundFn(game.round)}</td>
      <td>${game.season}</td>
    </tr>`;
  }

  function historyGamesTableHtml(team, games, opts = {}) {
    const allTeams = opts.allTeams || '__ALL__';
    const byDateDescFn = coreFn('byDateDesc');
    if (team === allTeams) {
      return '<tr><td colspan="7" class="muted">Select a team to see full game list.</td></tr>';
    }
    return games
      .slice()
      .sort(byDateDescFn)
      .map(g => historyGamesTableRowHtml(g, team))
      .filter(Boolean)
      .join('');
  }

  function renderGamesTable(team, games, opts = {}) {
    const root = docOrDefault(opts.doc);
    if (!root) return;
    const tbody = root.querySelector('#historyGamesTable tbody');
    if (!tbody) return;
    tbody.innerHTML = historyGamesTableHtml(team, games, opts);
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
      <td>${row.season}</td>
      <td>${row.week || ''}</td>
      <td>${row.date}</td>
      <td>${row.opp}</td>
      <td>${row.result}</td>
      <td class="score-cell">${nfmtFn(row?.pf, 2)} - ${row.pa.toFixed(2)} ${badges}</td>
      <td>${(row.xw === null || row.xw === undefined) ? '\u2014' : row.xw.toFixed(2)}</td>
      <td>${row.type}</td>
      <td>${row.round || ''}</td>
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
    return `
    <tr>
      <td>${summaryRow.season}</td>
      <td>${summaryRow.wins}-${summaryRow.losses}-${summaryRow.ties || 0}</td>
      <td>${fmtPctFn(summaryRow.wins, summaryRow.losses, summaryRow.ties || 0)}</td>
      <td>${Number.isFinite(+summaryRow.finish) ? summaryRow.finish : '\u2014'}</td>
      <td>${summaryRow.champion ? '\ud83d\udc51 ' : summaryRow.saunders ? '\ud83d\udca9 ' : ''}${outcome}</td>
    </tr>
  `;
  }

  function seasonRecapTableHtml(team, seasonSummaries, opts = {}) {
    const allTeams = opts.allTeams || '__ALL__';
    const allGames = opts.allGames || [];
    if (team === allTeams) {
      return '<tr><td colspan="5" class="muted">Select a team to see season recap.</td></tr>';
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

  const api = {
    historyGamesTableRowHtml,
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
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  Object.assign(global, api);
})(typeof globalThis !== 'undefined' ? globalThis : window);
