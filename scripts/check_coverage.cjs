const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { isCoverageSource } = require('./merge_coverage.cjs');

const METRICS = ['lines', 'statements', 'functions', 'branches'];

function toPosix(value) {
  return value.split(path.sep).join('/');
}

function percent(summary, metric) {
  const value = Number(summary?.[metric]?.pct);
  return Number.isFinite(value) ? value : 0;
}

function normalizeSummary(root, summary) {
  const files = new Map();
  for (const [filePath, value] of Object.entries(summary)) {
    if (filePath === 'total') continue;
    const absolutePath = path.resolve(root, filePath);
    files.set(toPosix(path.relative(root, absolutePath)), value);
  }
  return { total: summary.total, files };
}

function validateOverrides(overrides, now = new Date()) {
  const errors = [];
  for (const [file, override] of Object.entries(overrides || {})) {
    if (!override.reason || !override.owner || !/^\d{4}-\d{2}-\d{2}$/.test(override.expires || '')) {
      errors.push(`override ${file} must include reason, owner, and YYYY-MM-DD expiry`);
      continue;
    }
    const expiry = new Date(`${override.expires}T23:59:59Z`);
    if (!Number.isFinite(expiry.getTime()) || expiry < now) errors.push(`expired override: ${file} expired ${override.expires}`);
  }
  return errors;
}

function thresholdErrors(scope, summary, thresholds, file) {
  const errors = [];
  for (const metric of METRICS) {
    const actual = percent(summary, metric);
    const required = Number(thresholds[metric]);
    if (!Number.isFinite(required)) {
      errors.push(`${scope}${file ? ` ${file}` : ''}: missing ${metric} threshold`);
    } else if (actual < required) {
      errors.push(`${scope}${file ? ` ${file}` : ''}: ${metric} ${actual}% is below required ${required}%`);
    }
  }
  return errors;
}

function evaluateCoverage({ normalized, config, changedFiles = [], now = new Date() }) {
  const errors = [
    ...validateOverrides(config.overrides, now),
    ...thresholdErrors('global', normalized.total, config.global),
  ];
  for (const [file, summary] of normalized.files) {
    const thresholds = config.overrides?.[file]?.thresholds || config.perFile;
    errors.push(...thresholdErrors('per-file', summary, thresholds, file));
  }
  for (const file of changedFiles) {
    const summary = normalized.files.get(file);
    if (!summary) {
      errors.push(`changed-file ${file}: missing from merged coverage report`);
      continue;
    }
    errors.push(...thresholdErrors('changed-file', summary, config.changedFiles, file));
  }
  return errors;
}

function resolveChangedFiles(root, baseSha) {
  if (!baseSha) return [];
  const result = spawnSync('git', ['diff', '--name-only', '--diff-filter=AMR', `${baseSha}...HEAD`, '--'], {
    cwd: root,
    encoding: 'utf8',
  });
  if (result.status !== 0) throw new Error(`Could not determine changed files from base ${baseSha}: ${result.stderr.trim()}`);
  return result.stdout.split('\n')
    .filter(Boolean)
    .filter(file => fs.existsSync(path.join(root, file)) && isCoverageSource(root, path.join(root, file)))
    .map(toPosix)
    .sort();
}

function runCli(root = process.cwd(), options = {}) {
  try {
    const summaryPath = path.join(root, 'coverage', 'coverage-summary.json');
    if (!fs.existsSync(summaryPath)) throw new Error(`Coverage summary not found: ${summaryPath}`);
    const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
    const config = options.config || require(path.join(root, 'coverage.config.cjs'));
    const normalized = normalizeSummary(root, summary);
    if (!normalized.total || normalized.files.size === 0) throw new Error('Coverage summary contains zero authored files.');
    const changedFiles = options.changedFiles || resolveChangedFiles(root, options.baseSha ?? process.env.COVERAGE_BASE_SHA);
    const errors = evaluateCoverage({ normalized, config, changedFiles, now: options.now });
    if (errors.length) {
      console.error(['Coverage gate failed:', ...errors.map(error => `- ${error}`), 'Add behavior-focused tests or review a documented, expiring override.'].join('\n'));
      return 1;
    }
    const totals = METRICS.map(metric => `${metric} ${percent(normalized.total, metric)}%`).join(', ');
    console.log('Coverage gate passed');
    console.log(`Global: ${totals}`);
    console.log(`Files checked: ${normalized.files.size} authored, ${Object.keys(config.overrides || {}).length} overrides`);
    console.log(`Changed files checked: ${changedFiles.length}`);
    return 0;
  } catch (error) {
    console.error(error.message);
    return 1;
  }
}

if (require.main === module) process.exit(runCli());

module.exports = {
  evaluateCoverage,
  normalizeSummary,
  resolveChangedFiles,
  runCli,
  thresholdErrors,
  validateOverrides,
};
