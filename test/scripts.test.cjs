const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const { checkRepoHygiene } = require('../scripts/check_repo_hygiene.cjs');
const { createStaticServer, resolvePath } = require('../scripts/serve_static.cjs');
const { buildCoverageSummary } = require('../scripts/v8_coverage_report.cjs');

async function withTempRepo(fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'darling-hygiene-'));
  fs.mkdirSync(path.join(root, 'js'));
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ type: 'module' }));
  fs.writeFileSync(path.join(root, 'index.html'), '<script type="module" src="js/app.js"></script>');
  fs.writeFileSync(path.join(root, 'js', 'app.js'), "import './helpers.js';\n");
  fs.writeFileSync(path.join(root, 'js', 'helpers.js'), 'function ok() {}\nexport { ok };\n');
  try {
    return await fn(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function request(port, pathname, opts = {}) {
  return fetch(`http://127.0.0.1:${port}${pathname}`, opts);
}

function runNode(script, args, cwd) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd,
    encoding: 'utf8',
  });
}

function runShell(script, env, cwd) {
  return spawnSync('bash', [script], {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      ...env,
    },
  });
}

test('repo hygiene accepts the expected ESM app shape', async () => {
  await withTempRepo((root) => {
    assert.deepEqual(checkRepoHygiene(root), []);
  });
});

test('repo hygiene reports classic scripts and CommonJS helper regressions', async () => {
  await withTempRepo((root) => {
    fs.writeFileSync(path.join(root, 'index.html'), '<script src="js/helpers.js"></script>');
    fs.writeFileSync(path.join(root, 'js', 'helpers.js'), 'module.exports = {};\n');

    const failures = checkRepoHygiene(root);
    assert.ok(failures.some(failure => failure.includes('classic JavaScript scripts')));
    assert.ok(failures.some(failure => failure.includes('single module entrypoint')));
    assert.ok(failures.some(failure => failure.includes('CommonJS exports')));
    assert.ok(failures.some(failure => failure.includes('named helper APIs')));
  });
});

test('static server resolves only files under the configured root', async () => {
  await withTempRepo((root) => {
    assert.equal(resolvePath(root, '/'), path.join(root, 'index.html'));
    assert.equal(resolvePath(root, '/js/app.js?cache=1'), path.join(root, 'js', 'app.js'));
    assert.equal(resolvePath(root, '/../package.json'), null);
  });
});

