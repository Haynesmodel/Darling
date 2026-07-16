const path = require('node:path');

const SCHEMA_VERSION = 1;
const MANIFEST_VERSION = 2;
const DERIVED_GENERATOR_VERSION = 1;

const SOURCE_ASSETS = Object.freeze({
  H2H: { path: 'assets/H2H.json', schema: 'h2h.schema.json', required: true },
  SeasonSummary: { path: 'assets/SeasonSummary.json', schema: 'season-summary.schema.json', required: true },
  Rivalries: { path: 'assets/Rivalries.json', schema: 'rivalries.schema.json', required: false },
  CurrentSeason: { path: 'assets/CurrentSeason.json', schema: 'current-season.schema.json', required: false },
});

const GENERATED_ASSETS = Object.freeze({
  DraftSpot: { path: 'assets/DraftSpot.json', schema: 'draft-spot.schema.json', required: false },
  DerivedStats: { path: 'assets/DerivedStats.json', schema: 'derived-stats.schema.json' },
  AssetManifest: { path: 'assets/asset-manifest.json', schema: 'asset-manifest.schema.json' },
  AssetTypes: { path: 'src/data/generated/asset-types.ts' },
  AssetValidators: { path: 'src/data/generated/asset-validators.ts' },
});

const HERO_REQUIREMENTS = Object.freeze([
  { file: 'league-480.avif', format: 'avif', width: 480, maxBytes: 90 * 1024 },
  { file: 'league-768.avif', format: 'avif', width: 768, maxBytes: 150 * 1024 },
  { file: 'league-1280.avif', format: 'avif', width: 1280, maxBytes: 300 * 1024 },
  { file: 'league-1920.avif', format: 'avif', width: 1920, maxBytes: 520 * 1024 },
  { file: 'league-480.webp', format: 'webp', width: 480, maxBytes: 110 * 1024 },
  { file: 'league-768.webp', format: 'webp', width: 768, maxBytes: 180 * 1024 },
  { file: 'league-1280.webp', format: 'webp', width: 1280, maxBytes: 360 * 1024 },
  { file: 'league-1920.webp', format: 'webp', width: 1920, maxBytes: 640 * 1024 },
  { file: 'league-480.jpg', format: 'jpeg', width: 480, maxBytes: 130 * 1024 },
  { file: 'league-768.jpg', format: 'jpeg', width: 768, maxBytes: 220 * 1024 },
  { file: 'league-1280.jpg', format: 'jpeg', width: 1280, maxBytes: 430 * 1024 },
  { file: 'league-1920.jpg', format: 'jpeg', width: 1920, maxBytes: 760 * 1024 },
]);

function fromRoot(root, relativePath) {
  return path.join(root, ...relativePath.split('/'));
}

module.exports = {
  DERIVED_GENERATOR_VERSION,
  GENERATED_ASSETS,
  HERO_REQUIREMENTS,
  MANIFEST_VERSION,
  SCHEMA_VERSION,
  SOURCE_ASSETS,
  fromRoot,
};
