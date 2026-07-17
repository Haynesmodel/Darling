#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { readJson } = require('./data/canonical-json.cjs');

function auditBuiltAssets(root = process.cwd(), outputDir = 'dist') {
  const manifestPath = path.join(root, outputDir, 'assets', 'asset-manifest.json');
  const errors = [];
  if (!fs.existsSync(manifestPath)) return [`${outputDir}/assets/asset-manifest.json is missing`];
  const manifest = readJson(manifestPath);
  const paths = [
    ...Object.values(manifest.assets).map(asset => asset.path),
    ...(manifest.derived.required ? [manifest.derived.path] : []),
    ...manifest.media.leagueHero.variants.map(variant => variant.path),
  ];
  for (const assetPath of paths) {
    if (!fs.existsSync(path.join(root, outputDir, assetPath))) errors.push(`${outputDir}/${assetPath} is missing`);
  }
  const assetRoot = path.join(root, outputDir, 'assets');
  if (fs.existsSync(assetRoot)) {
    for (const entry of fs.readdirSync(assetRoot)) {
      if (entry.startsWith('.') || /(?:\.draft|\.updated|_backup)\.json$/.test(entry)) errors.push(`${outputDir}/assets/${entry} must not be deployed`);
    }
  }
  return errors;
}

if (require.main === module) {
  const outputDir = process.argv[2] || 'dist';
  const errors = auditBuiltAssets(process.cwd(), outputDir);
  if (errors.length) {
    errors.forEach(error => console.error(`ERROR [BUILT_ASSET_AUDIT] ${error}`));
    process.exit(1);
  }
  console.log(`Built asset audit passed for ${outputDir}.`);
}

module.exports = { auditBuiltAssets };
