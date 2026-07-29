const path = require('node:path');
const { canonicalJson, readJson } = require('./canonical-json.cjs');

const TRANSACTION_MAX_RETAINED_SEASONS = 12;
const TRANSACTION_MAX_SEASON_BYTES = 750000;
const TRANSACTION_MAX_ASSET_BYTES = 12 * 1024 * 1024;

function canonicalGameKey(game) {
  const teams = [game.teamA, game.teamB].sort((a, b) => a.localeCompare(b));
  return [game.season, game.week, teams[0], teams[1], game.type, game.round || ''].join('|');
}

function validateSemanticBundle(bundle, opts = {}) {
  const errors = [];
  const warnings = [];
  const root = opts.root || process.cwd();
  const exceptions = opts.exceptions || readJson(path.join(root, 'scripts/data/known-data-exceptions.json'));
  const usedExceptions = new Set();
  const exceptionIndex = new Map(exceptions.map((entry, index) => [`${entry.rule_id}|${entry.record_key}`, { entry, index }]));

  function report(ruleId, location, recordKey, message) {
    const exception = exceptionIndex.get(`${ruleId}|${recordKey}`);
    if (exception) {
      usedExceptions.add(exception.index);
      warnings.push(`WARN  [KNOWN_EXCEPTION] ${location}: ${ruleId} ${recordKey} (${exception.entry.reason})`);
      return;
    }
    errors.push(`ERROR [${ruleId}] ${location}: ${message}`);
  }

  const games = bundle.H2H || [];
  const summaries = bundle.SeasonSummary || [];
  const rivalries = bundle.Rivalries || [];
  const current = bundle.CurrentSeason || null;
  const transactionHistory = bundle.TransactionHistory || null;
  const currentOwners = new Set((current?.teams || []).map(team => team.owner));
  const summaryOwners = new Set(summaries.map(row => row.owner));
  const summaryKeys = new Set(summaries.map(row => `${row.season}|${row.owner}`));
  const seenGames = new Map();

  games.forEach((game, index) => {
    const location = `assets/H2H.json row ${index}`;
    const recordKey = canonicalGameKey(game);
    if (game.teamA === game.teamB) report('H2H_SAME_TEAM', location, recordKey, 'teamA and teamB must differ');
    if (seenGames.has(recordKey)) {
      report('H2H_DUPLICATE_GAME', location, recordKey, `duplicates row ${seenGames.get(recordKey)}`);
    } else {
      seenGames.set(recordKey, index);
    }
    for (const owner of [game.teamA, game.teamB]) {
      const documentedCurrentSeasonCase = current && game.season === current.season && currentOwners.has(owner);
      if (!summaryKeys.has(`${game.season}|${owner}`) && !documentedCurrentSeasonCase) {
        report('H2H_UNKNOWN_TEAM_SEASON', location, `${game.season}|${owner}`, `${owner} has no SeasonSummary row for ${game.season}`);
      }
    }
  });

  const summariesBySeason = new Map();
  const summarySeen = new Set();
  summaries.forEach((row, index) => {
    const key = `${row.season}|${row.owner}`;
    if (summarySeen.has(key)) report('SUMMARY_DUPLICATE_TEAM_SEASON', `assets/SeasonSummary.json row ${index}`, key, `duplicate owner-season ${key}`);
    summarySeen.add(key);
    if (!summariesBySeason.has(row.season)) summariesBySeason.set(row.season, []);
    summariesBySeason.get(row.season).push({ row, index });
  });

  for (const [season, entries] of summariesBySeason) {
    const rows = entries.map(entry => entry.row);
    const champions = rows.filter(row => row.champion);
    if (champions.length !== 1) report('SUMMARY_CHAMPION_COUNT', 'assets/SeasonSummary.json', `${season}`, `season ${season} has ${champions.length} champions; expected exactly one`);
    const saunders = rows.filter(row => row.saunders);
    if (saunders.length !== 1) report('SUMMARY_SAUNDERS_COUNT', 'assets/SeasonSummary.json', `${season}`, `season ${season} has ${saunders.length} Saunders winners; expected exactly one`);
    const finishes = rows.map(row => row.finish).sort((a, b) => a - b);
    const expectedFinishes = rows.map((_, index) => index + 1);
    if (finishes.some((finish, index) => finish !== expectedFinishes[index])) {
      report('SUMMARY_FINISH_RANGE', 'assets/SeasonSummary.json', `${season}`, `season ${season} final ranks must be unique 1-${rows.length}`);
    }
    const picks = rows.filter(row => Number.isFinite(row.draft_pick)).map(row => row.draft_pick).sort((a, b) => a - b);
    if (picks.length && (picks.length !== rows.length || picks.some((pick, index) => pick !== index + 1))) {
      report('SUMMARY_DRAFT_PICK_RANGE', 'assets/SeasonSummary.json', `${season}`, `draft picks must be absent for the whole season or unique 1-${rows.length}`);
    }
  }

  const aggregate = new Map();
  for (const game of games) {
    if (game.type !== 'Regular') continue;
    for (const side of [
      { owner: game.teamA, pf: game.scoreA, pa: game.scoreB },
      { owner: game.teamB, pf: game.scoreB, pa: game.scoreA },
    ]) {
      const key = `${game.season}|${side.owner}`;
      const row = aggregate.get(key) || { wins: 0, losses: 0, ties: 0, points_for: 0, points_against: 0 };
      row.points_for += side.pf;
      row.points_against += side.pa;
      if (side.pf > side.pa) row.wins += 1;
      else if (side.pf < side.pa) row.losses += 1;
      else row.ties += 1;
      aggregate.set(key, row);
    }
  }
  for (const row of summaries) {
    const key = `${row.season}|${row.owner}`;
    const calculated = aggregate.get(key);
    if (!calculated) {
      report('SUMMARY_NO_REGULAR_GAMES', 'assets/SeasonSummary.json', key, `${key} has no regular-season H2H games`);
      continue;
    }
    for (const field of ['wins', 'losses', 'ties']) {
      if (calculated[field] !== row[field]) report('SUMMARY_RECORD_MISMATCH', 'assets/SeasonSummary.json', key, `${key} ${field}=${row[field]}, recomputed=${calculated[field]}`);
    }
    for (const field of ['points_for', 'points_against']) {
      if (Math.abs(calculated[field] - row[field]) > 0.05) report('SUMMARY_POINTS_MISMATCH', 'assets/SeasonSummary.json', key, `${key} ${field}=${row[field]}, recomputed=${calculated[field]}`);
    }
  }

  const rivalrySlugs = new Set();
  const rivalryPairs = new Set();
  rivalries.forEach((rivalry, index) => {
    const location = `assets/Rivalries.json row ${index}`;
    if (rivalrySlugs.has(rivalry.slug)) report('RIVALRY_DUPLICATE_SLUG', location, rivalry.slug, `duplicate slug ${rivalry.slug}`);
    rivalrySlugs.add(rivalry.slug);
    for (const owner of rivalry.members) {
      if (!summaryOwners.has(owner)) report('RIVALRY_UNKNOWN_OWNER', location, `${rivalry.slug}|${owner}`, `unknown owner ${owner}`);
    }
    if (rivalry.type === 'pair') {
      if (rivalry.members.length !== 2) report('RIVALRY_PAIR_SIZE', location, rivalry.slug, 'pair rivalries must contain exactly two members');
      const pair = rivalry.members.slice().sort().join('|');
      if (rivalryPairs.has(pair)) report('RIVALRY_DUPLICATE_PAIR', location, pair, `duplicate or reversed pair ${pair}`);
      rivalryPairs.add(pair);
    }
  });

  if (current) {
    const ownerByRoster = new Map();
    currentOwners.clear();
    for (const team of current.teams) {
      if (ownerByRoster.has(team.roster_id)) report('CURRENT_DUPLICATE_ROSTER', 'assets/CurrentSeason.json teams', `${team.roster_id}`, `duplicate roster_id ${team.roster_id}`);
      if (currentOwners.has(team.owner)) report('CURRENT_DUPLICATE_OWNER', 'assets/CurrentSeason.json teams', team.owner, `duplicate owner ${team.owner}`);
      ownerByRoster.set(team.roster_id, team.owner);
      currentOwners.add(team.owner);
    }
    const matchupKeys = new Set();
    current.games.forEach((game, index) => {
      const location = `assets/CurrentSeason.json games row ${index}`;
      const key = `${game.week}|${game.matchup_id}`;
      if (game.season !== current.season) report('CURRENT_SEASON_MISMATCH', location, key, `game season ${game.season} differs from declared season ${current.season}`);
      if (game.teamA === game.teamB) report('CURRENT_SAME_TEAM', location, key, 'teamA and teamB must differ');
      if (matchupKeys.has(key)) report('CURRENT_DUPLICATE_MATCHUP', location, key, `duplicate matchup_id ${game.matchup_id} in week ${game.week}`);
      matchupKeys.add(key);
      if (ownerByRoster.get(game.rosterA) !== game.teamA || ownerByRoster.get(game.rosterB) !== game.teamB) {
        report('CURRENT_ROSTER_OWNER_MISMATCH', location, key, 'roster IDs do not resolve to the listed owners');
      }
      if (game.status === 'final' && (!Number.isFinite(game.scoreA) || !Number.isFinite(game.scoreB))) {
        report('CURRENT_FINAL_SCORE_MISSING', location, key, 'final games require both scores');
      }
      const historical = games.find(row => canonicalGameKey(row) === canonicalGameKey(game));
      if (historical && (historical.scoreA !== game.scoreA || historical.scoreB !== game.scoreB || historical.teamA !== game.teamA)) {
        const sameOrientation = historical.teamA === game.teamA;
        const scoresAgree = sameOrientation
          ? historical.scoreA === game.scoreA && historical.scoreB === game.scoreB
          : historical.scoreA === game.scoreB && historical.scoreB === game.scoreA;
        if (!scoresAgree) report('CURRENT_HISTORY_CONFLICT', location, canonicalGameKey(game), 'current-season game conflicts with promoted H2H history');
      }
    });
    const rules = current.playoff_rules;
    if (rules.playoff_slots > current.teams.length || rules.bye_slots > rules.playoff_slots || rules.saunders_slots > current.teams.length) {
      report('CURRENT_IMPOSSIBLE_PLAYOFF_RULES', 'assets/CurrentSeason.json playoff_rules', `${current.season}`, 'playoff rule counts are impossible for the current league size');
    }
    if (rules.regular_season_max_week !== current.regular_season_max_week) {
      report('CURRENT_RULE_WEEK_MISMATCH', 'assets/CurrentSeason.json playoff_rules', `${current.season}`, 'regular season week metadata disagrees');
    }
    const newestFinalDate = current.games.filter(game => game.status === 'final').map(game => game.date).sort().at(-1);
    if (newestFinalDate && current.update_context.cutoff_date < newestFinalDate) {
      report('CURRENT_STALE_UPDATE_CONTEXT', 'assets/CurrentSeason.json update_context', `${current.season}`, `cutoff date ${current.update_context.cutoff_date} predates finalized game ${newestFinalDate}`);
    }
  }

  if (transactionHistory) {
    const players = transactionHistory.players || [];
    const seasons = transactionHistory.seasons || [];
    const playerIds = new Set();
    const playersById = new Map();
    players.forEach((player, index) => {
      if (playerIds.has(player.id)) {
        report('TRANSACTION_DUPLICATE_PLAYER', `assets/TransactionHistory.json players row ${index}`, player.id, `duplicate player ${player.id}`);
      }
      playerIds.add(player.id);
      playersById.set(player.id, player);
    });
    const sortedPlayerIds = players.map(player => player.id).slice().sort((a, b) => a.localeCompare(b));
    if (players.some((player, index) => player.id !== sortedPlayerIds[index])) {
      report('TRANSACTION_PLAYER_ORDER', 'assets/TransactionHistory.json players', 'players', 'players must be sorted by ID');
    }
    const seasonValues = seasons.map(season => season.season);
    if (seasonValues.some((season, index) => index > 0 && season <= seasonValues[index - 1])) {
      report('TRANSACTION_SEASON_ORDER', 'assets/TransactionHistory.json seasons', 'seasons', 'seasons must be unique and ascending');
    }
    seasons.forEach((season, seasonIndex) => {
      const location = `assets/TransactionHistory.json seasons row ${seasonIndex}`;
      const rosterOwners = new Map();
      const owners = new Set();
      season.teams.forEach(team => {
        if (rosterOwners.has(team.roster_id)) {
          report('TRANSACTION_DUPLICATE_ROSTER', `${location} teams`, `${season.season}|${team.roster_id}`, `duplicate roster ${team.roster_id}`);
        }
        if (owners.has(team.owner)) {
          report('TRANSACTION_DUPLICATE_OWNER', `${location} teams`, `${season.season}|${team.owner}`, `duplicate owner ${team.owner}`);
        }
        rosterOwners.set(team.roster_id, team.owner);
        owners.add(team.owner);
      });
      const expectedTransactionRounds = Array.from({ length: season.max_week + 1 }, (_, week) => week);
      const expectedMatchupWeeks = Array.from({ length: season.max_week }, (_, index) => index + 1);
      if (canonicalJson(season.coverage.transaction_rounds) !== canonicalJson(expectedTransactionRounds)) {
        report('TRANSACTION_COVERAGE_ROUNDS', `${location} coverage`, `${season.season}|transaction_rounds`, `transaction rounds must cover exactly 0-${season.max_week}`);
      }
      if (canonicalJson(season.coverage.matchup_weeks) !== canonicalJson(expectedMatchupWeeks)) {
        report('TRANSACTION_COVERAGE_ROUNDS', `${location} coverage`, `${season.season}|matchup_weeks`, `matchup weeks must cover exactly 1-${season.max_week}`);
      }
      if (season.coverage.completed_week > season.max_week) {
        report('TRANSACTION_COMPLETED_WEEK', `${location} coverage`, `${season.season}`, `completed week ${season.coverage.completed_week} exceeds max week ${season.max_week}`);
      }
      if (season.draft.pick_count !== season.draft.picks.length) {
        report('TRANSACTION_DRAFT_RECONCILIATION', `${location} draft`, `${season.season}`, 'draft pick_count does not match picks length');
      }
      if (
        (season.draft.status === 'selected' && !season.draft.draft_id)
        || (season.draft.status === 'unavailable' && (
          season.draft.draft_id !== null
          || season.draft.pick_count !== 0
          || season.draft.picks.length !== 0
        ))
      ) {
        report('TRANSACTION_DRAFT_RECONCILIATION', `${location} draft`, `${season.season}|${season.draft.status}`, 'draft status, ID, and picks do not reconcile');
      }
      const referencedPlayers = new Set();
      season.draft.picks.forEach((pick, index) => {
        const pickLocation = `${location} draft.picks row ${index}`;
        referencedPlayers.add(pick.player_id);
        if (!playerIds.has(pick.player_id)) report('TRANSACTION_MISSING_PLAYER', pickLocation, `${season.season}|${pick.player_id}`, `missing player ${pick.player_id}`);
        if (!owners.has(pick.owner)) report('TRANSACTION_UNKNOWN_OWNER', pickLocation, `${season.season}|${pick.owner}`, `unknown draft owner ${pick.owner}`);
        if (rosterOwners.get(pick.roster_id) !== pick.owner) {
          report('TRANSACTION_ROSTER_OWNER_MISMATCH', pickLocation, `${season.season}|${pick.roster_id}`, 'draft roster does not resolve to the listed owner');
        }
      });
      const transactionIds = new Set();
      const transactionsById = new Map();
      const typeCounts = { commissioner: 0, free_agent: 0, trade: 0, waiver: 0 };
      const statusCounts = { complete: 0, failed: 0, pending: 0 };
      season.transactions.forEach((transaction, index) => {
        const txLocation = `${location} transactions row ${index}`;
        if (transactionIds.has(transaction.id)) {
          report('TRANSACTION_DUPLICATE_ID', txLocation, `${season.season}|${transaction.id}`, `duplicate transaction ${transaction.id}`);
        }
        transactionIds.add(transaction.id);
        transactionsById.set(transaction.id, transaction);
        if (transaction.week < 0 || transaction.week > season.max_week) {
          report('TRANSACTION_INVALID_WEEK', txLocation, `${season.season}|${transaction.id}`, `week ${transaction.week} exceeds 0-${season.max_week}`);
        }
        typeCounts[transaction.type] += 1;
        if (transaction.status === 'complete') statusCounts.complete += 1;
        else if (transaction.status === 'failed') statusCounts.failed += 1;
        else statusCounts.pending += 1;
        for (const owner of transaction.participants) {
          if (!owners.has(owner)) report('TRANSACTION_UNKNOWN_OWNER', txLocation, `${transaction.id}|${owner}`, `unknown participant ${owner}`);
        }
        for (const movement of [...transaction.adds, ...transaction.drops]) {
          referencedPlayers.add(movement.player_id);
          if (!owners.has(movement.owner)) report('TRANSACTION_UNKNOWN_OWNER', txLocation, `${transaction.id}|${movement.owner}`, `unknown movement owner ${movement.owner}`);
          if (!playerIds.has(movement.player_id)) report('TRANSACTION_MISSING_PLAYER', txLocation, `${transaction.id}|${movement.player_id}`, `missing player ${movement.player_id}`);
        }
        for (const pick of transaction.draft_picks) {
          for (const owner of [pick.original_owner, pick.owner, pick.previous_owner].filter(Boolean)) {
            if (!owners.has(owner)) report('TRANSACTION_UNKNOWN_OWNER', txLocation, `${transaction.id}|${owner}`, `unknown draft-pick owner ${owner}`);
          }
          if (rosterOwners.get(pick.roster_id) !== pick.original_owner) {
            report('TRANSACTION_ROSTER_OWNER_MISMATCH', txLocation, `${transaction.id}|${pick.roster_id}`, 'transaction pick roster does not resolve to original_owner');
          }
        }
        for (const transfer of transaction.waiver_budget) {
          for (const owner of [transfer.sender, transfer.receiver]) {
            if (!owners.has(owner)) report('TRANSACTION_UNKNOWN_OWNER', txLocation, `${transaction.id}|${owner}`, `unknown waiver-budget owner ${owner}`);
          }
        }
      });
      const coverage = season.coverage;
      if (
        coverage.transaction_count !== season.transactions.length
        || coverage.complete_count !== statusCounts.complete
        || coverage.failed_count !== statusCounts.failed
        || coverage.pending_count !== statusCounts.pending
      ) {
        report('TRANSACTION_COVERAGE_MISMATCH', `${location} coverage`, `${season.season}`, 'coverage status counts do not reconcile to normalized transactions');
      }
      for (const [type, count] of Object.entries(typeCounts)) {
        if (coverage.type_counts[type] !== count) {
          report('TRANSACTION_TYPE_COUNT_MISMATCH', `${location} coverage`, `${season.season}|${type}`, `${type} count does not reconcile`);
        }
      }
      const journeyIds = new Set();
      season.player_journeys.forEach((journey, index) => {
        const journeyLocation = `${location} player_journeys row ${index}`;
        if (journeyIds.has(journey.player_id)) {
          report('TRANSACTION_DUPLICATE_JOURNEY', journeyLocation, `${season.season}|${journey.player_id}`, `duplicate journey ${journey.player_id}`);
        }
        journeyIds.add(journey.player_id);
        referencedPlayers.add(journey.player_id);
        if (!playerIds.has(journey.player_id)) report('TRANSACTION_MISSING_PLAYER', journeyLocation, `${season.season}|${journey.player_id}`, `missing player ${journey.player_id}`);
        journey.stints.forEach(stint => {
          if (!owners.has(stint.owner)) report('TRANSACTION_UNKNOWN_OWNER', journeyLocation, `${journey.player_id}|${stint.owner}`, `unknown stint owner ${stint.owner}`);
          for (const transactionId of [
            stint.acquisition.transaction_id,
            stint.release?.transaction_id,
          ].filter(Boolean)) {
            const source = transactionsById.get(transactionId);
            if (!source || source.status !== 'complete') {
              report('TRANSACTION_INVALID_STATUS_MUTATION', journeyLocation, `${journey.player_id}|${transactionId}`, 'journey mutations must reference complete transactions');
            }
          }
          for (const field of ['total_points', 'starter_points']) {
            if (Math.abs(stint[field] * 100 - Math.round(stint[field] * 100)) > 1e-7) {
              report('TRANSACTION_POINTS_PRECISION', journeyLocation, `${journey.player_id}|${stint.owner}|${field}`, `${field} must be rounded to two decimals`);
            }
          }
        });
      });
      const completeById = new Map(season.transactions.filter(row => row.status === 'complete').map(row => [row.id, row]));
      const roundPoints = value => Number(Number(value || 0).toFixed(2));
      const acquisitionStints = new Map();
      const allStints = [];
      for (const journey of season.player_journeys) {
        for (const stint of journey.stints) {
          const row = { player_id: journey.player_id, ...stint };
          allStints.push(row);
          const transactionId = stint.acquisition.transaction_id;
          if (!transactionId) continue;
          const key = `${transactionId}|${stint.owner}|${journey.player_id}`;
          if (!acquisitionStints.has(key)) acquisitionStints.set(key, []);
          acquisitionStints.get(key).push(stint);
        }
      }
      const expectedTrades = season.transactions
        .filter(transaction => transaction.status === 'complete' && transaction.type === 'trade')
        .map(transaction => {
          const unresolved = transaction.draft_picks.some(pick => pick.season > season.season);
          const sides = transaction.participants.map(owner => {
            const received = transaction.adds
              .filter(row => row.owner === owner)
              .map(row => row.player_id);
            const sideStints = received.flatMap(playerId => {
              const rows = acquisitionStints.get(`${transaction.id}|${owner}|${playerId}`) || [];
              return rows.length ? [rows.at(-1)] : [];
            });
            const picks = transaction.draft_picks
              .filter(pick => pick.owner === owner && pick.previous_owner !== owner);
            const faab = transaction.waiver_budget
              .filter(transfer => transfer.receiver === owner)
              .reduce((total, transfer) => total + transfer.amount, 0)
              - transaction.waiver_budget
                .filter(transfer => transfer.sender === owner)
                .reduce((total, transfer) => total + transfer.amount, 0);
            return {
              owner,
              players: received,
              picks,
              faab,
              starts: sideStints.reduce((total, stint) => total + stint.starts, 0),
              starter_points: roundPoints(sideStints.reduce((total, stint) => total + stint.starter_points, 0)),
              total_points: roundPoints(sideStints.reduce((total, stint) => total + stint.total_points, 0)),
              rostered_weeks: sideStints.reduce((total, stint) => total + stint.rostered_weeks, 0),
              retained_players: sideStints.filter(stint => stint.retained).length,
            };
          });
          const hasWeek = season.coverage.completed_week > transaction.week;
          const status = !hasWeek
            ? 'too_early'
            : unresolved
              ? 'incomplete'
              : season.league_status === 'complete'
                ? 'final'
                : 'provisional';
          const best = sides.length ? Math.max(...sides.map(side => side.starter_points)) : 0;
          const leaders = sides.filter(side => side.starter_points === best).map(side => side.owner);
          return {
            transaction_id: transaction.id,
            week: transaction.week,
            created_ms: transaction.created_ms,
            status,
            even: leaders.length !== 1,
            edge_owner: leaders.length === 1 && hasWeek && !unresolved ? leaders[0] : null,
            completed_through_week: season.coverage.completed_week,
            sides,
          };
        });
      if (canonicalJson(season.insights.trades) !== canonicalJson(expectedTrades)) {
        report('TRANSACTION_INSIGHT_RECONCILIATION', `${location} insights.trades`, `${season.season}|trades`, 'trade outcomes do not reconcile to normalized transactions and journeys');
      }
      const playerName = playerId => playersById.get(playerId)?.name || playerId;
      const expectedWireFinds = allStints
        .flatMap(stint => {
          const transactionId = stint.acquisition.transaction_id;
          const source = transactionId ? completeById.get(transactionId) : null;
          if (
            stint.acquisition.kind !== 'add'
            || !source
            || !['waiver', 'free_agent'].includes(source.type)
            || season.coverage.completed_week === 0
            || source.week > season.coverage.completed_week
          ) return [];
          return [{
            transaction_id: source.id,
            player_id: stint.player_id,
            owner: stint.owner,
            acquisition_type: source.type,
            week: source.week,
            starts: stint.starts,
            starter_points: stint.starter_points,
            rostered_weeks: stint.rostered_weeks,
            retained: stint.retained,
          }];
        })
        .sort((a, b) => (
          b.starter_points - a.starter_points
          || b.starts - a.starts
          || b.rostered_weeks - a.rostered_weeks
          || Number(b.retained) - Number(a.retained)
          || playerName(a.player_id).localeCompare(playerName(b.player_id), undefined, { sensitivity: 'base' })
          || a.player_id.localeCompare(b.player_id)
        ));
      if (canonicalJson(season.insights.wire_finds) !== canonicalJson(expectedWireFinds)) {
        report('TRANSACTION_INSIGHT_RECONCILIATION', `${location} insights.wire_finds`, `${season.season}|wire_finds`, 'wire-find rankings do not reconcile to complete acquisition stints');
      }
      const movement = new Map();
      const incomingByOwner = new Map(season.teams.map(team => [team.owner, new Set()]));
      const expectedOwnerActivity = new Map(season.teams.map(team => [team.owner, {
        owner: team.owner,
        transactions: 0,
        adds: 0,
        drops: 0,
        trades: 0,
        commissioner_moves: 0,
        faab_spent: 0,
        distinct_incoming_players: 0,
        retention: null,
        turnover: null,
      }]));
      const changeMovement = (playerId, field) => {
        const counts = movement.get(playerId) || { adds: 0, drops: 0 };
        counts[field] += 1;
        movement.set(playerId, counts);
      };
      for (const transaction of completeById.values()) {
        for (const owner of transaction.participants) {
          const activity = expectedOwnerActivity.get(owner);
          if (!activity) continue;
          activity.transactions += 1;
          if (transaction.type === 'trade') activity.trades += 1;
          if (transaction.type === 'commissioner') activity.commissioner_moves += 1;
        }
        if (['waiver', 'free_agent'].includes(transaction.type)) {
          for (const row of transaction.adds) {
            changeMovement(row.player_id, 'adds');
            const activity = expectedOwnerActivity.get(row.owner);
            const incoming = incomingByOwner.get(row.owner);
            if (activity) activity.adds += 1;
            if (incoming) incoming.add(row.player_id);
          }
          for (const row of transaction.drops) {
            changeMovement(row.player_id, 'drops');
            const activity = expectedOwnerActivity.get(row.owner);
            if (activity) activity.drops += 1;
          }
        }
        for (const row of transaction.adds) {
          const incoming = incomingByOwner.get(row.owner);
          if (incoming) incoming.add(row.player_id);
        }
        if (transaction.type === 'waiver' && transaction.faab_bid) {
          for (const row of transaction.adds) {
            const activity = expectedOwnerActivity.get(row.owner);
            if (activity) activity.faab_spent += transaction.faab_bid;
          }
        }
      }
      const expectedMovementCounts = [...movement.entries()]
        .map(([player_id, counts]) => ({ player_id, ...counts }))
        .sort((a, b) => (
          Math.max(b.adds, b.drops) - Math.max(a.adds, a.drops)
          || b.adds - a.adds
          || b.drops - a.drops
          || playerName(a.player_id).localeCompare(playerName(b.player_id), undefined, { sensitivity: 'base' })
          || a.player_id.localeCompare(b.player_id)
        ));
      if (canonicalJson(season.insights.movement_counts) !== canonicalJson(expectedMovementCounts)) {
        report('TRANSACTION_INSIGHT_RECONCILIATION', `${location} insights.movement_counts`, `${season.season}|movement_counts`, 'movement rankings do not reconcile to complete waiver/free-agent transactions');
      }
      const expectedRetention = season.teams.map(team => {
        const drafted = season.draft.picks.filter(pick => pick.owner === team.owner);
        const retainedIds = new Set(allStints
          .filter(stint => stint.owner === team.owner && stint.retained)
          .map(stint => stint.player_id));
        const retained = drafted.filter(pick => retainedIds.has(pick.player_id)).length;
        const available = season.draft.status === 'selected'
          && season.coverage.completed_week > 0
          && drafted.length > 0;
        const retention = available ? Number((retained / drafted.length).toFixed(4)) : null;
        const activity = expectedOwnerActivity.get(team.owner);
        activity.retention = retention;
        activity.turnover = retention === null ? null : Number((1 - retention).toFixed(4));
        activity.distinct_incoming_players = incomingByOwner.get(team.owner).size;
        return {
          owner: team.owner,
          available,
          drafted: drafted.length,
          retained,
          retention,
          turnover: activity.turnover,
        };
      });
      if (canonicalJson(season.insights.draft_retention) !== canonicalJson(expectedRetention)) {
        report('TRANSACTION_INSIGHT_RECONCILIATION', `${location} insights.draft_retention`, `${season.season}|draft_retention`, 'draft retention does not reconcile to draft picks and retained journeys');
      }
      const expectedActivity = [...expectedOwnerActivity.values()].sort((a, b) => (
        b.transactions - a.transactions
        || b.trades - a.trades
        || b.adds - a.adds
        || a.owner.localeCompare(b.owner, undefined, { sensitivity: 'base' })
      ));
      if (canonicalJson(season.insights.owner_activity) !== canonicalJson(expectedActivity)) {
        report('TRANSACTION_INSIGHT_RECONCILIATION', `${location} insights.owner_activity`, `${season.season}|owner_activity`, 'owner activity does not reconcile to complete transactions and retention');
      }
      const expectedKeeperReturn = season.draft.picks
        .filter(pick => pick.is_keeper)
        .map(pick => {
          const stint = allStints.find(row => row.player_id === pick.player_id && row.owner === pick.owner);
          return {
            player_id: pick.player_id,
            owner: pick.owner,
            round: pick.round,
            starts: stint?.starts || 0,
            starter_points: stint?.starter_points || 0,
          };
        })
        .sort((a, b) => (
          b.starter_points - a.starter_points
          || b.starts - a.starts
          || b.round - a.round
          || a.player_id.localeCompare(b.player_id)
        ));
      if (canonicalJson(season.insights.keeper_return) !== canonicalJson(expectedKeeperReturn)) {
        report('TRANSACTION_INSIGHT_RECONCILIATION', `${location} insights.keeper_return`, `${season.season}|keeper_return`, 'keeper return does not reconcile to keeper picks and journeys');
      }
      season.insights.trades.forEach(trade => {
        const source = completeById.get(trade.transaction_id);
        if (!source || source.type !== 'trade') {
          report('TRANSACTION_INVALID_STATUS_MUTATION', `${location} insights.trades`, trade.transaction_id, 'trade insight must reference a complete trade');
        }
        trade.sides.forEach(side => {
          if (!owners.has(side.owner)) report('TRANSACTION_UNKNOWN_OWNER', `${location} insights.trades`, `${trade.transaction_id}|${side.owner}`, `unknown trade side owner ${side.owner}`);
          side.players.forEach(playerId => {
            if (!playerIds.has(playerId)) report('TRANSACTION_MISSING_PLAYER', `${location} insights.trades`, `${trade.transaction_id}|${playerId}`, `missing player ${playerId}`);
          });
        });
        if (trade.edge_owner && (trade.even || !trade.sides.some(side => side.owner === trade.edge_owner))) {
          report('TRANSACTION_OUTCOME_RECONCILIATION', `${location} insights.trades`, trade.transaction_id, 'edge_owner must be a unique eligible side');
        }
      });
      season.insights.wire_finds.forEach(row => {
        const source = completeById.get(row.transaction_id);
        if (!source || !['waiver', 'free_agent'].includes(source.type)) {
          report('TRANSACTION_INVALID_STATUS_MUTATION', `${location} insights.wire_finds`, row.transaction_id, 'wire find must reference a complete waiver/free-agent transaction');
        }
        if (!owners.has(row.owner)) report('TRANSACTION_UNKNOWN_OWNER', `${location} insights.wire_finds`, `${row.transaction_id}|${row.owner}`, `unknown wire-find owner ${row.owner}`);
        if (!playerIds.has(row.player_id)) report('TRANSACTION_MISSING_PLAYER', `${location} insights.wire_finds`, `${row.transaction_id}|${row.player_id}`, `missing player ${row.player_id}`);
      });
      season.insights.movement_counts.forEach(row => {
        if (!playerIds.has(row.player_id)) report('TRANSACTION_MISSING_PLAYER', `${location} insights.movement_counts`, `${season.season}|${row.player_id}`, `missing player ${row.player_id}`);
      });
      for (const [name, rows] of [
        ['owner_activity', season.insights.owner_activity],
        ['draft_retention', season.insights.draft_retention],
      ]) {
        rows.forEach(row => {
          if (!owners.has(row.owner)) report('TRANSACTION_UNKNOWN_OWNER', `${location} insights.${name}`, `${season.season}|${row.owner}`, `unknown insight owner ${row.owner}`);
        });
      }
      season.insights.keeper_return.forEach(row => {
        if (!owners.has(row.owner)) report('TRANSACTION_UNKNOWN_OWNER', `${location} insights.keeper_return`, `${season.season}|${row.owner}`, `unknown keeper owner ${row.owner}`);
        if (!playerIds.has(row.player_id)) report('TRANSACTION_MISSING_PLAYER', `${location} insights.keeper_return`, `${season.season}|${row.player_id}`, `missing player ${row.player_id}`);
      });
      const missingMetadata = [...referencedPlayers]
        .filter(playerId => !playersById.get(playerId)?.name)
        .length;
      if (season.coverage.missing_player_metadata !== missingMetadata) {
        report('TRANSACTION_COVERAGE_MISMATCH', `${location} coverage`, `${season.season}|missing_player_metadata`, `missing-player metadata count ${season.coverage.missing_player_metadata} does not reconcile to ${missingMetadata}`);
      }
      const seasonBytes = Buffer.byteLength(canonicalJson(season));
      if (seasonBytes > TRANSACTION_MAX_SEASON_BYTES) {
        report('TRANSACTION_SEASON_SIZE', location, `${season.season}`, `season slice is ${seasonBytes} bytes; maximum is ${TRANSACTION_MAX_SEASON_BYTES}`);
      }
    });
    if (seasons.length > TRANSACTION_MAX_RETAINED_SEASONS) {
      report('TRANSACTION_SEASON_RETENTION', 'assets/TransactionHistory.json seasons', 'seasons', `asset retains ${seasons.length} seasons; maximum is ${TRANSACTION_MAX_RETAINED_SEASONS}`);
    }
    const totalBytes = Buffer.byteLength(canonicalJson(transactionHistory));
    if (totalBytes > TRANSACTION_MAX_ASSET_BYTES) {
      report('TRANSACTION_ASSET_SIZE', 'assets/TransactionHistory.json', 'asset', `asset is ${totalBytes} bytes; maximum is ${TRANSACTION_MAX_ASSET_BYTES}`);
    }
    const maxCreated = Math.max(0, ...seasons.flatMap(season => season.transactions.map(transaction => transaction.created_ms)));
    if (transactionHistory.source_updated_ms !== maxCreated) {
      report('TRANSACTION_SOURCE_UPDATED', 'assets/TransactionHistory.json', 'source_updated_ms', 'source_updated_ms must equal the maximum source transaction timestamp');
    }
  }

  exceptions.forEach((entry, index) => {
    if (!usedExceptions.has(index)) errors.push(`ERROR [STALE_KNOWN_EXCEPTION] scripts/data/known-data-exceptions.json row ${index}: ${entry.rule_id}|${entry.record_key} no longer matches a validation failure`);
  });
  return { errors, warnings };
}

module.exports = {
  canonicalGameKey,
  validateSemanticBundle,
};
