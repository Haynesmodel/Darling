#!/usr/bin/env node
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { generateAssetTypes } = require('./generate_asset_types.cjs');
const { generateAssetValidators } = require('./generate_asset_validators.cjs');
const { generateDerivedStats } = require('./generate_derived_stats.cjs');
const { generateAssetManifest } = require('./generate_asset_manifest.cjs');
const { GENERATED_ASSETS } = require('./data/constants.cjs');

const CHECKED = [
  GENERATED_ASSETS.DraftSpot.path,
  GENERATED_ASSETS.AssetTypes.path,
  GENERATED_ASSETS.AssetValidators.path,
  GENERATED_ASSETS.DerivedStats.path,
  GENERATED_ASSETS.AssetManifest.path,
];

async function checkGeneratedAssets(root = process.cwd()) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'darling-data-generated-'));
  try {
    const draftOutput = path.join(temp, GENERATED_ASSETS.DraftSpot.path);
    const draftResult = spawnSync('python3', [
      path.join(root, 'scripts/generate_draft_spot_asset.py'),
      '--season-summary',
      path.join(root, 'assets/SeasonSummary.json'),
      '--out',
      draftOutput,
    ], { cwd: root, encoding: 'utf8' });
    if (draftResult.status !== 0) {
      throw new Error(draftResult.stderr || draftResult.stdout || 'Draft Spot generation failed');
    }
    await generateAssetTypes({ sourceRoot: root, outputRoot: temp });
    generateAssetValidators({ sourceRoot: root, outputRoot: temp });
    generateDerivedStats({ sourceRoot: root, outputRoot: temp });
    await generateAssetManifest({
      sourceRoot: root,
      outputRoot: temp,
      draftSpotPath: draftOutput,
    });
    const failures = [];
    for (const relativePath of CHECKED) {
      const committedPath = path.join(root, relativePath);
      const generatedPath = path.join(temp, relativePath);
      if (!fs.existsSync(committedPath)) failures.push(`${relativePath}: committed generated file is missing`);
      else if (!fs.readFileSync(committedPath).equals(fs.readFileSync(generatedPath))) failures.push(`${relativePath}: stale; run npm run generate:data`);
    }
    return failures;
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

if (require.main === module) {
  checkGeneratedAssets().then(failures => {
    if (failures.length) {
      failures.forEach(failure => console.error(`ERROR [GENERATED_DRIFT] ${failure}`));
      process.exit(1);
    }
    console.log('Generated asset drift check passed.');
  }).catch(error => { console.error(error.message || error); process.exit(1); });
}

module.exports = { CHECKED, checkGeneratedAssets };
