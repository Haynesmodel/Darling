import * as core from './core-helpers.js';
function coreFn(name) {
  const fn = core[name];
  if (typeof fn !== 'function') {
    throw new Error(`data-helpers.js requires core-helpers.js before it (${name})`);
  }
  return fn;
}

function responseOk(res) {
  return !!res && (typeof res.ok !== 'boolean' || res.ok);
}

async function readRequiredJson(fetchFn, path) {
  const res = await fetchFn(path);
  if (!responseOk(res)) {
    throw new Error(`Could not load ${path}: HTTP ${res?.status || 'error'}`);
  }
  return res.json();
}

async function readOptionalArrayJson(fetchFn, path, logger = console) {
  try {
    const res = await fetchFn(path);
    if (!responseOk(res)) {
      logger.warn(`[Darling] ${path} missing - optional data disabled.`);
      return [];
    }
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) {
      logger.warn(`[Darling] ${path} missing or empty - optional data disabled.`);
      return [];
    }
    return data;
  } catch {
    logger.warn(`[Darling] ${path} not found/parse error - optional data disabled.`);
    return [];
  }
}

function assertArray(data, path) {
  if (!Array.isArray(data)) {
    throw new Error(`${path} must be a JSON array`);
  }
}

function isFiniteNumber(value) {
  return Number.isFinite(+value);
}

function isString(value) {
  return typeof value === 'string' && value.trim() !== '';
}

const SEASON_SUMMARY_NUMERIC_FIELDS = [
  'season',
  'wins',
  'losses',
  'ties',
  'finish',
  'playoff_wins',
  'playoff_losses',
  'saunders_wins',
  'saunders_losses',
  'points_for',
  'points_against',
  'bagels_earned',
];

function normalizeOptionalNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  return +value;
}

function normalizeLeagueGame(row) {
  const game = {
    ...row,
    season: +row.season,
    date: row.date.trim(),
    teamA: row.teamA.trim(),
    teamB: row.teamB.trim(),
    scoreA: +row.scoreA,
    scoreB: +row.scoreB,
    type: row.type.trim(),
    round: row.round === null || row.round === undefined ? '' : String(row.round).trim(),
  };
  if (Object.prototype.hasOwnProperty.call(row, 'week')) {
    game.week = normalizeOptionalNumber(row.week);
  }
  return game;
}

function normalizeSeasonSummary(row) {
  const summary = {
    ...row,
    owner: row.owner.trim(),
  };
  for (const field of SEASON_SUMMARY_NUMERIC_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(row, field)) {
      summary[field] = normalizeOptionalNumber(row[field]);
    }
  }
  return summary;
}

function normalizeRivalry(row) {
  const rivalry = {
    ...row,
    name: row.name.trim(),
    members: row.members.map(member => member.trim()),
  };
  if (row.type !== undefined) rivalry.type = row.type.trim();
  if (row.slug !== undefined) rivalry.slug = row.slug.trim();
  if (row.note !== undefined && typeof row.note === 'string') rivalry.note = row.note.trim();
  return rivalry;
}

function validateLeagueGames(rows, path = 'assets/H2H.json') {
  assertArray(rows, path);
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  rows.forEach((g, i) => {
    if (!g || typeof g !== 'object') throw new Error(`${path} row ${i} must be an object`);
    if (!isFiniteNumber(g.season)) throw new Error(`${path} row ${i} missing numeric season`);
    if (!isString(g.date) || !dateRe.test(g.date)) throw new Error(`${path} row ${i} invalid date`);
    if (!isString(g.teamA)) throw new Error(`${path} row ${i} missing teamA`);
    if (!isString(g.teamB)) throw new Error(`${path} row ${i} missing teamB`);
    if (!isFiniteNumber(g.scoreA)) throw new Error(`${path} row ${i} missing numeric scoreA`);
    if (!isFiniteNumber(g.scoreB)) throw new Error(`${path} row ${i} missing numeric scoreB`);
    if (+g.scoreA < 0 || +g.scoreB < 0) throw new Error(`${path} row ${i} scores must be non-negative`);
    if (!(isFiniteNumber(g.week) || g.week === null || g.week === undefined || g.week === '')) {
      throw new Error(`${path} row ${i} invalid week`);
    }
    if (!isString(g.type)) throw new Error(`${path} row ${i} missing type`);
  });
  return rows;
}

