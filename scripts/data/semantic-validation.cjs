const path = require('node:path');
const { readJson } = require('./canonical-json.cjs');

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

  exceptions.forEach((entry, index) => {
    if (!usedExceptions.has(index)) errors.push(`ERROR [STALE_KNOWN_EXCEPTION] scripts/data/known-data-exceptions.json row ${index}: ${entry.rule_id}|${entry.record_key} no longer matches a validation failure`);
  });
  return { errors, warnings };
}

module.exports = {
  canonicalGameKey,
  validateSemanticBundle,
};
