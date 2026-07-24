const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const vm = require('node:vm');
const { transformSync } = require('esbuild');
const { createCoverageMap } = require('istanbul-lib-coverage');
const { createInstrumenter } = require('istanbul-lib-instrument');

const {
  addUncoveredSourceFiles,
  assertRawCoverageSize,
  collectSourceFiles,
  discoverCoverageMaps,
  isCoverageSource,
  isTypeOnlySourceFile,
  mergeCoverageMaps,
  normalizeCoveragePath,
  runCli: runMergeCli,
  sortCoverageMap,
} = require('../scripts/merge_coverage.cjs');
const {
  evaluateCoverage,
  normalizeSummary,
  resolveChangedFiles,
  runCli: runCoverageGateCli,
  validateOverrides,
} = require('../scripts/check_coverage.cjs');
const { evaluateResults, runCli: runCiGateCli } = require('../scripts/check_ci_results.cjs');
const {
  escapeWindowsArgument,
  forwardSignal,
  npmCommand,
  resolveSpawn,
  runCommand,
  runSequence,
} = require('../scripts/process_runner.cjs');
const { detectLocalWebKitSupport, reportFailure, runCi } = require('../scripts/run_ci.cjs');
const {
  assertCoverageDirectory,
  cleanCoverageDirectory,
  cleanNodeV8Directory,
  coverageRunId,
  localBinary,
  runCoverage,
} = require('../scripts/run_coverage.cjs');
const { playwrightBinary, runPreview } = require('../scripts/run_playwright_preview.cjs');
const {
  browserRevision,
  browserSummary,
  coverageSummary,
  directoryBytes,
  emitSummary,
  formatDuration,
  runCli: runSummaryCli,
} = require('../scripts/summarize_ci.cjs');

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

async function withTempRepoAsync(callback) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'darling-coverage-'));
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.mkdirSync(path.join(root, 'js'), { recursive: true });
  fs.mkdirSync(path.join(root, 'scripts'), { recursive: true });
  try {
    return await callback(fs.realpathSync.native(root));
  } finally {
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
}

