const fs = require('node:fs');
const path = require('node:path');
const Ajv2020 = require('ajv/dist/2020').default;
const addFormats = require('ajv-formats').default;
const { GENERATED_ASSETS, SOURCE_ASSETS } = require('./constants.cjs');
const { readJson } = require('./canonical-json.cjs');

const SCHEMA_FILES = Object.freeze([
  'common.schema.json',
  'h2h.schema.json',
  'season-summary.schema.json',
  'rivalries.schema.json',
  'current-season.schema.json',
  'derived-stats.schema.json',
  'asset-manifest.schema.json',
]);

function loadSchemas(root = process.cwd()) {
  return SCHEMA_FILES.map(file => readJson(path.join(root, 'schemas', file)));
}

function createAjv(root = process.cwd(), opts = {}) {
  const ajv = new Ajv2020({
    allErrors: true,
    strict: true,
    validateFormats: true,
    allowUnionTypes: true,
    code: { esm: true, source: true },
    ...opts,
  });
  addFormats(ajv);
  for (const schema of loadSchemas(root)) ajv.addSchema(schema);
  return ajv;
}

function schemaId(file) {
  return `https://darling.example/schemas/${file}`;
}

function describeError(assetPath, error) {
  const segments = String(error.instancePath || '').split('/').filter(Boolean);
  const rowIndex = segments.find(segment => /^\d+$/.test(segment));
  const fieldSegments = rowIndex === undefined ? segments : segments.slice(segments.indexOf(rowIndex) + 1);
  const row = rowIndex === undefined ? '' : ` row ${Number(rowIndex)}`;
  const field = fieldSegments.length ? `, field "${fieldSegments.join('.')}"` : '';
  const extra = error.keyword === 'additionalProperties'
    ? ` "${error.params.additionalProperty}"`
    : '';
  return `ERROR [SCHEMA_${String(error.keyword).toUpperCase()}] ${assetPath}:${row}${field} ${error.message}${extra}`;
}

function validateWithSchema(ajv, schemaFile, value, assetPath, maxErrors = 50) {
  const validate = ajv.getSchema(schemaId(schemaFile));
  if (!validate) throw new Error(`Schema was not registered: ${schemaFile}`);
  if (validate(value)) return [];
  return (validate.errors || []).slice(0, maxErrors).map(error => describeError(assetPath, error));
}

function validateStructuralAssets(root = process.cwd(), opts = {}) {
  const ajv = opts.ajv || createAjv(root);
  const values = opts.values || {};
  const errors = [];
  for (const [name, config] of Object.entries(SOURCE_ASSETS)) {
    const filePath = path.join(root, config.path);
    if (!fs.existsSync(filePath)) {
      if (config.required) errors.push(`ERROR [ASSET_MISSING] ${config.path}: required source asset is missing`);
      continue;
    }
    const value = Object.prototype.hasOwnProperty.call(values, name) ? values[name] : readJson(filePath);
    errors.push(...validateWithSchema(ajv, config.schema, value, config.path));
  }
  for (const [name, config] of Object.entries({
    DerivedStats: GENERATED_ASSETS.DerivedStats,
    AssetManifest: GENERATED_ASSETS.AssetManifest,
  })) {
    const filePath = path.join(root, config.path);
    if (!fs.existsSync(filePath)) {
      if (opts.includeGenerated) errors.push(`ERROR [ASSET_MISSING] ${config.path}: generated asset is missing`);
      continue;
    }
    const value = Object.prototype.hasOwnProperty.call(values, name) ? values[name] : readJson(filePath);
    errors.push(...validateWithSchema(ajv, config.schema, value, config.path));
  }
  return errors;
}

module.exports = {
  SCHEMA_FILES,
  createAjv,
  describeError,
  loadSchemas,
  schemaId,
  validateStructuralAssets,
  validateWithSchema,
};
