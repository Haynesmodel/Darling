import { byDateDesc, sidesForTeam } from './core-helpers.js';
import { escapeHtml, nfmt } from './render-helpers.js';
import {
  buildCurrentMatchupRows,
  buildTeamCurrentSeasonSnapshot,
  currentSeasonSourceGames,
  isCompletedGame,
  latestCompletedWeek,
  latestLeagueSeason,
  seasonSourceSnapshot,
} from './current-season-data.js';
import {
  buildCommandCenterModel,
  matchupKey,
} from './current-season-command-data.js';
function docOrDefault(doc) {
  return doc || (typeof document !== 'undefined' ? document : null);
}

function fmtPct(value) {
  return Number.isFinite(Number(value)) ? `${(Number(value) * 100).toFixed(1)}%` : '0.0%';
}

function fmtOdds(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  if (number > 0 && number < 0.01) return '<1%';
  if (number < 1 && number > 0.99) return '>99%';
  return `${Math.round(number * 100)}%`;
}

function formatRecord(row) {
  if (!row) return '0-0';
  return row.record || (row.ties ? `${row.wins}-${row.losses}-${row.ties}` : `${row.wins}-${row.losses}`);
}

function scoreline(a, b) {
  return `${scoreFmt(a)} - ${scoreFmt(b)}`;
}

function scoreFmt(value) {
  return value === null || value === undefined || value === '' ? '-' : nfmt(value, 2);
}

function signedSeedChange(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n === 0) return 'No change';
  return n > 0 ? `Up ${n}` : `Down ${Math.abs(n)}`;
}

function gapText(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '-';
  if (n === 0) return 'At line';
  if (n < 0) return `${nfmt(Math.abs(n), 1)} lead`;
  return `${nfmt(n, 1)} back`;
}

function statusClass(status) {
  const tone = status?.tone || 'neutral';
  return `current-status-badge current-status-${tone}`;
}

function yesNo(value) {
  return value ? 'yes' : 'no';
}

function methodologyNoteHtml(command) {
  const meta = command?.methodology;
  if (!meta) return '';
  const generated = meta.generatedAt ? formattedGeneratedAt(meta.generatedAt) : 'Unavailable';
  const source = `${meta.sourceMode || 'unknown'}${meta.updateMode ? `/${meta.updateMode}` : ''}`;
  return `
    <div class="current-methodology-note">
      <strong>Method:</strong> ${escapeHtml(meta.modelType || command.modelLabel || 'Deterministic path model')}
      &middot; Generated ${escapeHtml(generated)}
      &middot; Source ${escapeHtml(source)}
      &middot; Live scores ${escapeHtml(yesNo(meta.containsLiveScores))}
      &middot; Projected scores ${escapeHtml(yesNo(meta.containsProjectedScores))}
      ${meta.cutoffDate ? `&middot; Cutoff ${escapeHtml(meta.cutoffDate)}` : ''}
    </div>
  `;
}

function selectedViewAllows(view, section) {
  const mode = view.commandCenter?.selectedView || 'command';
  if (mode === 'schedule') return section === 'schedule';
  const phase = view.presentation?.phase || 'regular-season';
  if (mode === 'recap') return section === 'recap';
  if (section === 'recap') return false;
  if (mode === 'command') {
    if (phase === 'regular-season') return true;
    if (phase === 'postseason') return ['matchups', 'playoff', 'standings'].includes(section);
    if (phase === 'preseason') return section === 'matchups';
    return ['matchups', 'standings', 'snapshots'].includes(section);
  }
  if (mode === 'matchups') return section === 'matchups';
  if (mode === 'standings') {
    return phase === 'regular-season'
      ? ['playoff', 'movement', 'projection', 'standings'].includes(section)
      : ['playoff', 'standings'].includes(section);
  }
  if (mode === 'owners') return ['needs', 'snapshots'].includes(section);
  return false;
}

function recordText(row) { return `${row?.W || 0}-${row?.L || 0}${row?.T ? `-${row.T}` : ''}`; }
function recordAccessible(row) { return `${row?.W || 0} wins, ${row?.L || 0} losses, ${row?.T || 0} ties`; }

