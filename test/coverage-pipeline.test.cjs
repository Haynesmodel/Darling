const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { createCoverageMap } = require('istanbul-lib-coverage');
const { createInstrumenter } = require('istanbul-lib-instrument');

const {
  addUncoveredSourceFiles,
  collectSourceFiles,
  isCoverageSource,
  isTypeOnlySourceFile,
  mergeCoverageMaps,
  normalizeCoveragePath,
  runCli: runMergeCli,
  sortCoverageMap,
} = require('../scripts/merge_coverage.cjs');
const {
  evaluateCoverage,
  resolveChangedFiles,
  validateOverrides,
} = require('../scripts/check_coverage.cjs');
const { evaluateResults, runCli: runCiGateCli } = require('../scripts/check_ci_results.cjs');
const { forwardSignal, npmCommand, runCommand, runSequence } = require('../scripts/process_runner.cjs');
const { reportFailure, runCi } = require('../scripts/run_ci.cjs');
const {
  assertCoverageDirectory,
  cleanCoverageDirectory,
  coverageRunId,
  localBinary,
  runCoverage,
} = require('../scripts/run_coverage.cjs');

function withTempRepo(callback) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'darling-coverage-'));
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.mkdirSync(path.join(root, 'js'), { recursive: true });
  fs.mkdirSync(path.join(root, 'scripts'), { recursive: true });
  try {
    return callback(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function instrumentAndRun(filePath, source) {
  fs.writeFileSync(filePath, source);
  const instrumenter = createInstrumenter({ compact: false });
  const instrumented = instrumenter.instrumentSync(source, filePath);
  const context = {};
  context.globalThis = context;
  vm.runInNewContext(instrumented, context, { filename: filePath });
  return context.__coverage__;
}

function metric(pct) {
  return { total: 10, covered: pct / 10, skipped: 0, pct };
}

function summary(pct) {
  return {
    lines: metric(pct),
    statements: metric(pct),
    functions: metric(pct),
    branches: metric(pct),
  };
}

test('Istanbul preserves uncovered nested branches and uncalled functions', () => {
  withTempRepo(root => {
    const filePath = path.join(root, 'src', 'branch.js');
    const rawMap = instrumentAndRun(filePath, [
      'function choose(flag) {',
      '  if (flag) return 1;',
      '  return 2;',
      '}',
      'function neverCalled() { return 3; }',
      'choose(true);',
      '',
    ].join('\n'));
    const rawDirectory = path.join(root, 'coverage', 'raw', 'browser');
    fs.mkdirSync(rawDirectory, { recursive: true });
    const rawPath = path.join(rawDirectory, 'worker.json');
    fs.writeFileSync(rawPath, JSON.stringify(rawMap));

    const merged = mergeCoverageMaps(root, [rawPath]);
    const result = merged.fileCoverageFor(fs.realpathSync.native(filePath)).toSummary();
    assert.ok(result.branches.pct < 100, JSON.stringify(result.branches));
    assert.ok(result.functions.pct < 100, JSON.stringify(result.functions));
    assert.ok(result.lines.pct < 100, JSON.stringify(result.lines));
  });
});

test('never-loaded authored files are added at zero percent', () => {
  withTempRepo(root => {
    const coveredPath = path.join(root, 'src', 'covered.js');
    const missingPath = path.join(root, 'src', 'missing.tsx');
    const rawMap = instrumentAndRun(coveredPath, 'function covered(){ return 1; }\ncovered();\n');
    fs.writeFileSync(missingPath, 'export function Missing(){ return <div>missing</div>; }\n');
    const map = createCoverageMap(rawMap);
    addUncoveredSourceFiles(root, map, [coveredPath, missingPath]);
    const missing = map.fileCoverageFor(fs.realpathSync.native(missingPath)).toSummary();
    assert.equal(missing.statements.pct, 0);
    assert.equal(missing.functions.pct, 0);
    assert.equal(missing.lines.pct, 0);
  });
});

test('source discovery excludes generated, vendor, test, and type-only files', () => {
  withTempRepo(root => {
    const runtime = path.join(root, 'src', 'runtime.ts');
    const typeOnly = path.join(root, 'src', 'types.ts');
    const generated = path.join(root, 'src', 'data', 'generated', 'asset-validators.ts');
    const vendor = path.join(root, 'js', 'charting', 'vendor', 'charting-vendor.js');
    fs.mkdirSync(path.dirname(generated), { recursive: true });
    fs.mkdirSync(path.dirname(vendor), { recursive: true });
    fs.writeFileSync(runtime, 'export const runtime = true;\n');
    fs.writeFileSync(typeOnly, 'export interface Shape { value: string }\n');
    fs.writeFileSync(generated, 'export const generated = true;\n');
    fs.writeFileSync(vendor, 'export const vendor = true;\n');
    assert.equal(isTypeOnlySourceFile(typeOnly), true);
    assert.equal(isCoverageSource(root, runtime), true);
    assert.equal(isCoverageSource(root, typeOnly), false);
    assert.equal(isCoverageSource(root, generated), false);
    assert.equal(isCoverageSource(root, vendor), false);
    assert.deepEqual(collectSourceFiles(root), [runtime]);
  });
});

test('malformed, missing, and outside-repository maps fail clearly', () => {
  withTempRepo(root => {
    assert.throws(() => mergeCoverageMaps(root, []), /No Node or browser Istanbul coverage maps/);
    const malformed = path.join(root, 'malformed.json');
    fs.writeFileSync(malformed, '{');
    assert.throws(() => mergeCoverageMaps(root, [malformed]), new RegExp(`Malformed coverage map .*${path.basename(malformed)}`));
    assert.throws(() => normalizeCoveragePath(root, path.join(root, '..', 'outside.js')), /outside repository/);
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'darling-outside-'));
    try {
      const outsideFile = path.join(outside, 'outside.js');
      const link = path.join(root, 'src', 'linked.js');
      fs.writeFileSync(outsideFile, 'export const outside = true;\n');
      fs.symlinkSync(outsideFile, link);
      assert.throws(() => normalizeCoveragePath(root, link), /outside repository/);
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });
});

test('coverage map ordering is deterministic', () => {
  withTempRepo(root => {
    const alpha = path.join(root, 'src', 'alpha.js');
    const zeta = path.join(root, 'src', 'zeta.js');
    const alphaMap = instrumentAndRun(alpha, 'const alpha = 1;\n');
    const zetaMap = instrumentAndRun(zeta, 'const zeta = 1;\n');
    const map = createCoverageMap({ ...zetaMap, ...alphaMap });
    assert.deepEqual(sortCoverageMap(map).files(), [alpha, zeta]);
  });
});

test('coverage merge CLI writes all standard report formats', () => {
  withTempRepo(root => {
    const filePath = path.join(root, 'src', 'reported.js');
    const rawMap = instrumentAndRun(filePath, 'function reported(){ return true; }\nreported();\n');
    const rawDirectory = path.join(root, 'coverage', 'raw', 'browser');
    fs.mkdirSync(rawDirectory, { recursive: true });
    fs.writeFileSync(path.join(rawDirectory, 'worker.json'), JSON.stringify(rawMap));
    assert.equal(runMergeCli(root), 0);
    for (const report of ['coverage-final.json', 'coverage-summary.json', 'lcov.info', 'text-summary.txt', 'coverage-meta.json']) {
      assert.equal(fs.existsSync(path.join(root, 'coverage', report)), true, report);
    }
    assert.equal(fs.existsSync(path.join(root, 'coverage', 'html', 'index.html')), true);
  });
});

test('coverage policy reports global, per-file, changed-file, and expiry failures', () => {
  const config = {
    global: { lines: 75, statements: 75, functions: 65, branches: 60 },
    perFile: { lines: 60, statements: 60, functions: 50, branches: 50 },
    changedFiles: { lines: 80, statements: 80, functions: 75, branches: 70 },
    overrides: {
      'src/legacy.js': {
        thresholds: { lines: 10, statements: 10, functions: 10, branches: 10 },
        reason: 'Legacy baseline',
        owner: '@maintainer',
        expires: '2026-01-01',
      },
    },
  };
  const normalized = {
    total: summary(59),
    files: new Map([
      ['src/changed.js', summary(40)],
      ['src/legacy.js', summary(20)],
    ]),
  };
  const errors = evaluateCoverage({
    normalized,
    config,
    changedFiles: ['src/changed.js', 'src/missing.js'],
    now: new Date('2026-07-22T00:00:00Z'),
  });
  assert.ok(errors.some(error => error.includes('global')));
  assert.ok(errors.some(error => error.includes('per-file src/changed.js')));
  assert.ok(errors.some(error => error.includes('changed-file src/changed.js')));
  assert.ok(errors.some(error => error.includes('changed-file src/missing.js: missing')));
  assert.ok(errors.some(error => error.includes('expired override')));
});

test('override metadata is required', () => {
  const errors = validateOverrides({
    'src/file.ts': { thresholds: {}, reason: '', owner: '', expires: 'soon' },
  });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /reason, owner, and YYYY-MM-DD expiry/);
});

