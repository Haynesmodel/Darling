import { escapeHtml, nfmt } from './render-helpers.js';
import { isCompletedGame, weekForGame } from './current-season-data.js';
import {
  compareTiebreakerValue,
  compareWildcardTie,
  qualifyStandings,
  regularSeasonGamesFor,
  resolveSeasonRules,
  sortAndRankStandings,
  standingsFromGames,
} from './current-season-command-data.js';

function docOrDefault(doc) { return doc || (typeof document !== 'undefined' ? document : null); }
function scoreFmt(value) { return value === null || value === undefined || value === '' ? '-' : nfmt(value, 2); }
function numeric(value) { return value === null || value === undefined || value === '' ? null : Number.isFinite(Number(value)) ? Number(value) : null; }

function playoffMachineGameKey(game) {
  const week = numeric(weekForGame(game) ?? game?.week) ?? '';
  const pair = [game?.teamA || '', game?.teamB || ''].sort().join('|');
  return [numeric(game?.season) ?? '', week, game?.matchup_id || pair, game?.rosterA || '', game?.rosterB || ''].join(':');
}

function validScenarioScore(value) {
  if (value === null || value === undefined || value === '') return null;
  const score = Number(value);
  return Number.isFinite(score) && score >= 0 && score <= 999.99 && Math.abs(score * 100 - Math.round(score * 100)) < 1e-8
    ? score
    : null;
}

function validMachineEdit(edit) {
  if (edit == null) return true;
  return typeof edit === 'object' && !Array.isArray(edit)
    && (edit.outcome == null || ['a', 'b', 'tie'].includes(edit.outcome))
    && Object.keys(edit).every(field => ['outcome', 'scoreA', 'scoreB'].includes(field));
}