function renderScheduleComparison(model, { season, week, owner, donor } = {}) {
  const label = team => model.names[team] || team;
  const weeks = model.weeks;
  const selected = model.teams.includes(owner) ? owner : '';
  const selectedDonor = model.teams.includes(donor) ? donor : selected;
  const columnWins = model.teams.map(schedule => model.teams.reduce((sum, team) => sum + model.matrix[team][schedule].W, 0));
  const easiest = Math.max(...columnWins);
  const hardest = Math.min(...columnWins);
  const headerMark = (index) => easiest === hardest ? '' : columnWins[index] === easiest
    ? '<span aria-hidden="true">🧁</span><span class="visually-hidden">Easiest borrowed schedule by total wins across scoring owners</span>'
    : columnWins[index] === hardest
      ? '<span aria-hidden="true">💀</span><span class="visually-hidden">Hardest borrowed schedule by total wins across scoring owners</span>'
      : '';
  const rowCells = model.teams.map(team => `<tr><th scope="row">${escapeHtml(label(team))}</th>${model.teams.map(schedule => {
    const record = model.matrix[team][schedule];
    const actual = model.matrix[team][team];
    const delta = record.W + record.T / 2 - (actual.W + actual.T / 2);
    const impact = team === schedule ? 'actual' : delta > 0 ? 'improved' : delta < 0 ? 'regressed' : 'same';
    const level = Math.abs(delta) >= 2 ? 'strong' : 'subtle';
    const amount = Number.isInteger(Math.abs(delta)) ? Math.abs(delta) : Math.abs(delta).toFixed(1);
    const relative = impact === 'actual' ? 'Actual schedule.' : impact === 'same' ? 'Same as actual schedule.'
      : `${impact === 'improved' ? 'Better' : 'Worse'} than actual by ${amount} win-equivalent${Math.abs(delta) === 1 ? '' : 's'}.`;
    return `<td><button type="button" data-schedule-team="${escapeHtml(team)}" data-schedule-donor="${escapeHtml(schedule)}" data-schedule-impact="${impact}" data-schedule-level="${level}" aria-pressed="${team === selected && schedule === selectedDonor}" aria-label="${escapeHtml(label(team))} under ${escapeHtml(label(schedule))}'s schedule: ${recordAccessible(record)}. ${relative}">${recordText(record)}</button></td>`;
  }).join('')}</tr>`).join('');
  const allPlayRows = model.teams.map(team => `<tr><th scope="row">${escapeHtml(label(team))}</th>${weeks.map(n => {
    const tally = model.allPlay[team].weeks[n];
    return `<td><button type="button" data-schedule-team="${escapeHtml(team)}" data-schedule-week="${n}" aria-label="${escapeHtml(label(team))}, Week ${n} all-play: ${recordAccessible(tally)}">${recordText(tally)}</button></td>`;
  }).join('')}<td><button type="button" data-schedule-team="${escapeHtml(team)}" data-schedule-total="1" aria-label="${escapeHtml(label(team))} all-play total: ${recordAccessible(model.allPlay[team].total)}">${recordText(model.allPlay[team].total)}</button></td></tr>`).join('');
  const detail = model.details;
  const buckets = (rows, empty) => rows.length ? rows.map(row => `${escapeHtml(label(row.owner))} (${scoreFmt(row.score)})`).join(', ') : empty;
  const detailView = !selected
    ? '<p>Select a team or matrix cell to view its schedule detail.</p>'
    : weeks.length
      ? `<h3 id="currentScheduleDetailHeading" tabindex="-1">${escapeHtml(label(selected))} schedule detail · borrowing ${escapeHtml(label(donor && model.teams.includes(donor) ? donor : selected))}'s schedule</h3><p class="muted">Actual record ${recordText(model.matrix[selected][selected])} · borrowed schedule record ${recordText(model.counterfactual)}</p>${detail.map(row => `<article class="current-schedule-week" id="currentScheduleWeek${row.week}"><h4 tabindex="-1">Week ${row.week}</h4><div class="current-schedule-detail-grid"><p><strong>Actual matchup</strong><br>${escapeHtml(label(selected))} ${scoreFmt(row.score)} vs ${escapeHtml(label(row.opponent))} ${scoreFmt(row.opponentScore)} · ${row.result}</p><p><strong>Borrowed schedule</strong><br>Original opponent: ${escapeHtml(label(row.donorOpponent))}<br>Alternative: ${escapeHtml(label(row.alternativeOpponent))} ${scoreFmt(row.alternativeScore)} · ${row.alternativeResult}${row.collision ? '<br>T-D collision: donor substituted as opponent.' : ''}</p><p class="current-schedule-all-play-detail"><strong>All-play ${recordText(row.allPlay)}</strong><br>Beat: ${buckets(row.beaten, 'none')}<br>Tied: ${buckets(row.tied, 'none')}<br>Lost to: ${buckets(row.lostTo, 'none')}</p></div></article>`).join('')}`
      : `<p>No complete final regular-season weeks through Week ${escapeHtml(week)}.</p>`;
  return `<p class="current-schedule-legend"><span><strong>Diagonal:</strong> actual schedule</span><span><strong>Green:</strong> better than actual</span><span><strong>Red:</strong> worse than actual</span><span>Gray: same record</span><span>Stronger tint: larger difference</span><span>W-L-T; ties count as half a win</span><span>🧁 Easiest (most total wins); 💀 Hardest (fewest total wins)</span></p>
    <div class="current-schedule-scroll" role="region" aria-label="Schedule matrix: rows are scoring owners; columns are teams whose schedules they borrow" tabindex="0"><table class="current-schedule-matrix"><caption>Scoring owner ↓ · borrowed schedule → (W-L-T)</caption><thead><tr><th scope="col">Scoring owner</th>${model.teams.map((team, index) => `<th scope="col" title="Borrowed schedule: ${escapeHtml(label(team))}">${escapeHtml(label(team))} ${headerMark(index)}</th>`).join('')}</tr></thead><tbody>${rowCells}</tbody></table></div>
    <div class="current-schedule-scroll" role="region" aria-label="All-play weekly records" tabindex="0"><table class="current-schedule-all-play"><caption>All-play records by scoring owner and week (W-L-T)</caption><thead><tr><th scope="col">Scoring owner</th>${weeks.map(n => `<th scope="col">Week ${n}</th>`).join('')}<th scope="col">Total</th></tr></thead><tbody>${allPlayRows}</tbody></table></div>
    ${model.excluded.length ? `<p class="current-schedule-excluded">Excluded weeks: ${model.excluded.map(row => `Week ${escapeHtml(row.week)} — ${escapeHtml(row.reason)}`).join('; ')}</p>` : ''}
    ${detailView}`;
}

function renderCurrentSchedule(model, options = {}) {
  const root = docOrDefault(options.doc);
  const target = root?.getElementById('currentScheduleRoot');
  if (!target) return;
  if (!model) { target.innerHTML = ''; return; }
  target.innerHTML = renderScheduleComparison(model, options);
}

function setSectionHtml(el, html) {
  if (!el) return;
  const content = String(html || '');
  el.innerHTML = content;
  el.hidden = content.trim() === '';
}

function formattedGeneratedAt(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
    timeZoneName: 'short',
  }).format(date);
}

function weekTypeLabel(type) {
  const normalized = String(type || '').trim().toLowerCase();
  if (normalized === 'playoff') return 'Playoff';
  if (normalized === 'saunders') return 'Saunders';
  return 'Week';
}

function rowWeekLabel(row) {
  const prefix = weekTypeLabel(row?.type);
  return `${prefix} Week ${row?.week || '-'}`;
}

function viewWeekLabel(view) {
  const types = new Set((view.matchups || [])
    .map(row => String(row.type || '').trim())
    .filter(Boolean));
  if (types.size === 1) {
    const type = [...types][0];
    const prefix = weekTypeLabel(type);
    return prefix === 'Week' ? `Week ${view.week || '-'}` : `${prefix} Week ${view.week || '-'}`;
  }
  if (types.has('Playoff') || types.has('Saunders')) {
    return `Postseason Week ${view.week || '-'}`;
  }
  return `Week ${view.week || '-'}`;
}

