const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  compareArtifactBytes,
  fetchBytes,
  fetchResponse,
  getCurrentMainSha,
  isAllowedUrl,
  normalizePagesUrl,
  readExpectedArtifact,
  runBrowserCheck,
  runVerification,
} = require('../scripts/verify_pages_deployment.cjs');

const pages = normalizePagesUrl('https://example.test/Darling/');
const index = Buffer.from('<html><link rel="stylesheet" href="/Darling/assets/app.css"></html>');
const manifest = Buffer.from('{"assets":{}}');
const artifact = { index, manifest };

function response(body, status = 200, headers = { 'content-type': 'text/html' }) {
  return new Response(body, { status, headers });
}

function pageRequest({ indexBody = index, manifestBody = manifest, indexStatus = 200 } = {}) {
  return async url => {
    if (url.endsWith('asset-manifest.json')) return response(manifestBody, 200, { 'content-type': 'application/json' });
    return response(indexBody, indexStatus);
  };
}

test('normalizes Pages origin and rejects lookalike base paths', () => {
  assert.equal(pages.url, 'https://example.test/Darling/');
  assert.equal(isAllowedUrl('https://example.test/Darling/assets/app.js', pages), true);
  assert.equal(isAllowedUrl('https://example.test/Darling2/assets/app.js', pages), false);
  assert.equal(isAllowedUrl('https://other.test/Darling/assets/app.js', pages), false);
});

test('compares exact artifact bytes and reports hashes', () => {
  const result = compareArtifactBytes({ name: 'index.html', expected: index, observed: Buffer.from(index) });
  assert.equal(result.expected.bytes, index.length);
  assert.equal(result.observed.sha256, result.expected.sha256);
  assert.throws(
    () => compareArtifactBytes({ name: 'index.html', expected: index, observed: Buffer.from('old') }),
    /index\.html mismatch: expected/,
  );
});

test('requires source HTML and manifest responses to be HTTP 200', async () => {
  await assert.rejects(
    () => fetchBytes(pages.url, {
      pages,
      request: pageRequest({ indexStatus: 503 }),
      requestTimeoutMs: 100,
    }),
    /Expected HTTP 200/,
  );
});

test('follows same-origin redirects and refuses cross-origin redirects', async () => {
  let calls = 0;
  const sameOrigin = await fetchBytes(pages.url, {
    pages,
    request: async url => {
      calls += 1;
      return calls === 1
        ? response(null, 302, { location: '/Darling/index.html' })
        : response(index);
    },
    requestTimeoutMs: 100,
  });
  assert.equal(sameOrigin.bytes.toString(), index.toString());
  await assert.rejects(
    () => fetchResponse(pages.url, {
      pages,
      request: async () => response(null, 302, { location: 'https://evil.test/Darling/' }),
      requestTimeoutMs: 100,
    }),
    /outside expected Pages origin\/base path/,
  );
});

test('request timeout covers a response body that never completes', async () => {
  await assert.rejects(
    () => fetchBytes(pages.url, {
      pages,
      request: async () => ({
        status: 200,
        headers: new Map(),
        arrayBuffer: () => new Promise(() => {}),
      }),
      requestTimeoutMs: 20,
    }),
    /Response body timed out after 20ms/,
  );
});

test('one deadline covers headers, redirects, and body consumption', async () => {
  const verifier = require('../scripts/verify_pages_deployment.cjs');
  const started = Date.now();
  const deadlineStart = Date.now();
  const deadline = {
    remaining: () => Math.max(0, 50 - (Date.now() - deadlineStart)),
    child: ms => ({ remaining: () => Math.max(0, Math.min(ms, 50 - (Date.now() - deadlineStart))) }),
  };
  let calls = 0;
  await assert.rejects(
    () => verifier.fetchBytes(pages.url, {
      pages, deadline, requestTimeoutMs: 100,
      request: async () => {
        await new Promise(resolve => setTimeout(resolve, 35));
        calls += 1;
        return calls === 1
          ? response(null, 302, { location: '/Darling/index.html' })
          : { status: 200, headers: new Map(), arrayBuffer: () => new Promise(resolve => setTimeout(() => resolve(index), 35)) };
      },
    }),
    /timed out/,
  );
  assert.ok(Date.now() - started < 130);
});

