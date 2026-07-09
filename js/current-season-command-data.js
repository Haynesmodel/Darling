import { isRegularGame, sidesForTeam } from './core-helpers.js';
import {
  buildCurrentSeasonStandings,
  currentSeasonSourceGames,
  gamesForSeasonWeek,
  isCompletedGame,
  latestLeagueSeason,
  weekForGame,
} from './current-season-data.js';

const DEFAULT_PLAYOFF_RULES = Object.freeze({
  regular_season_max_week: 14,
  playoff_slots: 6,
  bye_slots: 2,
  standings_tiebreakers: ['win_pct', 'points_for', 'points_differential', 'owner'],
  saunders_slots: 6,
});

const CURRENT_VIEW_MODES = Object.freeze(['command', 'matchups', 'standings', 'owners']);
const CURRENT_PROJECTION_MODES = Object.freeze(['current', 'ifScoresHold']);

function numeric(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function positiveInt(value, fallback) {
  const n = Math.trunc(Number(value));
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function clampSlots(value, fallback, teamCount) {
  const n = positiveInt(value, fallback);
  return teamCount > 0 ? Math.min(n, teamCount) : n;
}

function normalizeCurrentView(value) {
  return CURRENT_VIEW_MODES.includes(value) ? value : 'command';
}

function normalizeProjectionMode(value) {
  return CURRENT_PROJECTION_MODES.includes(value) ? value : 'ifScoresHold';
}

function resolveCurrentSeasonRules(currentSeason = null, teamCount = 0) {
  const raw = currentSeason?.playoff_rules || {};
  const regularSeasonMaxWeek = positiveInt(
    raw.regular_season_max_week ?? currentSeason?.regular_season_max_week,
    DEFAULT_PLAYOFF_RULES.regular_season_max_week
  );
  const playoffSlots = clampSlots(raw.playoff_slots, DEFAULT_PLAYOFF_RULES.playoff_slots, teamCount);
  const byeSlots = Math.min(
    clampSlots(raw.bye_slots, DEFAULT_PLAYOFF_RULES.bye_slots, teamCount),
    playoffSlots
  );
  const defaultSaunders = Math.max((teamCount || DEFAULT_PLAYOFF_RULES.playoff_slots + DEFAULT_PLAYOFF_RULES.saunders_slots) - playoffSlots, 0);
  const saundersSlots = clampSlots(raw.saunders_slots, defaultSaunders || DEFAULT_PLAYOFF_RULES.saunders_slots, teamCount);
  const standingsTiebreakers = Array.isArray(raw.standings_tiebreakers) && raw.standings_tiebreakers.length
    ? raw.standings_tiebreakers.map(value => String(value).trim()).filter(Boolean)
    : DEFAULT_PLAYOFF_RULES.standings_tiebreakers;

  return {
    regular_season_max_week: regularSeasonMaxWeek,
    playoff_slots: playoffSlots,
    bye_slots: byeSlots,
    standings_tiebreakers: standingsTiebreakers,
    saunders_slots: saundersSlots,
  };
}

function gameStatus(game) {
  return String(game?.status || '').trim().toLowerCase();
}

function hasScore(game) {
  return Number.isFinite(Number(game?.scoreA)) && Number.isFinite(Number(game?.scoreB));
}

function isLiveGame(game) {
  return gameStatus(game) === 'live' && hasScore(game) && !isCompletedGame(game);
}

function regularSeasonGamesFor({
  leagueGames = [],
  currentSeason = null,
  season = latestLeagueSeason(leagueGames, [], currentSeason),
  rules = resolveCurrentSeasonRules(currentSeason),
} = {}) {
  const target = numeric(season);
  if (!Number.isFinite(target)) return [];
  return currentSeasonSourceGames(leagueGames, target, currentSeason)
    .filter(game => numeric(game?.season) === target)
    .filter(isRegularGame)
    .filter(game => {
      const week = numeric(weekForGame(game));
      return !Number.isFinite(week) || week <= rules.regular_season_max_week;
    });
}

function completedRegularSeasonGames(opts = {}) {
  return regularSeasonGamesFor(opts).filter(isCompletedGame);
}

function liveRegularSeasonGames(opts = {}) {
  return regularSeasonGamesFor(opts).filter(isLiveGame);
}

function scheduledRegularSeasonGames(opts = {}) {
  return regularSeasonGamesFor(opts)
    .filter(game => !isCompletedGame(game) && !isLiveGame(game));
}

function standingsFromGames({
  games = [],
  leagueGames = [],
  seasonSummaries = [],
  currentSeason = null,
  season = latestLeagueSeason(leagueGames, seasonSummaries, currentSeason),
} = {}) {
  const syntheticCurrentSeason = {
    ...(currentSeason || {}),
    season,
    games,
  };
  return buildCurrentSeasonStandings({
    leagueGames,
    seasonSummaries,
    currentSeason: syntheticCurrentSeason,
    season,
  });
}

function tiebreakerValue(row, key) {
  const normalized = String(key || '').trim().toLowerCase();
  if (normalized === 'win_pct' || normalized === 'pct') return row.pct;
  if (normalized === 'wins') return row.wins;
  if (normalized === 'losses') return row.losses;
  if (normalized === 'points_for' || normalized === 'pf') return row.pointsFor;
  if (normalized === 'points_against' || normalized === 'pa') return row.pointsAgainst;
  if (normalized === 'points_differential' || normalized === 'differential' || normalized === 'diff') return row.differential;
  if (normalized === 'owner') return row.owner;
  return null;
}

function compareTiebreakerValue(a, b, key) {
  const normalized = String(key || '').trim().toLowerCase();
  const av = tiebreakerValue(a, normalized);
  const bv = tiebreakerValue(b, normalized);
  if (normalized === 'owner') return String(av || '').localeCompare(String(bv || ''));
  if (normalized === 'losses' || normalized === 'points_against' || normalized === 'pa') {
    const aNumber = Number(av);
    const bNumber = Number(bv);
    if (!Number.isFinite(aNumber) && !Number.isFinite(bNumber)) return 0;
    return (Number.isFinite(aNumber) ? aNumber : Infinity) - (Number.isFinite(bNumber) ? bNumber : Infinity);
  }
  const aNumber = Number(av);
  const bNumber = Number(bv);
  if (Number.isFinite(aNumber) || Number.isFinite(bNumber)) {
    return (Number.isFinite(bNumber) ? bNumber : -Infinity) - (Number.isFinite(aNumber) ? aNumber : -Infinity);
  }
  return 0;
}

function sortAndRankStandings(rows = [], rules = DEFAULT_PLAYOFF_RULES) {
  const tiebreakers = Array.isArray(rules?.standings_tiebreakers) && rules.standings_tiebreakers.length
    ? rules.standings_tiebreakers
    : DEFAULT_PLAYOFF_RULES.standings_tiebreakers;
  const ranked = rows
    .map(row => ({ ...row }))
    .sort((a, b) => {
      for (const key of tiebreakers) {
        const result = compareTiebreakerValue(a, b, key);
        if (result !== 0) return result;
      }
      return a.owner.localeCompare(b.owner);
    });
  ranked.forEach((row, index) => { row.rank = index + 1; });
  return ranked;
}

function forceGameOutcome(game, owner, outcome) {
  const side = sidesForTeam(game, owner);
  if (!side || !['win', 'loss'].includes(outcome)) return game;
  const ownerIsA = game.teamA === owner;
  const baseA = Number.isFinite(Number(game.scoreA)) ? Number(game.scoreA) : 100;
  const baseB = Number.isFinite(Number(game.scoreB)) ? Number(game.scoreB) : 100;
  let scoreA = baseA;
  let scoreB = baseB;
  if ((outcome === 'win' && ownerIsA) || (outcome === 'loss' && !ownerIsA)) {
    scoreA = Math.max(baseA, baseB + 1);
    scoreB = Math.min(baseB, scoreA - 1);
  } else {
    scoreB = Math.max(baseB, baseA + 1);
    scoreA = Math.min(baseA, scoreB - 1);
  }
  return {
    ...game,
    status: 'final',
    scoreA: Number(scoreA.toFixed(2)),
    scoreB: Number(scoreB.toFixed(2)),
  };
}

function holdLiveScore(game) {
  if (!isLiveGame(game)) return game;
  return {
    ...game,
    status: 'final',
  };
}

function buildScenarioStandings({
  leagueGames = [],
  seasonSummaries = [],
  currentSeason = null,
  season = latestLeagueSeason(leagueGames, seasonSummaries, currentSeason),
  week = null,
  rules = null,
  owner = null,
  outcome = null,
  forcedOutcomes = [],
  includeLiveLeaders = false,
} = {}) {
  const resolvedRules = rules || resolveCurrentSeasonRules(currentSeason);
  const targetWeek = numeric(week);
  const forces = [
    ...(owner && outcome ? [{ owner, outcome }] : []),
    ...forcedOutcomes,
  ].filter(force => force?.owner && ['win', 'loss'].includes(force.outcome));
  const scenarioGames = regularSeasonGamesFor({ leagueGames, currentSeason, season, rules: resolvedRules })
    .map(game => {
      if (isCompletedGame(game)) return game;
      const gameWeek = numeric(weekForGame(game));
      const force = forces.find(item => (
        (!Number.isFinite(targetWeek) || gameWeek === targetWeek) &&
        sidesForTeam(game, item.owner)
      ));
      if (force) {
        return forceGameOutcome(game, force.owner, force.outcome);
      }
      if (includeLiveLeaders) return holdLiveScore(game);
      return game;
    });

  return sortAndRankStandings(standingsFromGames({
    games: scenarioGames,
    leagueGames,
    seasonSummaries,
    currentSeason,
    season,
  }), resolvedRules);
}

function buildProjectedStandings({
  leagueGames = [],
  seasonSummaries = [],
  currentSeason = null,
  season = latestLeagueSeason(leagueGames, seasonSummaries, currentSeason),
  rules = null,
  projectionMode = 'ifScoresHold',
} = {}) {
  const resolvedRules = rules || resolveCurrentSeasonRules(currentSeason);
  const mode = normalizeProjectionMode(projectionMode);
  const currentStandings = buildScenarioStandings({
    leagueGames,
    seasonSummaries,
    currentSeason,
    season,
    rules: resolvedRules,
  });
  const projected = buildScenarioStandings({
    leagueGames,
    seasonSummaries,
    currentSeason,
    season,
    rules: resolvedRules,
    includeLiveLeaders: mode === 'ifScoresHold',
  });
  const currentByOwner = new Map(currentStandings.map(row => [row.owner, row]));
  return projected.map(row => {
    const current = currentByOwner.get(row.owner) || row;
    return {
      ...row,
      currentRank: current.rank,
      currentRecord: current.record,
      currentWins: current.wins,
      currentLosses: current.losses,
      currentTies: current.ties,
      currentPointsFor: current.pointsFor,
      projectedRank: row.rank,
      projectedRecord: row.record,
      projectedPointsFor: row.pointsFor,
      seedChange: (current.rank || row.rank || 0) - (row.rank || 0),
      projectionMode: mode,
    };
  });
}

function remainingScheduleForOwner({
  owner,
  leagueGames = [],
  currentSeason = null,
  season = latestLeagueSeason(leagueGames, [], currentSeason),
  rules = null,
} = {}) {
  if (!owner) return [];
  const resolvedRules = rules || resolveCurrentSeasonRules(currentSeason);
  return regularSeasonGamesFor({ leagueGames, currentSeason, season, rules: resolvedRules })
    .filter(game => !isCompletedGame(game))
    .filter(game => sidesForTeam(game, owner))
    .sort((a, b) => (numeric(weekForGame(a)) || 0) - (numeric(weekForGame(b)) || 0));
}

function remainingByOwner(standings, opts = {}) {
  return new Map(standings.map(row => [
    row.owner,
    remainingScheduleForOwner({ ...opts, owner: row.owner }),
  ]));
}

function classifyOwnerStatus({
  row,
  standings = [],
  rules = DEFAULT_PLAYOFF_RULES,
  remaining = new Map(),
} = {}) {
  if (!row) return { key: 'unknown', label: 'No data', tone: 'neutral' };
  const playoffSlots = rules.playoff_slots;
  const byeSlots = rules.bye_slots;
  const ownerRemaining = remaining.get(row.owner)?.length || 0;
  const seasonComplete = standings.length > 0 && standings.every(item => (remaining.get(item.owner)?.length || 0) === 0);

  if (seasonComplete) {
    if (row.rank <= byeSlots) return { key: 'clinched-bye', label: 'Clinched bye', tone: 'clinched' };
    if (row.rank <= playoffSlots) return { key: 'clinched-playoff', label: 'Clinched playoff', tone: 'clinched' };
    return { key: 'eliminated', label: 'Eliminated', tone: 'eliminated' };
  }

  const maxWins = row.wins + ownerRemaining;
  const teamsAlreadyAboveMax = standings.filter(other => other.owner !== row.owner && other.wins > maxWins).length;
  if (teamsAlreadyAboveMax >= playoffSlots) {
    return { key: 'eliminated', label: 'Eliminated', tone: 'eliminated' };
  }

  const teamsThatCanCatch = standings.filter(other => {
    if (other.owner === row.owner) return false;
    const otherRemaining = remaining.get(other.owner)?.length || 0;
    return other.wins + otherRemaining >= row.wins;
  }).length;

  if (teamsThatCanCatch < byeSlots) {
    return { key: 'clinched-bye', label: 'Clinched bye', tone: 'clinched' };
  }
  if (teamsThatCanCatch < playoffSlots) {
    return { key: 'clinched-playoff', label: 'Clinched playoff', tone: 'clinched' };
  }
  if (row.rank <= playoffSlots) {
    return { key: row.rank <= byeSlots ? 'in-control-bye' : 'in-control', label: 'In control', tone: 'control' };
  }
  if (Math.abs(row.rank - playoffSlots) <= 1) {
    return { key: 'bubble', label: 'Bubble', tone: 'bubble' };
  }
  return { key: 'needs-help', label: 'Needs help', tone: 'help' };
}

function gamesBackValue(row, lineRow) {
  if (!row || !lineRow) return null;
  return ((lineRow.wins - row.wins) + (row.losses - lineRow.losses)) / 2;
}

function cutlineGap(row, standings, slot) {
  if (!row || !slot || !standings.length) return null;
  if (row.rank <= slot) {
    const firstOut = standings[slot] || null;
    return firstOut ? -gamesBackValue(firstOut, row) : 0;
  }
  return gamesBackValue(row, standings[slot - 1]);
}

function saundersLineSeed(rules = DEFAULT_PLAYOFF_RULES, teamCount = 0) {
  const count = positiveInt(teamCount, 0);
  const saundersSlots = Math.max(positiveInt(rules?.saunders_slots, DEFAULT_PLAYOFF_RULES.saunders_slots), 0);
  if (!count || !saundersSlots) return null;
  return Math.max(1, count - Math.min(saundersSlots, count) + 1);
}

function ownerGoalLabel(row, rules = DEFAULT_PLAYOFF_RULES, teamCount = 0) {
  if (!row) return 'No data';
  const lineSeed = saundersLineSeed(rules, teamCount);
  if (row.status?.key === 'clinched-bye') return 'Bye locked';
  if (row.status?.key === 'clinched-playoff') return 'Bye race';
  if (row.status?.key === 'eliminated') return lineSeed && row.currentSeed >= lineSeed ? 'Saunders danger' : 'Placement';
  if (row.currentSeed <= rules.bye_slots) return 'Bye race';
  if (row.currentSeed <= rules.playoff_slots) return 'Playoff line';
  if (lineSeed && row.currentSeed >= lineSeed) return 'Saunders danger';
  return 'Playoff chase';
}

function saundersSummary(row, rules = DEFAULT_PLAYOFF_RULES, teamCount = 0) {
  const lineSeed = saundersLineSeed(rules, teamCount);
  if (!row || !lineSeed) return '';
  if (row.currentSeed >= lineSeed) {
    const safeSeed = Math.max(1, lineSeed - 1);
    return `In Saunders danger; climb to seed ${safeSeed} or better to clear the boundary.`;
  }
  if (lineSeed === 1) return 'Every seed is inside the Saunders boundary.';
  return `Above Saunders danger; boundary starts at seed ${lineSeed}.`;
}

function pointsForRanks(standings = []) {
  return new Map(standings
    .slice()
    .sort((a, b) => b.pointsFor - a.pointsFor || a.owner.localeCompare(b.owner))
    .map((row, index) => [row.owner, index + 1]));
}

function buildPlayoffPicture({
  currentStandings = [],
  projectedStandings = [],
  rules = DEFAULT_PLAYOFF_RULES,
  remaining = new Map(),
} = {}) {
  const projectedByOwner = new Map(projectedStandings.map(row => [row.owner, row]));
  const pfRanks = pointsForRanks(currentStandings);
  return currentStandings.map(row => {
    const projected = projectedByOwner.get(row.owner);
    const status = classifyOwnerStatus({ row, standings: currentStandings, rules, remaining });
    return {
      ...row,
      status,
      currentSeed: row.rank,
      projectedSeed: projected?.projectedRank || projected?.rank || row.rank,
      projectedRecord: projected?.projectedRecord || projected?.record || row.record,
      projectedPointsFor: projected?.projectedPointsFor ?? projected?.pointsFor ?? row.pointsFor,
      seedChange: (row.rank || 0) - (projected?.projectedRank || projected?.rank || row.rank || 0),
      pointsForRank: pfRanks.get(row.owner) || null,
      playoffGap: cutlineGap(row, currentStandings, rules.playoff_slots),
      byeGap: cutlineGap(row, currentStandings, rules.bye_slots),
      saundersGap: cutlineGap(row, currentStandings, (saundersLineSeed(rules, currentStandings.length) || 1) - 1),
      remainingGames: remaining.get(row.owner)?.length || 0,
    };
  });
}

function scenarioRank({ owner, outcome, forcedOutcomes = [], leagueGames, seasonSummaries, currentSeason, season, week, rules }) {
  const standings = buildScenarioStandings({
    leagueGames,
    seasonSummaries,
    currentSeason,
    season,
    week,
    rules,
    owner,
    outcome,
    forcedOutcomes,
    includeLiveLeaders: true,
  });
  return standings.find(row => row.owner === owner) || null;
}

function ownerMatchupForWeek(owner, opts = {}) {
  return gamesForSeasonWeek(opts.leagueGames, opts.season, opts.week, opts.currentSeason)
    .filter(isRegularGame)
    .find(game => sidesForTeam(game, owner)) || null;
}

function resultWord(game, owner) {
  const side = sidesForTeam(game, owner);
  if (!side) return 'no result';
  if (side.result === 'W') return 'win';
  if (side.result === 'L') return 'loss';
  return 'tie';
}

function helpTargetsForOwner(row, standings, rules) {
  if (!row || row.rank <= rules.playoff_slots) return [];
  return standings
    .filter(item => item.rank <= rules.playoff_slots && item.rank >= Math.max(1, rules.playoff_slots - 2))
    .map(item => item.owner);
}

function sentenceStart(text) {
  return text ? `${text.charAt(0).toUpperCase()}${text.slice(1)}` : '';
}

function outcomePhrase(game, owner, outcome = 'win') {
  const side = sidesForTeam(game, owner);
  if (!side) return '';
  return outcome === 'loss'
    ? `${owner} loses to ${side.opp}`
    : `${owner} beats ${side.opp}`;
}

function ownerHasFutureGames(owner, opts = {}) {
  const selectedWeek = numeric(opts.week);
  return remainingScheduleForOwner({ ...opts, owner })
    .some(game => {
      const gameWeek = numeric(weekForGame(game));
      return Number.isFinite(selectedWeek) && Number.isFinite(gameWeek) ? gameWeek > selectedWeek : false;
    });
}

function exactPathToSlot({
  row,
  matchup,
  currentWeekMatchups = [],
  currentStandings = [],
  targetSlot,
  targetLabel,
  leagueGames = [],
  seasonSummaries = [],
  currentSeason = null,
  season,
  week,
  rules,
} = {}) {
  if (!row || !matchup || isCompletedGame(matchup) || !targetSlot) return null;
  const ownerWinPhrase = outcomePhrase(matchup, row.owner, 'win');
  if (!ownerWinPhrase) return null;
  const hasFuture = ownerHasFutureGames(row.owner, { leagueGames, currentSeason, season, rules, week });
  const verb = hasFuture ? `moves into ${targetLabel}` : `clinches ${targetLabel}`;
  const ownerWinForce = { owner: row.owner, outcome: 'win' };
  const ownerWinRow = scenarioRank({
    owner: row.owner,
    forcedOutcomes: [ownerWinForce],
    leagueGames,
    seasonSummaries,
    currentSeason,
    season,
    week,
    rules,
  });
  if (ownerWinRow && ownerWinRow.rank <= targetSlot) {
    return `${sentenceStart(verb)} if ${ownerWinPhrase}.`;
  }

  const standingsByOwner = new Map(currentStandings.map(item => [item.owner, item]));
  const candidateLosses = currentWeekMatchups
    .filter(game => !isCompletedGame(game) && !sidesForTeam(game, row.owner))
    .flatMap(game => [game.teamA, game.teamB].map(owner => ({ game, owner, standing: standingsByOwner.get(owner) })))
    .filter(candidate => candidate.standing)
    .sort((a, b) => (a.standing.rank || 99) - (b.standing.rank || 99) || a.owner.localeCompare(b.owner));

  for (const candidate of candidateLosses) {
    const lossPhrase = outcomePhrase(candidate.game, candidate.owner, 'loss');
    if (!lossPhrase) continue;
    const helpedRow = scenarioRank({
      owner: row.owner,
      forcedOutcomes: [ownerWinForce, { owner: candidate.owner, outcome: 'loss' }],
      leagueGames,
      seasonSummaries,
      currentSeason,
      season,
      week,
      rules,
    });
    if (helpedRow && helpedRow.rank <= targetSlot) {
      return `${sentenceStart(verb)} if ${ownerWinPhrase} and ${lossPhrase}.`;
    }
  }
  return null;
}

function buildOwnerWeekNeeds({
  leagueGames = [],
  seasonSummaries = [],
  currentSeason = null,
  season = latestLeagueSeason(leagueGames, seasonSummaries, currentSeason),
  week = null,
  rules = null,
  playoffPicture = null,
  selectedOwner = '',
} = {}) {
  const resolvedRules = rules || resolveCurrentSeasonRules(currentSeason);
  const currentStandings = buildScenarioStandings({ leagueGames, seasonSummaries, currentSeason, season, rules: resolvedRules });
  const remaining = remainingByOwner(currentStandings, { leagueGames, currentSeason, season, rules: resolvedRules });
  const pictureRows = playoffPicture || buildPlayoffPicture({
    currentStandings,
    projectedStandings: buildProjectedStandings({ leagueGames, seasonSummaries, currentSeason, season, rules: resolvedRules }),
    rules: resolvedRules,
    remaining,
  });
  const currentWeekMatchups = Number.isFinite(numeric(week))
    ? gamesForSeasonWeek(leagueGames, season, week, currentSeason).filter(isRegularGame)
    : [];
  const teamCount = pictureRows.length || currentStandings.length;
  const saundersSeed = saundersLineSeed(resolvedRules, teamCount);

  return pictureRows.map(row => {
    const matchup = ownerMatchupForWeek(row.owner, { leagueGames, currentSeason, season, week });
    const side = matchup ? sidesForTeam(matchup, row.owner) : null;
    const opponent = side?.opp || null;
    const winRow = matchup && !isCompletedGame(matchup)
      ? scenarioRank({ owner: row.owner, outcome: 'win', leagueGames, seasonSummaries, currentSeason, season, week, rules: resolvedRules })
      : null;
    const lossRow = matchup && !isCompletedGame(matchup)
      ? scenarioRank({ owner: row.owner, outcome: 'loss', leagueGames, seasonSummaries, currentSeason, season, week, rules: resolvedRules })
      : null;
    const helpTargets = helpTargetsForOwner(row, currentStandings, resolvedRules);
    const goalLabel = ownerGoalLabel(row, resolvedRules, teamCount);
    const playoffPath = exactPathToSlot({
      row,
      matchup,
      currentWeekMatchups,
      currentStandings,
      targetSlot: resolvedRules.playoff_slots,
      targetLabel: 'a playoff spot',
      leagueGames,
      seasonSummaries,
      currentSeason,
      season,
      week,
      rules: resolvedRules,
    });
    const byePath = exactPathToSlot({
      row,
      matchup,
      currentWeekMatchups,
      currentStandings,
      targetSlot: resolvedRules.bye_slots,
      targetLabel: 'a bye',
      leagueGames,
      seasonSummaries,
      currentSeason,
      season,
      week,
      rules: resolvedRules,
    });
    const saundersPath = saundersSeed && saundersSeed > 1
      ? exactPathToSlot({
          row,
          matchup,
          currentWeekMatchups,
          currentStandings,
          targetSlot: saundersSeed - 1,
          targetLabel: 'Saunders safety',
          leagueGames,
          seasonSummaries,
          currentSeason,
          season,
          week,
          rules: resolvedRules,
        })
      : null;
    const saundersNote = saundersSummary(row, resolvedRules, teamCount);
    let mainNeed = '';
    let helpNeeded = '';
    let pathSummary = '';
    let riskSummary = '';

    if (row.status.key === 'clinched-bye') {
      mainNeed = 'Already clinched a bye.';
      helpNeeded = 'No outside help needed.';
      pathSummary = 'Playing for weekly scoring and playoff form.';
      riskSummary = 'Seeding risk is already handled.';
    } else if (row.status.key === 'clinched-playoff') {
      mainNeed = 'Already clinched a playoff spot.';
      helpNeeded = byePath || 'Help only matters for bye positioning.';
      pathSummary = opponent ? `A win over ${opponent} keeps bye pressure on.` : 'A win keeps bye pressure on.';
      riskSummary = 'A loss can affect seed, not playoff access.';
    } else if (row.status.key === 'eliminated') {
      mainNeed = 'Eliminated from the playoff race.';
      helpNeeded = 'No playoff help remains.';
      pathSummary = 'Focus is Saunders positioning and final placement.';
      riskSummary = saundersNote || 'Losses still affect the consolation bracket path.';
    } else if (!matchup) {
      mainNeed = `No regular-season matchup found for Week ${week || '-'}.`;
      helpNeeded = helpTargets.length ? `${helpTargets.join(', ')} slipping helps the cutline.` : 'No clear outside help target.';
      pathSummary = `Current seed ${row.currentSeed}.`;
      riskSummary = saundersNote || 'Path depends on remaining scheduled games.';
    } else if (isCompletedGame(matchup)) {
      mainNeed = `Week ${week || '-'} is final: ${resultWord(matchup, row.owner)} against ${opponent}.`;
      helpNeeded = helpTargets.length ? `${helpTargets.join(', ')} results still shape the cutline.` : 'No urgent outside help from this week.';
      pathSummary = `Current seed ${row.currentSeed} with ${row.remainingGames} regular-season game${row.remainingGames === 1 ? '' : 's'} left.`;
      riskSummary = saundersNote || (row.currentSeed <= resolvedRules.playoff_slots ? 'Stay above the playoff line.' : 'Needs future wins and help to climb above the line.');
    } else {
      const winSeed = winRow?.rank || row.currentSeed;
      const lossSeed = lossRow?.rank || row.currentSeed;
      if (row.currentSeed <= resolvedRules.playoff_slots) {
        mainNeed = byePath || `Win and protect seed ${row.currentSeed}.`;
        helpNeeded = lossSeed > resolvedRules.playoff_slots
          ? 'A loss can drop this path below the playoff line.'
          : 'Outside help mostly improves seeding.';
      } else {
        mainNeed = playoffPath || (winSeed <= resolvedRules.playoff_slots
          ? `Win and move into the playoff picture if scores hold.`
          : `Win to keep pressure on the playoff line.`);
        helpNeeded = helpTargets.length
          ? `Needs help from ${helpTargets.join(', ')}.`
          : 'Needs teams above the cutline to slip.';
      }
      pathSummary = saundersPath && goalLabel === 'Saunders danger'
        ? saundersPath
        : `Against ${opponent}: win projects seed ${winSeed}, loss projects seed ${lossSeed}.`;
      riskSummary = saundersNote || (lossSeed > row.currentSeed
        ? `A loss projects a drop to seed ${lossSeed}.`
        : `A loss leaves the path at seed ${lossSeed}.`);
    }

    return {
      owner: row.owner,
      currentSeed: row.currentSeed,
      projectedSeed: row.projectedSeed,
      record: row.record,
      status: row.status,
      opponent,
      matchup,
      goalLabel,
      mainNeed,
      helpNeeded,
      pathSummary,
      riskSummary,
      saundersSummary: saundersNote,
      winSeed: winRow?.rank || null,
      lossSeed: lossRow?.rank || null,
      isSelected: selectedOwner === row.owner,
    };
  }).sort((a, b) => {
    if (a.isSelected !== b.isSelected) return a.isSelected ? -1 : 1;
    return a.currentSeed - b.currentSeed || a.owner.localeCompare(b.owner);
  });
}

function buildLiveMovement({
  leagueGames = [],
  seasonSummaries = [],
  currentSeason = null,
  season = latestLeagueSeason(leagueGames, seasonSummaries, currentSeason),
  week = null,
  rules = null,
  projectedStandings = null,
} = {}) {
  const resolvedRules = rules || resolveCurrentSeasonRules(currentSeason);
  const selectedWeek = numeric(week);
  const regularGames = regularSeasonGamesFor({ leagueGames, currentSeason, season, rules: resolvedRules });
  const baselineGames = Number.isFinite(selectedWeek)
    ? regularGames.filter(game => isCompletedGame(game) && (numeric(weekForGame(game)) || 0) < selectedWeek)
    : completedRegularSeasonGames({ leagueGames, currentSeason, season, rules: resolvedRules });
  const baselineStandings = standingsFromGames({ games: baselineGames, leagueGames, seasonSummaries, currentSeason, season });
  const projected = projectedStandings || buildProjectedStandings({
    leagueGames,
    seasonSummaries,
    currentSeason,
    season,
    rules: resolvedRules,
    projectionMode: 'ifScoresHold',
  });
  const baselineByOwner = new Map(baselineStandings.map(row => [row.owner, row]));
  const baselinePfRanks = pointsForRanks(baselineStandings);
  const projectedPfRanks = pointsForRanks(projected);
  return projected.map(row => {
    const baseline = baselineByOwner.get(row.owner);
    const previousSeed = baseline?.rank || row.currentRank || row.projectedRank;
    const currentSeed = row.currentRank || row.projectedRank;
    const projectedSeed = row.projectedRank;
    return {
      owner: row.owner,
      previousSeed,
      currentSeed,
      projectedSeed,
      seedChange: previousSeed - projectedSeed,
      currentWeekScoringRank: projectedPfRanks.get(row.owner) || null,
      pointsForRankChange: (baselinePfRanks.get(row.owner) || projectedPfRanks.get(row.owner) || 0) - (projectedPfRanks.get(row.owner) || 0),
      projectedRecord: row.projectedRecord,
    };
  }).sort((a, b) => Math.abs(b.seedChange) - Math.abs(a.seedChange) || a.projectedSeed - b.projectedSeed || a.owner.localeCompare(b.owner));
}

function topLiveScore(games = []) {
  return games
    .flatMap(game => [
      { owner: game.teamA, score: numeric(game.scoreA), game },
      { owner: game.teamB, score: numeric(game.scoreB), game },
    ])
    .filter(row => Number.isFinite(row.score))
    .sort((a, b) => b.score - a.score || a.owner.localeCompare(b.owner))[0] || null;
}

function closestLiveGame(games = []) {
  return games
    .filter(hasScore)
    .map(game => ({ game, margin: Math.abs(Number(game.scoreA) - Number(game.scoreB)) }))
    .sort((a, b) => a.margin - b.margin || String(a.game.teamA).localeCompare(String(b.game.teamA)))[0] || null;
}

function matchupKey(game) {
  return [numeric(game?.week) || numeric(weekForGame(game)) || '', game?.teamA || '', game?.teamB || ''].join('|');
}

function impactLabelForMatchup(game, pictureByOwner, rules) {
  const rows = [pictureByOwner.get(game.teamA), pictureByOwner.get(game.teamB)].filter(Boolean);
  if (!rows.length) return 'Seeding only';
  const lineSeed = saundersLineSeed(rules, pictureByOwner.size);
  const hasBubble = rows.some(row => Math.abs(row.currentSeed - rules.playoff_slots) <= 1);
  const hasSaundersDanger = lineSeed && rows.some(row => row.currentSeed >= lineSeed || row.projectedSeed >= lineSeed);
  if (rows.some(row => row.currentSeed <= rules.bye_slots + 1)) return 'Bye race';
  if (hasBubble && hasSaundersDanger) return 'Bubble / Saunders danger';
  if (hasBubble) return 'Bubble swing';
  if (hasSaundersDanger) return 'Saunders danger';
  if (rows.some(row => row.status.key === 'eliminated')) return 'Seeding only';
  if (rows.some(row => row.currentSeed > rules.playoff_slots)) return 'Playoff chase';
  return 'Seeding only';
}

function buildMatchupImpacts({ matchups = [], playoffPicture = [], projectedStandings = [], rules = DEFAULT_PLAYOFF_RULES } = {}) {
  const pictureByOwner = new Map(playoffPicture.map(row => [row.owner, row]));
  const projectedByOwner = new Map(projectedStandings.map(row => [row.owner, row]));
  return new Map(matchups.map(game => {
    const projectedA = projectedByOwner.get(game.teamA);
    const projectedB = projectedByOwner.get(game.teamB);
    const leader = hasScore(game)
      ? Number(game.scoreA) === Number(game.scoreB) ? 'Tie' : Number(game.scoreA) > Number(game.scoreB) ? game.teamA : game.teamB
      : null;
    return [matchupKey(game), {
      key: matchupKey(game),
      label: impactLabelForMatchup(game, pictureByOwner, rules),
      leader,
      teamASeed: pictureByOwner.get(game.teamA)?.currentSeed || null,
      teamBSeed: pictureByOwner.get(game.teamB)?.currentSeed || null,
      teamAProjectedSeed: projectedA?.projectedRank || null,
      teamBProjectedSeed: projectedB?.projectedRank || null,
      teamASeedChange: projectedA?.seedChange || 0,
      teamBSeedChange: projectedB?.seedChange || 0,
    }];
  }));
}

function buildCommandCenterModel({
  leagueGames = [],
  seasonSummaries = [],
  currentSeason = null,
  season = latestLeagueSeason(leagueGames, seasonSummaries, currentSeason),
  week = null,
  selectedOwner = '',
  selectedView = 'command',
  projectionMode = 'ifScoresHold',
} = {}) {
  const currentStandings = buildScenarioStandings({ leagueGames, seasonSummaries, currentSeason, season });
  const owners = currentStandings.map(row => row.owner);
  const owner = owners.includes(selectedOwner) ? selectedOwner : '';
  const rules = resolveCurrentSeasonRules(currentSeason, owners.length);
  const current = buildScenarioStandings({ leagueGames, seasonSummaries, currentSeason, season, rules });
  const remaining = remainingByOwner(current, { leagueGames, currentSeason, season, rules });
  const projectedStandings = buildProjectedStandings({
    leagueGames,
    seasonSummaries,
    currentSeason,
    season,
    rules,
    projectionMode,
  });
  const playoffPicture = buildPlayoffPicture({
    currentStandings: current,
    projectedStandings,
    rules,
    remaining,
  });
  const ownerNeeds = buildOwnerWeekNeeds({
    leagueGames,
    seasonSummaries,
    currentSeason,
    season,
    week,
    rules,
    playoffPicture,
    selectedOwner: owner,
  });
  const liveMovement = buildLiveMovement({
    leagueGames,
    seasonSummaries,
    currentSeason,
    season,
    week,
    rules,
    projectedStandings,
  });
  const regularGames = regularSeasonGamesFor({ leagueGames, currentSeason, season, rules });
  const liveGames = liveRegularSeasonGames({ leagueGames, currentSeason, season, rules });
  const selectedWeekMatchups = gamesForSeasonWeek(leagueGames, season, week, currentSeason).filter(isRegularGame);
  const matchupImpacts = buildMatchupImpacts({
    matchups: selectedWeekMatchups,
    playoffPicture,
    projectedStandings,
    rules,
  });
  const clinched = playoffPicture.filter(row => row.status.key === 'clinched-bye' || row.status.key === 'clinched-playoff');
  const eliminated = playoffPicture.filter(row => row.status.key === 'eliminated');
  const biggestMover = liveMovement.find(row => row.seedChange !== 0) || null;
  const generatedAt = currentSeason && Number(currentSeason.season) === Number(season) ? currentSeason.generated_at || null : null;
  const updateContext = currentSeason && Number(currentSeason.season) === Number(season)
    ? currentSeason.update_context || {}
    : {};
  const sourceMode = currentSeason && Number(currentSeason.season) === Number(season)
    ? currentSeason.source || 'current-season asset'
    : 'historical JSON fallback';
  const containsLiveScores = Boolean(updateContext.contains_live_scores);
  const containsProjectedScores = Boolean(updateContext.contains_projected_scores);
  const modelLabel = 'Deterministic path model';

  return {
    season,
    week,
    selectedOwner: owner,
    selectedView: normalizeCurrentView(selectedView),
    selectedProjectionMode: normalizeProjectionMode(projectionMode),
    ownerOptions: owners,
    rules,
    modelLabel,
    generatedAt,
    methodology: {
      generatedAt,
      sourceMode,
      updateMode: updateContext.mode || 'unknown',
      cutoffDate: updateContext.cutoff_date || null,
      containsLiveScores,
      containsProjectedScores,
      liveScoreAvailability: containsLiveScores || liveGames.length > 0 ? 'Live scores available' : 'No live scores in asset',
      projectedScoreAvailability: containsProjectedScores ? 'Projected scores available' : 'No projected scores in asset',
      modelType: modelLabel,
    },
    playoffPicture,
    ownerNeeds,
    liveMovement,
    projectedStandings,
    matchupImpacts,
    summary: {
      playoffSpots: rules.playoff_slots,
      aliveCount: playoffPicture.length - eliminated.length,
      clinchedCount: clinched.length,
      eliminatedCount: eliminated.length,
      liveGameCount: liveGames.length,
      scheduledGameCount: scheduledRegularSeasonGames({ leagueGames, currentSeason, season, rules }).length,
      completedGameCount: completedRegularSeasonGames({ leagueGames, currentSeason, season, rules }).length,
      regularGameCount: regularGames.length,
      biggestMover,
      highestLiveScore: topLiveScore(liveGames.length ? liveGames : selectedWeekMatchups),
      closestLiveMatchup: closestLiveGame(liveGames.length ? liveGames : selectedWeekMatchups),
      saundersLineSeed: saundersLineSeed(rules, playoffPicture.length),
      saundersSlots: rules.saunders_slots,
    },
  };
}

export {
  CURRENT_PROJECTION_MODES,
  CURRENT_VIEW_MODES,
  DEFAULT_PLAYOFF_RULES,
  buildCommandCenterModel,
  buildLiveMovement,
  buildOwnerWeekNeeds,
  buildPlayoffPicture,
  buildProjectedStandings,
  buildScenarioStandings,
  classifyOwnerStatus,
  completedRegularSeasonGames,
  liveRegularSeasonGames,
  matchupKey,
  normalizeCurrentView,
  normalizeProjectionMode,
  regularSeasonGamesFor,
  remainingScheduleForOwner,
  resolveCurrentSeasonRules,
  scheduledRegularSeasonGames,
};
