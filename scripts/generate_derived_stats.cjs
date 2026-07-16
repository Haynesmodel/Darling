#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { buildDerivedStats } = require('./data/derived-stats.cjs');
const { readJson, writeCanonicalJson } = require('./data/canonical-json.cjs');
const { GENERATED_ASSETS, SOURCE_ASSETS } = require('./data/constants.cjs');

function outputRootFromArgs(argv) {
  const index = argv.indexOf('--output-root');
  return index >= 0 ? path.resolve(argv[index + 1]) : process.cwd();
}

function generateDerivedStats({ sourceRoot = process.cwd(), outputRoot = sourceRoot } = {}) {
  const inputs = Object.fromEntries(['H2H', 'SeasonSummary', 'Rivalries'].map(name => [
    name,
    readJson(path.join(sourceRoot, SOURCE_ASSETS[name].path)),
  ]));
  const derived = buildDerivedStats(inputs);
  const outputPath = path.join(outputRoot, GENERATED_ASSETS.DerivedStats.path);
  writeCanonicalJson(outputPath, derived);
  return { outputPath, derived };
}

if (require.main === module) {
  const started = process.hrtime.bigint();
  try {
    const { outputPath } = generateDerivedStats({ outputRoot: outputRootFromArgs(process.argv.slice(2)) });
    const elapsed = Number(process.hrtime.bigint() - started) / 1e6;
    console.log(`Generated ${path.relative(process.cwd(), outputPath)} in ${elapsed.toFixed(0)} ms`);
  } catch (error) {
    console.error(error.message || error);
    process.exit(1);
  }
}

module.exports = { generateDerivedStats };
