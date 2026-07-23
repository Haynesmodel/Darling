const fs = require('node:fs');
const path = require('node:path');
const { resolveChangedFiles } = require('./check_coverage.cjs');

const METRICS = ['lines', 'statements', 'functions', 'branches'];

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function formatDuration(milliseconds) {
  if (!Number.isFinite(milliseconds)) return 'unavailable';
  return `${(milliseconds / 1000).toFixed(1)}s`;
}

function formatMetrics(summary) {
  if (!summary) return 'unavailable';
  return METRICS.map(metric => `${metric} ${summary[metric]?.pct ?? 0}%`).join(', ');
}

function formatThresholds(thresholds) {
  return METRICS.map(metric => `${metric} ${thresholds?.[metric] ?? 'unset'}%`).join(', ');
}

function directoryBytes(directory) {
  if (!fs.existsSync(directory)) return 0;
  let bytes = 0;
  const pending = [directory];
  while (pending.length) {
    const current = pending.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) pending.push(entryPath);
      else bytes += fs.statSync(entryPath).size;
    }
  }
  return bytes;
}

function browserRevision(root, project) {
  const metadata = readJson(path.join(root, 'node_modules', 'playwright-core', 'browsers.json'));
  const browserName = project === 'webkit-smoke' ? 'webkit' : 'chromium';
  const browser = metadata?.browsers?.find(candidate => candidate.name === browserName);
  if (!browser) return 'unavailable';
  return `${browser.browserVersion || browser.name} (revision ${browser.revision})`;
}

function playwrightVersion(root) {
  return readJson(path.join(root, 'node_modules', '@playwright', 'test', 'package.json'))?.version || 'unavailable';
}

function browserSummary(root, project, environment = process.env) {
  const reportPath = path.resolve(
    root,
    environment.PLAYWRIGHT_JSON_OUTPUT_FILE || 'test-results/playwright-results.json',
  );
  const report = readJson(reportPath);
  const stats = report?.stats || {};
  const lines = [
    `### Browser / ${project === 'webkit-smoke' ? 'WebKit smoke' : 'Chromium'}`,
    `- Project: ${project}`,
    `- Playwright: ${playwrightVersion(root)}; browser ${browserRevision(root, project)}`,
    `- Tests: ${stats.expected ?? 'unavailable'} passed, ${stats.unexpected ?? 'unavailable'} failed, ${stats.skipped ?? 'unavailable'} skipped, ${stats.flaky ?? 'unavailable'} flaky`,
    `- Execution duration: ${formatDuration(stats.duration)}`,
    `- Artifact digest validation: ${environment.ARTIFACT_VALIDATION || 'unavailable'}${environment.ARTIFACT_DIGEST ? ` (${environment.ARTIFACT_DIGEST})` : ''}`,
  ];
  if (environment.JOB_STATUS && environment.JOB_STATUS !== 'success') {
    lines.push(`- Failure reports: ${environment.REPORT_ARTIFACT_NAME || 'unavailable'}, ${environment.RESULTS_ARTIFACT_NAME || 'unavailable'}`);
  }
  return `${lines.join('\n')}\n`;
}

function coverageSummary(root, environment = process.env) {
  const summary = readJson(path.join(root, 'coverage', 'coverage-summary.json'));
  const metadata = readJson(path.join(root, 'coverage', 'coverage-meta.json'));
  let config = null;
  try {
    config = require(path.join(root, 'coverage.config.cjs'));
  } catch {
    // A setup failure can leave the summary step without repository dependencies.
  }
  let changedFilesStatus = '0';
  try {
    changedFilesStatus = String(resolveChangedFiles(root, environment.COVERAGE_BASE_SHA).length);
  } catch (error) {
    changedFilesStatus = `unavailable (${error.message})`;
  }
  const lines = [
    '### Coverage',
    `- Global: ${formatMetrics(summary?.total)}`,
    `- Global thresholds: ${formatThresholds(config?.global)}`,
    `- Per-file thresholds: ${formatThresholds(config?.perFile)}`,
    `- Changed-file thresholds: ${formatThresholds(config?.changedFiles)}`,
    `- Files: ${metadata?.sourceFiles ?? 'unavailable'} authored, ${metadata?.excludedFiles ?? 'unavailable'} excluded, ${Object.keys(config?.overrides || {}).length} overrides`,
    `- Changed files checked: ${changedFilesStatus}`,
    `- Raw output: ${directoryBytes(path.join(root, 'coverage', 'raw'))} bytes`,
    `- Report conversion: ${formatDuration(metadata?.reportMilliseconds)}`,
  ];
  if (environment.JOB_STATUS && environment.JOB_STATUS !== 'success') {
    lines.push(`- Failure diagnostics: ${environment.DIAGNOSTICS_ARTIFACT_NAME || 'unavailable'}`);
  }
  return `${lines.join('\n')}\n`;
}

function emitSummary(markdown, environment = process.env) {
  if (environment.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(environment.GITHUB_STEP_SUMMARY, markdown);
  } else {
    process.stdout.write(markdown);
  }
}

function runCli(root = process.cwd(), args = process.argv.slice(2), environment = process.env) {
  const [kind, project] = args;
  if (kind === 'browser' && project) {
    emitSummary(browserSummary(root, project, environment), environment);
    return 0;
  }
  if (kind === 'coverage') {
    emitSummary(coverageSummary(root, environment), environment);
    return 0;
  }
  console.error('Usage: node scripts/summarize_ci.cjs browser <chromium|webkit-smoke> | coverage');
  return 1;
}

if (require.main === module) process.exit(runCli());

module.exports = {
  browserRevision,
  browserSummary,
  coverageSummary,
  directoryBytes,
  emitSummary,
  formatDuration,
  runCli,
};