function buildPlayoffMachine({ leagueGames = [], currentSeason = null, season, scenario = {} } = {}) {
  const rules = resolveSeasonRules({ leagueGames, currentSeason, season });
  const games = regularSeasonGamesFor({ leagueGames, currentSeason, season, rules });
  const teamOwners = [...new Set([
    ...(Number(currentSeason?.season) === Number(season) ? (currentSeason.teams || []).map(team => team.owner) : []),
    ...games.flatMap(game => [game.teamA, game.teamB]),
  ].filter(Boolean))].sort();
  const gameRows = games.map(game => ({
    key: playoffMachineGameKey(game),
    game,
    week: Number(weekForGame(game) ?? game.week),
  }));
  const eligible = gameRows.filter(({ game }) => !isCompletedGame(game));
  const actualStandings = sortAndRankStandings(standingsFromGames({ games, leagueGames, currentSeason, season }), rules);
  const eligibleByKey = new Map();
  const duplicateKeys = new Set();
  for (const row of eligible) {
    if (eligibleByKey.has(row.key)) duplicateKeys.add(row.key);
    eligibleByKey.set(row.key, row);
  }
  const edits = scenario && typeof scenario === 'object' ? scenario : {};
  const issues = [];
  if (Object.keys(edits).some(key => !eligibleByKey.has(key))) issues.push('Some saved scenario inputs no longer match unresolved games and were ignored.');
  const invalidEdits = new Set(eligible.filter(({ key }) => edits[key] != null && !validMachineEdit(edits[key])).map(({ key }) => key));
  if (invalidEdits.size) issues.push('Some saved scenario picks are invalid and were ignored.');
  const seenByWeek = new Map();
  for (const { game, week } of gameRows) {
    if (!seenByWeek.has(week)) seenByWeek.set(week, []);
    seenByWeek.get(week).push(game);
  }
  const expectedOwners = new Set(teamOwners);
  let scheduleComplete = teamOwners.length > 0;
  for (let week = 1; week <= rules.regular_season_max_week; week += 1) {
    const weekGames = seenByWeek.get(week) || [];
    const appearances = weekGames.flatMap(game => [game.teamA, game.teamB]);
    if (weekGames.length !== teamOwners.length / 2
      || appearances.length !== expectedOwners.size
      || new Set(appearances).size !== appearances.length
      || appearances.some(owner => !expectedOwners.has(owner))) scheduleComplete = false;
  }
  if (!scheduleComplete) issues.push('The regular-season schedule has missing or duplicate team appearances. Exact seeds are unavailable.');
  if (duplicateKeys.size) {
    scheduleComplete = false;
    issues.push('Some unresolved games have duplicate identities. Exact seeds are unavailable.');
  }
  let allScored = true;
  const exactGames = new Map();
  const pickedOutcomes = [];
  for (const { key, game } of eligible) {
    if (duplicateKeys.has(key)) { allScored = false; continue; }
    const edit = edits[key];
    if (invalidEdits.has(key)) { allScored = false; continue; }
    if (!edit || typeof edit !== 'object') { allScored = false; continue; }
    const scoreA = validScenarioScore(edit.scoreA);
    const scoreB = validScenarioScore(edit.scoreB);
    const exact = scoreA !== null && scoreB !== null;
    const outcome = exact ? (scoreA === scoreB ? 'tie' : scoreA > scoreB ? 'a' : 'b') : ['a', 'b', 'tie'].includes(edit.outcome) ? edit.outcome : null;
    if (exact) {
      exactGames.set(key, { ...game, status: 'final', scoreA, scoreB });
    } else if (outcome) {
      pickedOutcomes.push([game, outcome]);
      allScored = false;
    } else {
      allScored = false;
    }
    if (!exact) allScored = false;
  }
  const scenarioGames = games.map(game => exactGames.get(playoffMachineGameKey(game)) || game);
  const standingsByOwner = new Map(standingsFromGames({ games: scenarioGames, leagueGames, currentSeason, season }).map(row => [row.owner, row]));
  for (const owner of teamOwners) if (!standingsByOwner.has(owner)) standingsByOwner.set(owner, {
    owner, season: Number(season), games: 0, wins: 0, losses: 0, ties: 0, pointsFor: 0,
    pointsAgainst: 0, differential: 0, pct: 0, record: '0-0', streak: '', rank: null,
  });
  for (const [game, outcome] of pickedOutcomes) applyMachineOutcome(standingsByOwner, game, outcome);
  const ranked = sortAndRankStandings([...standingsByOwner.values()], rules);
  const qualified = qualifyStandings(ranked, rules);
  const exact = scheduleComplete && allScored;
  const outsiderRows = qualified.filter(row => row.standingsRank > 5)
    .sort((a, b) => compareTiebreakerValue(a, b, 'points_for') || compareWildcardTie(a, b, rules));
  const leader = outsiderRows[0] || null;
  return {
    available: true,
    exact,
    issues,
    scheduleComplete,
    games: gameRows.filter(({ game }) => !isCompletedGame(game)).map(({ key, game, week }) => ({
      key, week, teamA: game.teamA, teamB: game.teamB, status: game.status || 'scheduled',
      sourceScoreA: validScenarioScore(game.scoreA), sourceScoreB: validScenarioScore(game.scoreB),
      edit: edits[key] && validMachineEdit(edits[key]) ? { ...edits[key] } : null,
      editError: invalidEdits.has(key) ? 'This saved pick is invalid and was ignored.' : '',
      scoreError: (() => {
        const edit = edits[key];
        if (!edit || edit.scoreA === '' && edit.scoreB === '' || edit.scoreA == null && edit.scoreB == null) return '';
        return validScenarioScore(edit.scoreA) !== null && validScenarioScore(edit.scoreB) !== null
          ? ''
          : 'Enter both valid scores from 0 to 999.99, with at most two decimal places.';
      })(),
      duplicate: duplicateKeys.has(key),
    })),
    weeks: [...new Set(eligible.map(row => row.week))].sort((a, b) => a - b),
    standings: qualified.map(row => ({ ...row, playoffSeed: exact ? row.playoffSeed : null })),
    actualStandings,
    candidates: outsiderRows.map(row => ({ ...row, gap: leader ? Number((leader.pointsFor - row.pointsFor).toFixed(2)) : null })),
    qualifier: exact ? leader : null,
    normalSixth: qualified.find(row => row.standingsRank === 6) || null,
    rules,
  };
}

function applyMachineOutcome(rows, game, outcome) {
  const resultA = outcome === 'tie' ? 'T' : outcome === 'a' ? 'W' : 'L';
  for (const [owner, result] of [[game.teamA, resultA], [game.teamB, resultA === 'W' ? 'L' : resultA === 'L' ? 'W' : 'T']]) {
    const row = rows.get(owner);
    if (!row) continue;
    row.games += 1;
    if (result === 'W') row.wins += 1;
    else if (result === 'L') row.losses += 1;
    else row.ties += 1;
    row.pct = (row.wins + row.ties * 0.5) / row.games;
    row.record = `${row.wins}-${row.losses}${row.ties ? `-${row.ties}` : ''}`;
  }
}

