const fs = require('node:fs');
const path = require('node:path');
const {
  DERIVED_GENERATOR_VERSION,
  GENERATED_ASSETS,
  MANIFEST_VERSION,
  SCHEMA_VERSION,
  SOURCE_ASSETS,
} = require('./constants.cjs');
const { canonicalJson, readJson, sha256Json } = require('./canonical-json.cjs');
const { inspectHeroAssets } = require('./media-validation.cjs');

function seasonCoverage(name, value) {
  const rows = Array.isArray(value) ? value : value?.games || value?.rows || [];
  if (name === 'Rivalries') return { rows: rows.length, season_min: null, season_max: null };
  const seasons = rows.map(row => Number(row.season)).filter(Number.isFinite);
  if (!seasons.length && Number.isFinite(value?.season)) seasons.push(Number(value.season));
  return {
    rows: rows.length,
    season_min: seasons.length ? Math.min(...seasons) : null,
    season_max: seasons.length ? Math.max(...seasons) : null,
  };
}

function jsonAssetEntry(root, name, config, value) {
  const filePath = path.join(root, config.path);
  const coverage = seasonCoverage(name, value);
  return {
    path: config.path,
    sha256: sha256Json(value),
    bytes: fs.statSync(filePath).size,
    ...coverage,
    required: config.required,
  };
}

async function buildManifest(root = process.cwd(), opts = {}) {
  const derivedPath = opts.derivedPath || path.join(root, 'assets', 'DerivedStats.json');
  const sourceValues = {};
  const assets = {};
  for (const [name, config] of Object.entries(SOURCE_ASSETS)) {
    const filePath = path.join(root, config.path);
    if (!fs.existsSync(filePath)) {
      if (config.required) throw new Error(`Missing required source asset: ${config.path}`);
      continue;
    }
    const value = readJson(filePath);
    sourceValues[name] = value;
    assets[name] = jsonAssetEntry(root, name, config, value);
  }
  const draftSpotPath = opts.draftSpotPath || path.join(root, GENERATED_ASSETS.DraftSpot.path);
  if (!fs.existsSync(draftSpotPath)) {
    throw new Error(`Missing generated Draft Spot asset: ${GENERATED_ASSETS.DraftSpot.path}`);
  }
  const draftSpot = readJson(draftSpotPath);
  assets.DraftSpot = jsonAssetEntry(root, 'DraftSpot', GENERATED_ASSETS.DraftSpot, draftSpot);
  const derived = readJson(derivedPath);
  const media = await inspectHeroAssets(root);
  if (media.errors.length) throw new Error(media.errors.join('\n'));
  const derivedEntry = {
    path: 'assets/DerivedStats.json',
    sha256: sha256Json(derived),
    bytes: fs.statSync(derivedPath).size,
    required: false,
    source_hashes: derived.source_hashes,
  };
  const schemaVersions = {
    H2H: SCHEMA_VERSION,
    SeasonSummary: SCHEMA_VERSION,
    Rivalries: SCHEMA_VERSION,
    CurrentSeason: SCHEMA_VERSION,
    DraftSpot: SCHEMA_VERSION,
    DerivedStats: SCHEMA_VERSION,
  };
  const versionInput = {
    source_hashes: Object.fromEntries(Object.entries(assets).map(([name, entry]) => [name, entry.sha256])),
    schema_versions: schemaVersions,
    derived_generator_version: DERIVED_GENERATOR_VERSION,
    derived_hash: derivedEntry.sha256,
    media_hashes: media.variants.map(variant => [variant.path, variant.sha256]),
  };
  return {
    manifest_version: MANIFEST_VERSION,
    data_version: sha256Json(versionInput),
    derived_generator_version: DERIVED_GENERATOR_VERSION,
    schema_versions: schemaVersions,
    assets,
    derived: derivedEntry,
    media: {
      leagueHero: { role: 'runtime-required', variants: media.variants },
      leagueHeroSource: {
        role: media.source.role,
        path: media.source.path,
        fallback: media.source.fallback,
      },
    },
  };
}

async function verifyManifest(root = process.cwd(), manifest = null) {
  const actual = manifest || readJson(path.join(root, 'assets', 'asset-manifest.json'));
  const expected = await buildManifest(root);
  return canonicalJson(actual) === canonicalJson(expected)
    ? []
    : ['ERROR [MANIFEST_STALE] assets/asset-manifest.json: regenerate with npm run generate:manifest'];
}

module.exports = {
  buildManifest,
  jsonAssetEntry,
  seasonCoverage,
  verifyManifest,
};
