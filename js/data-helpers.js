import * as core from './core-helpers.js';
import {
  normalizeLeagueGame,
  normalizeCurrentSeasonGame,
  normalizeSeasonSummary,
  normalizeRivalry,
  validateLeagueGames,
  validateCurrentSeason,
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

async function readOptionalObjectJson(fetchFn, path, logger = console) {
  try {
    const res = await fetchFn(path);
    if (!responseOk(res)) {
      logger.warn(`[Darling] ${path} missing - optional data disabled.`);
      return null;
    }
    const data = await res.json();
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      logger.warn(`[Darling] ${path} missing or invalid - optional data disabled.`);
      return null;
    }
    return data;
  } catch {
    logger.warn(`[Darling] ${path} not found/parse error - optional data disabled.`);
    return null;
  }
}

async function loadLeagueAssets(opts = {}) {
  if (!opts.forceLegacy && !opts.paths && !opts.fetchFn && typeof globalThis.darlingDataLoader === 'function') {
    return globalThis.darlingDataLoader({ logger: opts.logger || console });
  }
  const fetchFn = opts.fetchFn || globalThis.fetch;
  if (typeof fetchFn !== 'function') {
    throw new Error('loadLeagueAssets requires a fetch function');
  }

  const paths = {
    h2h: 'assets/H2H.json',
    seasonSummary: 'assets/SeasonSummary.json',
    rivalries: 'assets/Rivalries.json',
    currentSeason: 'assets/CurrentSeason.json',
    ...(opts.paths || {}),
  };
  const logger = opts.logger || console;

  const [rawGameRows, seasonSummaryRows, rivalryRows, currentSeasonData] = await Promise.all([
    readRequiredJson(fetchFn, paths.h2h),
    readRequiredJson(fetchFn, paths.seasonSummary),
    readOptionalArrayJson(fetchFn, paths.rivalries, logger),
    readOptionalObjectJson(fetchFn, paths.currentSeason, logger),
  ]);

  validateLeagueAssetBundle({
    h2hRows: rawGameRows,
    seasonSummaryRows,
    rivalriesRows: rivalryRows,
    currentSeason: currentSeasonData || undefined,
    paths,
  });

  const rawGames = rawGameRows.map(normalizeLeagueGame);
  const seasonSummaries = seasonSummaryRows.map(normalizeSeasonSummary);
  const rivalries = rivalryRows.map(normalizeRivalry);
  const currentSeason = currentSeasonData
    ? {
      ...currentSeasonData,
      season: +currentSeasonData.season,
      current_week: currentSeasonData.current_week === null || currentSeasonData.current_week === undefined ? null : +currentSeasonData.current_week,
      games: (currentSeasonData.games || []).map(normalizeCurrentSeasonGame),
    }
    : null;

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
    currentSeason,
  };
}
export {
  normalizeCurrentSeasonGame,
  normalizeLeagueGame,
  normalizeSeasonSummary,
  normalizeRivalry,
  validateCurrentSeason,
  validateLeagueGames,
  validateSeasonSummaries,
  validateRivalries,
  validateLeagueAssetBundle,
  loadLeagueAssets
};
