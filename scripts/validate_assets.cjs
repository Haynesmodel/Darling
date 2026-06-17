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
  ];
  if (argv.length === 0) return defaults;
  if (argv.length !== 3 && argv.length !== 4) {
    throw new Error('Usage: node scripts/validate_assets.cjs [H2H.json SeasonSummary.json Rivalries.json [CurrentSeason.json]]');
  }
  return argv.map(arg => path.resolve(process.cwd(), arg)).concat(argv.length === 3 ? [defaults[3]] : []);
}

async function main() {
  const [h2hPath, seasonSummaryPath, rivalriesPath, currentSeasonPath] = resolveAssetPaths(process.argv.slice(2));
  const { validateLeagueAssetBundle } = await import(pathToFileURL(path.join(__dirname, '../js/asset-validation.js')).href);
  const currentSeason = fs.existsSync(currentSeasonPath) ? readJson(currentSeasonPath) : undefined;

  validateLeagueAssetBundle({
    h2hRows: readJson(h2hPath),
    seasonSummaryRows: readJson(seasonSummaryPath),
    rivalriesRows: readJson(rivalriesPath),
    currentSeason,
    paths: {
      h2h: h2hPath,
      seasonSummary: seasonSummaryPath,
      rivalries: rivalriesPath,
      currentSeason: currentSeasonPath,
    },
  });

  console.log('Asset validation passed.');
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