function matchupWinner(row) {
  if (!row.completed) {
    return String(row.status || '').trim().toLowerCase() === 'live' ? 'In progress' : 'Pending';
  }
  if (row.resultA === 'W') return row.teamA;
  if (row.resultB === 'W') return row.teamB;
  return 'Tie';
}

function resultClass(result) {
  if (result === 'W') return 'result-win';
  if (result === 'L') return 'result-loss';
  if (result === 'T') return 'result-tie';
  return '';
}

function highestScore(games) {
  const rows = games.flatMap(game => [
    { owner: game.teamA, score: Number(game.scoreA), game },
    { owner: game.teamB, score: Number(game.scoreB), game },
  ]).filter(row => Number.isFinite(row.score));
  return rows.sort((a, b) => b.score - a.score || byDateDesc(a.game, b.game))[0] || null;
}

function closestGame(games) {
  return games
    .map(game => ({ game, margin: Math.abs(Number(game.scoreA) - Number(game.scoreB)) }))
    .filter(row => Number.isFinite(row.margin))
    .sort((a, b) => a.margin - b.margin || byDateDesc(a.game, b.game))[0] || null;
}

function buildCurrentSeasonViewModel({
  leagueGames = [],
  seasonSummaries = [],
  currentSeason = null,
  season = latestLeagueSeason(leagueGames, seasonSummaries, currentSeason),
  week = latestCompletedWeek(leagueGames, season, currentSeason),
  selectedOwner = '',
  selectedView = 'command',
  projectionMode = 'ifScoresHold',
} = {}) {
  const selectedSeason = Number.isFinite(Number(season)) ? Number(season) : latestLeagueSeason(leagueGames, seasonSummaries, currentSeason);
  const selectedWeek = Number.isFinite(Number(week)) ? Number(week) : latestCompletedWeek(leagueGames, selectedSeason, currentSeason);
  const sourceSnapshot = seasonSourceSnapshot({
    leagueGames,
    currentSeason,
    season: selectedSeason,
    week: selectedWeek,
  });
  const snapshotLeagueGames = sourceSnapshot.leagueGames;
  const snapshotCurrentSeason = sourceSnapshot.currentSeason;
  const seasonGames = currentSeasonSourceGames(snapshotLeagueGames, selectedSeason, snapshotCurrentSeason);
  const regularGames = seasonGames.filter(game => String(game.type || '').trim() === 'Regular');
  const completedRegularGames = regularGames.filter(isCompletedGame);
  const matchups = buildCurrentMatchupRows({
    leagueGames: snapshotLeagueGames,
    seasonSummaries,
    currentSeason: snapshotCurrentSeason,
    season: selectedSeason,
    week: selectedWeek,
  });
  const commandCenter = buildCommandCenterModel({
    leagueGames: snapshotLeagueGames,
    seasonSummaries,
    currentSeason: snapshotCurrentSeason,
    season: selectedSeason,
    week: selectedWeek,
    selectedOwner,
    selectedView,
    projectionMode,
  });
  const standings = commandCenter.playoffPicture.map(row => ({
    owner: row.owner,
    season: row.season,
    games: row.games,
    wins: row.wins,
    losses: row.losses,
    ties: row.ties,
    pointsFor: row.pointsFor,
    pointsAgainst: row.pointsAgainst,
    differential: row.differential,
    pct: row.pct,
    streak: row.streak,
    record: row.record,
    rank: row.currentSeed,
  }));
  const teams = standings.map(row => row.owner);
  const standingsByOwner = new Map(standings.map(row => [row.owner, row]));
  const snapshots = teams.map(owner => buildTeamCurrentSeasonSnapshot({
    owner,
    leagueGames: snapshotLeagueGames,
    seasonSummaries,
    currentSeason: snapshotCurrentSeason,
    season: selectedSeason,
  })).map(snapshot => ({
    ...snapshot,
    standing: standingsByOwner.get(snapshot.owner) || snapshot.standing,
  }));

  return {
    season: selectedSeason,
    week: selectedWeek,
    seasonGames,
    regularGames,
    standings,
    matchups,
    snapshots,
    source: currentSeason && Number(currentSeason.season) === Number(selectedSeason) ? 'sleeper' : 'history',
    generatedAt: currentSeason && Number(currentSeason.season) === Number(selectedSeason) ? currentSeason.generated_at || null : null,
    commandCenter,
    summary: {
      teamCount: teams.length,
      gameCount: regularGames.length,
      completedGameCount: completedRegularGames.length,
      highestScore: highestScore(completedRegularGames),
      closestGame: closestGame(completedRegularGames),
    },
  };
}

function attachCurrentSeasonOdds(view, odds) {
  if (!view?.commandCenter || !odds) return view;
  const oddsByOwner = new Map((odds.rows || []).map(row => [row.owner, row]));
  view.commandCenter.odds = odds;
  view.commandCenter.playoffPicture = view.commandCenter.playoffPicture.map(row => ({
    ...row,
    odds: oddsByOwner.get(row.owner) || null,
  }));
  return view;
}