test('retries propagation mismatches at most twelve times and passes after recovery', async () => {
  let attempts = 0;
  const result = await runVerification({
    artifact,
    pages,
    expectedSha: 'a'.repeat(40),
    request: async url => {
      attempts += 1;
      const old = attempts < 5;
      return url.endsWith('asset-manifest.json')
        ? response(old ? Buffer.from('old') : manifest, 200, { 'content-type': 'application/json' })
        : response(old ? Buffer.from('old') : index);
    },
    maxAttempts: 12,
    retryDelayMs: 0,
    deadlineMs: 1000,
    browserCheck: async () => ({ requestFailures: [], consoleErrors: [], pageErrors: [] }),
  });
  assert.equal(result.status, 'PASS');
  assert.equal(result.attempts, 3);
  assert.equal(attempts, 6);
});

test('recovery on attempt eleven remains within the twelve-attempt ceiling', async () => {
  let attempts = 0;
  const result = await runVerification({
    artifact, pages, expectedSha: '1'.repeat(40), maxAttempts: 12, retryDelayMs: 0, deadlineMs: 1000,
    request: async url => {
      const attempt = Math.floor(attempts / 2) + 1;
      attempts += 1;
      const body = attempt < 11 ? Buffer.from('old') : (url.endsWith('asset-manifest.json') ? manifest : index);
      return response(body, 200, url.endsWith('asset-manifest.json') ? { 'content-type': 'application/json' } : undefined);
    },
    browserCheck: async () => ({ requestFailures: [], consoleErrors: [], pageErrors: [] }),
  });
  assert.equal(result.status, 'PASS');
  assert.equal(result.attempts, 11);
});

test('attempt twelve exhaustion is reported without a thirteenth try', async () => {
  const result = await runVerification({
    artifact, pages, expectedSha: '2'.repeat(40), maxAttempts: 12, retryDelayMs: 0, deadlineMs: 1000,
    request: pageRequest({ indexBody: Buffer.from('old') }),
    browserCheck: async () => ({ requestFailures: [], consoleErrors: [], pageErrors: [] }),
  });
  assert.equal(result.status, 'FAIL');
  assert.equal(result.attempts, 12);
});

test('default retry spacing is fifteen seconds when sleep is injected', async () => {
  const sleeps = [];
  const result = await runVerification({
    artifact, pages, expectedSha: '3'.repeat(40), maxAttempts: 2, deadlineMs: 20000,
    request: pageRequest({ indexBody: Buffer.from('old') }),
    sleep: async ms => sleeps.push(ms),
    browserCheck: async () => ({ requestFailures: [], consoleErrors: [], pageErrors: [] }),
  });
  assert.equal(result.status, 'FAIL');
  assert.deepEqual(sleeps, [15000]);
});

test('exhaustion returns FAIL with a bounded attempt count', async () => {
  const result = await runVerification({
    artifact,
    pages,
    expectedSha: 'b'.repeat(40),
    request: pageRequest({ indexBody: Buffer.from('old') }),
    maxAttempts: 3,
    retryDelayMs: 0,
    deadlineMs: 1000,
    browserCheck: async () => ({ requestFailures: [], consoleErrors: [], pageErrors: [] }),
  });
  assert.equal(result.status, 'FAIL');
  assert.equal(result.attempts, 3);
  assert.match(result.error, /mismatch/);
});

test('verification rejects budgets outside the documented hard caps', async () => {
  const base = { artifact, pages, expectedSha: 'a'.repeat(40) };
  await assert.rejects(() => runVerification({ ...base, deadlineMs: Infinity }), /deadlineMs must be a finite number/);
  await assert.rejects(() => runVerification({ ...base, maxAttempts: 13 }), /maxAttempts must be a finite number/);
  await assert.rejects(() => runVerification({ ...base, requestTimeoutMs: -1 }), /requestTimeoutMs must be a finite number/);
  await assert.rejects(() => runVerification({ artifact, pages }), /expectedSha must be a full 40-character/);
});

test('artifact mismatch retains browser failure evidence when the final attempt fails', async () => {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'darling-pages-'));
  const screenshotPath = path.join(outputDir, 'mismatch.png');
  const result = await runVerification({
    artifact,
    pages,
    expectedSha: 'b'.repeat(40),
    request: pageRequest({ indexBody: Buffer.from('old') }),
    maxAttempts: 1,
    retryDelayMs: 0,
    deadlineMs: 1000,
    browserFactory: fakeBrowser(),
    screenshotPath,
    browserTimeoutMs: 100,
  });
  assert.equal(result.status, 'FAIL');
  assert.deepEqual(result.browser.requestFailures, []);
  assert.equal(fs.readFileSync(screenshotPath, 'utf8'), 'PNG');
  fs.rmSync(outputDir, { recursive: true, force: true });
});

