/**
 * Canonical JSON contract for the league asset bundle.
 *
 * This table is the source of truth for both validation and normalization:
 * - `required` marks fields that must be present and non-empty
 * - `nullable` allows explicit `null` / empty-string absence for optional fields
 * - `always` controls whether a normalized field is always written back
 * - `default` is applied during normalization when a field is omitted
 *
 * Asset shapes:
 * - `assets/H2H.json`: season, date, teamA, teamB, scoreA, scoreB, week?, type, round?
 * - `assets/SeasonSummary.json`: season, owner, wins, losses, ties, finish?, playoff_wins,
 *   playoff_losses, saunders_wins, saunders_losses, points_for?, points_against?,
 *   bagels_earned?, draft_pick?, bye?, champion?, saunders?, saunders_bye?, wild_card?
 * - `assets/Rivalries.json`: name, members[], type?, slug?, note?
 * - `assets/CurrentSeason.json`: source, league_id, season, generated_at, current_week?,
 *   games[] where each game is H2H-like plus status? and nullable scores for scheduled matchups.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const LEAGUE_ASSET_CONTRACT = Object.freeze({
  H2H: {
    path: 'assets/H2H.json',
    fields: {
      season: { kind: 'number', required: true },
      date: { kind: 'string', required: true, trim: true, pattern: DATE_RE },
      teamA: { kind: 'string', required: true, trim: true },
      teamB: { kind: 'string', required: true, trim: true },
      scoreA: { kind: 'number', required: true, min: 0 },
      scoreB: { kind: 'number', required: true, min: 0 },
      week: { kind: 'number', nullable: true, emptyToNull: true },
      type: { kind: 'string', required: true, trim: true },
      round: { kind: 'string', trim: true, default: '', always: true, nullable: true, allowBlank: true },
    },
  },
  SeasonSummary: {
    path: 'assets/SeasonSummary.json',
    fields: {
      season: { kind: 'number', required: true },
      owner: { kind: 'string', required: true, trim: true },
      wins: { kind: 'number', required: true },
      losses: { kind: 'number', required: true },
      ties: { kind: 'number', required: true },
      finish: { kind: 'number', nullable: true, emptyToNull: true },
      playoff_wins: { kind: 'number', required: true },
      playoff_losses: { kind: 'number', required: true },
      saunders_wins: { kind: 'number', required: true },
      saunders_losses: { kind: 'number', required: true },
      points_for: { kind: 'number', nullable: true, emptyToNull: true },
      points_against: { kind: 'number', nullable: true, emptyToNull: true },
      bagels_earned: { kind: 'number', nullable: true, emptyToNull: true },
      draft_pick: { kind: 'number', nullable: true, emptyToNull: true },
      bye: { kind: 'boolean' },
      champion: { kind: 'boolean' },
      saunders: { kind: 'boolean' },
      saunders_bye: { kind: 'boolean' },
      wild_card: { kind: 'boolean' },
    },
  },
  Rivalries: {
    path: 'assets/Rivalries.json',
    fields: {
      name: { kind: 'string', required: true, trim: true },
      members: { kind: 'array', required: true, minLength: 2, item: { kind: 'string', trim: true } },
      type: { kind: 'string', trim: true },
      slug: { kind: 'string', trim: true },
      note: { kind: 'string', trim: true, nullable: true, allowBlank: true },
    },
  },
  CurrentSeasonGame: {
    path: 'assets/CurrentSeason.json games',
    fields: {
      season: { kind: 'number', required: true },
      date: { kind: 'string', required: true, trim: true, pattern: DATE_RE },
      teamA: { kind: 'string', required: true, trim: true },
      teamB: { kind: 'string', required: true, trim: true },
      scoreA: { kind: 'number', nullable: true, emptyToNull: true, min: 0 },
      scoreB: { kind: 'number', nullable: true, emptyToNull: true, min: 0 },
      week: { kind: 'number', required: true },
      type: { kind: 'string', required: true, trim: true },
      round: { kind: 'string', trim: true, default: '', always: true, nullable: true, allowBlank: true },
      status: { kind: 'string', trim: true },
    },
  },
});

function assertArray(data, path) {
  if (!Array.isArray(data)) {
    throw new Error(`${path} must be a JSON array`);
  }
}

function isRequiredFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function isString(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function getSchema(assetName) {
  const schema = LEAGUE_ASSET_CONTRACT[assetName];
  if (!schema) {
    throw new Error(`Unknown asset schema: ${assetName}`);
  }
  return schema;
}

function shouldWriteNormalizedField(spec, hasField) {
  return hasField || spec.always || Object.prototype.hasOwnProperty.call(spec, 'default');
}

function normalizeScalarValue(value, spec) {
  if (value === null || value === undefined || value === '') {
    if (Object.prototype.hasOwnProperty.call(spec, 'default')) return spec.default;
    return spec.nullable ? null : value;
  }
  if (spec.kind === 'number') return +value;
  if (spec.kind === 'boolean') return value;
  if (spec.kind === 'string') return spec.trim === false ? String(value) : String(value).trim();
  return value;
}

function normalizeValue(value, spec) {
  if (spec.kind === 'array') {
    return value.map(item => normalizeValue(item, spec.item));
  }
  return normalizeScalarValue(value, spec);
}

function validateScalarField(value, spec, path, i, field) {
  if (value === undefined) {
    if (spec.required) {
      throw new Error(`${path} row ${i} missing ${spec.kind === 'number' ? 'numeric ' : ''}${field}`);
    }
    return;
  }
  if (value === null) {
    if (spec.nullable) return;
    throw new Error(`${path} row ${i} missing ${spec.kind === 'number' ? 'numeric ' : ''}${field}`);
  }
  if (value === '') {
    if (spec.kind === 'string' && spec.allowBlank) return;
    if (spec.kind !== 'string' && (spec.emptyToNull || spec.nullable)) return;
  }
  if (spec.kind === 'number') {
    if (!isRequiredFiniteNumber(value)) throw new Error(`${path} row ${i} missing numeric ${field}`);
    if (spec.min !== undefined && +value < spec.min) {
      throw new Error(`${path} row ${i} invalid ${field}`);
    }
    return;
  }
  if (spec.kind === 'boolean') {
    if (typeof value !== 'boolean') throw new Error(`${path} row ${i} invalid ${field}`);
    return;
  }
  if (spec.kind === 'string') {
    if (typeof value !== 'string') throw new Error(`${path} row ${i} missing ${field}`);
    if (!spec.allowBlank && value.trim() === '') throw new Error(`${path} row ${i} missing ${field}`);
    if (spec.pattern && !spec.pattern.test(spec.trim === false ? value : value.trim())) {
      throw new Error(`${path} row ${i} invalid ${field}`);
    }
    return;
  }
  throw new Error(`Unsupported scalar schema type for ${field}`);
}

function validateField(value, spec, path, i, field) {
  if (spec.kind === 'array') {
    if (value === undefined) {
      if (spec.required) throw new Error(`${path} row ${i} missing ${field}`);
      return;
    }
    if (!Array.isArray(value)) {
      throw new Error(`${path} row ${i} invalid ${field}`);
    }
    if (spec.minLength !== undefined && value.length < spec.minLength) {
      const noun = field === 'members' ? 'team names' : 'items';
      const count = field === 'members' && spec.minLength === 2 ? 'two' : `${spec.minLength}`;
      throw new Error(`${path} row ${i} ${field} must contain at least ${count} ${noun}`);
    }
    value.forEach((item, idx) => validateScalarField(item, spec.item, path, i, `${field}[${idx}]`));
    return;
  }
  validateScalarField(value, spec, path, i, field);
}

function normalizeRow(row, assetName) {
  const schema = getSchema(assetName);
  const out = { ...row };
  for (const [field, spec] of Object.entries(schema.fields)) {
    const hasField = Object.prototype.hasOwnProperty.call(row, field);
    if (!shouldWriteNormalizedField(spec, hasField)) continue;
    if (!hasField && !Object.prototype.hasOwnProperty.call(spec, 'default')) continue;
    if (spec.kind === 'array') {
      if (!hasField) {
        out[field] = Object.prototype.hasOwnProperty.call(spec, 'default') ? spec.default : out[field];
        continue;
      }
      out[field] = normalizeValue(row[field], spec);
      continue;
    }
    out[field] = normalizeValue(hasField ? row[field] : spec.default, spec);
  }
  return out;
}

function validateRows(rows, assetName, path) {
  assertArray(rows, path);
  const schema = getSchema(assetName);
  rows.forEach((row, i) => {
    if (!row || typeof row !== 'object') {
      throw new Error(`${path} row ${i} must be an object`);
    }
    for (const [field, spec] of Object.entries(schema.fields)) {
      validateField(row[field], spec, path, i, field);
    }
  });
  return rows;
}

function validateLeagueGames(rows, path = LEAGUE_ASSET_CONTRACT.H2H.path) {
  return validateRows(rows, 'H2H', path);
}

function validateSeasonSummaries(rows, path = LEAGUE_ASSET_CONTRACT.SeasonSummary.path) {
  return validateRows(rows, 'SeasonSummary', path);
}

function validateRivalries(rows, path = LEAGUE_ASSET_CONTRACT.Rivalries.path) {
  return validateRows(rows, 'Rivalries', path);
}

function validateCurrentSeason(data, path = 'assets/CurrentSeason.json') {
  if (data === null || data === undefined) return null;
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error(`${path} must be a JSON object`);
  }
  if (!isRequiredFiniteNumber(data.season)) throw new Error(`${path} missing numeric season`);
  if (!Array.isArray(data.games)) throw new Error(`${path} missing games`);
  validateRows(data.games, 'CurrentSeasonGame', `${path} games`);
  return data;
}

function validateLeagueAssetBundle(opts = {}) {
  const paths = {
    h2h: LEAGUE_ASSET_CONTRACT.H2H.path,
    seasonSummary: LEAGUE_ASSET_CONTRACT.SeasonSummary.path,
    rivalries: LEAGUE_ASSET_CONTRACT.Rivalries.path,
    ...(opts.paths || {}),
  };
  return {
    h2hRows: validateLeagueGames(opts.h2hRows, paths.h2h),
    seasonSummaryRows: validateSeasonSummaries(opts.seasonSummaryRows, paths.seasonSummary),
    rivalriesRows: validateRivalries(opts.rivalriesRows, paths.rivalries),
    currentSeason: opts.currentSeason === undefined ? undefined : validateCurrentSeason(opts.currentSeason, paths.currentSeason || 'assets/CurrentSeason.json'),
  };
}

function normalizeLeagueGame(row) {
  return normalizeRow(row, 'H2H');
}

function normalizeSeasonSummary(row) {
  return normalizeRow(row, 'SeasonSummary');
}

function normalizeRivalry(row) {
  return normalizeRow(row, 'Rivalries');
}

function normalizeCurrentSeasonGame(row) {
  return normalizeRow(row, 'CurrentSeasonGame');
}

export {
  LEAGUE_ASSET_CONTRACT,
  normalizeCurrentSeasonGame,
  normalizeLeagueGame,
  normalizeSeasonSummary,
  normalizeRivalry,
  validateCurrentSeason,
  validateLeagueGames,
  validateSeasonSummaries,
  validateRivalries,
  validateLeagueAssetBundle,
};
