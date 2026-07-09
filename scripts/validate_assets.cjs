#!/usr/bin/env node
/* Validate the canonical JSON asset bundle before scripts or tests consume it. */
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

const HERO_REQUIREMENTS = [
  { file: 'league-480.avif', maxBytes: 90 * 1024 },
  { file: 'league-768.avif', maxBytes: 150 * 1024 },
  { file: 'league-1280.avif', maxBytes: 300 * 1024 },
  { file: 'league-1920.avif', maxBytes: 520 * 1024 },
  { file: 'league-480.webp', maxBytes: 110 * 1024 },
  { file: 'league-768.webp', maxBytes: 180 * 1024 },
  { file: 'league-1280.webp', maxBytes: 360 * 1024 },
  { file: 'league-1920.webp', maxBytes: 640 * 1024 },
  { file: 'league-480.jpg', maxBytes: 130 * 1024 },
  { file: 'league-768.jpg', maxBytes: 220 * 1024 },
  { file: 'league-1280.jpg', maxBytes: 430 * 1024 },
  { file: 'league-1920.jpg', maxBytes: 760 * 1024 },
];

function validateHeroAssets(root = process.cwd()) {
  const heroDir = path.join(root, 'assets', 'hero');
  if (!fs.existsSync(heroDir)) {
    throw new Error(`Missing hero asset directory: ${path.relative(root, heroDir)}`);
  }
  for (const requirement of HERO_REQUIREMENTS) {
    const filePath = path.join(heroDir, requirement.file);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Missing hero image: ${path.relative(root, filePath)}`);
    }
    const size = fs.statSync(filePath).size;
    if (size > requirement.maxBytes) {
      throw new Error(`Hero image too large: ${path.relative(root, filePath)} ${(size / 1024).toFixed(1)} KB > ${(requirement.maxBytes / 1024).toFixed(0)} KB`);
    }
  }
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
  validateHeroAssets();

  console.log('Asset validation passed.');
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  });
}

module.exports = {
  HERO_REQUIREMENTS,
  validateHeroAssets,
};