function currentSeasonHeroHtml(view) {
  const high = view.summary.highestScore;
  const close = view.summary.closestGame;
  const closeGame = close?.game;
  const generatedAt = formattedGeneratedAt(view.generatedAt);
  const weekLabel = viewWeekLabel(view);
  const command = view.commandCenter;
  const commandHigh = command?.summary?.highestLiveScore;
  const commandClose = command?.summary?.closestLiveMatchup;
  const biggestMover = command?.summary?.biggestMover;
  const selectedNeed = command?.selectedOwner
    ? command.ownerNeeds.find(row => row.owner === command.selectedOwner)
    : null;
  const phase = view.presentation?.phase || 'regular-season';
  const recap = view.recap;
  if (command?.selectedView === 'recap') {
    const phaseCopy = {
      preseason: 'The schedule is available; competition has not started.',
      finalizing: 'Final games are available; authoritative honors are pending.',
      offseason: 'The finalized season, trophy winners, and final table.',
      'historical-fallback': 'A historical snapshot without live-data claims.',
      'regular-season': 'A snapshot of the active season.',
      postseason: 'The postseason trophy paths.',
    };
    return `
      <div class="current-hero-inner current-recap-hero">
        <div>
          <div class="card-kicker">Current Season &middot; ${escapeHtml(phase.replace('-', ' '))}</div>
          <h3>${escapeHtml(view.season || 'Season')} ${phase === 'offseason' ? 'Year in Review' : phase === 'preseason' ? 'Preview' : 'Recap'}</h3>
          <p>${escapeHtml(phaseCopy[phase] || phaseCopy['historical-fallback'])}</p>
          <p class="muted">${view.presentation?.source === 'historical' ? 'Source: validated history' : `Source: validated CurrentSeason${generatedAt ? ` · Updated ${escapeHtml(generatedAt)}` : ''}`}</p>
        </div>
        <div class="current-hero-stats">
          <div class="stat"><div class="label">Champion</div><div class="value">${escapeHtml(recap?.champion || 'Pending')}</div></div>
          <div class="stat"><div class="label">Saunders</div><div class="value">${escapeHtml(recap?.saunders || 'Pending')}</div></div>
          <div class="stat"><div class="label">Final Table</div><div class="value">${escapeHtml(recap?.finalStandings?.length || 0)}</div><div class="sub">owners</div></div>
        </div>
      </div>
    `;
  }
  if (command?.selectedView === 'schedule') {
    const completed = command?.summary?.completedGameCount ?? view.summary.completedGameCount;
    const source = view.presentation?.source === 'historical'
      ? 'Source: validated historical snapshot'
      : `Source: ${phase === 'regular-season' ? 'Sleeper snapshot' : 'validated CurrentSeason snapshot'}${generatedAt ? ` · Updated ${escapeHtml(generatedAt)}` : ''}`;
    return `<div class="current-hero-inner current-schedule-hero"><div><div class="card-kicker">Current Season · Schedule</div><h3>${escapeHtml(view.season || 'Season')} Schedule Comparison</h3><p class="muted">Through ${escapeHtml(weekLabel)} · ${escapeHtml(completed)} completed regular-season games</p><p class="muted">${source}</p></div></div>`;
  }
  const historicalAnalysis = phase !== 'regular-season';
  return `
    <div class="current-hero-inner">
      <div>
        <div class="card-kicker">Current Season</div>
        <h3>${escapeHtml(view.season || 'Season')}</h3>
        <p class="muted">${escapeHtml(weekLabel)} ${historicalAnalysis ? 'historical/final analysis' : 'command center'} from ${escapeHtml(command?.summary?.completedGameCount ?? view.summary.completedGameCount)} completed regular-season games.</p>
        ${view.presentation?.source === 'historical' ? '<p class="muted">Source: validated historical snapshot</p>' : `<p class="muted">Source: ${phase === 'regular-season' ? 'Sleeper snapshot' : 'validated CurrentSeason snapshot'}${generatedAt ? ` &middot; Last updated ${escapeHtml(generatedAt)}` : ''}</p>`}
        ${command && phase === 'regular-season' ? `<p class="muted">Model: ${escapeHtml(command.modelLabel)} &middot; ${escapeHtml(command.rules.playoff_slots)} playoff spots, ${escapeHtml(command.rules.bye_slots)} byes</p>` : ''}
        ${selectedNeed ? `<p class="current-owner-focus-note"><strong>${escapeHtml(selectedNeed.owner)}:</strong> ${escapeHtml(selectedNeed.mainNeed)}</p>` : ''}
      </div>
      <div class="current-hero-stats">
        <div class="stat">
          <div class="label">Alive</div>
          <div class="value">${escapeHtml(command?.summary?.aliveCount ?? view.summary.teamCount)}</div>
          <div class="sub">${escapeHtml(command?.summary?.clinchedCount ?? 0)} clinched &middot; ${escapeHtml(command?.summary?.eliminatedCount ?? 0)} eliminated</div>
        </div>
        <div class="stat">
          <div class="label">High Score</div>
          <div class="value">${commandHigh ? `${escapeHtml(commandHigh.owner)} ${nfmt(commandHigh.score, 2)}` : high ? `${escapeHtml(high.owner)} ${nfmt(high.score, 2)}` : '-'}</div>
          ${commandHigh ? `<div class="sub">${escapeHtml(commandHigh.game.teamA)} vs ${escapeHtml(commandHigh.game.teamB)}</div>` : high ? `<div class="sub">${escapeHtml(high.game.date)}</div>` : ''}
        </div>
        <div class="stat">
          <div class="label">${biggestMover ? 'Biggest Mover' : 'Closest Game'}</div>
          <div class="value">${biggestMover ? `${escapeHtml(biggestMover.owner)} ${escapeHtml(signedSeedChange(biggestMover.seedChange))}` : commandClose ? nfmt(commandClose.margin, 2) : close ? nfmt(close.margin, 2) : '-'}</div>
          ${biggestMover ? `<div class="sub">Projected seed ${escapeHtml(biggestMover.projectedSeed)}</div>` : commandClose ? `<div class="sub">${escapeHtml(commandClose.game.teamA)} vs ${escapeHtml(commandClose.game.teamB)}</div>` : closeGame ? `<div class="sub">${escapeHtml(closeGame.teamA)} vs ${escapeHtml(closeGame.teamB)}</div>` : ''}
        </div>
      </div>
    </div>
  `;
}

