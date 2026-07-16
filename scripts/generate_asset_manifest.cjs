#!/usr/bin/env node
const path = require('node:path');
const { writeCanonicalJson } = require('./data/canonical-json.cjs');
const { GENERATED_ASSETS } = require('./data/constants.cjs');
const { buildManifest } = require('./data/manifest.cjs');

function outputRootFromArgs(argv) {
  const index = argv.indexOf('--output-root');
  return index >= 0 ? path.resolve(argv[index + 1]) : process.cwd();
}

async function generateAssetManifest({ sourceRoot = process.cwd(), outputRoot = sourceRoot, draftSpotPath } = {}) {
  const derivedPath = path.join(outputRoot, GENERATED_ASSETS.DerivedStats.path);
  const manifest = await buildManifest(sourceRoot, {
    derivedPath,
    draftSpotPath: draftSpotPath || path.join(outputRoot, GENERATED_ASSETS.DraftSpot.path),
  });
  const outputPath = path.join(outputRoot, GENERATED_ASSETS.AssetManifest.path);
  writeCanonicalJson(outputPath, manifest);
  return { outputPath, manifest };
}

if (require.main === module) {
  generateAssetManifest({ outputRoot: outputRootFromArgs(process.argv.slice(2)) })
    .then(({ outputPath }) => console.log(`Generated ${path.relative(process.cwd(), outputPath)}`))
    .catch(error => { console.error(error.message || error); process.exit(1); });
}

module.exports = { generateAssetManifest };
