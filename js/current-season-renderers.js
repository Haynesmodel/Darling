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
  if (row.resultA === 'W') return row.teamA;
  if (row.resultB === 'W') return row.teamB;
  return 'Tie';
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
  return `
    <div class="current-hero-inner">
      <div>
        <div class="card-kicker">Current Season</div>
        <h3>${escapeHtml(view.season || 'Season')}</h3>
        <p class="muted">${escapeHtml(weekLabel)} context from ${escapeHtml(view.summary.completedGameCount)} completed regular-season games.</p>
        ${view.source === 'sleeper' ? `<p class="muted">Source: Sleeper${generatedAt ? ` &middot; Last updated ${escapeHtml(generatedAt)}` : ''}</p>` : '<p class="muted">Source: historical JSON fallback</p>'}
      </div>
      <div class="current-hero-stats">
        <div class="stat">
          <div class="label">Teams</div>
          <div class="value">${escapeHtml(view.summary.teamCount)}</div>
        </div>
        <div class="stat">
          <div class="label">High Score</div>
          <div class="value">${high ? `${escapeHtml(high.owner)} ${nfmt(high.score, 2)}` : '-'}</div>
          ${high ? `<div class="sub">${escapeHtml(high.game.date)}</div>` : ''}
        </div>
        <div class="stat">
          <div class="label">Closest Game</div>
          <div class="value">${close ? nfmt(close.margin, 2) : '-'}</div>
          ${closeGame ? `<div class="sub">${escapeHtml(closeGame.teamA)} vs ${escapeHtml(closeGame.teamB)}</div>` : ''}
        </div>
      </div>
    </div>
  `;
}

function currentMatchupCardHtml(row) {
  const allTime = row.allTimeContext?.allTime;
  const current = row.currentSeasonContext?.selected;
  const last = row.lastMeeting;
  const winner = matchupWinner(row);
  const status = String(row.status || '').trim();
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
        <span class="${row.resultA === 'W' ? 'result-win' : row.resultA === 'L' ? 'result-loss' : 'result-tie'}">${escapeHtml(row.teamA)} ${scoreFmt(row.scoreA)}</span>
        <span>${escapeHtml(row.teamB)} ${scoreFmt(row.scoreB)}</span>
      </div>
      <div class="current-context-grid">
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
      ${view.matchups.map(currentMatchupCardHtml).join('')}
    </div>
  `;
}

function currentStandingsHtml(view) {
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

function renderCurrentSeasonHero(view, opts = {}) {
  const root = docOrDefault(opts.doc);
  const el = root?.getElementById('currentHero');
  if (el) el.innerHTML = currentSeasonHeroHtml(view);
}

function renderCurrentMatchups(view, opts = {}) {
  const root = docOrDefault(opts.doc);
  const el = root?.getElementById('currentMatchups');
  if (el) el.innerHTML = currentMatchupsHtml(view);
}

function renderCurrentStandings(view, opts = {}) {
  const root = docOrDefault(opts.doc);
  const el = root?.getElementById('currentStandings');
  if (el) el.innerHTML = currentStandingsHtml(view);
}

function renderCurrentTeamSnapshots(view, opts = {}) {
  const root = docOrDefault(opts.doc);
  const el = root?.getElementById('currentTeamSnapshots');
  if (el) el.innerHTML = currentTeamSnapshotsHtml(view);
}

export {
  buildCurrentSeasonViewModel,
  currentMatchupsHtml,
  currentSeasonHeroHtml,
  currentStandingsHtml,
  currentTeamSnapshotsHtml,
  formattedGeneratedAt,
  renderCurrentMatchups,
  renderCurrentSeasonHero,
  renderCurrentStandings,
  renderCurrentTeamSnapshots,
  viewWeekLabel,
};
