const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const esbuild = require('esbuild');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const sharp = require('sharp');

const { checkRepoHygiene } = require('../scripts/check_repo_hygiene.cjs');
const { FORMATS, HERO_WIDTHS, generateHeroImages, resolveSource } = require('../scripts/generate_hero_images.cjs');
const { createStaticServer, normalizeBasePath, resolvePath } = require('../scripts/serve_static.cjs');
const { syncPublicAssets } = require('../scripts/sync_public_assets.cjs');
const { validateHeroAssets } = require('../scripts/validate_assets.cjs');
const { buildCoverageSummary, isTypeOnlySourceFile } = require('../scripts/v8_coverage_report.cjs');

async function withTempRepo(fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'darling-hygiene-'));
  fs.mkdirSync(path.join(root, 'js'));
  fs.mkdirSync(path.join(root, 'js', 'charting', 'vendor'), { recursive: true });
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ type: 'module' }));
  fs.writeFileSync(path.join(root, 'index.html'), '<script type="module" src="js/app.js"></script>');
  fs.writeFileSync(path.join(root, 'js', 'app.js'), "import './helpers.js';\n");
  fs.writeFileSync(path.join(root, 'js', 'helpers.js'), 'function ok() {}\nexport { ok };\n');
  fs.writeFileSync(path.join(root, 'js', 'charting', 'vendor', 'charting-vendor.js'), 'export {};\n');
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

test('repo hygiene accepts the Vite TypeScript app entrypoint', async () => {
  await withTempRepo((root) => {
    fs.writeFileSync(path.join(root, 'index.html'), '<script type="module" src="/src/main.tsx"></script>');

    assert.deepEqual(checkRepoHygiene(root), []);
  });
});

test('repo hygiene reports classic scripts and CommonJS helper regressions', async () => {
  await withTempRepo((root) => {
    fs.writeFileSync(path.join(root, 'index.html'), '<script src="js/helpers.js"></script>');
    fs.writeFileSync(path.join(root, 'js', 'helpers.js'), 'module.exports = {};\n');

    const failures = checkRepoHygiene(root);
    assert.ok(failures.some(failure => failure.includes('classic JavaScript scripts')));
    assert.ok(failures.some(failure => failure.includes('module entrypoint')));
    assert.ok(failures.some(failure => failure.includes('CommonJS exports')));
    assert.ok(failures.some(failure => failure.includes('named helper APIs')));
  });
});

test('repo hygiene scans nested source modules and ignores generated vendor code', async () => {
  await withTempRepo((root) => {
    fs.mkdirSync(path.join(root, 'js', 'charting'), { recursive: true });
    fs.writeFileSync(path.join(root, 'js', 'charting', 'chart-data.js'), 'const bad = require("bad");\n');
    fs.writeFileSync(path.join(root, 'js', 'charting', 'vendor', 'charting-vendor.js'), 'module.exports = {};\n');

    const failures = checkRepoHygiene(root);
    assert.ok(failures.some(failure => failure.includes('js/charting/chart-data.js must not use CommonJS require')));
    assert.ok(failures.some(failure => failure.includes('js/charting/chart-data.js must export named helper APIs')));
    assert.ok(!failures.some(failure => failure.includes('js/charting/vendor/charting-vendor.js')));
  });
});

test('static server resolves only files under the configured root', async () => {
  await withTempRepo((root) => {
    assert.equal(resolvePath(root, '/'), path.join(root, 'index.html'));
    assert.equal(resolvePath(root, '/js/app.js?cache=1'), path.join(root, 'js', 'app.js'));
    assert.equal(resolvePath(root, '/../package.json'), null);
  });
});

