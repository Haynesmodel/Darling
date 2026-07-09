import { byDateDesc, sidesForTeam } from './core-helpers.js';
import { escapeHtml, nfmt } from './render-helpers.js';
import {
  buildCurrentMatchupRows,
  buildCurrentSeasonStandings,
  buildTeamCurrentSeasonSnapshot,
  currentSeasonSourceGames,
  isCompletedGame,
  latestCompletedWeek,
  latestLeagueSeason,
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

function selectedViewAllows(view, section) {
  const mode = view.commandCenter?.selectedView || 'command';
  if (mode === 'command') return true;
  if (mode === 'matchups') return section === 'matchups';
  if (mode === 'standings') return ['playoff', 'movement', 'projection', 'standings'].includes(section);
  if (mode === 'owners') return ['needs', 'snapshots'].includes(section);
  return true;
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
    return `${weekTypeLabel([...types][0])} Week ${view.week || '-'}`;
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
  const seasonGames = currentSeasonSourceGames(leagueGames, selectedSeason, currentSeason);
  const regularGames = seasonGames.filter(game => String(game.type || '').trim() === 'Regular');
  const completedRegularGames = regularGames.filter(isCompletedGame);
  const standings = buildCurrentSeasonStandings({ leagueGames, seasonSummaries, currentSeason, season: selectedSeason });
  const matchups = buildCurrentMatchupRows({ leagueGames, seasonSummaries, currentSeason, season: selectedSeason, week: selectedWeek });
  const teams = standings.map(row => row.owner);
  const snapshots = teams.map(owner => buildTeamCurrentSeasonSnapshot({
    owner,
    leagueGames,
      seasonSummaries,
    currentSeason,
    season: selectedSeason,
  }));
  const commandCenter = buildCommandCenterModel({
    leagueGames,
    seasonSummaries,
    currentSeason,
    season: selectedSeason,
    week: selectedWeek,
    selectedOwner,
    selectedView,
    projectionMode,
  });

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
  return `
    <div class="current-hero-inner">
      <div>
        <div class="card-kicker">Current Season</div>
        <h3>${escapeHtml(view.season || 'Season')}</h3>
        <p class="muted">${escapeHtml(weekLabel)} command center from ${escapeHtml(command?.summary?.completedGameCount ?? view.summary.completedGameCount)} completed regular-season games.</p>
        ${view.source === 'sleeper' ? `<p class="muted">Source: Sleeper${generatedAt ? ` &middot; Last updated ${escapeHtml(generatedAt)}` : ''}</p>` : '<p class="muted">Source: historical JSON fallback</p>'}
        ${command ? `<p class="muted">Model: ${escapeHtml(command.modelLabel)} &middot; ${escapeHtml(command.rules.playoff_slots)} playoff spots, ${escapeHtml(command.rules.bye_slots)} byes</p>` : ''}
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

function currentMatchupCardHtml(row, view = {}) {
  const allTime = row.allTimeContext?.allTime;
  const current = row.currentSeasonContext?.selected;
  const last = row.lastMeeting;
  const winner = matchupWinner(row);
  const status = String(row.status || '').trim();
  const impact = view.commandCenter?.matchupImpacts?.get(matchupKey(row));
  return `
    <article class="current-matchup-card">
      <div class="current-matchup-top">
        <div>
          <div class="card-kicker">${escapeHtml(rowWeekLabel(row))} &middot; ${escapeHtml(row.date)}${status ? ` &middot; ${escapeHtml(status)}` : ''}</div>
          <h3>${escapeHtml(row.teamA)} vs ${escapeHtml(row.teamB)}</h3>
        </div>
        <a class="btn" href="${escapeHtml(row.rivalryUrl)}">Head to Head</a>
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
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th scope="col">Rank</th>
            <th scope="col">Owner</th>
            <th scope="col">Record</th>
            <th scope="col">Win %</th>
            <th scope="col">PF</th>
            <th scope="col">PA</th>
            <th scope="col">Diff</th>
            <th scope="col">Streak</th>
          </tr>
        </thead>
        <tbody>
          ${view.standings.map(row => `
            <tr>
              <td>${escapeHtml(row.rank)}</td>
              <td>${escapeHtml(row.owner)}</td>
              <td>${escapeHtml(row.record)}</td>
              <td>${escapeHtml(fmtPct(row.pct))}</td>
              <td>${nfmt(row.pointsFor, 2)}</td>
              <td>${nfmt(row.pointsAgainst, 2)}</td>
              <td>${row.differential >= 0 ? '+' : ''}${nfmt(row.differential, 2)}</td>
              <td>${escapeHtml(row.streak || '-')}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
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
  if (!rows.length) return '<h3>Playoff Picture</h3><p class="muted">No playoff picture available.</p>';
  return `
    <div class="section-heading current-section-heading">
      <h3>Playoff Picture</h3>
      <div class="muted">Top ${escapeHtml(command.rules.playoff_slots)} make playoffs &middot; Top ${escapeHtml(command.rules.bye_slots)} earn byes</div>
    </div>
    <div class="current-playoff-grid">
      ${rows.map(row => `
        ${row.currentSeed === command.rules.bye_slots + 1 ? '<div class="current-cutline">Bye line</div>' : ''}
        ${row.currentSeed === command.rules.playoff_slots + 1 ? '<div class="current-cutline current-cutline-playoff">Playoff line</div>' : ''}
        <div class="current-seed-row${row.owner === command.selectedOwner ? ' current-owner-focus' : ''}">
          <div class="current-seed-badge">${escapeHtml(row.currentSeed)}</div>
          <div class="current-seed-main">
            <strong>${escapeHtml(row.owner)}</strong>
            <span>${escapeHtml(row.record)} &middot; PF rank ${escapeHtml(row.pointsForRank || '-')}</span>
          </div>
          <div class="current-seed-meta">
            <span class="${statusClass(row.status)}">${escapeHtml(row.status.label)}</span>
            <span>${escapeHtml(gapText(row.playoffGap))}</span>
            <span>Projected ${escapeHtml(row.projectedSeed)} (${escapeHtml(signedSeedChange(row.seedChange))})</span>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function currentWeekNeedsHtml(view) {
  if (!selectedViewAllows(view, 'needs')) return '';
  const command = view.commandCenter;
  const rows = command?.ownerNeeds || [];
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
              <h3>${escapeHtml(row.owner)}</h3>
            </div>
            <span class="${statusClass(row.status)}">${escapeHtml(row.status.label)}</span>
          </div>
          <p><strong>${escapeHtml(row.mainNeed)}</strong></p>
          <p class="muted">${escapeHtml(row.helpNeeded)}</p>
          <p class="muted">${escapeHtml(row.pathSummary)}</p>
          <p class="current-risk-text">${escapeHtml(row.riskSummary)}</p>
        </article>
      `).join('')}
    </div>
  `;
}

function currentLiveMovementHtml(view) {
  if (!selectedViewAllows(view, 'movement')) return '';
  const command = view.commandCenter;
  const rows = (command?.liveMovement || []).slice(0, 6);
  if (!rows.length) return '<h3>Live Movement</h3><p class="muted">No movement available.</p>';
  return `
    <div class="section-heading current-section-heading">
      <h3>Live Movement</h3>
      <div class="muted">Baseline: previous completed week &middot; If scores hold</div>
    </div>
    <div class="current-movement-grid">
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
    <div class="table-wrap current-projection-table">
      <table>
        <thead>
          <tr>
            <th scope="col">Projected Seed</th>
            <th scope="col">Owner</th>
            <th scope="col">Projected Record</th>
            <th scope="col">Current Record</th>
            <th scope="col">Projected PF</th>
            <th scope="col">Seed Change</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(row => `
            <tr class="${row.owner === command.selectedOwner ? 'current-owner-focus-row' : ''}">
              <td>${escapeHtml(row.projectedRank)}</td>
              <td>${escapeHtml(row.owner)}</td>
              <td>${escapeHtml(row.projectedRecord)}</td>
              <td>${escapeHtml(row.currentRecord)}</td>
              <td>${nfmt(row.projectedPointsFor, 2)}</td>
              <td>${escapeHtml(signedSeedChange(row.seedChange))}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderCurrentSeasonHero(view, opts = {}) {
  const root = docOrDefault(opts.doc);
  const el = root?.getElementById('currentHero');
  if (el) el.innerHTML = currentSeasonHeroHtml(view);
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
}

export {
  buildCurrentSeasonViewModel,
  currentLiveMovementHtml,
  currentMatchupsHtml,
  currentPlayoffPictureHtml,
  currentProjectedStandingsHtml,
  currentSeasonHeroHtml,
  currentStandingsHtml,
  currentTeamSnapshotsHtml,
  currentWeekNeedsHtml,
  formattedGeneratedAt,
  renderCurrentCommandCenter,
  renderCurrentMatchups,
  renderCurrentSeasonHero,
  renderCurrentStandings,
  renderCurrentTeamSnapshots,
  viewWeekLabel,
};
