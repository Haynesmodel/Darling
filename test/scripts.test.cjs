const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const sharp = require('sharp');

const { checkRepoHygiene } = require('../scripts/check_repo_hygiene.cjs');
const { checkCssHygiene, runCli: runCssHygieneCli } = require('../scripts/check_css_hygiene.cjs');
const { auditBuiltAssets } = require('../scripts/audit_built_assets.cjs');
const { canonicalJson, sha256Json } = require('../scripts/data/canonical-json.cjs');
const { measureBundle } = require('../scripts/check_bundle_size.cjs');
const { FORMATS, HERO_WIDTHS, generateHeroImages, resolveSource } = require('../scripts/generate_hero_images.cjs');
const { createStaticServer, normalizeBasePath, resolvePath } = require('../scripts/serve_static.cjs');
const { syncPublicAssets } = require('../scripts/sync_public_assets.cjs');
const { validateHeroAssets } = require('../scripts/validate_assets.cjs');
const { propagateResult } = require('../scripts/run_tests_with_coverage.cjs');

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

function writeCssHygieneFixture(root) {
  const styles = path.join(root, 'src', 'styles');
  fs.mkdirSync(styles, { recursive: true });
  fs.mkdirSync(path.join(root, 'scripts', 'data'), { recursive: true });
  fs.writeFileSync(path.join(root, 'scripts', 'data', 'css-budget.json'), JSON.stringify({
    defaultSharedLineBudget: 20,
    defaultFeatureLineBudget: 20,
    lineBudgets: {
      'src/styles/app.css': 10,
    },
    importantBudgets: {},
    hardcodedColorBudgets: {},
  }));
  fs.writeFileSync(path.join(styles, 'app.css'), [
    '@layer tokens, components;',
    '@import "./tokens.css" layer(tokens);',
    '@import "./components.css" layer(components);',
    '',
  ].join('\n'));
  fs.writeFileSync(path.join(styles, 'tokens.css'), ':root{--fixture-text:CanvasText}\n');
  fs.writeFileSync(path.join(styles, 'components.css'), '.fixture{color:var(--fixture-text)}\n');
}

test('repo hygiene accepts the expected ESM app shape', async () => {
  await withTempRepo((root) => {
    assert.deepEqual(checkRepoHygiene(root), []);
  });
});

test('CSS hygiene checker and CLI accept a layered fixture', async () => {
  await withTempRepo((root) => {
    writeCssHygieneFixture(root);
    assert.deepEqual(checkCssHygiene(root), []);

    const originalLog = console.log;
    const messages = [];
    console.log = message => messages.push(String(message));
    try {
      assert.equal(runCssHygieneCli(root), 0);
    } finally {
      console.log = originalLog;
    }
    assert.ok(messages.some(message => message.includes('CSS hygiene checks passed')));
  });
});