function currentPlayoffMachineHtml(machine, selectedWeek = null, root = docOrDefault()) {
  if (!machine?.available) return '<div class="section-heading"><h3>Playoff Machine</h3></div><p class="muted">The Playoff Machine is available during the active regular season.</p>';
  const week = machine.weeks.length ? machine.weeks.includes(Number(selectedWeek)) ? Number(selectedWeek) : machine.weeks[0] : null;
  const games = machine.games.filter(game => game.week === week);
  const edit = game => game.edit || {};
  const gameTemplate = root?.getElementById('currentMachineGameTemplate')?.innerHTML || '';
  const controls = (game, index) => {
    const scoreA = validScenarioScore(edit(game).scoreA);
    const scoreB = validScenarioScore(edit(game).scoreB);
    const selected = scoreA !== null && scoreB !== null ? scoreA === scoreB ? 'tie' : scoreA > scoreB ? 'a' : 'b' : edit(game).outcome;
    const disabled = game.duplicate ? ' disabled' : '';
    const buttons = [['a', game.teamA], ['tie', 'Tie'], ['b', game.teamB]].map(([value, label]) => `<button type="button" data-machine-action="outcome" data-game-key="${escapeHtml(game.key)}" data-outcome="${value}" aria-pressed="${selected === value}"${disabled}>${escapeHtml(label)}</button>`).join('');
    const scoreValueA = edit(game).scoreA ?? '';
    const scoreValueB = edit(game).scoreB ?? '';
    const errorId = `currentMachineScoreError${index}`;
    const status = `${escapeHtml(game.status)}${game.sourceScoreA !== null && game.sourceScoreB !== null ? ` · Live ${scoreFmt(game.sourceScoreA)}–${scoreFmt(game.sourceScoreB)}` : ''}`;
    const warning = game.duplicate
      ? '<p class="current-machine-warning">This game has a duplicate schedule identity; scenario edits are disabled.</p>'
      : game.editError
        ? `<p class="current-machine-warning" id="${errorId}" role="alert">${escapeHtml(game.editError)}</p>`
      : game.scoreError
        ? `<p class="current-machine-warning" id="${errorId}" role="alert">${escapeHtml(game.scoreError)}</p>`
        : `<span class="visually-hidden" id="${errorId}">Both scores are required for an exact result.</span>`;
    const values = {
      __TEAM_A__: escapeHtml(game.teamA), __TEAM_B__: escapeHtml(game.teamB), __STATUS__: status,
      __BUTTONS__: buttons, __WEEK__: escapeHtml(game.week), __KEY__: escapeHtml(game.key),
      __ERROR_ID__: errorId, __SCORE_A__: escapeHtml(scoreValueA), __SCORE_B__: escapeHtml(scoreValueB),
      __DISABLED__: disabled.trim(), __WARNING__: warning,
    };
    return gameTemplate.replace(/__[A-Z_]+__/gi, key => values[key.toUpperCase()] ?? key);
  };
  const actualByOwner = new Map(machine.actualStandings.map(row => [row.owner, row]));
  const seedBoard = machine.exact ? `<section class="current-machine-seed-board"><h3>Your six playoff seeds</h3><p>Top five by standings · seed 6 by points for outside the top five</p><div>${machine.standings.filter(row => row.playoffSeed).sort((a, b) => a.playoffSeed - b.playoffSeed).map(row => `<article><small>Seed ${escapeHtml(row.playoffSeed)}${row.qualificationReason === 'points_for' ? ' · PF' : ''}</small><strong>${escapeHtml(row.owner)}</strong></article>`).join('')}</div></section>` : '';
  const candidates = machine.candidates.map((row, index) => `<li${index === 0 ? ' class="current-machine-leader"' : ''}><strong>${escapeHtml(row.owner)}</strong><span>${escapeHtml(row.pointsFor.toFixed(2))} PF</span><span>${index === 0 ? 'Leader' : `−${escapeHtml(row.gap.toFixed(2))}`}</span></li>`).join('');
  const liveStandings = machine.exact
    ? machine.standings.filter(row => row.standingsRank <= 5 || row.playoffSeed === 6 || row.standingsRank === 6)
    : machine.standings.slice(0, 7);
  const liveRows = liveStandings.map(row => `<tr${row.standingsRank === 6 ? ' class="current-machine-sixth"' : ''}><td>${escapeHtml(row.standingsRank)}</td><th scope="row">${escapeHtml(row.owner)}</th><td>${escapeHtml(row.record)}</td><td>${machine.exact ? `#${escapeHtml(row.playoffSeed || '–')}` : row.rank <= 5 ? `#${escapeHtml(row.rank)}` : row.rank === 6 ? '—' : 'PF race'}</td></tr>`).join('');
  const fullRows = machine.standings.map(row => { const actual = actualByOwner.get(row.owner) || row; const rankChange = (actual.rank || row.rank) - (row.rank || 0); return `<tr><th scope="row">${escapeHtml(row.owner)}</th><td>${escapeHtml(actual.record)}</td><td>${escapeHtml(row.record)}</td><td>${escapeHtml(row.pointsFor.toFixed(2))}</td><td>${escapeHtml(row.standingsRank)}</td><td>${machine.exact ? escapeHtml(row.playoffSeed || 'Out') : 'Provisional'}</td><td>${rankChange > 0 ? '+' : ''}${escapeHtml(rankChange)}</td></tr>`; }).join('');
  const previous = machine.weeks.indexOf(week) <= 0;
  const next = machine.weeks.indexOf(week) >= machine.weeks.length - 1;
  const scored = machine.games.filter(game => game.edit?.scoreA !== '' && game.edit?.scoreA != null && game.edit?.scoreB !== '' && game.edit?.scoreB != null && !game.scoreError).length;
  const picks = machine.games.filter(game => game.edit?.outcome).length;
  const template = root?.getElementById('currentPlayoffMachineTemplate')?.innerHTML || '';
  const status = machine.exact ? 'Exact for this scenario' : `Provisional · ${scored}/${machine.games.length} scored · ${picks} picks`;
  const raceNote = machine.exact
    ? `Exact: ${escapeHtml(machine.qualifier?.owner || 'No qualifier')} takes seed 6.${machine.normalSixth && machine.qualifier?.owner !== machine.normalSixth.owner ? ` ${escapeHtml(machine.normalSixth.owner)} is standings sixth.` : ''}`
    : 'Unscored games can change PF and the race leader.';
  const values = {
    __MACHINE_STATUS__: escapeHtml(status),
    __MACHINE_ISSUES__: machine.issues.map(issue => `<p class="current-machine-warning" role="status">${escapeHtml(issue)}</p>`).join(''),
    __PREVIOUS__: previous ? 'disabled' : '',
    __NEXT__: next ? 'disabled' : '',
    __WEEK__: escapeHtml(week ?? ''),
    __WEEK_NAV__: machine.weeks.length ? `<div class="current-machine-week-nav"><button type="button" data-machine-action="week-prev" data-weeks="${escapeHtml(machine.weeks.join(','))}" aria-label="Previous unresolved week"${previous ? ' disabled' : ''}>‹</button><strong>Week ${escapeHtml(week)} of ${escapeHtml(machine.rules.regular_season_max_week)}</strong><button type="button" data-machine-action="week-next" data-weeks="${escapeHtml(machine.weeks.join(','))}" aria-label="Next unresolved week"${next ? ' disabled' : ''}>›</button></div>` : '<p class="muted">The regular season is complete. No unresolved games remain.</p>',
    __WEEKS__: escapeHtml(machine.weeks.join(',')),
    __MAX_WEEK__: escapeHtml(machine.rules.regular_season_max_week),
    __SCENARIO_LABEL__: escapeHtml(machine.exact ? 'Scenario complete' : 'Standings · actual → scenario'),
    __OWNER_COUNT__: escapeHtml(machine.standings.length),
    __SEED_BOARD__: seedBoard,
    __MACHINE_GAMES__: games.length ? games.map(controls).join('') : '<p class="muted">No unresolved games remain.</p>',
    __MACHINE_ACTIONS__: machine.weeks.length ? `<div class="current-machine-actions"><button type="button" data-machine-action="clear-week" data-week="${escapeHtml(week)}">Clear week</button><button type="button" data-machine-action="reset">Reset all</button></div>` : '',
    __LIVE_ROWS__: liveRows,
    __CANDIDATES__: candidates,
    __RACE_NOTE__: raceNote,
    __FULL_ROWS__: fullRows,
  };
  return template.replace(/<!--(__[A-Z_]+__)-->|(__[A-Z_]+__)/g, (_, comment, token) => {
    const key = comment || token;
    return values[key] ?? key;
  });
}

function drawPlayoffMachine({ leagueGames, currentSeason, season, scenario, selectedWeek, changeAnnouncement, doc } = {}) {
  const root = docOrDefault(doc);
  const host = root?.getElementById('currentPlayoffMachine');
  const machine = buildPlayoffMachine({ leagueGames, currentSeason, season, scenario });
  if (host) host.innerHTML = currentPlayoffMachineHtml(machine, selectedWeek, root);
  const announcement = root?.getElementById('currentMachineAnnouncement');
  const status = changeAnnouncement
    ? `${changeAnnouncement}. ${machine.exact ? 'Exact seeds are ready for this scenario.' : 'Scenario placement is provisional.'}`
    : machine.exact ? 'Exact seeds are ready for this scenario.' : 'Scenario standings are provisional.';
  if (announcement && announcement.textContent !== status) announcement.textContent = status;
}

export { buildPlayoffMachine, currentPlayoffMachineHtml, drawPlayoffMachine, playoffMachineGameKey, validMachineEdit };
