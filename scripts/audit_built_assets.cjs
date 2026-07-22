#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { readJson, sha256Json } = require('./data/canonical-json.cjs');

function safeOutputPath(outputRoot, assetPath) {
  if (typeof assetPath !== 'string') return null;
  const resolved = path.resolve(outputRoot, assetPath);
  return resolved === outputRoot || resolved.startsWith(`${outputRoot}${path.sep}`) ? resolved : null;
}

function isWithinOutput(outputRoot, candidate) {
  return candidate === outputRoot || candidate.startsWith(`${outputRoot}${path.sep}`);
}

function auditBuiltAssets(root = process.cwd(), outputDir = 'dist') {
  const manifestPath = path.join(root, outputDir, 'assets', 'asset-manifest.json');
  const errors = [];
  if (!fs.existsSync(manifestPath)) return [`${outputDir}/assets/asset-manifest.json is missing`];
  let manifest;
  try {
    manifest = readJson(manifestPath);
  } catch (error) {
    return [`${outputDir}/assets/asset-manifest.json is invalid: ${error.message}`];
  }
  const outputRoot = path.resolve(root, outputDir);
  const realOutputRoot = fs.realpathSync(outputRoot);
  const jsonAssets = [...Object.values(manifest.assets || {}), manifest.derived].filter(Boolean);
  for (const asset of jsonAssets) {
    const assetPath = asset.path;
    const builtPath = safeOutputPath(outputRoot, assetPath);
    if (!builtPath) {
      errors.push(`${outputDir}/${assetPath} escapes the build output`);
      continue;
    }
    if (!fs.existsSync(builtPath)) {
      errors.push(`${outputDir}/${assetPath} is missing`);
      continue;
    }
    if (!isWithinOutput(realOutputRoot, fs.realpathSync(builtPath))) {
      errors.push(`${outputDir}/${assetPath} resolves outside the build output`);
      continue;
    }
    const actualBytes = fs.statSync(builtPath).size;
    if (actualBytes !== asset.bytes) {
      errors.push(`${outputDir}/${assetPath} byte size ${actualBytes} does not match manifest ${asset.bytes}`);
    }
    let value;
    try {
      value = readJson(builtPath);
    } catch (error) {
      errors.push(`${outputDir}/${assetPath} is invalid JSON: ${error.message}`);
      continue;
    }
    const actualSha256 = sha256Json(value);
    if (actualSha256 !== asset.sha256) {
      errors.push(`${outputDir}/${assetPath} hash ${actualSha256} does not match manifest ${asset.sha256}`);
    }
  }
  for (const variant of manifest.media?.leagueHero?.variants || []) {
    const builtPath = safeOutputPath(outputRoot, variant.path);
    if (!builtPath) errors.push(`${outputDir}/${variant.path} escapes the build output`);
    else if (!fs.existsSync(builtPath)) errors.push(`${outputDir}/${variant.path} is missing`);
    else if (!isWithinOutput(realOutputRoot, fs.realpathSync(builtPath))) errors.push(`${outputDir}/${variant.path} resolves outside the build output`);
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