test('CSS hygiene checker and CLI report invalid and unimported CSS', async () => {
  await withTempRepo((root) => {
    writeCssHygieneFixture(root);
    fs.appendFileSync(path.join(root, 'src', 'styles', 'components.css'), '.fixture{outline:none}\n');
    fs.writeFileSync(path.join(root, 'src', 'styles', 'unimported.css'), '.unimported{color:var(--fixture-text)}\n');

    const failures = checkCssHygiene(root);
    assert.ok(failures.some(failure => failure.includes('repeats selector ".fixture"')));
    assert.ok(failures.some(failure => failure.includes('uses outline:none')));
    assert.ok(failures.some(failure => failure.includes('unimported.css is not imported')));

    const originalError = console.error;
    const messages = [];
    console.error = message => messages.push(String(message));
    try {
      assert.equal(runCssHygieneCli(root), 1);
    } finally {
      console.error = originalError;
    }
    assert.ok(messages.some(message => message.includes('CSS hygiene:')));
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

test('built asset audit requires every manifested deployable asset', async () => {
  await withTempRepo((root) => {
    const assetDir = path.join(root, 'dist', 'assets');
    fs.mkdirSync(path.join(assetDir, 'hero'), { recursive: true });
    const empty = [];
    const descriptor = (assetPath, required) => ({
      path: assetPath,
      required,
      bytes: Buffer.byteLength(canonicalJson(empty)),
      sha256: sha256Json(empty),
    });
    fs.writeFileSync(path.join(assetDir, 'asset-manifest.json'), JSON.stringify({
      assets: {
        H2H: descriptor('assets/H2H.json', true),
        Rivalries: descriptor('assets/Rivalries.json', false),
      },
      derived: descriptor('assets/DerivedStats.json', false),
      media: {
        leagueHero: {
          variants: [{ path: 'assets/hero/league-480.jpg' }],
        },
      },
    }));
    fs.writeFileSync(path.join(assetDir, 'H2H.json'), canonicalJson(empty));
    fs.writeFileSync(path.join(assetDir, 'Rivalries.json'), canonicalJson(empty));
    fs.writeFileSync(path.join(assetDir, 'DerivedStats.json'), canonicalJson(empty));
    fs.writeFileSync(path.join(assetDir, 'hero', 'league-480.jpg'), 'image');
    assert.deepEqual(auditBuiltAssets(root), []);

    fs.rmSync(path.join(assetDir, 'H2H.json'));
    assert.ok(auditBuiltAssets(root).some(error => error.includes('H2H.json is missing')));

    fs.writeFileSync(path.join(assetDir, 'H2H.json'), canonicalJson(empty));
    fs.rmSync(path.join(assetDir, 'DerivedStats.json'));
    assert.ok(auditBuiltAssets(root).some(error => error.includes('DerivedStats.json is missing')));

    fs.writeFileSync(path.join(assetDir, 'DerivedStats.json'), canonicalJson(empty));
    const outside = path.join(root, 'outside.json');
    fs.writeFileSync(outside, canonicalJson(empty));
    fs.rmSync(path.join(assetDir, 'Rivalries.json'));
    fs.symlinkSync(outside, path.join(assetDir, 'Rivalries.json'));
    assert.ok(auditBuiltAssets(root).some(error => error.includes('Rivalries.json resolves outside')));
  });
});

test('built asset audit rejects byte and semantic hash mismatches', async () => {
  await withTempRepo((root) => {
    const assetDir = path.join(root, 'dist', 'assets');
    fs.mkdirSync(assetDir, { recursive: true });
    const expected = { value: 1 };
    const entry = {
      path: 'assets/H2H.json', required: true,
      bytes: Buffer.byteLength(canonicalJson(expected)), sha256: sha256Json(expected),
    };
    fs.writeFileSync(path.join(assetDir, 'asset-manifest.json'), JSON.stringify({ assets: { H2H: entry }, media: { leagueHero: { variants: [] } } }));
    fs.writeFileSync(path.join(assetDir, 'H2H.json'), `${canonicalJson(expected)} `);
    assert.ok(auditBuiltAssets(root).some(error => error.includes('byte size')));
    fs.writeFileSync(path.join(assetDir, 'H2H.json'), canonicalJson({ value: 2 }));
    assert.ok(auditBuiltAssets(root).some(error => error.includes('hash')));
  });
});

test('built asset audit rejects malformed UTF-8 in the manifest and JSON assets', async () => {
  await withTempRepo((root) => {
    const assetDir = path.join(root, 'dist', 'assets');
    fs.mkdirSync(assetDir, { recursive: true });
    const malformedAsset = Buffer.concat([
      Buffer.from('{"value":"'),
      Buffer.from([0xc3]),
      Buffer.from('"}'),
    ]);
    const replacementValue = JSON.parse(malformedAsset.toString('utf8'));
    const manifest = {
      assets: {
        H2H: {
          path: 'assets/H2H.json',
          required: true,
          bytes: malformedAsset.byteLength,
          sha256: sha256Json(replacementValue),
        },
      },
      media: { leagueHero: { variants: [] } },
    };
    const manifestPath = path.join(assetDir, 'asset-manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    fs.writeFileSync(path.join(assetDir, 'H2H.json'), malformedAsset);

    assert.ok(auditBuiltAssets(root).some(error => error.includes('H2H.json is invalid JSON: not valid UTF-8')));

    const malformedManifest = Buffer.concat([
      Buffer.from('{"assets":{},"label":"'),
      Buffer.from([0xc3]),
      Buffer.from('"}'),
    ]);
    fs.writeFileSync(manifestPath, malformedManifest);
    assert.ok(auditBuiltAssets(root).some(error => error.includes('asset-manifest.json is invalid: not valid UTF-8')));
  });
});

test('bundle measurement enforces a separate data runtime chunk', async () => {
  await withTempRepo((root) => {
    const distDir = path.join(root, 'dist');
    const assetDir = path.join(distDir, 'assets');
    fs.mkdirSync(path.join(distDir, '.vite'), { recursive: true });
    fs.mkdirSync(path.join(root, 'scripts', 'data'), { recursive: true });
    fs.mkdirSync(assetDir, { recursive: true });
    fs.writeFileSync(path.join(root, 'scripts', 'data', 'bundle-budget.json'), JSON.stringify({
      baseline: { commit: 'fixture', largest_chunk_bytes: 100, largest_chunk_gzip_bytes: 100 },
      budgets: {
        entry_chunk_max_bytes: 1000,
        total_javascript_gzip_max_bytes: 1000,
        require_data_runtime_chunk: true,
      },
    }));
    fs.writeFileSync(path.join(distDir, '.vite', 'manifest.json'), JSON.stringify({
      'src/main.tsx': { file: 'assets/index.js', isEntry: true },
      'src/data/load-league-assets.ts': { file: 'assets/load-league-assets.js', isDynamicEntry: true },
    }));
    fs.writeFileSync(path.join(assetDir, 'index.js'), 'export const app = true;\n');
    fs.writeFileSync(path.join(assetDir, 'load-league-assets.js'), 'export const loader = true;\n');

    const result = measureBundle(root);
    assert.deepEqual(result.errors, []);
    assert.equal(result.chunks.length, 2);
    assert.equal(result.dataChunk.isDynamicEntry, true);

    fs.writeFileSync(path.join(distDir, '.vite', 'manifest.json'), JSON.stringify({
      'src/main.tsx': { file: 'assets/index.js', isEntry: true },
      'src/data/load-league-assets.ts': { file: 'assets/load-league-assets.js', isDynamicEntry: false },
    }));
    const staticLoader = measureBundle(root);
    assert.ok(staticLoader.errors.some(error => error.includes('not marked as a dynamic entry')));
  });
});

test('bundle measurement rejects duplicate named chart runtime chunks', async () => {
  await withTempRepo((root) => {
    const distDir = path.join(root, 'dist');
    const assetDir = path.join(distDir, 'assets');
    fs.mkdirSync(path.join(distDir, '.vite'), { recursive: true });
    fs.mkdirSync(path.join(root, 'scripts', 'data'), { recursive: true });
    fs.mkdirSync(assetDir, { recursive: true });
    fs.writeFileSync(path.join(root, 'scripts', 'data', 'bundle-budget.json'), JSON.stringify({
      baseline: { commit: 'fixture', largest_chunk_bytes: 100, largest_chunk_gzip_bytes: 100 },
      budgets: {
        entry_chunk_max_bytes: 1000,
        total_javascript_gzip_max_bytes: 1000,
        plot_vendor_max_copies: 1,
      },
    }));
    fs.writeFileSync(path.join(distDir, '.vite', 'manifest.json'), JSON.stringify({
      'src/main.ts': { file: 'assets/index.js', isEntry: true },
      '_chart-a.js': { file: 'assets/a.js', name: 'chart-runtime' },
      '_chart-b.js': { file: 'assets/b.js', name: 'chart-runtime' },
    }));
    fs.writeFileSync(path.join(assetDir, 'index.js'), 'export const app = true;\n');
    fs.writeFileSync(path.join(assetDir, 'a.js'), 'export const chartA = true;\n');
    fs.writeFileSync(path.join(assetDir, 'b.js'), 'export const chartB = true;\n');

    const result = measureBundle(root);
    assert.equal(result.vendorCopies.length, 2);
    assert.ok(result.errors.some(error => error.includes('Plot/vendor emitted 2 copies')));
  });
});

test('bundle measurement enforces the cold Pulse route and excludes chart runtime', async () => {
  await withTempRepo((root) => {
    const distDir = path.join(root, 'dist');
    const assetDir = path.join(distDir, 'assets');
    fs.mkdirSync(path.join(distDir, '.vite'), { recursive: true });
    fs.mkdirSync(path.join(root, 'scripts', 'data'), { recursive: true });
    fs.mkdirSync(assetDir, { recursive: true });
    fs.writeFileSync(path.join(root, 'scripts', 'data', 'bundle-budget.json'), JSON.stringify({
      baseline: { commit: 'fixture', largest_chunk_bytes: 100, largest_chunk_gzip_bytes: 100 },
      budgets: {
        entry_chunk_max_bytes: 1000, total_javascript_gzip_max_bytes: 1000, pulse_route_gzip_max_bytes: 1000,
        required_dynamic_entries: { 'league-pulse': 'src/features/league-pulse/league-pulse-controller.ts' },
      },
    }));
    fs.writeFileSync(path.join(distDir, '.vite', 'manifest.json'), JSON.stringify({
      'src/main.tsx': { file: 'assets/index.js', isEntry: true },
      'src/features/league-pulse/league-pulse-controller.ts': { file: 'assets/pulse.js', isDynamicEntry: true },
    }));
    fs.writeFileSync(path.join(assetDir, 'index.js'), 'export const app = true;\n');
    fs.writeFileSync(path.join(assetDir, 'pulse.js'), 'export const pulse = true;\n');
    const result = measureBundle(root);
    assert.deepEqual(result.errors, []);
    assert.ok(result.pulseRouteGzipBytes > 0);
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

test('run_tests_with_coverage propagates child status and termination signals', () => {
  const calls = [];
  const processApi = { pid: 42, kill: (...args) => calls.push(args) };
  assert.equal(propagateResult({ status: 0, signal: null }, processApi), 0);
  assert.equal(propagateResult({ status: null, signal: null }, processApi), 1);
  assert.equal(propagateResult({ status: null, signal: 'SIGTERM' }, processApi), 1);
  assert.deepEqual(calls, [[42, 'SIGTERM']]);
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
if [[ "$script" == "-" ]]; then
  echo '{"nfl_season":"2025","league_season":"2025","nfl_week":1}'
  exit 0
fi
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
    assert.doesNotMatch(result.stdout, /1257071385973362690/);
    assert.deepEqual(
      fs.readdirSync(path.join(repoRoot, 'scripts')).filter(name => name.startsWith('.update-')),
      [],
    );

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

test('update workflow rejects a Sleeper league-season mismatch before extraction', async () => {
  const repoRoot = path.join(__dirname, '..');
  const stubDir = fs.mkdtempSync(path.join(os.tmpdir(), 'darling-python-season-stub-'));
  const stubPath = path.join(stubDir, 'python-stub.sh');
  const extractionMarker = path.join(stubDir, 'extraction-started');

  fs.writeFileSync(stubPath, `#!/usr/bin/env bash
set -euo pipefail
script="$1"
if [[ "$script" == "-" ]]; then
  echo '{"nfl_season":"2026","league_season":"2026","nfl_week":1}'
  exit 0
fi
touch "${extractionMarker}"
exit 99
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
        LEAGUE_ID: 'not-logged',
        PYTHON: stubPath,
      },
      repoRoot,
    );

    assert.equal(result.status, 2);
    assert.match(result.stderr, /requested season 2025 does not match Sleeper league season 2026/);
    assert.equal(fs.existsSync(extractionMarker), false);
    assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /not-logged/);
  } finally {
    fs.rmSync(stubDir, { recursive: true, force: true });
  }
});
