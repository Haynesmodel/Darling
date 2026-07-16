#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { HERO_REQUIREMENTS, SOURCE_ASSETS } = require('./data/constants.cjs');
const { readJson, sha256Json } = require('./data/canonical-json.cjs');
const { createAjv, validateStructuralAssets, validateWithSchema } = require('./data/schema-validation.cjs');
const { validateSemanticBundle } = require('./data/semantic-validation.cjs');
const { verifyManifest } = require('./data/manifest.cjs');
const { validateMedia } = require('./data/media-validation.cjs');

function validateHeroAssets(root = process.cwd()) {
  const heroDir = path.join(root, 'assets', 'hero');
  if (!fs.existsSync(heroDir)) throw new Error(`Missing hero asset directory: ${path.relative(root, heroDir)}`);
  for (const requirement of HERO_REQUIREMENTS) {
    const filePath = path.join(heroDir, requirement.file);
    if (!fs.existsSync(filePath)) throw new Error(`Missing hero image: ${path.relative(root, filePath)}`);
    const size = fs.statSync(filePath).size;
    if (size > requirement.maxBytes) throw new Error(`Hero image too large: ${path.relative(root, filePath)}`);
  }
}

function resolveAssetPaths(argv, root = process.cwd()) {
  const defaults = Object.values(SOURCE_ASSETS).map(asset => path.join(root, asset.path));
  if (!argv.length) return { paths: defaults, custom: false };
  if (argv.length !== 3 && argv.length !== 4) {
    throw new Error('Usage: node scripts/validate_assets.cjs [H2H.json SeasonSummary.json Rivalries.json [CurrentSeason.json]]');
  }
  return {
    paths: argv.map(file => path.resolve(root, file)).concat(argv.length === 3 ? [defaults[3]] : []),
    custom: true,
  };
}

function readBundle(paths) {
  const names = Object.keys(SOURCE_ASSETS);
  return Object.fromEntries(paths.map((filePath, index) => [
    names[index],
    fs.existsSync(filePath) ? readJson(filePath) : null,
  ]));
}

function validateDerivedDependencies(bundle, derived) {
  const errors = [];
  for (const name of ['H2H', 'SeasonSummary', 'Rivalries']) {
    const actual = sha256Json(bundle[name]);
    if (derived.source_hashes[name] !== actual) errors.push(`ERROR [DERIVED_SOURCE_HASH] assets/DerivedStats.json: ${name} source hash is stale`);
  }
  return errors;
}

function validateDraftSpotDependencies(bundle, draftSpot) {
  if (!draftSpot) {
    return ['ERROR [DRAFT_SPOT_MISSING] assets/DraftSpot.json: generated asset is missing'];
  }
  const actual = sha256Json(bundle.SeasonSummary);
  return draftSpot.source_sha256 === actual
    ? []
    : ['ERROR [DRAFT_SPOT_SOURCE_HASH] assets/DraftSpot.json: SeasonSummary source hash is stale'];
}

async function validateAssets(root = process.cwd(), argv = []) {
  const resolved = resolveAssetPaths(argv, root);
  const bundle = readBundle(resolved.paths);
  const errors = [];
  const warnings = [];
  const contractRoot = fs.existsSync(path.join(root, 'schemas')) ? root : path.join(__dirname, '..');
  const fullAudit = !resolved.custom
    && fs.existsSync(path.join(root, 'schemas'))
    && fs.existsSync(path.join(root, 'assets', 'asset-manifest.json'));
  const ajv = createAjv(contractRoot);

  if (!fullAudit) {
    Object.entries(SOURCE_ASSETS).forEach(([name, config], index) => {
      if (bundle[name] === null && !config.required) return;
      errors.push(...validateWithSchema(ajv, config.schema, bundle[name], resolved.paths[index]));
    });
  } else {
    errors.push(...validateStructuralAssets(root, { ajv, includeGenerated: true }));
  }

  if (!errors.length) {
    const semantic = validateSemanticBundle(bundle, { root: contractRoot });
    errors.push(...semantic.errors);
    warnings.push(...semantic.warnings);
  }

  if (fullAudit && !errors.length) {
    const derived = readJson(path.join(root, 'assets', 'DerivedStats.json'));
    const draftSpot = readJson(path.join(root, 'assets', 'DraftSpot.json'));
    errors.push(...validateDerivedDependencies(bundle, derived));
    errors.push(...validateDraftSpotDependencies(bundle, draftSpot));
    errors.push(...await verifyManifest(root));
  }

  if (fullAudit) {
    const manifestPath = path.join(root, 'assets', 'asset-manifest.json');
    const manifest = readJson(manifestPath);
    const media = await validateMedia(root, manifest);
    errors.push(...media.errors);
    warnings.push(...media.warnings);
  }
  return { errors, warnings };
}

async function main() {
  const result = await validateAssets(process.cwd(), process.argv.slice(2));
  result.warnings.forEach(warning => console.warn(warning));
  if (result.errors.length) {
    result.errors.slice(0, 100).forEach(error => console.error(error));
    process.exit(1);
  }
  console.log('Asset validation passed.');
}

if (require.main === module) main().catch(error => { console.error(error.message || error); process.exit(1); });

module.exports = {
  HERO_REQUIREMENTS,
  resolveAssetPaths,
  validateAssets,
  validateDraftSpotDependencies,
  validateDerivedDependencies,
  validateHeroAssets,
};
