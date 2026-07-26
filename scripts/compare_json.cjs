#!/usr/bin/env node
const { readJson, sha256Json } = require('./data/canonical-json.cjs');

function jsonFilesEqual(leftPath, rightPath) {
  return sha256Json(readJson(leftPath)) === sha256Json(readJson(rightPath));
}

function runCli(argv = process.argv.slice(2)) {
  if (argv.length !== 2) {
    console.error('Usage: node scripts/compare_json.cjs <left.json> <right.json>');
    return 2;
  }

  try {
    return jsonFilesEqual(argv[0], argv[1]) ? 0 : 1;
  } catch (error) {
    console.error(error.message || error);
    return 2;
  }
}

if (require.main === module) {
  process.exitCode = runCli();
}

module.exports = { jsonFilesEqual, runCli };
