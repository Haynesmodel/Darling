const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const esbuild = require('esbuild');
const nodeCanonical = require('../scripts/data/canonical-json.cjs');

const root = path.join(__dirname, '..');
let tempDir;
let browserCanonical;
let transport;

test.before(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'darling-integrity-'));
  await Promise.all([
    esbuild.build({ entryPoints: [path.join(root, 'src/data/canonical-json.ts')], outfile: path.join(tempDir, 'canonical.mjs'), bundle: true, platform: 'node', format: 'esm', target: 'node20', logLevel: 'silent' }),
    esbuild.build({ entryPoints: [path.join(root, 'src/data/verified-json-fetch.ts')], outfile: path.join(tempDir, 'transport.mjs'), bundle: true, platform: 'node', format: 'esm', target: 'node20', logLevel: 'silent' }),
  ]);
  browserCanonical = await import(`${pathToFileURL(path.join(tempDir, 'canonical.mjs')).href}?${Date.now()}`);
  transport = await import(`${pathToFileURL(path.join(tempDir, 'transport.mjs')).href}?${Date.now()}`);
});

test.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));

test('browser canonical JSON exactly matches the generator for edge cases', async () => {
  const fixtures = [
    { z: 1, a: { emoji: '🏆', quote: '"line"\nslash\\', empty: {}, values: [null, true, 1, 2.5] } },
    [{ b: 2, a: 1 }, { owners: ['José', 'Zoë'] }], {}, [],
  ];
  for (const fixture of fixtures) {
    assert.equal(browserCanonical.canonicalJson(fixture), nodeCanonical.canonicalJson(fixture));
    assert.equal(await browserCanonical.sha256Json(fixture), nodeCanonical.sha256Json(fixture));
  }
});

test('browser hashes match the manifest for every canonical JSON asset', async () => {
  const manifest = nodeCanonical.readJson(path.join(root, 'assets/asset-manifest.json'));
  for (const entry of [...Object.values(manifest.assets), manifest.derived]) {
    const value = nodeCanonical.readJson(path.join(root, entry.path));
    assert.equal(browserCanonical.canonicalJson(value), nodeCanonical.canonicalJson(value), entry.path);
    assert.equal(await browserCanonical.sha256Json(value), entry.sha256, entry.path);
  }
});

test('versioned URLs use the full digest and preserve an existing query', () => {
  const digest = `sha256:${'a'.repeat(64)}`;
  assert.equal(transport.versionedAssetUrl('assets/H2H.json?source=test', '/Darling', digest), `/Darling/assets/H2H.json?source=test&v=${'a'.repeat(64)}`);
  assert.throws(() => transport.versionedAssetUrl('assets/H2H.json', '/', 'sha256:abc'), error => error.code === 'INVALID_MANIFEST');
});

test('verified transport fails closed without SHA-256 support', async () => {
  const entry = nodeCanonical.readJson(path.join(root, 'assets/asset-manifest.json')).assets.H2H;
  const body = fs.readFileSync(path.join(root, entry.path));
  let requests = 0;
  await assert.rejects(transport.fetchVerifiedJson({
    name: 'H2H', path: entry.path, sha256: entry.sha256, bytes: entry.bytes, dataVersion: 'test-version',
  }, {
    fetchFn: async () => {
      requests += 1;
      return {
        ok: true, status: 200,
        async arrayBuffer() { return body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength); },
      };
    },
    digestFn: async () => { throw new Error('unavailable'); },
  }), error => error.code === 'INTEGRITY_UNAVAILABLE' && error.details.attempts === 1);
  assert.equal(requests, 1);
});
