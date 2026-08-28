#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const standaloneCode = require('ajv/dist/standalone').default;
const esbuild = require('esbuild');
const { GENERATED_ASSETS } = require('./data/constants.cjs');
const { createAjv, schemaId } = require('./data/schema-validation.cjs');

function outputRootFromArgs(argv) {
  const index = argv.indexOf('--output-root');
  return index >= 0 ? path.resolve(argv[index + 1]) : process.cwd();
}

function specializeFormatRuntime(standaloneModule) {
  const specialized = standaloneModule.replaceAll(
    'require("ajv-formats/dist/formats")',
    'require("./scripts/data/standalone-formats.cjs")',
  );
  if (specialized.includes('ajv-formats/dist/formats')) {
    throw new Error('Generated validators still reference the full ajv-formats runtime');
  }
  return specialized;
}

function compactValidatorErrors(standaloneModule) {
  const compacted = standaloneModule.replace(
    /,schemaPath:"(?:\\.|[^"])*",keyword:"[^"]+",params:\{(?:"(?:\\.|[^"])*"|[^{}])*\}/g,
    '',
  );
  if (compacted.includes('schemaPath:') || compacted.includes('keyword:') || compacted.includes('params:')) {
    throw new Error('Generated validators contain an unsupported error-object shape');
  }
  return compacted;
}

// Browser validation only needs a fail-closed boolean.  AJV's standalone
// output otherwise allocates an error object for every failed keyword and
// carries those objects through every nested validator, even though runtime
// callers turn them into the same generic optional-asset diagnostic.  Keep the
// validation branches and counters intact while dropping that diagnostics-only
// allocation from shipped browser code.  Build-time AJV still reports full
// errors through the Node validation path.
function stripValidatorErrorConstruction(standaloneModule) {
  return standaloneModule.replace(
    /\s*const err\d+ = \{ instancePath(?:[^}]*) \};\s*if \(vErrors === null\) \{\s*vErrors = \[err\d+\];\s*\} else \{\s*vErrors\.push\(err\d+\);\s*\}/g,
    '',
  ).replace(/\s*validate\d+\.errors = \[\{[^;]*\}\];/g, '');
}

function stripValidatorBookkeeping(standaloneModule) {
  return standaloneModule
    .replace(/\s*vErrors = vErrors === null \? validate\d+\.errors : vErrors\.concat\(validate\d+\.errors\);\n(\s*)errors = vErrors\.length;/g, '\n$1errors++;')
    .replace(/\s*let vErrors = null;/g, '')
    .replace(/\s*validate\d+\.errors = vErrors;/g, '')
    .replace(/\s*const evaluated\d+ = validate\d+\.evaluated;\s*if \(evaluated\d+\.dynamicProps\) \{\s*evaluated\d+\.props = void 0;\s*\}\s*if \(evaluated\d+\.dynamicItems\) \{\s*evaluated\d+\.items = void 0;\s*\}/g, '')
    .replace(/\s*validate\d+\.evaluated = [^\n]*;\n/g, '')
    .replace(/function (validate\d+)\(data, \{[^)]*\} = \{\}\)/g, 'function $1(data)')
    .replace(/, \{ instancePath[^}]*\}/g, '')
    .replace(/\s*if \(vErrors !== null\) \{\s*if \(_errs\d+\) \{\s*vErrors\.length = _errs\d+;\s*\} else \{\s*vErrors = null;\s*\}\s*\}/g, '');
}

