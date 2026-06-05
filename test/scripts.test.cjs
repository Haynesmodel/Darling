const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { checkRepoHygiene } = require('../scripts/check_repo_hygiene.cjs');
const { createStaticServer, resolvePath } = require('../scripts/serve_static.cjs');

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