function currentRecapHtml(view) {
  if (!selectedViewAllows(view, 'recap')) return '';
  const phase = view.presentation?.phase || 'historical-fallback';
  const recap = view.recap;
  const context = phase === 'preseason' ? view.contextRecap : recap;
  const rows = recap?.finalStandings || [];
  const scheduled = (view.matchups || []).filter(row => !row.completed);
  const pointsLeader = rows.reduce((best, row) => !best || row.pointsFor > best.pointsFor ? row : best, null);

  const honors = recap?.complete ? `
    <div class="current-recap-honors">
      <article><div class="label">Champion</div><strong>${escapeHtml(recap.champion)}</strong></article>
      <article><div class="label">Runner-up</div><strong>${escapeHtml(recap.runnerUp || 'Not available')}</strong></article>
      <article><div class="label">Saunders Bowl</div><strong>${escapeHtml(recap.saunders)}</strong></article>
    </div>
  ` : phase === 'preseason' && context?.complete ? `
    <div class="current-recap-honors">
      <article><div class="label">Defending champion</div><strong>${escapeHtml(context.champion)}</strong></article>
      <article><div class="label">Latest Saunders winner</div><strong>${escapeHtml(context.saunders)}</strong></article>
    </div>
  ` : `
    <div class="current-recap-pending">
      <strong>Authoritative honors pending</strong>
      <p>Champion and Saunders claims wait for one validated winner of each honor.</p>
    </div>
  `;

  const schedule = phase === 'preseason' ? `
    <div class="current-recap-block">
      <h3>Available Schedule</h3>
      ${scheduled.length ? `<div class="current-recap-schedule">${scheduled.map(row => `
        <article>
          <strong>${escapeHtml(row.teamA)} vs ${escapeHtml(row.teamB)}</strong>
          <span>${escapeHtml(row.date)} &middot; ${escapeHtml(rowWeekLabel(row))}</span>
        </article>
      `).join('')}</div>` : '<p class="muted">No scheduled matchups are available yet.</p>'}
    </div>
  ` : '';

  const standings = rows.length ? `
    <div class="current-recap-block">
      <h3>Final Standings</h3>
      <div class="table-scroll">
        <table>
          <thead><tr><th scope="col">Finish</th><th scope="col">Owner</th><th scope="col">Record</th><th scope="col">Points</th></tr></thead>
          <tbody>${rows.map(row => `<tr><td>${escapeHtml(row.finish)}</td><th scope="row">${escapeHtml(row.owner)}</th><td>${escapeHtml(row.record)}</td><td>${nfmt(row.pointsFor, 2)}</td></tr>`).join('')}</tbody>
        </table>
      </div>
    </div>
  ` : '';

  return `
    <div class="section-heading current-section-heading">
      <h3>${phase === 'preseason' ? 'Season Preview' : phase === 'finalizing' ? 'Recap Pending' : 'Year in Review'}</h3>
      <span class="current-phase-badge">${escapeHtml(phase.replace('-', ' '))}</span>
    </div>
    ${honors}
    ${recap?.championshipResult ? `<p><strong>Championship:</strong> ${escapeHtml(recap.championshipResult)}</p>` : ''}
    ${pointsLeader ? `<p><strong>Points leader:</strong> ${escapeHtml(pointsLeader.owner)} · ${nfmt(pointsLeader.pointsFor, 2)}</p>` : ''}
    ${schedule}
    ${standings}
  `;
}

function currentMatchupCardHtml(row, view = {}) {
  const allTime = row.allTimeContext?.allTime;
  const current = row.currentSeasonContext?.selected;
  const last = row.lastMeeting;
  const winner = matchupWinner(row);
  const status = String(row.status || '').trim();
  const impact = (view.presentation?.phase || 'regular-season') === 'regular-season'
    ? view.commandCenter?.matchupImpacts?.get(matchupKey(row))
    : null;
  return `
    <article class="current-matchup-card">
      <div class="current-matchup-top">
        <div>
          <div class="card-kicker">${escapeHtml(rowWeekLabel(row))} &middot; ${escapeHtml(row.date)}${status ? ` &middot; ${escapeHtml(status)}` : ''}</div>
          <h3>${escapeHtml(row.teamA)} vs ${escapeHtml(row.teamB)}</h3>
        </div>
        <div class="current-matchup-actions">
          <a class="btn" href="${escapeHtml(row.rivalryUrl)}">Head to Head</a>
          <div
            class="share-card-action-host"
            data-share-team-a="${escapeHtml(row.teamA)}"
            data-share-team-b="${escapeHtml(row.teamB)}"
          ></div>
        </div>
      </div>
      <div class="current-scoreline">
        <span class="${resultClass(row.resultA)}">${escapeHtml(row.teamA)} ${scoreFmt(row.scoreA)}</span>
        <span class="${resultClass(row.resultB)}">${escapeHtml(row.teamB)} ${scoreFmt(row.scoreB)}</span>
      </div>
      <div class="current-context-grid">
        ${impact ? `
        <div>
          <div class="label">Swing</div>
          <div class="value">${escapeHtml(impact.label)}</div>
          <div class="sub">${impact.leader ? `If held: ${escapeHtml(impact.leader)}` : 'Pre-game path'}</div>
        </div>
        <div>
          <div class="label">Seeds</div>
          <div class="value">${escapeHtml(row.teamA)} ${escapeHtml(impact.teamASeed || '-')} / ${escapeHtml(row.teamB)} ${escapeHtml(impact.teamBSeed || '-')}</div>
          <div class="sub">If held: ${escapeHtml(impact.teamAProjectedSeed || '-')} / ${escapeHtml(impact.teamBProjectedSeed || '-')}</div>
        </div>
        ` : ''}
        <div>
          <div class="label">Winner</div>
          <div class="value">${escapeHtml(winner)}</div>
        </div>
        <div>
          <div class="label">Current Records</div>
          <div class="value">${escapeHtml(formatRecord(row.standingA))} / ${escapeHtml(formatRecord(row.standingB))}</div>
        </div>
        <div>
          <div class="label">All-Time H2H</div>
          <div class="value">${escapeHtml(allTime?.recordA || '0-0')}</div>
          <div class="sub">${escapeHtml(row.teamA)} perspective &middot; ${escapeHtml(allTime?.games || 0)} games</div>
        </div>
        <div>
          <div class="label">This Season H2H</div>
          <div class="value">${escapeHtml(current?.recordA || '0-0')}</div>
          <div class="sub">${escapeHtml(current?.games || 0)} games</div>
        </div>
      </div>
      <div class="current-matchup-note">
        ${last ? `Last meeting: ${escapeHtml(last.date)} &middot; ${escapeHtml(last.teamA)} ${scoreFmt(last.scoreA)} - ${escapeHtml(last.teamB)} ${scoreFmt(last.scoreB)}` : 'No prior meeting.'}
        ${row.playoffMeetings ? ` &middot; ${escapeHtml(row.playoffMeetings)} playoff meeting${row.playoffMeetings === 1 ? '' : 's'}` : ''}
      </div>
    </article>
  `;
}

