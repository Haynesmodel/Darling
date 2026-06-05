function assertArray(data, path) {
  if (!Array.isArray(data)) {
    throw new Error(`${path} must be a JSON array`);
  }
}

function isRequiredFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function isOptionalFiniteNumber(value) {
  return value === null || value === undefined || value === '' || isRequiredFiniteNumber(value);
}

function isString(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function validateLeagueGames(rows, path = 'assets/H2H.json') {
  assertArray(rows, path);
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  rows.forEach((g, i) => {
    if (!g || typeof g !== 'object') throw new Error(`${path} row ${i} must be an object`);
    if (!isRequiredFiniteNumber(g.season)) throw new Error(`${path} row ${i} missing numeric season`);
    if (!isString(g.date) || !dateRe.test(g.date)) throw new Error(`${path} row ${i} invalid date`);
    if (!isString(g.teamA)) throw new Error(`${path} row ${i} missing teamA`);
    if (!isString(g.teamB)) throw new Error(`${path} row ${i} missing teamB`);
    if (!isRequiredFiniteNumber(g.scoreA)) throw new Error(`${path} row ${i} missing numeric scoreA`);
    if (!isRequiredFiniteNumber(g.scoreB)) throw new Error(`${path} row ${i} missing numeric scoreB`);
    if (+g.scoreA < 0 || +g.scoreB < 0) throw new Error(`${path} row ${i} scores must be non-negative`);
    if (!isOptionalFiniteNumber(g.week)) {
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
    if (!isRequiredFiniteNumber(r.season)) throw new Error(`${path} row ${i} missing numeric season`);
    if (!isString(r.owner)) throw new Error(`${path} row ${i} missing owner`);
    ['wins', 'losses', 'ties', 'playoff_wins', 'playoff_losses', 'saunders_wins', 'saunders_losses'].forEach((field) => {
      if (!isRequiredFiniteNumber(r[field])) throw new Error(`${path} row ${i} missing numeric ${field}`);
    });
    if (!isOptionalFiniteNumber(r.finish)) {
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
    if (r.note !== undefined && r.note !== null && typeof r.note !== 'string') {
      throw new Error(`${path} row ${i} invalid note`);
    }
  });
  return rows;
}

function validateLeagueAssetBundle(opts = {}) {
  const paths = {
    h2h: 'assets/H2H.json',
    seasonSummary: 'assets/SeasonSummary.json',
    rivalries: 'assets/Rivalries.json',
    ...(opts.paths || {}),
  };
  return {
    h2hRows: validateLeagueGames(opts.h2hRows, paths.h2h),
    seasonSummaryRows: validateSeasonSummaries(opts.seasonSummaryRows, paths.seasonSummary),
    rivalriesRows: validateRivalries(opts.rivalriesRows, paths.rivalries),
  };
}

export {
  validateLeagueGames,
  validateSeasonSummaries,
  validateRivalries,
  validateLeagueAssetBundle,
};