function instrumentAndRun(filePath, source, values = {}) {
  fs.writeFileSync(filePath, source);
  const instrumenter = createInstrumenter({ compact: false });
  const instrumented = instrumenter.instrumentSync(source, filePath);
  const context = { ...values };
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

test('Node and browser maps for one source merge branch and function counters', () => {
  withTempRepo(root => {
    const filePath = path.join(root, 'src', 'shared-runtime.js');
    const source = [
      'function choose(flag) {',
      '  if (flag) return 1;',
      '  return 2;',
      '}',
      'function neverCalled() { return 3; }',
      'choose(runtimeFlag);',
      '',
    ].join('\n');
    const nodeMap = instrumentAndRun(filePath, source, { runtimeFlag: true });
    const browserMap = instrumentAndRun(filePath, source, { runtimeFlag: false });
    const nodeDirectory = path.join(root, 'coverage', 'raw', 'node');
    const browserDirectory = path.join(root, 'coverage', 'raw', 'browser');
    fs.mkdirSync(nodeDirectory, { recursive: true });
    fs.mkdirSync(browserDirectory, { recursive: true });
    const nodePath = path.join(nodeDirectory, 'node.json');
    const browserPath = path.join(browserDirectory, 'browser.json');
    fs.writeFileSync(nodePath, JSON.stringify(nodeMap));
    fs.writeFileSync(browserPath, JSON.stringify(browserMap));

    const merged = mergeCoverageMaps(root, [nodePath, browserPath]);
    const result = merged.fileCoverageFor(fs.realpathSync.native(filePath)).toSummary();
    assert.equal(result.branches.total, 2);
    assert.equal(result.branches.covered, 2);
    assert.equal(result.functions.total, 2);
    assert.equal(result.functions.covered, 1);
  });
});

test('Vite and Preact map instrumented TSX to original lines while normal mode stays clean', async () => {
  const root = process.cwd();
  const fixtureName = `__coverage-contract-${process.pid}-${Date.now()}.tsx`;
  const sourcePath = path.join(root, 'src', fixtureName);
  const requestPath = `/src/${fixtureName}`;
  const cacheDir = path.join(root, 'node_modules', `.vite-coverage-contract-${process.pid}`);
  const previousCoverageMode = process.env.COLLECT_COVERAGE;
  try {
    fs.writeFileSync(sourcePath, [
      'export function choose(flag: boolean) {',
      '  if (flag) return <span>enabled</span>;',
      '  return <span>disabled</span>;',
      '}',
      '',
    ].join('\n'));
    const { createServer } = await import('vite');
    const serverOptions = {
      root,
      configFile: path.join(root, 'vite.config.ts'),
      appType: 'custom',
      logLevel: 'silent',
      cacheDir,
      server: { middlewareMode: true },
    };
    const rawFilesBefore = discoverCoverageMaps(root);

    delete process.env.COLLECT_COVERAGE;
    const normalServer = await createServer(serverOptions);
    try {
      const transformed = await normalServer.transformRequest(requestPath);
      assert.doesNotMatch(transformed.code, /coverageData|cov_[a-zA-Z0-9]+/);
      assert.deepEqual(discoverCoverageMaps(root), rawFilesBefore);
    } finally {
      await normalServer.close();
    }

    process.env.COLLECT_COVERAGE = '1';
    const coverageServer = await createServer(serverOptions);
    try {
      const transformed = await coverageServer.transformRequest(requestPath);
      assert.match(transformed.code, /coverageData|cov_[a-zA-Z0-9]+/);
      const commonJs = transformSync(transformed.code, {
        format: 'cjs',
        loader: 'js',
        target: 'es2022',
      }).code;
      const module = { exports: {} };
      const context = {
        module,
        exports: module.exports,
        require(specifier) {
          if (specifier.includes('preact')) return require('preact/jsx-runtime');
          throw new Error(`Unexpected transformed TSX import: ${specifier}`);
        },
      };
      context.globalThis = context;
      vm.runInNewContext(commonJs, context, { filename: sourcePath });
      const fixture = module.exports;
      fixture.choose(true);
      const map = createCoverageMap(context.__coverage__);
      const mappedPath = map.files().find(file => path.basename(file) === fixtureName);
      assert.ok(mappedPath, JSON.stringify(map.files()));
      assert.equal(fs.realpathSync.native(mappedPath), fs.realpathSync.native(sourcePath));
      const coverage = map.fileCoverageFor(mappedPath);
      const result = coverage.toSummary();
      assert.equal(result.functions.total, 1);
      assert.equal(result.functions.covered, 1);
      assert.equal(result.branches.total, 2);
      assert.equal(result.branches.covered, 1);
      const statementLines = Object.values(coverage.data.statementMap).map(location => location.start.line);
      assert.ok(statementLines.includes(2), JSON.stringify(coverage.data.statementMap));
      assert.ok(statementLines.every(line => line >= 1 && line <= 4), JSON.stringify(statementLines));
    } finally {
      await coverageServer.close();
    }
  } finally {
    if (previousCoverageMode === undefined) delete process.env.COLLECT_COVERAGE;
    else process.env.COLLECT_COVERAGE = previousCoverageMode;
    fs.rmSync(sourcePath, { force: true });
    fs.rmSync(cacheDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
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
    const runtimeTsx = path.join(root, 'src', 'runtime.tsx');
    const typeOnly = path.join(root, 'src', 'types.ts');
    const declaration = path.join(root, 'src', 'types.d.ts');
    const malformed = path.join(root, 'src', 'malformed.ts');
    const generated = path.join(root, 'src', 'data', 'generated', 'asset-validators.ts');
    const vendor = path.join(root, 'js', 'charting', 'vendor', 'charting-vendor.js');
    fs.mkdirSync(path.dirname(generated), { recursive: true });
    fs.mkdirSync(path.dirname(vendor), { recursive: true });
    fs.writeFileSync(runtime, 'export const runtime = true;\n');
    fs.writeFileSync(runtimeTsx, 'export const runtime = <div>ready</div>;\n');
    fs.writeFileSync(typeOnly, 'export interface Shape { value: string }\n');
    fs.writeFileSync(declaration, 'export interface Declaration { value: string }\n');
    fs.writeFileSync(malformed, 'export const = ;\n');
    fs.writeFileSync(generated, 'export const generated = true;\n');
    fs.writeFileSync(vendor, 'export const vendor = true;\n');
    assert.equal(isTypeOnlySourceFile(typeOnly), true);
    assert.equal(isTypeOnlySourceFile(path.join(root, 'src', 'missing.ts')), false);
    assert.equal(isTypeOnlySourceFile(malformed), false);
    assert.equal(isCoverageSource(root, runtime), true);
    assert.equal(isCoverageSource(root, runtimeTsx), true);
    assert.equal(isCoverageSource(root, typeOnly), false);
    assert.equal(isCoverageSource(root, declaration), false);
    assert.equal(isCoverageSource(root, generated), false);
    assert.equal(isCoverageSource(root, vendor), false);
    assert.equal(isCoverageSource(root, root), false);
    assert.equal(isCoverageSource(path.join(root, 'missing-root'), path.join(root, 'missing-root', 'src', 'missing.js')), true);
    assert.deepEqual(collectSourceFiles(root), [malformed, runtime, runtimeTsx]);
  });
});

test('malformed, missing, and outside-repository maps fail clearly', () => {
  withTempRepo(root => {
    assert.throws(() => mergeCoverageMaps(root, []), /No Node or browser Istanbul coverage maps/);
    const malformed = path.join(root, 'malformed.json');
    fs.writeFileSync(malformed, '{');
    assert.throws(() => mergeCoverageMaps(root, [malformed]), new RegExp(`Malformed coverage map .*${path.basename(malformed)}`));
    const invalid = path.join(root, 'invalid.json');
    fs.writeFileSync(invalid, JSON.stringify({ source: { path: 42 } }));
    assert.throws(() => mergeCoverageMaps(root, [invalid]), new RegExp(`Invalid coverage map .*${path.basename(invalid)}`));
    const inside = path.join(root, 'src', 'inside.js');
    fs.writeFileSync(inside, 'export const inside = true;\n');
    assert.equal(normalizeCoveragePath(root, pathToFileURL(inside).href), fs.realpathSync.native(inside));
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

test('coverage map discovery handles absent and nested raw directories', () => {
  withTempRepo(root => {
    assert.deepEqual(discoverCoverageMaps(root), []);
    const nested = path.join(root, 'coverage', 'raw', 'node', 'nested');
    fs.mkdirSync(nested, { recursive: true });
    const mapPath = path.join(nested, 'coverage.json');
    fs.writeFileSync(mapPath, '{}');
    fs.writeFileSync(path.join(nested, 'ignored.txt'), '{}');
    assert.deepEqual(discoverCoverageMaps(root), [mapPath]);
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
    const originalError = console.error;
    console.error = () => {};
    try {
      assert.equal(runMergeCli(root), 1);
    } finally {
      console.error = originalError;
    }
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
    const metadata = JSON.parse(fs.readFileSync(path.join(root, 'coverage', 'coverage-meta.json'), 'utf8'));
    assert.equal(metadata.rawBytes > 0, true);
    assert.equal(metadata.rawByteLimit, 25_000_000);
  });
});

test('raw coverage size rejects an oversized fixture with actual and allowed bytes', () => {
  withTempRepo(root => {
    const rawDirectory = path.join(root, 'coverage', 'raw');
    fs.mkdirSync(rawDirectory, { recursive: true });
    fs.writeFileSync(path.join(rawDirectory, 'oversized.json'), '123456');
    assert.equal(assertRawCoverageSize(root, 6), 6);
    assert.throws(
      () => assertRawCoverageSize(root, 5),
      /Raw coverage size 6 bytes exceeds allowed 5 bytes/,
    );
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

test('coverage gate normalizes report paths and handles pass, policy failure, and missing input', () => {
  withTempRepo(root => {
    const sourcePath = path.join(root, 'src', 'covered.js');
    const report = { total: summary(90), [sourcePath]: summary(90) };
    const normalized = normalizeSummary(root, report);
    assert.deepEqual([...normalized.files.keys()], ['src/covered.js']);

    const coverageDirectory = path.join(root, 'coverage');
    fs.mkdirSync(coverageDirectory, { recursive: true });
    fs.writeFileSync(path.join(coverageDirectory, 'coverage-summary.json'), JSON.stringify(report));
    const passingConfig = {
      global: { lines: 80, statements: 80, functions: 75, branches: 70 },
      perFile: { lines: 80, statements: 80, functions: 75, branches: 70 },
      changedFiles: { lines: 80, statements: 80, functions: 75, branches: 70 },
      overrides: {},
    };
    const originalLog = console.log;
    const originalError = console.error;
    console.log = () => {};
    console.error = () => {};
    try {
      assert.equal(runCoverageGateCli(root, { config: passingConfig, changedFiles: ['src/covered.js'] }), 0);
      assert.equal(runCoverageGateCli(root, {
        config: { ...passingConfig, global: { ...passingConfig.global, lines: 95 } },
        changedFiles: [],
      }), 1);
      fs.rmSync(coverageDirectory, { recursive: true });
      assert.equal(runCoverageGateCli(root, { config: passingConfig, changedFiles: [] }), 1);
    } finally {
      console.log = originalLog;
      console.error = originalError;
    }
  });
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
    fs.mkdirSync(path.join(root, 'coverage', 'raw', 'node-v8'), { recursive: true });
    fs.writeFileSync(path.join(root, 'coverage', 'raw', 'node-v8', 'temporary.json'), '{}');
    cleanNodeV8Directory(root);
    assert.equal(fs.existsSync(path.join(root, 'coverage', 'raw', 'node-v8')), false);
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

test('Windows cmd shims use ComSpec with escaped arguments', () => {
  const resolved = resolveSpawn(
    'C:\\Program Files\\nodejs\\npm.cmd',
    ['run', 'test & verify'],
    {
      platform: 'win32',
      environment: { ComSpec: 'C:\\Windows\\System32\\cmd.exe' },
    },
  );
  assert.equal(resolved.command, 'C:\\Windows\\System32\\cmd.exe');
  assert.deepEqual(resolved.args.slice(0, 3), ['/d', '/s', '/c']);
  assert.equal(resolved.options.windowsVerbatimArguments, true);
  assert.match(resolved.args[3], /Program\^ Files\\nodejs\\npm\.cmd/);
  assert.match(resolved.args[3], /\^+&/);
  assert.doesNotMatch(resolved.args[3], /test & verify/);
  assert.equal(escapeWindowsArgument('say"hi').includes('say\\^^^"hi'), true);
  assert.deepEqual(
    resolveSpawn('npm', ['run', 'test'], { platform: 'linux' }),
    { command: 'npm', args: ['run', 'test'], options: {} },
  );
});

test('preview launcher sets environment portably and selects named projects', async () => {
  const calls = [];
  await runPreview({
    root: process.cwd(),
    project: 'webkit',
    environment: { CI: '1' },
    run: async (...args) => calls.push(args),
  });
  assert.equal(calls[0][1], playwrightBinary(process.cwd()));
  assert.deepEqual(calls[0][2], ['test', '--project=webkit-smoke']);
  assert.deepEqual(calls[0][3].env, { CI: '1', PLAYWRIGHT_SERVER: 'preview' });
  const allProjectCalls = [];
  await runPreview({
    root: process.cwd(),
    environment: {},
    run: async (...args) => allProjectCalls.push(args),
  });
  assert.deepEqual(allProjectCalls[0][2], ['test']);
  assert.deepEqual(allProjectCalls[0][3].env, { CI: '', PLAYWRIGHT_SERVER: 'preview' });
  assert.match(playwrightBinary('C:\\fixture', 'win32'), /playwright\.cmd$/);
  await assert.rejects(
    runPreview({ root: process.cwd(), project: 'firefox', run: async () => {} }),
    /Unknown preview project/,
  );
  const cli = spawnSync(process.execPath, ['scripts/run_playwright_preview.cjs', 'firefox'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  assert.equal(cli.status, 1);
  assert.match(cli.stderr, /Unknown preview project/);
});

test('local CI orchestrator sets CI and builds exactly once', async () => {
  const calls = [];
  await runCi(async (...args) => calls.push(args), {
    detectWebKitSupport: () => ({ platform: 'fixture', supported: true }),
  });
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

test('local CI skips only unavailable WebKit builds while hosted WebKit remains required', async () => {
  assert.deepEqual(detectLocalWebKitSupport({
    utils: { hostPlatform: 'mac13-arm64' },
    registry: {
      registry: {
        findExecutable: browser => {
          assert.equal(browser, 'webkit');
          return { downloadURLs: [] };
        },
      },
    },
  }), {
    platform: 'mac13-arm64',
    supported: false,
  });

  const calls = [];
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = message => warnings.push(message);
  try {
    await runCi(async (...args) => calls.push(args), {
      detectWebKitSupport: () => ({ platform: 'mac13-arm64', supported: false }),
    });
  } finally {
    console.warn = originalWarn;
  }

  assert.deepEqual(calls.map(call => call[0]), [
    'npm version',
    'unit and data checks',
    'production build',
    'Chromium production preview',
  ]);
  assert.deepEqual(warnings, [
    'Skipping local WebKit production preview: Playwright does not publish WebKit for mac13-arm64. '
      + 'Hosted CI still requires the WebKit smoke lane.',
  ]);
});

test('coverage orchestrator enables instrumentation only for Chromium', async () => {
  await withTempRepoAsync(async root => {
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

test('Playwright coverage persistence is a no-op normally and rejects zero instrumented files', async () => {
  await withTempRepoAsync(async root => {
    const {
      coverageModeEnabled,
      persistWorkerCoverage,
    } = await import(pathToFileURL(path.join(process.cwd(), 'test', 'ui', 'coverage-runtime.js')).href);
    const outputPath = path.join(root, 'coverage', 'raw', 'browser', 'worker.json');
    const state = { map: createCoverageMap({}), failedTests: 0 };
    assert.equal(coverageModeEnabled({}), false);
    assert.equal(coverageModeEnabled({ COLLECT_COVERAGE: 'true' }), false);
    assert.equal(coverageModeEnabled({ COLLECT_COVERAGE: '1' }), true);
    assert.equal(persistWorkerCoverage({ enabled: false, state, outputPath }), false);
    assert.equal(fs.existsSync(path.join(root, 'coverage', 'raw')), false);
    assert.throws(
      () => persistWorkerCoverage({ enabled: true, state, outputPath }),
      /zero instrumented application files/,
    );
    assert.equal(fs.existsSync(outputPath), false);
  });
});

test('structured CI summaries include browser and coverage diagnostics', () => {
  withTempRepo(root => {
    const reportPath = path.join(root, 'playwright-results.json');
    fs.writeFileSync(reportPath, JSON.stringify({
      stats: {
        expected: 6,
        unexpected: 1,
        skipped: 2,
        flaky: 1,
        duration: 12_345,
      },
    }));
    const browser = browserSummary(process.cwd(), 'chromium', {
      PLAYWRIGHT_JSON_OUTPUT_FILE: reportPath,
      ARTIFACT_DIGEST: 'sha256:fixture',
      ARTIFACT_VALIDATION: 'success',
      JOB_STATUS: 'failure',
      REPORT_ARTIFACT_NAME: 'playwright-report-fixture',
      RESULTS_ARTIFACT_NAME: 'test-results-fixture',
    });
    assert.match(browser, /6 passed, 1 failed, 2 skipped, 1 flaky/);
    assert.match(browser, /Execution duration: 12\.3s/);
    assert.match(browser, /revision \d+/);
    assert.match(browser, /Artifact digest validation: success \(sha256:fixture\)/);
    assert.match(browser, /playwright-report-fixture, test-results-fixture/);
    const successBrowser = browserSummary(process.cwd(), 'webkit-smoke', {
      PLAYWRIGHT_JSON_OUTPUT_FILE: path.join(root, 'missing-report.json'),
      JOB_STATUS: 'success',
    });
    assert.match(successBrowser, /WebKit smoke/);
    assert.match(successBrowser, /unavailable passed, unavailable failed/);
    assert.doesNotMatch(successBrowser, /Failure reports/);
    assert.equal(formatDuration(Number.NaN), 'unavailable');

    fs.writeFileSync(path.join(root, 'coverage.config.cjs'), `module.exports = ${JSON.stringify({
      global: { lines: 90, statements: 88, functions: 85, branches: 77 },
      perFile: { lines: 60, statements: 60, functions: 50, branches: 50 },
      changedFiles: { lines: 80, statements: 80, functions: 75, branches: 70 },
      overrides: { 'src/legacy.js': {} },
    })};\n`);
    const coverageDirectory = path.join(root, 'coverage');
    fs.mkdirSync(path.join(coverageDirectory, 'raw'), { recursive: true });
    fs.writeFileSync(path.join(coverageDirectory, 'raw', 'map.json'), 'fixture');
    fs.writeFileSync(path.join(coverageDirectory, 'coverage-summary.json'), JSON.stringify({
      total: summary(90),
    }));
    fs.writeFileSync(path.join(coverageDirectory, 'coverage-meta.json'), JSON.stringify({
      sourceFiles: 151,
      excludedFiles: 9,
      rawBytes: 7,
      rawByteLimit: 25_000_000,
      reportMilliseconds: 1621,
    }));
    const coverage = coverageSummary(root, {
      JOB_STATUS: 'failure',
      DIAGNOSTICS_ARTIFACT_NAME: 'coverage-diagnostics-fixture',
    });
    assert.match(coverage, /lines 90%/);
    assert.match(coverage, /151 authored, 9 excluded, 1 overrides/);
    assert.match(coverage, /Changed files checked: 0/);
    assert.match(coverage, /Raw output: 7 \/ 25000000 bytes/);
    assert.match(coverage, /Report conversion: 1\.6s/);
    assert.match(coverage, /coverage-diagnostics-fixture/);
    const missingCoverage = coverageSummary(path.join(root, 'missing-root'), {
      COVERAGE_BASE_SHA: 'missing-base',
      JOB_STATUS: 'success',
    });
    assert.match(missingCoverage, /Global: unavailable/);
    assert.match(missingCoverage, /unavailable authored/);
    assert.match(missingCoverage, /Changed files checked: unavailable/);
    assert.doesNotMatch(missingCoverage, /Failure diagnostics/);

    const browserMetadataRoot = path.join(root, 'browser-metadata');
    const browserMetadataDirectory = path.join(browserMetadataRoot, 'node_modules', 'playwright-core');
    fs.mkdirSync(browserMetadataDirectory, { recursive: true });
    fs.writeFileSync(path.join(browserMetadataDirectory, 'browsers.json'), JSON.stringify({
      browsers: [{ name: 'chromium', revision: 'fixture-revision' }],
    }));
    assert.equal(browserRevision(browserMetadataRoot, 'chromium'), 'chromium (revision fixture-revision)');
    assert.equal(browserRevision(browserMetadataRoot, 'webkit-smoke'), 'unavailable');
    assert.equal(directoryBytes(path.join(root, 'missing-directory')), 0);
    const nestedBytes = path.join(root, 'nested-bytes', 'child');
    fs.mkdirSync(nestedBytes, { recursive: true });
    fs.writeFileSync(path.join(nestedBytes, 'bytes.txt'), '12345');
    assert.equal(directoryBytes(path.join(root, 'nested-bytes')), 5);

    const emitted = path.join(root, 'summary-output.md');
    emitSummary('first\n', { GITHUB_STEP_SUMMARY: emitted });
    assert.equal(fs.readFileSync(emitted, 'utf8'), 'first\n');
    assert.equal(runSummaryCli(process.cwd(), ['browser', 'chromium'], {
      GITHUB_STEP_SUMMARY: emitted,
      PLAYWRIGHT_JSON_OUTPUT_FILE: reportPath,
    }), 0);
    assert.equal(runSummaryCli(root, ['coverage'], { GITHUB_STEP_SUMMARY: emitted }), 0);
    const originalError = console.error;
    console.error = () => {};
    try {
      assert.equal(runSummaryCli(root, ['unknown'], { GITHUB_STEP_SUMMARY: emitted }), 1);
    } finally {
      console.error = originalError;
    }
    assert.match(fs.readFileSync(emitted, 'utf8'), /Browser \/ Chromium/);
  });
});

test('browser summary starts without repository dependencies', () => {
  withTempRepo(root => {
    const standaloneSummary = path.join(root, 'scripts', 'summarize_ci.cjs');
    fs.copyFileSync(path.join(process.cwd(), 'scripts', 'summarize_ci.cjs'), standaloneSummary);
    const result = spawnSync(process.execPath, [standaloneSummary, 'browser', 'chromium'], {
      cwd: root,
      encoding: 'utf8',
      env: {},
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /### Browser \/ Chromium/);
    assert.match(result.stdout, /Playwright: unavailable; browser unavailable/);
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