test('static server serves files, no-store headers, and rejects unsupported methods', async () => {
  await withTempRepo(async (root) => {
    const server = createStaticServer(root);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();

    try {
      const ok = await request(port, '/js/app.js');
      assert.equal(ok.status, 200);
      assert.equal(ok.headers.get('cache-control'), 'no-store');
      assert.match(ok.headers.get('content-type'), /text\/javascript/);
      assert.match(await ok.text(), /helpers/);

      const head = await request(port, '/index.html', { method: 'HEAD' });
      assert.equal(head.status, 200);
      assert.equal(await head.text(), '');

      const missing = await request(port, '/missing.js');
      assert.equal(missing.status, 404);

      const post = await request(port, '/index.html', { method: 'POST' });
      assert.equal(post.status, 405);
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  });
});

test('coverage reporter measures source files and excludes tests', async () => {
  await withTempRepo((root) => {
    fs.mkdirSync(path.join(root, 'coverage', '.v8'), { recursive: true });
    fs.mkdirSync(path.join(root, 'scripts'), { recursive: true });
    fs.mkdirSync(path.join(root, 'test'), { recursive: true });

    const appSource = 'const app = true;\nexport { app };\n';
    const entryPointPath = path.join(root, 'js', 'app.js');
    const scriptSource = 'module.exports = { ok: true };\n';
    const testSource = 'assert.equal(1, 1);\n';
    const appPath = path.join(root, 'js', 'helpers.js');
    const scriptPath = path.join(root, 'scripts', 'tool.cjs');
    const testPath = path.join(root, 'test', 'data.test.js');
    fs.writeFileSync(entryPointPath, "import './helpers.js';\n");
    fs.writeFileSync(appPath, appSource);
    fs.writeFileSync(scriptPath, scriptSource);
    fs.writeFileSync(testPath, testSource);

    fs.writeFileSync(path.join(root, 'coverage', '.v8', 'coverage.json'), JSON.stringify({
      result: [appPath, scriptPath, testPath].map(filePath => ({
        url: pathToFileURL(filePath).href,
        functions: [{
          ranges: [{ startOffset: 0, endOffset: fs.readFileSync(filePath, 'utf8').length, count: 1 }],
        }],
      })).concat([entryPointPath].map(filePath => ({
        url: pathToFileURL(filePath).href,
        functions: [{
          ranges: [{ startOffset: 0, endOffset: fs.readFileSync(filePath, 'utf8').length, count: 1 }],
        }],
      }))),
    }));

    const summary = buildCoverageSummary(root);
    assert.deepEqual(
      summary.files.map(file => file.file).sort(),
      ['js/app.js', 'js/helpers.js', 'scripts/tool.cjs']
    );
    assert.equal(summary.total.lines.pct, 100);
  });
});

test('coverage reporter fails when a source file never appears in coverage output', async () => {
  await withTempRepo((root) => {
    fs.mkdirSync(path.join(root, 'coverage', '.v8'), { recursive: true });
    const entryPointPath = path.join(root, 'js', 'app.js');
    const coveredPath = path.join(root, 'js', 'helpers.js');
    const missingPath = path.join(root, 'js', 'missing.js');
    fs.writeFileSync(entryPointPath, "import './helpers.js';\n");
    fs.writeFileSync(coveredPath, 'const covered = true;\nexport { covered };\n');
    fs.writeFileSync(missingPath, 'const missing = true;\nexport { missing };\n');
    fs.writeFileSync(path.join(root, 'coverage', '.v8', 'coverage.json'), JSON.stringify({
      result: [{
        url: pathToFileURL(entryPointPath).href,
        functions: [{
          ranges: [{ startOffset: 0, endOffset: fs.readFileSync(entryPointPath, 'utf8').length, count: 1 }],
        }],
      }, {
        url: pathToFileURL(coveredPath).href,
        functions: [{
          ranges: [{ startOffset: 0, endOffset: fs.readFileSync(coveredPath, 'utf8').length, count: 1 }],
        }],
      }],
    }));

    assert.throws(
      () => buildCoverageSummary(root),
      /Missing coverage for source files: js\/missing\.js/
    );
  });
});

test('coverage summary checker accepts a valid summary file', async () => {
  await withTempRepo((root) => {
    fs.mkdirSync(path.join(root, 'coverage'));
    fs.writeFileSync(path.join(root, 'coverage', 'coverage-summary.json'), JSON.stringify({
      total: {
        lines: {
          pct: 100,
        },
      },
    }));

    const result = runNode(path.join(__dirname, '..', 'scripts', 'check_coverage.cjs'), [], root);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /Coverage 100% meets minimum 80%/);
  });
});

test('run_tests_with_coverage can execute in a minimal temp repo', async () => {
  await withTempRepo((root) => {
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ type: 'module' }));
    fs.mkdirSync(path.join(root, 'test'));
    fs.writeFileSync(path.join(root, 'test', 'data.test.js'), "import test from 'node:test';\nimport assert from 'node:assert/strict';\ntest('data ok', () => { assert.equal(1, 1); });\n");
    fs.writeFileSync(path.join(root, 'test', 'scripts.test.cjs'), "const test = require('node:test');\nconst assert = require('node:assert/strict');\ntest('scripts ok', () => { assert.equal(1, 1); });\n");
    fs.writeFileSync(path.join(root, 'test', 'app-state-controller.test.js'), "import test from 'node:test';\nimport assert from 'node:assert/strict';\ntest('app ok', () => { assert.ok(true); });\n");

    const result = runNode(path.join(__dirname, '..', 'scripts', 'run_tests_with_coverage.cjs'), [], root);
    assert.equal(result.status, 0);
  });
});