test('changed-file discovery uses the explicit base SHA', () => {
  withTempRepo(root => {
    const git = args => spawnSync('git', args, { cwd: root, encoding: 'utf8' });
    assert.equal(git(['init', '-q']).status, 0);
    assert.equal(git(['config', 'user.email', 'coverage@example.com']).status, 0);
    assert.equal(git(['config', 'user.name', 'Coverage Test']).status, 0);
    fs.writeFileSync(path.join(root, 'src', 'existing.js'), 'export const value = 1;\n');
    git(['add', '.']);
    git(['commit', '-qm', 'base']);
    const baseSha = git(['rev-parse', 'HEAD']).stdout.trim();
    fs.writeFileSync(path.join(root, 'src', 'existing.js'), 'export const value = 2;\n');
    fs.writeFileSync(path.join(root, 'src', 'added.ts'), 'export const added = true;\n');
    git(['add', '.']);
    git(['commit', '-qm', 'change']);
    assert.deepEqual(resolveChangedFiles(root, baseSha), ['src/added.ts', 'src/existing.js']);
  });
});

test('coverage cleanup is constrained to the repository coverage directory', () => {
  withTempRepo(root => {
    fs.mkdirSync(path.join(root, 'coverage'), { recursive: true });
    fs.writeFileSync(path.join(root, 'coverage', 'temporary.json'), '{}');
    cleanCoverageDirectory(root);
    assert.equal(fs.existsSync(path.join(root, 'coverage')), false);
    assert.throws(
      () => assertCoverageDirectory(root, path.join(root, 'not-coverage')),
      /Refusing to clean unexpected coverage path/,
    );
    assert.equal(localBinary(root, 'c8', 'win32').endsWith('c8.cmd'), true);
    assert.equal(localBinary(root, 'c8', 'darwin').endsWith('/c8'), true);
    assert.equal(coverageRunId({ GITHUB_RUN_ID: 'run-1' }, 123), 'run-1');
    assert.equal(coverageRunId({}, 123), 'local-123');
  });
});

