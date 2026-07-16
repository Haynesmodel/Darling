import { isRegularGame, sidesForTeam } from './core-helpers.js';
import {
  buildScenarioStandings,
  regularSeasonGamesFor,
  resolveCurrentSeasonRules,
  saundersLineSeed,
  sortAndRankStandings,
} from './current-season-command-data.js';
import { isCompletedGame, weekForGame } from './current-season-data.js';
import { gaussianSample, seededRng } from './gauntlet-simulator.js';

const DEFAULT_SIMULATIONS = 10000;
const MODEL_VERSION = 'team-score-monte-carlo-v1';
const ODDS_CACHE = new Map();

function numeric(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function standardDeviation(values, average = mean(values)) {
  if (values.length < 2) return 0;
  return Math.sqrt(values.reduce((sum, value) => sum + ((value - average) ** 2), 0) / values.length);
}

function quantile(values, probability) {
  const sorted = values.filter(Number.isFinite).slice().sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

function scoreForOwner(game, owner) {
  if (game?.teamA === owner) return numeric(game.scoreA);
  if (game?.teamB === owner) return numeric(game.scoreB);
  return null;
}

function completedScoresByOwner(games) {
  const scores = new Map();
  for (const game of games.filter(isCompletedGame)) {
    for (const owner of [game.teamA, game.teamB]) {
      const score = scoreForOwner(game, owner);
      if (!Number.isFinite(score)) continue;
      scores.set(owner, [...(scores.get(owner) || []), score]);
    }
  }
  return scores;
}

function historicalScoresByOwner(derivedStats, season) {
  const scores = new Map();
  for (const teamSeason of derivedStats?.team_seasons || []) {
    if (numeric(teamSeason.season) >= numeric(season, Infinity)) continue;
    const ownerScores = Array.isArray(teamSeason.scores)
      ? teamSeason.scores.map(Number).filter(Number.isFinite)
      : [];
    if (!ownerScores.length) continue;
    scores.set(teamSeason.owner, [
      ...(scores.get(teamSeason.owner) || []),
      ...ownerScores.map(score => ({
        score,
        weight: 1 / Math.max(1, numeric(season) - numeric(teamSeason.season)),
      })),
    ]);
  }
  return scores;
}

function weightedStats(events) {
  if (!events.length) return { mean: 0, standardDeviation: 0, sample: 0 };
  const totalWeight = events.reduce((sum, event) => sum + event.weight, 0);
  const average = events.reduce((sum, event) => sum + event.score * event.weight, 0) / totalWeight;
  const variance = events.reduce((sum, event) => sum + event.weight * ((event.score - average) ** 2), 0) / totalWeight;
  return { mean: average, standardDeviation: Math.sqrt(variance), sample: events.length };
}

function buildTeamScoringDistributions({
  leagueGames = [],
  currentSeason = null,
  derivedStats = null,
  season,
  rules,
} = {}) {
  const regularGames = regularSeasonGamesFor({ leagueGames, currentSeason, season, rules });
  const currentScores = completedScoresByOwner(regularGames);
  const historicalScores = historicalScoresByOwner(derivedStats, season);
  const standings = buildScenarioStandings({ leagueGames, currentSeason, season, rules });
  const owners = standings.map(row => row.owner);
  const allScores = [
    ...[...currentScores.values()].flat(),
    ...(derivedStats?.team_seasons || []).flatMap(row => row.scores || []),
  ].map(Number).filter(Number.isFinite);
  const leagueMean = mean(allScores) || 100;
  const leagueStdev = standardDeviation(allScores, leagueMean) || 20;
  const leagueFloor = allScores.length ? quantile(allScores, 0.01) : 40;
  const leagueCeiling = allScores.length ? quantile(allScores, 0.99) : 220;

  return owners.map(owner => {
    const current = currentScores.get(owner) || [];
    const historical = historicalScores.get(owner) || [];
    const currentMean = current.length ? mean(current) : leagueMean;
    const currentStdev = current.length > 1 ? standardDeviation(current, currentMean) : leagueStdev;
    const historicalStats = weightedStats(historical);
    const progress = clamp(current.length / Math.max(1, rules.regular_season_max_week), 0, 1);
    const currentWeight = current.length ? 0.4 + 0.45 * progress : 0;
    const historicalWeight = historical.length ? Math.min(0.5, 1 - currentWeight) : 0;
    const leagueWeight = Math.max(0, 1 - currentWeight - historicalWeight);
    const resolvedHistoricalMean = historical.length ? historicalStats.mean : leagueMean;
    const resolvedHistoricalStdev = historical.length ? historicalStats.standardDeviation || leagueStdev : leagueStdev;
    const distributionMean = currentMean * currentWeight
      + resolvedHistoricalMean * historicalWeight
      + leagueMean * leagueWeight;
    const distributionStdev = Math.max(
      8,
      currentStdev * currentWeight
        + resolvedHistoricalStdev * historicalWeight
        + leagueStdev * leagueWeight,
    );
    return {
      owner,
      currentSample: current.length,
      historicalSample: historical.length,
      currentWeight,
      historicalWeight,
      leagueWeight,
      mean: distributionMean,
      standardDeviation: distributionStdev,
      floor: Math.max(0, leagueFloor),
      ceiling: Math.max(leagueFloor + 1, leagueCeiling),
    };
  });
}

function cloneStanding(row) {
  return {
    ...row,
    wins: numeric(row.wins, 0),
    losses: numeric(row.losses, 0),
    ties: numeric(row.ties, 0),
    games: numeric(row.games, 0),
    pointsFor: numeric(row.pointsFor, 0),
    pointsAgainst: numeric(row.pointsAgainst, 0),
    differential: numeric(row.differential, 0),
    pct: numeric(row.pct, 0),
  };
}

function applySimulatedGame(rowsByOwner, game, scoreA, scoreB) {
  const a = rowsByOwner.get(game.teamA);
  const b = rowsByOwner.get(game.teamB);
  if (!a || !b) return;
  a.games += 1;
  b.games += 1;
  a.pointsFor += scoreA;
  a.pointsAgainst += scoreB;
  b.pointsFor += scoreB;
  b.pointsAgainst += scoreA;
  if (scoreA > scoreB) {
    a.wins += 1;
    b.losses += 1;
  } else if (scoreB > scoreA) {
    b.wins += 1;
    a.losses += 1;
  } else {
    a.ties += 1;
    b.ties += 1;
  }
}

function finalizeRows(rowsByOwner) {
  return [...rowsByOwner.values()].map(row => ({
    ...row,
    record: row.ties ? `${row.wins}-${row.losses}-${row.ties}` : `${row.wins}-${row.losses}`,
    pct: row.games ? (row.wins + 0.5 * row.ties) / row.games : 0,
    differential: row.pointsFor - row.pointsAgainst,
  }));
}

function drawScore(distribution, rng) {
  return clamp(
    gaussianSample(distribution.mean, distribution.standardDeviation, rng),
    distribution.floor,
    distribution.ceiling,
  );
}

function conditionForcedScores(game, forcedOutcome, sampledScoreA, sampledScoreB) {
  if (!forcedOutcome || !sidesForTeam(game, forcedOutcome.owner)) return null;
  if (Number.isFinite(numeric(forcedOutcome.week)) && numeric(weekForGame(game)) !== numeric(forcedOutcome.week)) return null;
  const ownerIsA = game.teamA === forcedOutcome.owner;
  const ownerWins = forcedOutcome.outcome === 'win';
  const aShouldWin = ownerIsA === ownerWins;
  const floorA = String(game.status).toLowerCase() === 'live' ? numeric(game.scoreA, 0) : 0;
  const floorB = String(game.status).toLowerCase() === 'live' ? numeric(game.scoreB, 0) : 0;
  let scoreA = Math.max(floorA, sampledScoreA);
  let scoreB = Math.max(floorB, sampledScoreB);

  if ((aShouldWin && scoreA > scoreB) || (!aShouldWin && scoreB > scoreA)) {
    return [scoreA, scoreB];
  }

  [scoreA, scoreB] = [scoreB, scoreA];
  scoreA = Math.max(floorA, scoreA);
  scoreB = Math.max(floorB, scoreB);
  if (aShouldWin && scoreA <= scoreB) scoreA = scoreB + 0.01;
  if (!aShouldWin && scoreB <= scoreA) scoreB = scoreA + 0.01;
  return [scoreA, scoreB];
}

function snapshotCacheKey(options) {
  return JSON.stringify({
    season: options.season,
    simulations: options.simulations,
    seed: options.seed,
    liveMode: options.liveMode,
    forcedOutcome: options.forcedOutcome,
    games: (options.currentSeason?.games || []).map(game => [
      game.week,
      game.teamA,
      game.teamB,
      game.status,
      game.scoreA,
      game.scoreB,
    ]),
  });
}

function simulateOddsSnapshot(options = {}) {
  const cacheKey = snapshotCacheKey(options);
  if (ODDS_CACHE.has(cacheKey)) return ODDS_CACHE.get(cacheKey);
  const simulations = Math.max(100, Math.min(50000, Math.floor(numeric(options.simulations, DEFAULT_SIMULATIONS))));
  const rules = options.rules || resolveCurrentSeasonRules(options.currentSeason);
  const distributions = options.distributions || buildTeamScoringDistributions({ ...options, rules });
  const distributionByOwner = new Map(distributions.map(row => [row.owner, row]));
  const regularGames = regularSeasonGamesFor({ ...options, rules });
  const unresolved = regularGames.filter(game => !isCompletedGame(game));
  const baseline = buildScenarioStandings({ ...options, rules });
  const owners = baseline.map(row => row.owner);
  const counts = new Map(owners.map(owner => [owner, {
    playoff: 0,
    bye: 0,
    saunders: 0,
    seeds: Array.from({ length: owners.length }, () => 0),
  }]));
  const rng = seededRng(options.seed);
  const saundersStart = saundersLineSeed(rules, owners.length);
  const liveScoresReliable = Boolean(options.currentSeason?.update_context?.contains_live_scores);

  if (!unresolved.length) {
    const rows = sortAndRankStandings(baseline, rules).map(row => ({
      owner: row.owner,
      playoffOdds: row.rank <= rules.playoff_slots ? 1 : 0,
      byeOdds: row.rank <= rules.bye_slots ? 1 : 0,
      saundersOdds: saundersStart && row.rank >= saundersStart ? 1 : 0,
      seedProbabilities: Object.fromEntries(
        owners.map((_, index) => [`${index + 1}`, index + 1 === row.rank ? 1 : 0]),
      ),
    }));
    const result = { rows, distributions, simulations };
    ODDS_CACHE.set(cacheKey, result);
    return result;
  }

  for (let simulation = 0; simulation < simulations; simulation += 1) {
    const rowsByOwner = new Map(baseline.map(row => [row.owner, cloneStanding(row)]));
    for (const game of unresolved) {
      let scoreA;
      let scoreB;
      if (
        options.liveMode === 'hold'
        && String(game.status).toLowerCase() === 'live'
        && Number.isFinite(numeric(game.scoreA))
        && Number.isFinite(numeric(game.scoreB))
      ) {
        scoreA = numeric(game.scoreA);
        scoreB = numeric(game.scoreB);
      } else {
        scoreA = drawScore(distributionByOwner.get(game.teamA), rng);
        scoreB = drawScore(distributionByOwner.get(game.teamB), rng);
        if (liveScoresReliable && String(game.status).toLowerCase() === 'live') {
          const currentA = numeric(game.scoreA);
          const currentB = numeric(game.scoreB);
          if (Number.isFinite(currentA)) scoreA = Math.max(currentA, scoreA * 0.7 + currentA * 0.3);
          if (Number.isFinite(currentB)) scoreB = Math.max(currentB, scoreB * 0.7 + currentB * 0.3);
        }
      }
      const forced = conditionForcedScores(game, options.forcedOutcome, scoreA, scoreB);
      if (forced) [scoreA, scoreB] = forced;
      if (scoreA === scoreB) scoreA += rng() < 0.5 ? 0.01 : -0.01;
      applySimulatedGame(rowsByOwner, game, scoreA, scoreB);
    }
    const ranked = sortAndRankStandings(finalizeRows(rowsByOwner), rules);
    for (const row of ranked) {
      const ownerCounts = counts.get(row.owner);
      const seed = row.rank;
      ownerCounts.seeds[seed - 1] += 1;
      if (seed <= rules.playoff_slots) ownerCounts.playoff += 1;
      if (seed <= rules.bye_slots) ownerCounts.bye += 1;
      if (saundersStart && seed >= saundersStart) ownerCounts.saunders += 1;
    }
  }

  const rows = baseline.map(row => {
    const ownerCounts = counts.get(row.owner);
    return {
      owner: row.owner,
      playoffOdds: ownerCounts.playoff / simulations,
      byeOdds: ownerCounts.bye / simulations,
      saundersOdds: ownerCounts.saunders / simulations,
      seedProbabilities: Object.fromEntries(
        ownerCounts.seeds.map((count, index) => [`${index + 1}`, count / simulations]),
      ),
    };
  });
  const result = { rows, distributions, simulations };
  ODDS_CACHE.set(cacheKey, result);
  if (ODDS_CACHE.size > 24) ODDS_CACHE.delete(ODDS_CACHE.keys().next().value);
  return result;
}

function seasonSnapshotBeforeWeek(currentSeason, week) {
  if (!currentSeason || !Number.isFinite(numeric(week))) return currentSeason;
  return {
    ...currentSeason,
    games: (currentSeason.games || []).map(game => (
      numeric(weekForGame(game)) < numeric(week)
        ? game
        : { ...game, status: 'scheduled', scoreA: null, scoreB: null }
    )),
  };
}

function seasonSnapshotThroughWeek(currentSeason, week) {
  if (!currentSeason || !Number.isFinite(numeric(week))) return currentSeason;
  return {
    ...currentSeason,
    current_week: numeric(week),
    games: (currentSeason.games || []).map(game => (
      numeric(weekForGame(game)) <= numeric(week)
        ? game
        : { ...game, status: 'scheduled', scoreA: null, scoreB: null }
    )),
  };
}

function matchupForOwner(currentSeason, owner, week) {
  if (!owner || !Number.isFinite(numeric(week))) return null;
  return (currentSeason?.games || [])
    .filter(isRegularGame)
    .find(game => numeric(weekForGame(game)) === numeric(week) && sidesForTeam(game, owner))
    || null;
}

function rowMap(rows) {
  return new Map(rows.map(row => [row.owner, row]));
}

function enforceStatuses(rows, playoffPicture) {
  const statusByOwner = new Map((playoffPicture || []).map(row => [row.owner, row.status?.key]));
  return rows.map(row => {
    const status = statusByOwner.get(row.owner);
    if (status === 'clinched-bye') return { ...row, playoffOdds: 1, byeOdds: 1 };
    if (status === 'clinched-playoff') return { ...row, playoffOdds: 1 };
    if (status === 'eliminated') return { ...row, playoffOdds: 0, byeOdds: 0 };
    return row;
  });
}

function buildCurrentSeasonOdds({
  leagueGames = [],
  currentSeason = null,
  derivedStats = null,
  season,
  week,
  dataVersion = 'unknown',
  selectedOwner = '',
  playoffPicture = [],
  simulations = DEFAULT_SIMULATIONS,
} = {}) {
  const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
  try {
    const rules = resolveCurrentSeasonRules(currentSeason, playoffPicture.length);
    const analysisSeason = seasonSnapshotThroughWeek(currentSeason, week);
    const scoreSignature = (analysisSeason?.games || []).map(game => `${game.week}:${game.scoreA}:${game.scoreB}:${game.status}`).join('|');
    const seed = `${dataVersion}|${season}|${week}|${MODEL_VERSION}|${scoreSignature}`;
    const distributions = buildTeamScoringDistributions({
      leagueGames,
      currentSeason: analysisSeason,
      derivedStats,
      season,
      rules,
    });
    const current = simulateOddsSnapshot({
      leagueGames,
      currentSeason: analysisSeason,
      derivedStats,
      season,
      rules,
      distributions,
      simulations,
      seed: `${seed}|current`,
      liveMode: 'score-aware',
    });
    const baselineSeason = seasonSnapshotBeforeWeek(analysisSeason, week);
    const baseline = simulateOddsSnapshot({
      leagueGames,
      currentSeason: baselineSeason,
      derivedStats,
      season,
      rules,
      simulations,
      seed: `${seed}|previous-week`,
      liveMode: 'pregame',
    });
    const hold = simulateOddsSnapshot({
      leagueGames,
      currentSeason: analysisSeason,
      derivedStats,
      season,
      rules,
      distributions,
      simulations,
      seed: `${seed}|scores-hold`,
      liveMode: 'hold',
    });
    const matchup = matchupForOwner(analysisSeason, selectedOwner, week);
    const selectedOwnerScenario = matchup && !isCompletedGame(matchup)
      ? {
          owner: selectedOwner,
          win: simulateOddsSnapshot({
            leagueGames,
            currentSeason: analysisSeason,
            derivedStats,
            season,
            rules,
            distributions,
            simulations,
            seed: `${seed}|${selectedOwner}|win`,
            liveMode: 'score-aware',
            forcedOutcome: { owner: selectedOwner, outcome: 'win', week },
          }).rows.find(row => row.owner === selectedOwner),
          loss: simulateOddsSnapshot({
            leagueGames,
            currentSeason: analysisSeason,
            derivedStats,
            season,
            rules,
            distributions,
            simulations,
            seed: `${seed}|${selectedOwner}|loss`,
            liveMode: 'score-aware',
            forcedOutcome: { owner: selectedOwner, outcome: 'loss', week },
          }).rows.find(row => row.owner === selectedOwner),
        }
      : null;
    const currentRows = enforceStatuses(current.rows, playoffPicture);
    const previousByOwner = rowMap(baseline.rows);
    const movement = currentRows.map(row => {
      const previous = previousByOwner.get(row.owner) || row;
      return {
        ...row,
        previousPlayoffOdds: previous.playoffOdds,
        previousByeOdds: previous.byeOdds,
        previousSaundersOdds: previous.saundersOdds,
        playoffChange: row.playoffOdds - previous.playoffOdds,
        byeChange: row.byeOdds - previous.byeOdds,
        saundersChange: row.saundersOdds - previous.saundersOdds,
      };
    });
    const endedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const hasReliableLiveScores = Boolean(currentSeason?.update_context?.contains_live_scores);
    return {
      status: currentRows.length ? 'ready' : 'unavailable',
      modelVersion: MODEL_VERSION,
      modelLabel: 'Deterministic team-score Monte Carlo',
      simulations: current.simulations,
      seed,
      liveMode: hasReliableLiveScores ? 'Score-aware; not lineup-projection-aware' : 'Pregame team-strength model',
      methodology: 'Completed current-season scoring is blended with recency-weighted owner history and a league prior. Remaining team scores are sampled deterministically and ranked with the configured standings tiebreakers.',
      durationMs: endedAt - startedAt,
      rows: currentRows,
      movement,
      ifScoresHold: enforceStatuses(hold.rows, playoffPicture),
      selectedOwnerScenario: selectedOwnerScenario?.win && selectedOwnerScenario?.loss
        ? selectedOwnerScenario
        : null,
      distributions,
    };
  } catch (error) {
    const endedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
    return {
      status: 'error',
      modelVersion: MODEL_VERSION,
      modelLabel: 'Deterministic team-score Monte Carlo',
      simulations,
      seed: '',
      liveMode: 'Unavailable',
      methodology: '',
      durationMs: endedAt - startedAt,
      rows: [],
      movement: [],
      ifScoresHold: [],
      selectedOwnerScenario: null,
      distributions: [],
      error: error.message || String(error),
    };
  }
}

export {
  DEFAULT_SIMULATIONS,
  MODEL_VERSION,
  buildCurrentSeasonOdds,
  buildTeamScoringDistributions,
  conditionForcedScores,
  simulateOddsSnapshot,
};
