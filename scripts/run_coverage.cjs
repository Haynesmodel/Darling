const fs = require('node:fs');
const path = require('node:path');
const { npmCommand, runCommand } = require('./process_runner.cjs');

function assertCoverageDirectory(root, coverageDirectory) {
  if (path.dirname(coverageDirectory) !== path.resolve(root) || path.basename(coverageDirectory) !== 'coverage') {
    throw new Error(`Refusing to clean unexpected coverage path: ${coverageDirectory}`);
  }
}

function cleanCoverageDirectory(root) {
  const coverageDirectory = path.resolve(root, 'coverage');
  assertCoverageDirectory(root, coverageDirectory);
  fs.rmSync(coverageDirectory, { recursive: true, force: true });
}

function cleanNodeV8Directory(root) {
  const rawDirectory = path.resolve(root, 'coverage', 'raw');
  const nodeV8Directory = path.resolve(rawDirectory, 'node-v8');
  if (path.dirname(nodeV8Directory) !== rawDirectory || path.basename(nodeV8Directory) !== 'node-v8') {
    throw new Error(`Refusing to clean unexpected Node V8 coverage path: ${nodeV8Directory}`);
  }
  fs.rmSync(nodeV8Directory, { recursive: true, force: true });
}

function localBinary(root, name, platform) {
  return path.join(root, 'node_modules', '.bin', platform === 'win32' ? `${name}.cmd` : name);
}

function coverageRunId(environment, now) {
  return environment.GITHUB_RUN_ID || `local-${now}`;
}

async function runCoverage({ root, run, environment, now }) {
  cleanCoverageDirectory(root);
  const sharedEnv = { CI: '1' };
  const c8Binary = localBinary(root, 'c8', process.platform);
  const playwrightBinary = localBinary(root, 'playwright', process.platform);

  await run('asset validation', npmCommand, ['run', 'test:assets'], { cwd: root, env: sharedEnv });
  await run('Node coverage', c8Binary, [
    '--temp-directory=coverage/raw/node-v8',
    '--reports-dir=coverage/raw/node',
    '--reporter=json',
    '--exclude-after-remap',
    '--exclude=test/**',
    '--exclude=src/data/generated/**',
    '--exclude=js/charting/vendor/**',
    '--exclude=scripts/build_chart_vendor.cjs',
    process.execPath,
    'scripts/run_tests_with_coverage.cjs',
  ], { cwd: root, env: sharedEnv });
  cleanNodeV8Directory(root);
  await run('instrumented Chromium coverage', playwrightBinary, ['test', '--project=chromium'], {
    cwd: root,
    env: {
      ...sharedEnv,
      COLLECT_COVERAGE: '1',
      PLAYWRIGHT_WORKERS: '1',
      COVERAGE_RUN_ID: coverageRunId(environment, now),
    },
  });
  await run('coverage merge and reports', process.execPath, ['scripts/merge_coverage.cjs'], { cwd: root, env: sharedEnv });
  await run('coverage policy gate', process.execPath, ['scripts/check_coverage.cjs'], { cwd: root, env: sharedEnv });
}

if (require.main === module) {
  runCoverage({
    root: process.cwd(),
    run: runCommand,
    environment: process.env,
    now: Date.now(),
  }).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  assertCoverageDirectory,
  cleanCoverageDirectory,
  cleanNodeV8Directory,
  coverageRunId,
  localBinary,
  runCoverage,
};
