const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const esbuild = require('esbuild');
const { canonicalJson, sha256Json } = require('../scripts/data/canonical-json.cjs');

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
const assetBodies = Object.fromEntries(Object.keys(assetValues).map(relativePath => [
  relativePath,
  fs.readFileSync(path.join(root, relativePath)),
]));

let tempDir;
let loadLeagueAssets;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function jsonResponse(value, status = 200, rawBody = null) {
  const body = rawBody || Buffer.from(canonicalJson(clone(value)));
  return {
    ok: status >= 200 && status < 300,
    status,
    async arrayBuffer() {
      return body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength);
    },
  };
}

function createFetch(overrides = {}, requests = []) {
  const attempts = new Map();
  return async (url, init) => {
    requests.push({ url: String(url), init: clone(init || {}) });
    const pathname = new URL(String(url), 'https://darling.test').pathname;
    const relativePath = Object.keys(assetValues).find(candidate => pathname.endsWith(candidate));
    if (!relativePath) return jsonResponse({}, 404);
    const configured = overrides[relativePath];
    const attempt = attempts.get(relativePath) || 0;
    attempts.set(relativePath, attempt + 1);
    const override = configured?.sequence ? configured.sequence[Math.min(attempt, configured.sequence.length - 1)] : configured;
    if (override?.status) return jsonResponse(override.body || {}, override.status);
    return override === undefined
      ? jsonResponse(assetValues[relativePath], 200, assetBodies[relativePath])
      : jsonResponse(override);
  };
}

function manifestWithValue(name, value) {
  const manifest = clone(assetValues['assets/asset-manifest.json']);
  const entry = name === 'DerivedStats' ? manifest.derived : manifest.assets[name];
  const body = canonicalJson(value);
  entry.bytes = Buffer.byteLength(body);
  entry.sha256 = sha256Json(value);
  return manifest;
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
  const manifest = manifestWithValue('DerivedStats', derived);
  const { warnings, logger } = quietLogger();
  const loaded = await loadLeagueAssets({
    basePath: '/',
    logger,
    fetchFn: createFetch({
      'assets/asset-manifest.json': manifest,
      'assets/DerivedStats.json': derived,
    }),
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
  assert.ok(requests.every(request => request.url.startsWith('/Darling/assets/')), requests.map(request => request.url).join('\n'));
});

test('runtime loader revalidates the manifest and versions assets with full hashes', async () => {
  const requests = [];
  const loaded = await loadLeagueAssets({ basePath: '/Darling/', fetchFn: createFetch({}, requests) });
  const manifestRequest = requests.find(request => request.url.endsWith('assets/asset-manifest.json'));
  assert.equal(manifestRequest.init.cache, 'no-store');
  assert.equal(new URL(manifestRequest.url, 'https://darling.test').search, '');
  const assetRequests = requests.filter(request => request !== manifestRequest);
  assert.ok(assetRequests.every(request => request.init.cache === 'force-cache'));
  for (const request of assetRequests) {
    const pathname = new URL(request.url, 'https://darling.test').pathname;
    const [name, entry] = Object.entries({ ...loaded.manifest.assets, DerivedStats: loaded.manifest.derived })
      .find(([, candidate]) => pathname.endsWith(candidate.path)) || [];
    assert.ok(name, request.url);
    assert.equal(new URL(request.url, 'https://darling.test').searchParams.get('v'), entry.sha256.replace('sha256:', ''));
  }
  assert.deepEqual(loaded.diagnostics.integrity.verifiedAssets, ['CurrentSeason', 'DerivedStats', 'H2H', 'Rivalries', 'SeasonSummary']);
});

test('runtime loader retries a mismatched cached asset once and records recovery', async () => {
  const requests = [];
  const loaded = await loadLeagueAssets({
    basePath: '/',
    fetchFn: createFetch({ 'assets/H2H.json': { sequence: [{ wrong: true }, assetValues['assets/H2H.json']] } }, requests),
    logger: { warn() {}, error() {} },
  });
  const h2hRequests = requests.filter(request => new URL(request.url, 'https://darling.test').pathname.endsWith('assets/H2H.json'));
  assert.equal(h2hRequests.length, 2);
  assert.equal(h2hRequests[0].init.cache, 'force-cache');
  assert.equal(h2hRequests[1].init.cache, 'reload');
  assert.deepEqual(loaded.diagnostics.integrity.recoveredAssets, ['H2H']);
});

test('runtime loader fails closed after two required integrity mismatches', async () => {
  await assert.rejects(
    loadLeagueAssets({
      basePath: '/',
      fetchFn: createFetch({ 'assets/H2H.json': { wrong: true } }),
    }),
    error => error.code === 'SIZE_MISMATCH' && error.asset === 'H2H' && error.details.attempts === 2,
  );
});
