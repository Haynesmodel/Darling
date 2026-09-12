#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { TextDecoder } = require('node:util');
const { sha256Json } = require('./data/canonical-json.cjs');
const SHARE_CARD_PATH = path.join('assets', 'share', 'darling-default-card.png');
const SHARE_CARD_MAX_BYTES = 250000;

function readUtf8Json(filePath) {
  const bytes = fs.readFileSync(filePath);
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error('not valid UTF-8');
  }
  return JSON.parse(text);
}

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
    manifest = readUtf8Json(manifestPath);
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
      value = readUtf8Json(builtPath);
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
  const sourceShareCard = path.join(root, SHARE_CARD_PATH);
  const builtShareCard = path.join(root, outputDir, SHARE_CARD_PATH);
  if (!fs.existsSync(sourceShareCard)) errors.push(`${SHARE_CARD_PATH} is missing`);
  if (!fs.existsSync(builtShareCard)) errors.push(`${outputDir}/${SHARE_CARD_PATH} is missing`);
  if (fs.existsSync(sourceShareCard) && fs.existsSync(builtShareCard)) {
    const source = fs.readFileSync(sourceShareCard);
    const built = fs.readFileSync(builtShareCard);
    if (!source.equals(built)) errors.push(`${outputDir}/${SHARE_CARD_PATH} differs from the committed source image`);
    if (source.length > SHARE_CARD_MAX_BYTES) errors.push(`${SHARE_CARD_PATH} exceeds ${SHARE_CARD_MAX_BYTES} bytes`);
    const png = source.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    if (!png) errors.push(`${SHARE_CARD_PATH} has an invalid PNG signature`);
    else if (source.length < 24 || source.readUInt32BE(16) !== 1200 || source.readUInt32BE(20) !== 630) {
      errors.push(`${SHARE_CARD_PATH} must be exactly 1200x630`);
    }
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

module.exports = { auditBuiltAssets, SHARE_CARD_MAX_BYTES, SHARE_CARD_PATH };