function compactGeneratedSchemas(source) {
  // AJV's generated checks only read a handful of schema metadata paths at
  // runtime (mostly `required` for nested array objects). Retain those exact
  // item paths, while dropping the otherwise-unused item schema descriptions.
  // The validation branches themselves remain untouched.
  const neededItemFields = new Map();
  const fullProperties = new Set();
  const neededFields = new Map();
  const addField = (path, field) => {
    if (!neededFields.has(path)) neededFields.set(path, new Set());
    neededFields.get(path).add(field);
  };
  const propertyMapReference = /((?:schema\d+)(?:(?:\.allOf\[\d+\]))*)\.properties\s*,/g;
  for (const match of source.matchAll(propertyMapReference)) fullProperties.add(`${match[1]}.properties`);
  const fieldReference = /((?:schema\d+)(?:(?:\.properties\.[A-Za-z0-9_]+)|(?:\.allOf\[\d+\]))+)\.(required|enum|properties|items|allOf)/g;
  for (const match of source.matchAll(fieldReference)) {
    addField(match[1], match[2]);
    const segments = match[1].split('.');
    for (let index = 0; index < segments.length; index += 1) {
      if (segments[index] === 'properties' || segments[index].startsWith('allOf[')) {
        addField(segments.slice(0, index).join('.'), segments[index] === 'properties' ? 'properties' : 'allOf');
      }
    }
  }
  const itemReference = /((?:schema\d+)(?:(?:\.properties\.[A-Za-z0-9_]+)|(?:\.allOf\[\d+\]))+\.items)\.(required|enum|properties|items|allOf)/g;
  for (const match of source.matchAll(itemReference)) {
    if (!neededItemFields.has(match[1])) neededItemFields.set(match[1], new Set());
    neededItemFields.get(match[1]).add(match[2]);
  }
  const keep = (schema, path = '') => {
    if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return schema;
    const result = {};
    const itemFields = neededItemFields.get(path);
    const root = /^schema\d+(?:\.allOf\[\d+\])*$/.test(path);
    const fields = neededFields.get(path);
    if (schema.required && (!itemFields || itemFields.has('required')) && (root || fields?.has('required') || itemFields?.has('required'))) result.required = schema.required;
    if (schema.enum && (!itemFields || itemFields.has('enum')) && (root || fields?.has('enum') || itemFields?.has('enum'))) result.enum = schema.enum;
    if (schema.properties && (!itemFields || itemFields.has('properties')) && (root || fields?.has('properties') || fullProperties.has(path))) {
      const properties = Object.entries(schema.properties);
      const keys = fullProperties.has(path) || root
        ? properties
        : properties.filter(([key]) => [...neededFields.keys()].some(reference => reference === `${path}.properties.${key}` || reference.startsWith(`${path}.properties.${key}.`)));
      result.properties = Object.fromEntries(keys.map(([key, value]) => [key, keep(value, `${path}.properties.${key}`)]));
    }
    const itemPath = `${path}.items`;
    if (schema.items && (!itemFields || itemFields.has('items')) && neededItemFields.has(itemPath)) {
      result.items = keep(schema.items, itemPath);
    }
    if (schema.allOf && (!itemFields || itemFields.has('allOf'))) {
      result.allOf = schema.allOf.map((value, index) => keep(value, `${path}.allOf[${index}]`));
    }
    return result;
  };
  const declaration = /var (schema\d+) = /g;
  let match;
  let output = '';
  let cursor = 0;
  while ((match = declaration.exec(source))) {
    const start = declaration.lastIndex;
    let index = start;
    let depth = 0;
    let quote = false;
    let escaped = false;
    for (; index < source.length; index += 1) {
      const character = source[index];
      if (quote) {
        if (escaped) escaped = false;
        else if (character === '\\') escaped = true;
        else if (character === '"') quote = false;
      } else if (character === '"') quote = true;
      else if (character === '{') depth += 1;
      else if (character === '}' && --depth === 0) break;
    }
    if (depth !== 0 || source[index + 1] !== ';') continue;
    let parsed;
    try { parsed = JSON.parse(source.slice(start, index + 1)); } catch { continue; }
    output += source.slice(cursor, start) + JSON.stringify(keep(parsed, match[1]));
    cursor = index + 1;
    declaration.lastIndex = cursor;
  }
  return output ? output + source.slice(cursor) : source;
}

