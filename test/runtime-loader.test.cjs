const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const esbuild = require('esbuild');

const root = path.join(__dirname, '..');
const assetValues = Object.fromEntries([
  'assets/asset-manifest.json',
  'assets/H2H.json',
  'assets/SeasonSummary.json',
  'assets/Rivalries.json',
  'assets/CurrentSeason.json',
  'assets/DerivedStats.json',
].map(relativePath => [
  relativePath,
  JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8')),
]));

let tempDir;
let loadLeagueAssets;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function jsonResponse(value, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return clone(value);
    },
  };
}

function createFetch(overrides = {}, requests = []) {
  return async url => {
    requests.push(String(url));
    const relativePath = Object.keys(assetValues).find(candidate => String(url).endsWith(candidate));
    if (!relativePath) return jsonResponse({}, 404);
    const override = overrides[relativePath];
    if (override?.status) return jsonResponse(override.body || {}, override.status);
    return jsonResponse(override === undefined ? assetValues[relativePath] : override);
  };
}

function quietLogger() {
  const warnings = [];
  return {
    warnings,
    logger: {
      warn(message) {
        warnings.push(String(message));
      },
      error() {},
    },
  };
}

test.before(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'darling-runtime-loader-'));
  const outfile = path.join(tempDir, 'load-league-assets.mjs');
  await esbuild.build({
    entryPoints: [path.join(root, 'src/data/load-league-assets.ts')],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    logLevel: 'silent',
  });
  ({ loadLeagueAssets } = await import(`${pathToFileURL(outfile).href}?${Date.now()}`));
});

test.after(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test('runtime loader rejects an invalid manifest', async () => {
  await assert.rejects(
    loadLeagueAssets({
      basePath: '/Darling/',
      fetchFn: createFetch({ 'assets/asset-manifest.json': {} }),
    }),
    error => error.code === 'INVALID_MANIFEST' && error.asset === 'asset-manifest.json',
  );
});

test('runtime loader rejects unsupported schema and generator versions', async t => {
  await t.test('schema version', async () => {
    const manifest = clone(assetValues['assets/asset-manifest.json']);
    manifest.schema_versions.H2H = 2;
    await assert.rejects(
      loadLeagueAssets({ basePath: '/', fetchFn: createFetch({ 'assets/asset-manifest.json': manifest }) }),
      error => error.code === 'UNSUPPORTED_VERSION' && error.asset === 'H2H',
    );
  });

  await t.test('generator version', async () => {
    const manifest = clone(assetValues['assets/asset-manifest.json']);
    manifest.derived_generator_version = 2;
    await assert.rejects(
      loadLeagueAssets({ basePath: '/', fetchFn: createFetch({ 'assets/asset-manifest.json': manifest }) }),
      error => error.code === 'UNSUPPORTED_VERSION' && error.asset === 'DerivedStats',
    );
  });
});

test('runtime loader rejects a missing required asset', async () => {
  await assert.rejects(
    loadLeagueAssets({
      basePath: '/',
      fetchFn: createFetch({ 'assets/H2H.json': { status: 404 } }),
    }),
    error => error.code === 'HTTP_ERROR' && error.asset === 'H2H',
  );
});

test('runtime loader degrades invalid optional assets without hiding required history', async () => {
  const { warnings, logger } = quietLogger();
  const loaded = await loadLeagueAssets({
    basePath: '/',
    logger,
    fetchFn: createFetch({
      'assets/Rivalries.json': { invalid: true },
      'assets/CurrentSeason.json': [],
    }),
  });
  assert.ok(loaded.leagueGames.length > 0);
  assert.deepEqual(loaded.rivalries, []);
  assert.equal(loaded.currentSeason, null);
  assert.ok(loaded.diagnostics.optionalAssetFailures.includes('Rivalries'));
  assert.ok(loaded.diagnostics.optionalAssetFailures.includes('CurrentSeason'));
  assert.ok(warnings.some(message => message.includes('Optional Rivalries unavailable')));
  assert.ok(warnings.some(message => message.includes('Optional CurrentSeason unavailable')));
});

test('runtime loader rejects stale DerivedStats dependencies and uses fallbacks', async () => {
  const derived = clone(assetValues['assets/DerivedStats.json']);
  derived.source_hashes.H2H = `sha256:${'0'.repeat(64)}`;
  const { warnings, logger } = quietLogger();
  const loaded = await loadLeagueAssets({
    basePath: '/',
    logger,
    fetchFn: createFetch({ 'assets/DerivedStats.json': derived }),
  });
  assert.equal(loaded.derivedStats, null);
  assert.ok(loaded.diagnostics.optionalAssetFailures.includes('DerivedStats'));
  assert.ok(warnings.some(message => message.includes('dependency hashes do not match')));
});

test('runtime loader prefixes every request with the configured base path', async () => {
  const requests = [];
  const loaded = await loadLeagueAssets({
    basePath: '/Darling',
    fetchFn: createFetch({}, requests),
  });
  assert.ok(loaded.leagueGames.length > 0);
  assert.ok(requests.length >= 6);
  assert.ok(requests.every(url => url.startsWith('/Darling/assets/')), requests.join('\n'));
});
