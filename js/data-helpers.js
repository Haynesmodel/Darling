import * as core from './core-helpers.js';
import {
  validateLeagueGames,
  validateSeasonSummaries,
  validateRivalries,
  validateLeagueAssetBundle,
} from './asset-validation.js';
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

  validateLeagueAssetBundle({
    h2hRows: rawGameRows,
    seasonSummaryRows,
    rivalriesRows: rivalryRows,
    paths,
  });

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
  validateLeagueAssetBundle,
  loadLeagueAssets
};