function compactBundledRuntime(source) {
  const formats = source.match(/var require_standalone_formats = __commonJS\(\{\n  "scripts\/data\/standalone-formats\.cjs"\(exports, module\) \{([\s\S]*?)\n    module\.exports = \{[\s\S]*?\n    \};\n  \}\n\}\);/);
  let compacted = source;
  if (formats) {
    const body = formats[1].replace(/^ {4}/gm, '');
    compacted = compacted
      .replace(/var __getOwnPropNames = Object\.getOwnPropertyNames;\nvar __commonJS = \(cb, mod\) => function __require\(\) \{[\s\S]*?\n\};\n\n/, '')
      .replace(formats[0], `${body}\nvar formats0 = { validate: date }, formats2 = { validate: dateTime };`)
      .replace(/var formats\d+ = require_standalone_formats\(\)\.fullFormats(?:\.date|\["date-time"\]);\n?/g, '');
  }
  return compacted
    // These assets use uniqueItems only for primitive arrays, so strict
    // equality is sufficient and AJV's deep-equality helper is unnecessary.
    .replace(/\/\/ node_modules\/fast-deep-equal\/index\.js[\s\S]*?\/\/ scripts\/data\/standalone-formats\.cjs/, '// scripts/data/standalone-formats.cjs')
    .replace(/var func0 = require_equal\(\)\.default;/g, 'var func0 = (a, b) => a === b;')
    // Native code-point length matches AJV's ucs2 helper for these modern
    // browser targets and avoids shipping another CommonJS wrapper.
    .replace(/\/\/ node_modules\/ajv\/dist\/runtime\/ucs2length\.js[\s\S]*?\/\/ scripts\/data\/standalone-formats\.cjs/, '// scripts/data/standalone-formats.cjs')
    .replace(/var func4 = require_ucs2length\(\)\.default;/g, 'var func4 = value => [...value].length;');
}

function compactGeneratedChecks(source) {
  return source
    .replace(/func3\.call\(([^,]+), ([^)]+)\)/g, 'func3($1, $2)')
    .replace(/var func3 = Object\.prototype\.hasOwnProperty;/g, 'var func3 = Object.hasOwn;')
    .replace(/typeof (data\d+) == "number" && \(!\(\1 % 1\) && !isNaN\(\1\)\) && isFinite\(\1\)/g, 'Number.isInteger($1)')
    .replace(/typeof (data\d+) === "number" && isFinite\(\1\)/g, 'Number.isFinite($1)')
    .replace(/typeof (data\d+) == "number" && isFinite\(\1\)/g, 'Number.isFinite($1)')
    .replace(/return errors === 0;/g, 'return !errors;');
}