test('process runner reports success, exit failures, startup failures, and sequences', async () => {
  const forwarded = [];
  forwardSignal({ killed: false, kill: signal => forwarded.push(signal) }, 'SIGTERM');
  forwardSignal({ killed: true, kill: signal => forwarded.push(signal) }, 'SIGINT');
  assert.deepEqual(forwarded, ['SIGTERM']);
  await runCommand('successful child', process.execPath, ['-e', 'process.exit(0)']);
  await assert.rejects(
    runCommand('failed child', process.execPath, ['-e', 'process.exit(3)']),
    /failed with exit code 3/,
  );
  await assert.rejects(
    runCommand('missing child', path.join(os.tmpdir(), 'missing-darling-command'), []),
    /could not start/,
  );
  await runSequence([
    { label: 'sequence child', command: process.execPath, args: ['-e', 'process.exit(0)'] },
  ]);
});

test('local CI orchestrator sets CI and builds exactly once', async () => {
  const calls = [];
  await runCi(async (...args) => calls.push(args));
  assert.deepEqual(calls.map(call => call[0]), [
    'npm version',
    'unit and data checks',
    'production build',
    'Chromium production preview',
    'WebKit production preview',
  ]);
  assert.equal(calls.filter(call => call[2].includes('build')).length, 1);
  assert.ok(calls.every(call => call[3].env.CI === '1'));
  assert.equal(calls[2][3].env.VITE_BASE_PATH, '/Darling/');
  assert.equal(calls[0][1], npmCommand);
  const errors = [];
  const originalError = console.error;
  const originalExitCode = process.exitCode;
  console.error = message => errors.push(message);
  try {
    reportFailure(new Error('fixture failure'));
    assert.deepEqual(errors, ['fixture failure']);
    assert.equal(process.exitCode, 1);
  } finally {
    console.error = originalError;
    process.exitCode = originalExitCode;
  }
});

test('coverage orchestrator enables instrumentation only for Chromium', async () => {
  await withTempRepo(async root => {
    fs.mkdirSync(path.join(root, 'coverage'), { recursive: true });
    fs.writeFileSync(path.join(root, 'coverage', 'old.json'), '{}');
    const calls = [];
    await runCoverage({
      root,
      environment: { GITHUB_RUN_ID: 'fixture-run' },
      now: 123,
      run: async (...args) => calls.push(args),
    });
    assert.equal(fs.existsSync(path.join(root, 'coverage', 'old.json')), false);
    assert.deepEqual(calls.map(call => call[0]), [
      'asset validation',
      'Node coverage',
      'instrumented Chromium coverage',
      'coverage merge and reports',
      'coverage policy gate',
    ]);
    assert.equal(calls[2][3].env.COLLECT_COVERAGE, '1');
    assert.equal(calls[2][3].env.COVERAGE_RUN_ID, 'fixture-run');
    assert.ok(calls.filter(call => call[3].env.COLLECT_COVERAGE).length === 1);
    assert.ok(calls.every(call => call[3].cwd === root));
  });
});

test('aggregate CI gate rejects skipped, cancelled, or failed lanes', () => {
  assert.deepEqual(evaluateResults({ quality: { result: 'success' }, browser: { result: 'success' } }), []);
  assert.deepEqual(evaluateResults({ quality: { result: 'success' }, browser: { result: 'skipped' } }), [
    ['browser', { result: 'skipped' }],
  ]);
});

test('aggregate CI gate CLI writes a summary and rejects missing input', () => {
  withTempRepo(root => {
    const summaryPath = path.join(root, 'summary.md');
    assert.equal(runCiGateCli({
      RESULTS: JSON.stringify({ quality: { result: 'success' }, browser: { result: 'success' } }),
      GITHUB_STEP_SUMMARY: summaryPath,
    }), 0);
    assert.match(fs.readFileSync(summaryPath, 'utf8'), /Overall: passed/);
    assert.equal(runCiGateCli({ RESULTS: '{}' }), 1);
    assert.equal(runCiGateCli({ RESULTS: '{' }), 1);
  });
});
