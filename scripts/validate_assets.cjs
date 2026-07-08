#!/usr/bin/env node
/* Validate the canonical JSON asset bundle before scripts or tests consume it. */
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function resolveAssetPaths(argv) {
  const defaults = [
    path.join(process.cwd(), 'assets', 'H2H.json'),
    path.join(process.cwd(), 'assets', 'SeasonSummary.json'),
    path.join(process.cwd(), 'assets', 'Rivalries.json'),
    path.join(process.cwd(), 'assets', 'CurrentSeason.json'),
    path.join(process.cwd(), 'assets', 'DraftSpot.json'),
  ];
  if (argv.length === 0) return defaults;
  if (argv.length < 3 || argv.length > 5) {
    throw new Error('Usage: node scripts/validate_assets.cjs [H2H.json SeasonSummary.json Rivalries.json [CurrentSeason.json [DraftSpot.json]]]');
  }
  const resolved = argv.map(arg => path.resolve(process.cwd(), arg));
  if (resolved.length === 3) resolved.push(defaults[3]);
  if (resolved.length === 4) resolved.push(defaults[4]);
  return resolved;
}

async function main() {
  const [h2hPath, seasonSummaryPath, rivalriesPath, currentSeasonPath, draftSpotPath] = resolveAssetPaths(process.argv.slice(2));
  const { validateLeagueAssetBundle } = await import(pathToFileURL(path.join(__dirname, '../js/asset-validation.js')).href);
  const currentSeason = fs.existsSync(currentSeasonPath) ? readJson(currentSeasonPath) : undefined;
  const draftSpot = fs.existsSync(draftSpotPath) ? readJson(draftSpotPath) : undefined;

  validateLeagueAssetBundle({
    h2hRows: readJson(h2hPath),
    seasonSummaryRows: readJson(seasonSummaryPath),
    rivalriesRows: readJson(rivalriesPath),
    currentSeason,
    draftSpot,
    paths: {
      h2h: h2hPath,
      seasonSummary: seasonSummaryPath,
      rivalries: rivalriesPath,
      currentSeason: currentSeasonPath,
      draftSpot: draftSpotPath,
    },
  });

  console.log('Asset validation passed.');
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