function generateAssetValidators({ sourceRoot = process.cwd(), outputRoot = sourceRoot } = {}) {
  const ajv = createAjv(sourceRoot, {
    loopEnum: 0,
    loopRequired: 0,
    messages: false,
    code: { esm: true, source: true, optimize: 3 },
  });
  const ajvStandaloneModule = standaloneCode(ajv, {
    validateH2H: schemaId('h2h.schema.json'),
    validateSeasonSummary: schemaId('season-summary.schema.json'),
    validateRivalries: schemaId('rivalries.schema.json'),
    validateCurrentSeason: schemaId('current-season.schema.json'),
    validateDraftSpot: schemaId('draft-spot.schema.json'),
    validateDerivedStats: schemaId('derived-stats.schema.json'),
    validateAssetManifest: schemaId('asset-manifest.schema.json'),
    validateTransactionHistory: schemaId('transaction-history.schema.json'),
  });
  const standaloneModule = specializeFormatRuntime(stripValidatorErrorConstruction(compactValidatorErrors(ajvStandaloneModule)));
  const moduleCode = compactGeneratedChecks(compactBundledRuntime(compactGeneratedSchemas(stripValidatorBookkeeping(stripValidatorErrorConstruction(esbuild.buildSync({
    stdin: {
      contents: standaloneModule,
      loader: 'js',
      resolveDir: sourceRoot,
      sourcefile: 'asset-validator-runtime.mjs',
    },
    bundle: true,
    platform: 'browser',
    format: 'esm',
    target: 'es2022',
    write: false,
    legalComments: 'none',
  }).outputFiles[0].text)))));
  const wrappers = `

import type { AssetManifest, CurrentSeasonData, DerivedStats, DraftSpot, H2HGame, RivalryDefinition, SeasonSummaryRow, TransactionHistory } from './asset-types';

export function isH2H(value: unknown): value is H2HGame[] { return validateH2H(value) as boolean; }
export function isSeasonSummary(value: unknown): value is SeasonSummaryRow[] { return validateSeasonSummary(value) as boolean; }
export function isRivalries(value: unknown): value is RivalryDefinition[] { return validateRivalries(value) as boolean; }
export function isCurrentSeason(value: unknown): value is CurrentSeasonData { return validateCurrentSeason(value) as boolean; }
export function isDraftSpot(value: unknown): value is DraftSpot { return validateDraftSpot(value) as boolean; }
export function isDerivedStats(value: unknown): value is DerivedStats { return validateDerivedStats(value) as boolean; }
export function isAssetManifest(value: unknown): value is AssetManifest { return validateAssetManifest(value) as boolean; }
export function isTransactionHistory(value: unknown): value is TransactionHistory { return validateTransactionHistory(value) as boolean; }
export type ValidatorName = 'H2H' | 'SeasonSummary' | 'Rivalries' | 'CurrentSeason' | 'DraftSpot' | 'DerivedStats' | 'AssetManifest' | 'TransactionHistory';
export function getValidatorErrors(_name: ValidatorName): Array<{ instancePath?: string; message?: string }> | null { return null; }

export function formatValidatorErrors(assetPath: string, _errors: Array<{ instancePath?: string; message?: string }> | null | undefined): string {
  return \`\${assetPath}: schema validation failed\`;
}
`;
  const outputPath = path.join(outputRoot, GENERATED_ASSETS.AssetValidators.path);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `// This file is generated by scripts/generate_asset_validators.cjs. Do not edit manually.\n// @ts-nocheck\n${moduleCode.trim()}${wrappers}`);

  // LeagueLore is optional and must be safe to validate in the browser without
  // shipping the full AJV runtime. Keep this structural validator generated so
  // the loader and checked-in artifact cannot silently diverge.
  const loreOutputPath = path.join(outputRoot, 'src/data/generated/league-lore-validator.ts');
  const loreValidator = `
import type { LeagueLore } from './asset-types';
const O = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
const S = (v: unknown, max = 500): v is string => typeof v === 'string' && v.length > 0 && v.length <= max;
const T = (v: unknown, max = 500): v is string => typeof v === 'string' && v.length <= max;
const C = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && /\\S/.test(v);
const N = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const I = Number.isInteger;
const K = (v: any, allowed: string[]) => O(v) && Object.keys(v).every(key => allowed.includes(key));
const A = (v: unknown, p: (x: any) => boolean) => Array.isArray(v) && v.every(p);
const U = (v: any[], p: (x: any) => any) => new Set(v.map(p)).size === v.length;
const ID = (v: unknown) => S(v, 100) && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v);
const OWN = (v: unknown) => C(v);
const STRS = (v: unknown, max = 80) => A(v, x => S(x, max));
const YEAR = (v: any) => I(v) && v >= 2014 && v <= 2100;
const COORD = (v: unknown) => O(v) && K(v, ['latitude','longitude']) && typeof v.latitude === 'number' && Number.isFinite(v.latitude) && v.latitude >= -90 && v.latitude <= 90 && typeof v.longitude === 'number' && Number.isFinite(v.longitude) && v.longitude >= -180 && v.longitude <= 180;
const DATE = (v: any) => { if (typeof v !== 'string' || !/^\\d{4}-\\d{2}-\\d{2}$/.test(v)) return false; const [year, month, day] = v.split('-').map(Number); const date = new Date(Date.UTC(year, month - 1, day)); return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day; };
const GAME_ANCHOR = (v: unknown): boolean => O(v) && K(v, ['type','season','week','game_type','owners']) && v.type === 'game' && YEAR(v.season) && I(v.week) && v.week >= 1 && v.week <= 30 && S(v.game_type, 30) && Array.isArray(v.owners) && v.owners.length === 2 && v.owners.every(OWN) && U(v.owners, x => x);
const ANCHOR = (v: unknown): boolean => {
  if (!O(v)) return false;
  if (v.type === 'owner-season') return K(v, ['type','owner','season']) && OWN(v.owner) && YEAR(v.season);
  if (v.type === 'season') return K(v, ['type','season']) && YEAR(v.season);
  if (v.type === 'game') return GAME_ANCHOR(v);
  if (v.type === 'draft-slot') return K(v, ['type','season','owner','expected_slot']) && YEAR(v.season) && OWN(v.owner) && (v.expected_slot === undefined || I(v.expected_slot) && v.expected_slot > 0 && v.expected_slot <= 24);
  if (v.type === 'draft-selection') return K(v, ['type','season','owner','player_id']) && YEAR(v.season) && OWN(v.owner) && S(v.player_id, 40);
  if (v.type === 'transaction') return K(v, ['type','season','transaction_id']) && YEAR(v.season) && S(v.transaction_id, 120);
  if (v.type === 'record') return K(v, ['type','selector','game']) && v.selector === 'lowest-score' && GAME_ANCHOR(v.game);
  if (v.type === 'rivalry') return K(v, ['type','owners','slug']) && ((Array.isArray(v.owners) && v.owners.length === 2 && v.owners.every(OWN) && U(v.owners, x => x) && !('slug' in v)) || (S(v.slug, 120) && !('owners' in v)));
  return false;
};
const ENTRY = (v: unknown) => O(v) && K(v, ['id','category','title','teaser','body','season','occurred_year','completed_year','almanac_edition','owners','anchors','search_terms','provenance','sensitivity','enabled']) && ID(v.id) && ['season-moment','punishment','commissioner','draft-weekend','hall-of-asterisks','league-moment','micro-entry','record'].includes(v.category) && S(v.title, 180) && S(v.teaser, 180) && Array.isArray(v.body) && v.body.length > 0 && STRS(v.body, 500) && Array.isArray(v.owners) && v.owners.every(OWN) && U(v.owners, x => x) && Array.isArray(v.anchors) && v.anchors.every(ANCHOR) && STRS(v.search_terms) && U(v.search_terms, x => x) && S(v.provenance, 300) && [v.season, v.occurred_year, v.completed_year, v.almanac_edition].every(x => x === null || YEAR(x)) && ['ordinary', 'sensitive', 'respectful'].includes(v.sensitivity) && typeof v.enabled === 'boolean';
const DRAFT_LOCATION = (v: unknown) => O(v) && K(v, ['id','label','location_type','season_start','season_end','venue','coordinates','coordinate_precision','entry_id','enabled']) && ID(v.id) && S(v.label, 120) && ['virtual','physical'].includes(v.location_type) && YEAR(v.season_start) && YEAR(v.season_end) && ID(v.entry_id) && typeof v.enabled === 'boolean' && ((v.location_type === 'virtual' && v.venue === null && v.coordinates === null && v.coordinate_precision === 'none') || (v.location_type === 'physical' && (v.venue === null || S(v.venue, 180)) && COORD(v.coordinates) && ['municipality','venue'].includes(v.coordinate_precision)));
const MATCH = (v: any) => K(v, ['owner','season','owners','activation_value']) && (v.owner === undefined || OWN(v.owner)) && (v.season === undefined || YEAR(v.season)) && (v.activation_value === undefined || T(v.activation_value, 100)) && (v.owners === undefined || Array.isArray(v.owners) && v.owners.length <= 2 && v.owners.every(OWN));
const SURFACES = ['global-search','draft-spot','history','curse-tracker','owner-hub','current-season','trophy','rivalry','dynasty','gauntlet','transactions','theme'];
const ACTIVATIONS = ['search','collection-open','selection','triple-activate','theme-sequence','filter-state','render-condition','owner-emblem'];
const TRIGGER = (v: unknown) => O(v) && K(v, ['id','surface','activation','entry_id','collection_id','effect_id','once_policy','match','enabled']) && ID(v.id) && SURFACES.includes(v.surface) && ACTIVATIONS.includes(v.activation) && ['repeatable','scope','session'].includes(v.once_policy) && typeof v.enabled === 'boolean' && (('entry_id' in v) !== ('collection_id' in v)) && (!('entry_id' in v) || ID(v.entry_id)) && (!('collection_id' in v) || ID(v.collection_id)) && (!('effect_id' in v) || ID(v.effect_id)) && (!('match' in v) || MATCH(v.match));
const COLLECTION = (v: unknown) => O(v) && K(v, ['id','title','summary','entry_ids','search_terms','enabled']) && ID(v.id) && S(v.title, 180) && S(v.summary, 500) && Array.isArray(v.entry_ids) && v.entry_ids.length > 0 && v.entry_ids.every(ID) && U(v.entry_ids, x => x) && STRS(v.search_terms) && typeof v.enabled === 'boolean';
const EFFECT = (v: unknown) => O(v) && K(v, ['id','label','symbol','presentation','tone','duration_ms','motion_policy','enabled']) && ID(v.id) && S(v.label, 100) && S(v.symbol, 12) && ['overlay','rattle','cake','callout','static','dialog','confetti','bagel-shower','flies','suitcase','podium','snake-tail','chairs','crown','fog','target','ticket','blank-document'].includes(v.presentation) && ['playful','celebratory','restrained','respectful','informational'].includes(v.tone) && I(v.duration_ms) && v.duration_ms >= 0 && v.duration_ms <= 2500 && ['animate','reduce-to-static','static'].includes(v.motion_policy) && typeof v.enabled === 'boolean';
export function isLeagueLore(value: unknown): value is LeagueLore {
  if (!O(value) || !K(value, ['schema_version','enabled','updated_at','source_policy','owners','commissioner_terms','collections','effects','entries','triggers','draft_locations']) || value.schema_version !== 1 || typeof value.enabled !== 'boolean' || !DATE(value.updated_at)) return false;
  if (!O(value.source_policy) || !K(value.source_policy, ['numeric_authority','almanac_narrative_through']) || !Array.isArray(value.source_policy.numeric_authority) || value.source_policy.numeric_authority.length === 0 || !value.source_policy.numeric_authority.every(N) || !YEAR(value.source_policy.almanac_narrative_through)) return false;
  if (!A(value.owners, item => O(item) && K(item, ['owner','aliases']) && OWN(item.owner) && STRS(item.aliases) && U(item.aliases, x => x))) return false;
  if (!A(value.commissioner_terms, item => O(item) && K(item, ['id','owner','term_start','term_end','display_term','summary','entry_ids']) && ID(item.id) && OWN(item.owner) && YEAR(item.term_start) && (item.term_end === null || YEAR(item.term_end)) && S(item.display_term, 100) && S(item.summary, 500) && Array.isArray(item.entry_ids) && item.entry_ids.every(ID) && U(item.entry_ids, x => x))) return false;
  if (!A(value.collections, COLLECTION) || !A(value.effects, EFFECT) || !A(value.entries, ENTRY) || !A(value.triggers, TRIGGER) || (value.draft_locations !== undefined && !(Array.isArray(value.draft_locations) && value.draft_locations.length > 0 && A(value.draft_locations, DRAFT_LOCATION)))) return false;
  return true;
}
`;
  fs.mkdirSync(path.dirname(loreOutputPath), { recursive: true });
  fs.writeFileSync(loreOutputPath, `// This file is generated by scripts/generate_asset_validators.cjs. Do not edit manually.\n// @ts-nocheck\n${loreValidator.trim()}\n`);

  const transactionWrappers = `
// TransactionHistory shares the browser validator runtime so its support code
// is emitted once while the JSON asset remains loaded only by Transactions.
import { isTransactionHistory, getValidatorErrors } from './asset-validators';
export { isTransactionHistory };
export const getTransactionHistoryValidatorErrors = () => getValidatorErrors('TransactionHistory');
`;
  const transactionOutputPath = path.join(outputRoot, GENERATED_ASSETS.TransactionHistoryValidator.path);
  fs.mkdirSync(path.dirname(transactionOutputPath), { recursive: true });
  fs.writeFileSync(
    transactionOutputPath,
    `// This file is generated by scripts/generate_asset_validators.cjs. Do not edit manually.\n${transactionWrappers}`,
  );
  return outputPath;
}

if (require.main === module) {
  try {
    const output = generateAssetValidators({ outputRoot: outputRootFromArgs(process.argv.slice(2)) });
    console.log(`Generated ${path.relative(process.cwd(), output)}`);
  } catch (error) {
    console.error(error.message || error);
    process.exit(1);
  }
}

module.exports = {
  generateAssetValidators,
  compactValidatorErrors,
  stripValidatorErrorConstruction,
  outputRootFromArgs,
  specializeFormatRuntime,
};