function validateSeasonSummaries(rows, path = 'assets/SeasonSummary.json') {
  assertArray(rows, path);
  rows.forEach((r, i) => {
    if (!r || typeof r !== 'object') throw new Error(`${path} row ${i} must be an object`);
    if (!isFiniteNumber(r.season)) throw new Error(`${path} row ${i} missing numeric season`);
    if (!isString(r.owner)) throw new Error(`${path} row ${i} missing owner`);
    ['wins', 'losses', 'ties', 'playoff_wins', 'playoff_losses', 'saunders_wins', 'saunders_losses'].forEach((field) => {
      if (!isFiniteNumber(r[field])) throw new Error(`${path} row ${i} missing numeric ${field}`);
    });
    if (r.finish !== null && r.finish !== undefined && !isFiniteNumber(r.finish)) {
      throw new Error(`${path} row ${i} invalid finish`);
    }
  });
  return rows;
}

function validateRivalries(rows, path = 'assets/Rivalries.json') {
  assertArray(rows, path);
  rows.forEach((r, i) => {
    if (!r || typeof r !== 'object') throw new Error(`${path} row ${i} must be an object`);
    if (!isString(r.name)) throw new Error(`${path} row ${i} missing name`);
    if (!Array.isArray(r.members) || r.members.length < 2 || !r.members.every(isString)) {
      throw new Error(`${path} row ${i} members must contain at least two team names`);
    }
    if (r.type !== undefined && !isString(r.type)) throw new Error(`${path} row ${i} invalid type`);
    if (r.slug !== undefined && !isString(r.slug)) throw new Error(`${path} row ${i} invalid slug`);
  });
  return rows;
}

async function loadLeagueAssets(opts = {}) {
  const fetchFn = opts.fetchFn || globalThis.fetch;
  if (typeof fetchFn !== 'function') {
    throw new Error('loadLeagueAssets requires a fetch function');
  }

  const paths = {
    h2h: 'assets/H2H.json',
    seasonSummary: 'assets/SeasonSummary.json',
    rivalries: 'assets/Rivalries.json',
    ...(opts.paths || {}),
  };
  const logger = opts.logger || console;

  const [rawGameRows, seasonSummaryRows, rivalryRows] = await Promise.all([
    readRequiredJson(fetchFn, paths.h2h),
    readRequiredJson(fetchFn, paths.seasonSummary),
    readOptionalArrayJson(fetchFn, paths.rivalries, logger),
  ]);

  validateLeagueGames(rawGameRows, paths.h2h);
  validateSeasonSummaries(seasonSummaryRows, paths.seasonSummary);
  validateRivalries(rivalryRows, paths.rivalries);

  const rawGames = rawGameRows.map(normalizeLeagueGame);
  const seasonSummaries = seasonSummaryRows.map(normalizeSeasonSummary);
  const rivalries = rivalryRows.map(normalizeRivalry);

  const dedupeGamesFn = opts.dedupeGamesFn || coreFn('dedupeGames');
  const deriveWeeksInPlaceFn = opts.deriveWeeksInPlaceFn || coreFn('deriveWeeksInPlace');
  const leagueGames = dedupeGamesFn(rawGames);
  const derivedWeeksSet = deriveWeeksInPlaceFn(leagueGames);

  return {
    rawGames,
    leagueGames,
    derivedWeeksSet,
    seasonSummaries,
    rivalries,
  };
}
export {
  normalizeLeagueGame,
  normalizeSeasonSummary,
  normalizeRivalry,
  validateLeagueGames,
  validateSeasonSummaries,
  validateRivalries,
  loadLeagueAssets
};