function currentMatchupsHtml(view) {
  if (!selectedViewAllows(view, 'matchups')) return '';
  if (!view.matchups.length) {
    return '<div class="card"><h3>This Week</h3><p class="muted">No current-season matchups found for this week.</p></div>';
  }
  const weekLabel = viewWeekLabel(view);
  if (view.presentation?.phase === 'postseason') {
    const championship = view.matchups.filter(row => String(row.type) !== 'Saunders');
    const saunders = view.matchups.filter(row => String(row.type) === 'Saunders');
    const group = (heading, rows) => rows.length ? `
      <div class="current-postseason-group">
        <h3>${escapeHtml(heading)}</h3>
        <div class="current-matchup-grid">${rows.map(row => currentMatchupCardHtml(row, view)).join('')}</div>
      </div>
    ` : '';
    return `
      <div class="section-heading current-section-heading">
        <h3>${escapeHtml(weekLabel)} Trophy Paths</h3>
        <div class="muted">${escapeHtml(view.matchups.length)} active or final games</div>
      </div>
      ${group('Championship Path', championship)}
      ${group('Saunders Path', saunders)}
    `;
  }
  return `
    <div class="section-heading current-section-heading">
      <h3>${escapeHtml(weekLabel)} Matchups</h3>
      <div class="muted">${escapeHtml(view.matchups.length)} games</div>
    </div>
    <div class="current-matchup-grid">
      ${view.matchups.map(row => currentMatchupCardHtml(row, view)).join('')}
    </div>
  `;
}

function currentStandingsHtml(view) {
  if (!selectedViewAllows(view, 'standings')) return '';
  if (!view.standings.length) {
    return '<h3>Standings</h3><p class="muted">No standings available.</p>';
  }
  return `
    <h3>Standings</h3>
    <div id="currentStandingsTableRoot"></div>
  `;
}

function describeExtreme(row) {
  if (!row) return '-';
  return `${row.opp} ${nfmt(row.pf, 2)}-${nfmt(row.pa, 2)}`;
}

function currentTeamSnapshotsHtml(view) {
  if (!selectedViewAllows(view, 'snapshots')) return '';
  if (!view.snapshots.length) {
    return '<div class="card"><h3>Team Snapshots</h3><p class="muted">No team snapshots available.</p></div>';
  }
  return `
    <div class="section-heading current-section-heading">
      <h3>Team Snapshots</h3>
      <div class="muted">${escapeHtml(view.season)} season</div>
    </div>
    <div class="current-snapshot-grid">
      ${view.snapshots.map(snapshot => `
        <article class="card current-snapshot-card">
          <div class="card-kicker">Rank ${escapeHtml(snapshot.standing.rank || '-')}</div>
          <h3>${escapeHtml(snapshot.owner)}</h3>
          <div class="current-context-grid">
            <div>
              <div class="label">Record</div>
              <div class="value">${escapeHtml(snapshot.standing.record || '0-0')}</div>
            </div>
            <div>
              <div class="label">Scoring Rank</div>
              <div class="value">${escapeHtml(snapshot.scoringRank || '-')}</div>
            </div>
            <div>
              <div class="label">Best Win</div>
              <div class="value">${escapeHtml(describeExtreme(snapshot.bestWin))}</div>
            </div>
            <div>
              <div class="label">Worst Loss</div>
              <div class="value">${escapeHtml(describeExtreme(snapshot.worstLoss))}</div>
            </div>
          </div>
        </article>
      `).join('')}
    </div>
  `;
}