test('static server resolves project-page base paths', async () => {
  await withTempRepo((root) => {
    assert.equal(normalizeBasePath('Darling'), '/Darling/');
    assert.equal(normalizeBasePath('/'), '/');
    assert.equal(resolvePath(root, '/Darling/', '/Darling/'), path.join(root, 'index.html'));
    assert.equal(resolvePath(root, '/Darling/js/app.js?cache=1', '/Darling/'), path.join(root, 'js', 'app.js'));
    assert.equal(resolvePath(root, '/js/app.js', '/Darling/'), null);
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

test('static server redirects root into the configured base path', async () => {
  await withTempRepo(async (root) => {
    const server = createStaticServer(root, { basePath: '/Darling/' });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();

    try {
      const redirect = await request(port, '/?tab=current', { redirect: 'manual' });
      assert.equal(redirect.status, 302);
      assert.equal(redirect.headers.get('location'), '/Darling/?tab=current');

      const app = await request(port, '/Darling/js/app.js');
      assert.equal(app.status, 200);
      assert.match(app.headers.get('content-type'), /text\/javascript/);

      const outsideBase = await request(port, '/js/app.js');
      assert.equal(outsideBase.status, 404);
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  });
});

test('asset sync copies source assets into Vite public assets', async () => {
  await withTempRepo((root) => {
    fs.mkdirSync(path.join(root, 'assets'));
    fs.writeFileSync(path.join(root, 'assets', 'H2H.json'), '[{"season":2025}]\n');
    fs.writeFileSync(path.join(root, 'assets', 'H2H.updated.json'), '[]\n');
    fs.writeFileSync(path.join(root, 'assets', 'H2H_backup.json'), '[]\n');
    fs.writeFileSync(path.join(root, 'assets', 'LeaguePic.jpeg'), 'image\n');
    fs.mkdirSync(path.join(root, 'assets', 'hero'));
    fs.writeFileSync(path.join(root, 'assets', 'hero', 'league-1280.jpg'), 'image\n');
    fs.writeFileSync(path.join(root, 'assets', 'hero', 'source.txt'), 'skip\n');
    fs.writeFileSync(path.join(root, 'assets', '.DS_Store'), 'local\n');
    fs.mkdirSync(path.join(root, 'public', 'assets'), { recursive: true });
    fs.writeFileSync(path.join(root, 'public', 'assets', 'stale.json'), '{}\n');

    const targetDir = syncPublicAssets(root);

    assert.equal(targetDir, path.join(root, 'public', 'assets'));
    assert.equal(fs.readFileSync(path.join(root, 'public', 'assets', 'H2H.json'), 'utf8'), '[{"season":2025}]\n');
    assert.equal(fs.existsSync(path.join(root, 'public', 'assets', 'H2H.updated.json')), false);
    assert.equal(fs.existsSync(path.join(root, 'public', 'assets', 'H2H_backup.json')), false);
    assert.equal(fs.existsSync(path.join(root, 'public', 'assets', 'LeaguePic.jpeg')), false);
    assert.equal(fs.existsSync(path.join(root, 'public', 'assets', 'hero', 'league-1280.jpg')), true);
    assert.equal(fs.existsSync(path.join(root, 'public', 'assets', 'hero', 'source.txt')), false);
    assert.equal(fs.existsSync(path.join(root, 'public', 'assets', '.DS_Store')), false);
    assert.equal(fs.existsSync(path.join(root, 'public', 'assets', 'stale.json')), false);
  });
});

test('hero asset validation checks required responsive variants', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'darling-hero-assets-'));
  try {
    const heroDir = path.join(root, 'assets', 'hero');
    fs.mkdirSync(heroDir, { recursive: true });
    const files = [
      'league-480.avif',
      'league-768.avif',
      'league-1280.avif',
      'league-1920.avif',
      'league-480.webp',
      'league-768.webp',
      'league-1280.webp',
      'league-1920.webp',
      'league-480.jpg',
      'league-768.jpg',
      'league-1280.jpg',
      'league-1920.jpg',
    ];
    files.forEach(file => fs.writeFileSync(path.join(heroDir, file), 'image\n'));
    assert.doesNotThrow(() => validateHeroAssets(root));
    fs.rmSync(path.join(heroDir, 'league-480.avif'));
    assert.throws(() => validateHeroAssets(root), /Missing hero image/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('hero image generator creates every responsive format from a source image', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'darling-hero-generate-'));
  try {
    const sourcePath = path.join(root, 'source.jpg');
    await sharp({
      create: {
        width: 32,
        height: 20,
        channels: 3,
        background: '#2563eb',
      },
    }).jpeg().toFile(sourcePath);

    const resolved = resolveSource(root, sourcePath);
    assert.equal(resolved.label, 'source.jpg');

    const result = await generateHeroImages(root, sourcePath);
    assert.equal(result.outputs.length, HERO_WIDTHS.length * FORMATS.length);
    for (const width of HERO_WIDTHS) {
      for (const format of FORMATS) {
        const output = path.join(root, 'assets', 'hero', `league-${width}.${format.ext}`);
        assert.equal(fs.existsSync(output), true, output);
        assert.ok(fs.statSync(output).size > 0, output);
      }
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('coverage reporter measures source files and excludes tests', async () => {
  await withTempRepo((root) => {
    fs.mkdirSync(path.join(root, 'coverage', '.v8'), { recursive: true });
    fs.mkdirSync(path.join(root, 'scripts'), { recursive: true });
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.mkdirSync(path.join(root, 'test'), { recursive: true });

    const appSource = 'const app = true;\nexport { app };\n';
    const srcSource = "import '../js/app.js';\n";
    const entryPointPath = path.join(root, 'js', 'app.js');
    const scriptSource = 'module.exports = { ok: true };\n';
    const testSource = 'assert.equal(1, 1);\n';
    const appPath = path.join(root, 'js', 'helpers.js');
    const scriptPath = path.join(root, 'scripts', 'tool.cjs');
    const srcPath = path.join(root, 'src', 'main.tsx');
    const testPath = path.join(root, 'test', 'data.test.js');
    fs.writeFileSync(entryPointPath, "import './helpers.js';\n");
    fs.writeFileSync(appPath, appSource);
    fs.writeFileSync(scriptPath, scriptSource);
    fs.writeFileSync(srcPath, srcSource);
    fs.writeFileSync(testPath, testSource);

    fs.writeFileSync(path.join(root, 'coverage', '.v8', 'coverage.json'), JSON.stringify({
      result: [appPath, scriptPath, srcPath, testPath].map(filePath => ({
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
      ['js/app.js', 'js/helpers.js', 'scripts/tool.cjs', 'src/main.tsx']
    );
    assert.equal(summary.total.lines.pct, 100);
  });
});

test('coverage reporter maps inline source maps back to original TypeScript files', async () => {
  await withTempRepo(async (root) => {
    fs.mkdirSync(path.join(root, 'coverage', '.v8'), { recursive: true });
    fs.mkdirSync(path.join(root, 'src', 'theme'), { recursive: true });

    const entryPointPath = path.join(root, 'js', 'app.js');
    const helperPath = path.join(root, 'js', 'helpers.js');
    const sourcePath = path.join(root, 'src', 'theme', 'mapped.ts');
    fs.writeFileSync(entryPointPath, "import './helpers.js';\n");
    fs.writeFileSync(helperPath, 'const covered = true;\nexport { covered };\n');
    fs.writeFileSync(sourcePath, 'export function answer(){\n  return 42;\n}\nanswer();\n');

    const outPath = path.join(root, 'coverage', 'mapped.mjs');
    await esbuild.build({
      entryPoints: [sourcePath],
      outfile: outPath,
      bundle: true,
      format: 'esm',
      platform: 'browser',
      sourcemap: 'inline',
      sourcesContent: true,
    });
    const generated = fs.readFileSync(outPath, 'utf8');
    fs.writeFileSync(path.join(root, 'coverage', '.v8', 'coverage.json'), JSON.stringify({
      result: [entryPointPath, helperPath].map(filePath => ({
        url: pathToFileURL(filePath).href,
        functions: [{
          ranges: [{ startOffset: 0, endOffset: fs.readFileSync(filePath, 'utf8').length, count: 1 }],
        }],
      })).concat([{
        url: pathToFileURL(outPath).href,
        functions: [{
          ranges: [{ startOffset: 0, endOffset: generated.length, count: 1 }],
        }],
      }]),
    }));

    const summary = buildCoverageSummary(root);
    const mapped = summary.files.find(file => file.file === 'src/theme/mapped.ts');
    assert.ok(mapped);
    assert.equal(mapped.pct, 100);
  });
});

test('coverage reporter excludes type-only TypeScript files', async () => {
  await withTempRepo((root) => {
    fs.mkdirSync(path.join(root, 'coverage', '.v8'), { recursive: true });
    fs.mkdirSync(path.join(root, 'src', 'theme'), { recursive: true });
    const entryPointPath = path.join(root, 'js', 'app.js');
    const helperPath = path.join(root, 'js', 'helpers.js');
    const typeOnlyPath = path.join(root, 'src', 'theme', 'theme-types.ts');
    fs.writeFileSync(entryPointPath, "import './helpers.js';\n");
    fs.writeFileSync(helperPath, 'const covered = true;\nexport { covered };\n');
    fs.writeFileSync(typeOnlyPath, 'export type Mode = \"dark\" | \"light\";\nexport interface ThemeShape {\n  mode: Mode;\n}\n');
    fs.writeFileSync(path.join(root, 'coverage', '.v8', 'coverage.json'), JSON.stringify({
      result: [entryPointPath, helperPath].map(filePath => ({
        url: pathToFileURL(filePath).href,
        functions: [{
          ranges: [{ startOffset: 0, endOffset: fs.readFileSync(filePath, 'utf8').length, count: 1 }],
        }],
      })),
    }));

    assert.equal(isTypeOnlySourceFile(typeOnlyPath), true);
    const summary = buildCoverageSummary(root);
    assert.equal(summary.files.some(file => file.file === 'src/theme/theme-types.ts'), false);
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
      week: 1,
      type: 'Regular',
      round: '',
    }]));
    const summaryDefaults = {
      ties: 0,
      playoff_wins: 0,
      playoff_losses: 0,
      saunders_wins: 0,
      saunders_losses: 0,
      bye: false,
      wild_card: false,
      saunders_bye: false,
      bagels_earned: null,
    };
    fs.writeFileSync(path.join(root, 'assets', 'SeasonSummary.json'), JSON.stringify([
      { ...summaryDefaults, season: 2025, owner: 'Joe', wins: 1, losses: 0, finish: 1, points_for: 100, points_against: 90, champion: true, saunders: false },
      { ...summaryDefaults, season: 2025, owner: 'Shap', wins: 0, losses: 1, finish: 2, points_for: 90, points_against: 100, champion: false, saunders: true },
    ]));
    fs.writeFileSync(path.join(root, 'assets', 'Rivalries.json'), JSON.stringify([{
      slug: 'founders',
      name: 'Founders',
      type: 'pair',
      members: ['Joe', 'Shap'],
    }]));
    fs.mkdirSync(path.join(root, 'assets', 'hero'));
    [
      'league-480.avif',
      'league-768.avif',
      'league-1280.avif',
      'league-1920.avif',
      'league-480.webp',
      'league-768.webp',
      'league-1280.webp',
      'league-1920.webp',
      'league-480.jpg',
      'league-768.jpg',
      'league-1280.jpg',
      'league-1920.jpg',
    ].forEach(file => fs.writeFileSync(path.join(root, 'assets', 'hero', file), 'image\n'));

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
    assert.match(result.stderr, /row 0, field "date".*format "date"/);
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
  const currentUpdatedPath = path.join(repoRoot, 'assets', 'CurrentSeason.updated.json');
  const before = fs.existsSync(updatedPath) ? fs.readFileSync(updatedPath, 'utf8') : null;
  const currentBefore = fs.existsSync(currentUpdatedPath) ? fs.readFileSync(currentUpdatedPath, 'utf8') : null;

  fs.writeFileSync(stubPath, `#!/usr/bin/env bash
set -euo pipefail

script="$1"
shift
out=""
h2h=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --out)
      out="$2"
      shift 2
      ;;
    --h2h)
      h2h="$2"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done

mkdir -p "$(dirname "$out")"
if [[ "$script" == *"generate_current_season.py" ]]; then
cp assets/CurrentSeason.json "$out"
exit 0
fi

if [[ "$h2h" != "$out" ]]; then
  cp "$h2h" "$out"
fi
`);
  fs.chmodSync(stubPath, 0o755);

  try {
    const result = runShell(
      path.join(repoRoot, 'scripts', 'update_sleeper_h2h.sh'),
      {
        UPDATE_LIVE: '1',
        VALIDATE_ONLY: '1',
        SEASON: '2025',
        CURRENT_WEEK: '1',
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
    if (currentBefore === null) {
      assert.equal(fs.existsSync(currentUpdatedPath), false);
    } else {
      assert.equal(fs.readFileSync(currentUpdatedPath, 'utf8'), currentBefore);
    }
  } finally {
    fs.rmSync(stubDir, { recursive: true, force: true });
  }
});