test('newer main SHA marks a propagation failure superseded', async () => {
  const result = await runVerification({
    artifact,
    pages,
    expectedSha: 'c'.repeat(40),
    repository: 'Haynesmodel/Darling',
    token: 'test-token',
    request: pageRequest({ indexBody: Buffer.from('old') }),
    apiRequest: async () => response(JSON.stringify({ commit: { sha: 'd'.repeat(40) } }), 200, { 'content-type': 'application/json' }),
    maxAttempts: 12,
    retryDelayMs: 0,
    deadlineMs: 1000,
  });
  assert.equal(result.status, 'SUPERSEDED');
  assert.equal(result.supersededBy, 'd'.repeat(40));
});

test('browser errors are retried and included in the final result', async () => {
  let browserAttempts = 0;
  const result = await runVerification({
    artifact,
    pages,
    expectedSha: 'e'.repeat(40),
    request: pageRequest(),
    maxAttempts: 2,
    retryDelayMs: 0,
    deadlineMs: 1000,
    browserCheck: async () => {
      browserAttempts += 1;
      throw Object.assign(new Error('application error'), {
        diagnostics: { requestFailures: [{ url: '/Darling/assets/app.js' }], consoleErrors: [], pageErrors: [] },
      });
    },
  });
  assert.equal(result.status, 'FAIL');
  assert.equal(browserAttempts, 2);
  assert.deepEqual(result.browser.requestFailures, [{ url: '/Darling/assets/app.js' }]);
});

function fakeBrowser({ failNavigation = false, emitErrors = false, hangingRequest = false, requestState, browserState, hangScreenshot = false, hangContextClose = false } = {}) {
  const listeners = new Map();
  let currentUrl = pages.url;
  const page = {
    on(event, callback) {
      listeners.set(event, callback);
    },
    async goto(url) {
      currentUrl = new URL(url, pages.url).toString();
      if (failNavigation) throw new Error('navigation failed');
      if (hangingRequest) listeners.get('request')?.({
        url: () => `${pages.url}assets/hanging.css`,
        resourceType: () => 'stylesheet',
        abort: async () => { if (requestState) requestState.aborted = true; },
      });
      if (emitErrors) {
        listeners.get('response')?.({ url: () => `${pages.url}missing.js`, status: () => 404 });
        listeners.get('requestfailed')?.({ url: () => `${pages.url}failed.js`, failure: () => ({ errorText: 'offline' }) });
        listeners.get('console')?.({ type: () => 'error', text: () => 'console failure' });
        listeners.get('pageerror')?.(new Error('page failure'));
      }
    },
    url: () => currentUrl,
    locator(selector) {
      return {
        async waitFor() {},
        async getAttribute(name) {
          if (name === 'data-feature-state' && selector.startsWith('#page-')) return 'ready';
          return null;
        },
        async click() {
          currentUrl = `${pages.url}?tab=current`;
        },
      };
    },
    async evaluate() {
      return [`${pages.url}assets/app.css`];
    },
    async waitForTimeout(ms) {
      if (hangingRequest) await new Promise(resolve => setTimeout(resolve, ms));
    },
    async screenshot({ path: screenshotPath }) {
      if (hangScreenshot) return new Promise(() => {});
      fs.writeFileSync(screenshotPath, 'PNG');
    },
  };
  const context = {
    async newPage() { return page; },
    pages() { return [page]; },
    async close() { if (hangContextClose) return new Promise(() => {}); },
  };
  const browser = {
    async newContext() { return context; },
    async close() { if (browserState) browserState.closed = true; },
  };
  return async () => browser;
}

test('browser adapter verifies Home, Current, navigation, styles, and captures a screenshot', async () => {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'darling-pages-'));
  const screenshotPath = path.join(outputDir, 'verification.png');
  const diagnostics = await runBrowserCheck({
    pages,
    browserFactory: fakeBrowser(),
    screenshotPath,
    browserTimeoutMs: 100,
  });
  assert.deepEqual(diagnostics.requestFailures, []);
  assert.deepEqual(diagnostics.consoleErrors, []);
  assert.deepEqual(diagnostics.pageErrors, []);
  assert.deepEqual(diagnostics.screenshots, [screenshotPath]);
  assert.equal(fs.readFileSync(screenshotPath, 'utf8'), 'PNG');
  fs.rmSync(outputDir, { recursive: true, force: true });
});

test('browser adapter preserves diagnostics and screenshot on navigation failure', async () => {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'darling-pages-'));
  const screenshotPath = path.join(outputDir, 'failure.png');
  await assert.rejects(
    () => runBrowserCheck({
      pages,
      browserFactory: fakeBrowser({ failNavigation: true }),
      screenshotPath,
      browserTimeoutMs: 100,
    }),
    error => error.message === 'navigation failed'
      && error.diagnostics.screenshots.length === 1,
  );
  assert.equal(fs.readFileSync(screenshotPath, 'utf8'), 'PNG');
  fs.rmSync(outputDir, { recursive: true, force: true });
});

