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

function responseFromBytes(bytes, { contentLength } = {}) {
  const body = Buffer.from(bytes);
  return {
    ok: true,
    status: 200,
    headers: {
      get(name) {
        return name.toLowerCase() === 'content-length' && contentLength !== undefined
          ? String(contentLength)
          : null;
      },
    },
    async arrayBuffer() {
      return body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength);
    },
  };
}

function descriptorFor(value, name = 'Fixture') {
  const body = Buffer.from(nodeCanonical.canonicalJson(value));
  return {
    descriptor: {
      name,
      path: `assets/${name}.json`,
      sha256: nodeCanonical.sha256Json(value),
      bytes: body.byteLength,
      dataVersion: 'sha256:fixture',
    },
    body,
  };
}

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

test('invalid UTF-8 retries once, recovers, and then fails closed when repeated', async () => {
  const { descriptor, body } = descriptorFor(0, 'Utf8Fixture');
  const invalid = Buffer.from([0xc3, 0x28]);
  const caches = [];
  const recovered = await transport.fetchVerifiedJson(descriptor, {
    fetchFn: async (_url, init) => {
      caches.push(init.cache);
      return responseFromBytes(caches.length === 1 ? invalid : body);
    },
    logger: { warn() {} },
  });
  assert.equal(recovered.cacheRecovered, true);
  assert.equal(recovered.attempts, 2);
  assert.deepEqual(caches, ['force-cache', 'reload']);

  await assert.rejects(
    transport.fetchVerifiedJson(descriptor, {
      fetchFn: async () => responseFromBytes(invalid),
      logger: { warn() {} },
    }),
    error => error.code === 'INVALID_UTF8' && error.details.attempts === 2,
  );
});

test('invalid JSON retries once and can recover from a fresh canonical body', async () => {
  const { descriptor, body } = descriptorFor(0, 'JsonFixture');
  const invalid = Buffer.from('{\n');
  let attempts = 0;
  const recovered = await transport.fetchVerifiedJson(descriptor, {
    fetchFn: async () => responseFromBytes(++attempts === 1 ? invalid : body),
    logger: { warn() {} },
  });
  assert.equal(recovered.value, 0);
  assert.equal(recovered.cacheRecovered, true);
  assert.equal(attempts, 2);
});

test('equal byte lengths do not bypass canonical SHA-256 verification', async () => {
  const { descriptor } = descriptorFor({ value: 'a' }, 'HashFixture');
  const wrongBody = Buffer.from(nodeCanonical.canonicalJson({ value: 'b' }));
  assert.equal(wrongBody.byteLength, descriptor.bytes);
  await assert.rejects(
    transport.fetchVerifiedJson(descriptor, {
      fetchFn: async () => responseFromBytes(wrongBody),
      logger: { warn() {} },
    }),
    error => error.code === 'INTEGRITY_MISMATCH'
      && error.details.actualBytes === descriptor.bytes
      && error.details.attempts === 2,
  );
});

test('manifest and declared asset maximum sizes fail before parsing or fetching', async () => {
  const oversizedManifest = Buffer.alloc(transport.MANIFEST_MAX_BYTES + 1, 0x20);
  await assert.rejects(
    transport.fetchManifestJson('assets/asset-manifest.json', {
      fetchFn: async () => responseFromBytes(oversizedManifest),
    }),
    error => error.code === 'INVALID_MANIFEST' && error.details.actualBytes === oversizedManifest.byteLength,
  );

  let requests = 0;
  await assert.rejects(
    transport.fetchVerifiedJson({
      name: 'Oversized',
      path: 'assets/Oversized.json',
      sha256: `sha256:${'a'.repeat(64)}`,
      bytes: transport.ASSET_MAX_BYTES + 1,
      dataVersion: 'sha256:fixture',
    }, {
      fetchFn: async () => {
        requests += 1;
        return responseFromBytes(Buffer.alloc(0));
      },
    }),
    error => error.code === 'INVALID_MANIFEST',
  );
  assert.equal(requests, 0);
});