function currentPlayoffPictureHtml(view) {
  if (!selectedViewAllows(view, 'playoff')) return '';
  const command = view.commandCenter;
  const rows = command?.playoffPicture || [];
  if (!rows.length) return view.presentation?.phase === 'postseason'
    ? ''
    : '<h3>Playoff Picture</h3><p class="muted">No playoff picture available.</p>';
  const estimatesMeaningful = (view.presentation?.phase || 'regular-season') === 'regular-season';
  const saundersLine = command.summary?.saundersLineSeed || null;
  return `
    <div class="section-heading current-section-heading">
      <h3>Playoff Picture</h3>
      <div class="muted">Top ${escapeHtml(command.rules.playoff_slots)} make playoffs &middot; Top ${escapeHtml(command.rules.bye_slots)} earn byes${saundersLine ? ` &middot; Saunders danger starts at seed ${escapeHtml(saundersLine)}` : ''}</div>
    </div>
    <div class="current-playoff-grid">
      ${rows.map(row => `
        ${row.currentSeed === command.rules.bye_slots + 1 ? '<div class="current-cutline">Bye line</div>' : ''}
        ${row.currentSeed === command.rules.playoff_slots + 1 ? '<div class="current-cutline current-cutline-playoff">Playoff line</div>' : ''}
        ${saundersLine && row.currentSeed === saundersLine ? '<div class="current-cutline current-cutline-saunders">Saunders danger line</div>' : ''}
        <div class="current-seed-row${row.owner === command.selectedOwner ? ' current-owner-focus' : ''}">
          <div class="current-seed-badge">${escapeHtml(row.currentSeed)}</div>
          <div class="current-seed-main">
            <strong>${escapeHtml(row.owner)}</strong>
            <span>${escapeHtml(row.record)} &middot; PF rank ${escapeHtml(row.pointsForRank || '-')}</span>
          </div>
          <div class="current-seed-meta">
            ${row.status.tone === 'clinched' ? `<button type="button" class="${statusClass(row.status)} current-lore-status" data-lore-trigger="current-clinched" data-lore-owner="${escapeHtml(row.owner)}">${escapeHtml(row.status.label)}</button>` : row.status.tone === 'eliminated' ? `<button type="button" class="${statusClass(row.status)} current-lore-status" data-lore-trigger="current-eliminated" data-lore-owner="${escapeHtml(row.owner)}">${escapeHtml(row.status.label)}</button>` : `<span class="${statusClass(row.status)}">${escapeHtml(row.status.label)}</span>`}
            <span>${escapeHtml(gapText(row.playoffGap))}</span>
            ${estimatesMeaningful ? `<span>Projected ${escapeHtml(row.projectedSeed)} (${escapeHtml(signedSeedChange(row.seedChange))})</span>` : '<span>Deterministic final status</span>'}
            ${estimatesMeaningful && row.odds ? `
              <span class="current-odds-chip">Playoffs ${escapeHtml(fmtOdds(row.odds.playoffOdds))}</span>
              <span class="current-odds-chip">Bye ${escapeHtml(fmtOdds(row.odds.byeOdds))}</span>
              <span class="current-odds-chip current-odds-chip-saunders">Saunders ${escapeHtml(fmtOdds(row.odds.saundersOdds))}</span>
              <details class="current-seed-distribution">
                <summary>Seed odds</summary>
                <span>${Object.entries(row.odds.seedProbabilities).map(([seed, probability]) => `#${escapeHtml(seed)} ${escapeHtml(fmtOdds(probability))}`).join(' · ')}</span>
              </details>
            ` : ''}
          </div>
        </div>
      `).join('')}
    </div>
    ${estimatesMeaningful && command.odds?.status === 'ready' ? `
      <div class="current-odds-methodology">
        <strong>${escapeHtml(command.odds.modelLabel)}</strong>
        <span>${escapeHtml(command.odds.simulations.toLocaleString())} simulations · ${escapeHtml(command.odds.liveMode)} · model ${escapeHtml(command.odds.modelVersion)}</span>
        <span>${escapeHtml(command.odds.methodology)}</span>
      </div>
    ` : estimatesMeaningful && command.odds?.status === 'error' ? `
      <div class="current-odds-methodology current-odds-error">
        Probability model unavailable. Deterministic standings remain authoritative.
      </div>
    ` : ''}
    ${saundersLine ? `<p class="current-boundary-note">The Saunders boundary marks the bottom ${escapeHtml(command.rules.saunders_slots)} seed${command.rules.saunders_slots === 1 ? '' : 's'} entering the consolation danger zone.</p>` : ''}
  `;
}

function currentWeekNeedsHtml(view) {
  if (!selectedViewAllows(view, 'needs')) return '';
  const command = view.commandCenter;
  const rows = command?.ownerNeeds || [];
  const scenario = command?.odds?.selectedOwnerScenario || null;
  if (!rows.length) return '<div class="card"><h3>This Week Needs</h3><p class="muted">No owner paths available.</p></div>';
  return `
    <div class="section-heading current-section-heading">
      <h3>This Week Needs</h3>
      <div class="muted">${command.selectedOwner ? `${escapeHtml(command.selectedOwner)} focus` : 'All owners'}</div>
    </div>
    <div class="current-needs-grid">
      ${rows.map(row => `
        <article class="card current-needs-card${row.isSelected ? ' current-owner-focus' : ''}">
          <div class="current-needs-head">
            <div>
              <div class="card-kicker">Seed ${escapeHtml(row.currentSeed)}${row.opponent ? ` &middot; vs ${escapeHtml(row.opponent)}` : ''}</div>
              <div class="card-kicker">Goal: ${escapeHtml(row.goalLabel || 'Seeding')}</div>
              <h3>${escapeHtml(row.owner)}</h3>
            </div>
            <span class="${statusClass(row.status)}">${escapeHtml(row.status.label)}</span>
          </div>
          <p><strong>${escapeHtml(row.mainNeed)}</strong></p>
          <p class="muted">${escapeHtml(row.helpNeeded)}</p>
          <p class="muted">${escapeHtml(row.pathSummary)}</p>
          <p class="current-risk-text">${escapeHtml(row.riskSummary)}</p>
          ${row.saundersSummary && row.saundersSummary !== row.riskSummary ? `<p class="current-saunders-text">${escapeHtml(row.saundersSummary)}</p>` : ''}
          ${scenario?.owner === row.owner ? `
            <p class="current-odds-scenario">
              <strong>Win:</strong> playoff ${escapeHtml(fmtOdds(scenario.win.playoffOdds))}, bye ${escapeHtml(fmtOdds(scenario.win.byeOdds))}
              · <strong>Loss:</strong> playoff ${escapeHtml(fmtOdds(scenario.loss.playoffOdds))}, bye ${escapeHtml(fmtOdds(scenario.loss.byeOdds))}
            </p>
          ` : ''}
        </article>
      `).join('')}
    </div>
  `;
}

function currentLiveMovementHtml(view) {
  if (!selectedViewAllows(view, 'movement')) return '';
  const command = view.commandCenter;
  const isLive = view.presentation ? Boolean(view.presentation.isLive) : true;
  if (!isLive && !Number(command?.summary?.completedGameCount)) return '';
  const rows = (command?.liveMovement || []).slice(0, 6);
  const heading = isLive ? 'Live Movement' : 'Standings Movement';
  if (!rows.length) return `<h3>${heading}</h3><p class="muted">No movement available.</p>`;
  const projectionLabel = command.selectedProjectionMode === 'current' ? 'Completed games only' : 'If scores hold';
  const oddsMovement = (command.odds?.movement || []).slice().sort((a, b) => Math.abs(b.playoffChange) - Math.abs(a.playoffChange));
  return `
    <div class="section-heading current-section-heading">
      <h3>${heading}</h3>
      <div class="muted">Baseline: previous completed week &middot; ${escapeHtml(projectionLabel)}</div>
    </div>
    <div class="current-command-chart chart-shell">
      <div id="currentSeedMovementPlot" class="chart-host current-seed-movement-host" aria-label="Live seed movement by owner"></div>
    </div>
    ${oddsMovement.length ? `
      <div class="section-heading current-section-heading">
        <h4>Playoff odds movement</h4>
        <div class="muted">Change from the previous completed-week baseline</div>
      </div>
      <div class="current-command-chart chart-shell">
        <div id="currentOddsMovementPlot" class="chart-host current-odds-movement-host" aria-label="Playoff odds movement by owner"></div>
      </div>
      <div class="current-odds-movement-list chart-fallback">
        ${oddsMovement.slice(0, 6).map(row => `
          <span><strong>${escapeHtml(row.owner)}</strong> ${escapeHtml(row.playoffChange >= 0 ? '+' : '')}${escapeHtml(Math.round(row.playoffChange * 100))} pts</span>
        `).join('')}
      </div>
    ` : ''}
    <div class="current-movement-grid chart-fallback">
      ${rows.map(row => `
        <div class="current-movement-card${row.owner === command.selectedOwner ? ' current-owner-focus' : ''}">
          <div class="current-movement-owner">${escapeHtml(row.owner)}</div>
          <div class="current-movement-value ${row.seedChange > 0 ? 'current-movement-up' : row.seedChange < 0 ? 'current-movement-down' : ''}">${escapeHtml(signedSeedChange(row.seedChange))}</div>
          <div class="muted">Seed ${escapeHtml(row.previousSeed)} to ${escapeHtml(row.projectedSeed)} &middot; ${escapeHtml(row.projectedRecord)}</div>
        </div>
      `).join('')}
    </div>
  `;
}

function currentProjectedStandingsHtml(view) {
  if (!selectedViewAllows(view, 'projection')) return '';
  const command = view.commandCenter;
  const rows = command?.projectedStandings || [];
  if (!rows.length) return '<h3>Projected Standings</h3><p class="muted">No projection available.</p>';
  return `
    <div class="section-heading current-section-heading">
      <h3>Projected Standings</h3>
      <div class="muted">${escapeHtml(command.modelLabel)} &middot; ${command.selectedProjectionMode === 'ifScoresHold' ? 'If scores hold' : 'Completed games only'}</div>
    </div>
    ${methodologyNoteHtml(command)}
    <div class="current-command-chart chart-shell">
      <div id="currentProjectedStandingsPlot" class="chart-host current-projected-standings-host" aria-label="Projected standings seed by owner"></div>
    </div>
    <div id="currentProjectedTableRoot" class="current-projection-table"></div>
  `;
}

function renderCurrentSeasonHero(view, opts = {}) {
  const root = docOrDefault(opts.doc);
  const el = root?.getElementById('currentHero');
  if (el) el.innerHTML = currentSeasonHeroHtml(view);
}

function renderCurrentRecap(view, opts = {}) {
  const root = docOrDefault(opts.doc);
  const el = root?.getElementById('currentRecap');
  setSectionHtml(el, currentRecapHtml(view));
}

function renderCurrentMatchups(view, opts = {}) {
  const root = docOrDefault(opts.doc);
  const el = root?.getElementById('currentMatchups');
  setSectionHtml(el, currentMatchupsHtml(view));
}

function renderCurrentStandings(view, opts = {}) {
  const root = docOrDefault(opts.doc);
  const el = root?.getElementById('currentStandings');
  setSectionHtml(el, currentStandingsHtml(view));
}

function renderCurrentTeamSnapshots(view, opts = {}) {
  const root = docOrDefault(opts.doc);
  const el = root?.getElementById('currentTeamSnapshots');
  setSectionHtml(el, currentTeamSnapshotsHtml(view));
}

function renderCurrentCommandCenter(view, opts = {}) {
  const root = docOrDefault(opts.doc);
  const sections = [
    ['currentPlayoffPicture', currentPlayoffPictureHtml],
    ['currentWeekNeeds', currentWeekNeedsHtml],
    ['currentLiveMovement', currentLiveMovementHtml],
    ['currentProjectedStandings', currentProjectedStandingsHtml],
  ];
  for (const [id, htmlFn] of sections) {
    const el = root?.getElementById(id);
    setSectionHtml(el, htmlFn(view));
  }
  if (view.commandCenter?.selectedView !== 'schedule') renderCurrentCommandCharts(view, { doc: root });
}

function renderCurrentCommandCharts(view, opts = {}) {
  const root = docOrDefault(opts.doc);
  const movementHost = typeof root?.getElementById === 'function' ? root.getElementById('currentSeedMovementPlot') : null;
  const oddsMovementHost = typeof root?.getElementById === 'function' ? root.getElementById('currentOddsMovementPlot') : null;
  const projectionHost = typeof root?.getElementById === 'function' ? root.getElementById('currentProjectedStandingsPlot') : null;
  const targets = [
    [movementHost, 'renderCurrentSeedMovementPlot'],
    [oddsMovementHost, 'renderCurrentOddsMovementPlot'],
    [projectionHost, 'renderCurrentProjectedStandingsPlot'],
  ].filter(([host]) => host && (!host.closest('details') || host.closest('details').open));
  void import('../src/charting/plot-charts.ts').then(runtime => {
    targets.forEach(([host, renderer]) => runtime[renderer](host, view));
  });
}

export {
  attachCurrentSeasonOdds,
  buildCurrentSeasonViewModel,
  currentLiveMovementHtml,
  currentMatchupsHtml,
  currentPlayoffPictureHtml,
  currentProjectedStandingsHtml,
  currentRecapHtml,
  currentSeasonHeroHtml,
  currentStandingsHtml,
  currentTeamSnapshotsHtml,
  currentWeekNeedsHtml,
  formattedGeneratedAt,
  renderCurrentCommandCenter,
  renderCurrentCommandCharts,
  renderCurrentMatchups,
  renderCurrentRecap,
  renderCurrentSchedule,
  renderCurrentSeasonHero,
  renderCurrentStandings,
  renderCurrentTeamSnapshots,
  viewWeekLabel,
};