test('browser adapter fails when app-owned request or console errors are observed', async () => {
  await assert.rejects(
    () => runBrowserCheck({
      pages,
      browserFactory: fakeBrowser({ emitErrors: true }),
      browserTimeoutMs: 100,
    }),
    error => error.message.includes('app-owned request or application errors')
      && error.diagnostics.requestFailures.length >= 2
      && error.diagnostics.consoleErrors.length >= 1
      && error.diagnostics.pageErrors.length >= 1,
  );
});

test('browser adapter reports an owned request that remains pending past its bound', async () => {
  await assert.rejects(
    () => runBrowserCheck({
      pages,
      browserFactory: fakeBrowser({ hangingRequest: true }),
      browserTimeoutMs: 100,
      requestTimeoutMs: 10,
    }),
    error => (error.message.includes('app-owned request or application errors') || error.message.includes('request settlement timed out'))
      && error.diagnostics.pendingRequests.length >= 1
      && error.diagnostics.requestFailures.some(failure => failure.kind === 'timeout'),
  );
});

test('browser scenario budget is a child of the global deadline', async () => {
  const started = Date.now();
  await runBrowserCheck({ pages, browserFactory: fakeBrowser(), browserTimeoutMs: 20, deadline: {
    remaining: () => Math.max(0, 500 - (Date.now() - started)),
    child: ms => ({ remaining: () => Math.max(0, Math.min(ms, 500 - (Date.now() - started))), child: () => ({ remaining: () => 0 }) }),
  } });
  assert.ok(Date.now() - started < 100);
});

test('late Chromium launch is closed after its launch deadline', async () => {
  let closed = false;
  await assert.rejects(() => runBrowserCheck({
    pages,
    browserTimeoutMs: 20,
    browserFactory: async () => {
      await new Promise(resolve => setTimeout(resolve, 40));
      return { close: async () => { closed = true; } };
    },
  }), /Chromium launch timed out/);
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(closed, true);
});

test('timed out browser requests are actively cancelled', async () => {
  const state = { aborted: false };
  await assert.rejects(() => runBrowserCheck({
    pages, browserFactory: fakeBrowser({ hangingRequest: true, requestState: state }),
    browserTimeoutMs: 100, requestTimeoutMs: 10,
  }));
  assert.equal(state.aborted, true);
});

test('failure cleanup starts even when screenshot or context close hangs', async () => {
  for (const option of ['hangScreenshot', 'hangContextClose']) {
    const state = { closed: false };
    await assert.rejects(() => runBrowserCheck({
      pages,
      browserFactory: fakeBrowser({
        failNavigation: option === 'hangScreenshot',
        [option]: true,
        browserState: state,
      }),
      browserTimeoutMs: 30,
      screenshotPath: option === 'hangScreenshot' ? path.join(os.tmpdir(), `darling-${option}.png`) : undefined,
    }));
    assert.equal(state.closed, true, option);
  }
});

test('expected artifact reader accepts complete artifacts and rejects missing files', () => {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'darling-artifact-'));
  fs.mkdirSync(path.join(outputDir, 'assets'));
  fs.writeFileSync(path.join(outputDir, 'index.html'), index);
  fs.writeFileSync(path.join(outputDir, 'assets', 'asset-manifest.json'), manifest);
  const loaded = readExpectedArtifact(outputDir);
  assert.deepEqual(loaded, artifact);
  fs.unlinkSync(path.join(outputDir, 'index.html'));
  assert.throws(() => readExpectedArtifact(outputDir), /missing index\.html/);
  fs.rmSync(outputDir, { recursive: true, force: true });
});

test('GitHub SHA lookup handles missing auth, API errors, and valid responses', async () => {
  assert.deepEqual(await getCurrentMainSha({ repository: 'Haynesmodel/Darling' }), { sha: null, status: 'missing-auth' });
  assert.deepEqual(await getCurrentMainSha({
    repository: 'Haynesmodel/Darling',
    token: 'secret',
    request: async () => response('denied', 403),
    requestTimeoutMs: 100,
  }), { sha: null, status: 'http-403', httpStatus: 403 });
  assert.deepEqual(await getCurrentMainSha({
    repository: 'Haynesmodel/Darling',
    token: 'secret',
    request: async () => response(JSON.stringify({ commit: { sha: 'f'.repeat(40) } }), 200, { 'content-type': 'application/json' }),
    requestTimeoutMs: 100,
  }), { sha: 'f'.repeat(40), status: 'ok' });
});
