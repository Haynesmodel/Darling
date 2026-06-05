(function (global) {
  function coreFn(name) {
    const fn = global[name];
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

  async function loadLeagueAssets(opts = {}) {
    const fetchFn = opts.fetchFn || global.fetch;
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

    const [rawGames, seasonSummaries, rivalries] = await Promise.all([
      readRequiredJson(fetchFn, paths.h2h),
      readRequiredJson(fetchFn, paths.seasonSummary),
      readOptionalArrayJson(fetchFn, paths.rivalries, logger),
    ]);

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

  const api = {
    loadLeagueAssets,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  Object.assign(global, api);
})(typeof globalThis !== 'undefined' ? globalThis : window);