test('asset validation cli accepts the canonical bundle', async () => {
  await withTempRepo((root) => {
    fs.mkdirSync(path.join(root, 'assets'));
    fs.writeFileSync(path.join(root, 'assets', 'H2H.json'), JSON.stringify([{
      season: 2025,
      date: '2025-09-07',
      teamA: 'Joe',
      teamB: 'Shap',
      scoreA: 100,
      scoreB: 90,
      type: 'Regular',
      round: '',
    }]));
    fs.writeFileSync(path.join(root, 'assets', 'SeasonSummary.json'), JSON.stringify([{
      season: 2025,
      owner: 'Joe',
      wins: 10,
      losses: 4,
      ties: 0,
      finish: 1,
      playoff_wins: 2,
      playoff_losses: 0,
      saunders_wins: 0,
      saunders_losses: 0,
    }]));
    fs.writeFileSync(path.join(root, 'assets', 'Rivalries.json'), JSON.stringify([{
      name: 'Founders',
      members: ['Joe', 'Shap'],
    }]));

    const result = runNode(path.join(__dirname, '..', 'scripts', 'validate_assets.cjs'), [], root);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /Asset validation passed/);
  });
});

test('asset validation cli reports row-level failures', async () => {
  await withTempRepo((root) => {
    fs.mkdirSync(path.join(root, 'assets'));
    fs.writeFileSync(path.join(root, 'assets', 'H2H.json'), JSON.stringify([{
      season: 2025,
      date: 'not-a-date',
      teamA: 'Joe',
      teamB: 'Shap',
      scoreA: 100,
      scoreB: 90,
      type: 'Regular',
      round: '',
    }]));
    fs.writeFileSync(path.join(root, 'assets', 'SeasonSummary.json'), JSON.stringify([{
      season: 2025,
      owner: 'Joe',
      wins: 10,
      losses: 4,
      ties: 0,
      finish: 1,
      playoff_wins: 2,
      playoff_losses: 0,
      saunders_wins: 0,
      saunders_losses: 0,
    }]));
    fs.writeFileSync(path.join(root, 'assets', 'Rivalries.json'), JSON.stringify([{
      name: 'Founders',
      members: ['Joe', 'Shap'],
    }]));

    const result = runNode(path.join(__dirname, '..', 'scripts', 'validate_assets.cjs'), [], root);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /row 0 invalid date/);
  });
});

test('update workflow refuses live Sleeper calls unless explicitly enabled', async () => {
  const result = runShell(path.join(__dirname, '..', 'scripts', 'update_sleeper_h2h.sh'), {}, path.join(__dirname, '..'));
  assert.equal(result.status, 2);
  assert.match(result.stderr, /UPDATE_LIVE=1/);
});

test('update workflow validation-only mode runs with a stub updater and leaves assets untouched', async () => {
  const repoRoot = path.join(__dirname, '..');
  const stubDir = fs.mkdtempSync(path.join(os.tmpdir(), 'darling-python-stub-'));
  const stubPath = path.join(stubDir, 'python-stub.sh');
  const updatedPath = path.join(repoRoot, 'assets', 'H2H.updated.json');
  const before = fs.existsSync(updatedPath) ? fs.readFileSync(updatedPath, 'utf8') : null;

  fs.writeFileSync(stubPath, `#!/usr/bin/env bash
set -euo pipefail

out=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --out)
      out="$2"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done

mkdir -p "$(dirname "$out")"
cat > "$out" <<'JSON'
[
  {
    "season": 2025,
    "date": "2025-09-07",
    "teamA": "Joe",
    "teamB": "Shap",
    "scoreA": 100,
    "scoreB": 90,
    "week": 1,
    "round": "",
    "type": "Regular"
  }
]
JSON
`);
  fs.chmodSync(stubPath, 0o755);

  try {
    const result = runShell(
      path.join(repoRoot, 'scripts', 'update_sleeper_h2h.sh'),
      {
        UPDATE_LIVE: '1',
        VALIDATE_ONLY: '1',
        PYTHON: stubPath,
      },
      repoRoot,
    );

    assert.equal(result.status, 0);
    assert.match(result.stdout, /Validation-only mode enabled/);
    assert.match(result.stdout, /Validation complete\. No files were written into assets\//);

    if (before === null) {
      assert.equal(fs.existsSync(updatedPath), false);
    } else {
      assert.equal(fs.readFileSync(updatedPath, 'utf8'), before);
    }
  } finally {
    fs.rmSync(stubDir, { recursive: true, force: true });
  }
});
