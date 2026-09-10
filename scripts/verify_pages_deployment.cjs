#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const DEFAULTS = Object.freeze({
  maxAttempts: 12,
  retryDelayMs: 15_000,
  deadlineMs: 240_000,
  requestTimeoutMs: 10_000,
  browserTimeoutMs: 30_000,
});

function normalizeBasePath(value) {
  const pathname = new URL(value, 'https://example.invalid').pathname;
  const stripped = pathname.replace(/^\/+|\/+$/g, '');
  return stripped ? `/${stripped}/` : '/';
}

function normalizePagesUrl(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error(`Pages URL must use HTTP(S); observed ${url.protocol}`);
  }
  const basePath = normalizeBasePath(url.pathname);
  return {
    origin: url.origin,
    basePath,
    url: `${url.origin}${basePath}`,
  };
}

function redactUrl(value) {
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`;
  } catch {
    return '<invalid-url>';
  }
}

function isAllowedUrl(value, pages) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.origin !== pages.origin) return false;
  if (pages.basePath === '/') return true;
  const baseWithoutTrailingSlash = pages.basePath.slice(0, -1);
  return url.pathname === baseWithoutTrailingSlash
    || url.pathname.startsWith(pages.basePath);
}

function assertAllowedUrl(value, pages) {
  if (!isAllowedUrl(value, pages)) {
    throw new Error(`Refusing redirect outside expected Pages origin/base path: ${redactUrl(value)}`);
  }
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function summarizeBytes(bytes) {
  return { bytes: bytes.length, sha256: sha256(bytes) };
}

function parseHeaders(headers) {
  if (!headers) return new Map();
  if (headers instanceof Map) return headers;
  if (typeof headers.get === 'function') {
    return new Map(['content-type', 'location'].map(name => [name, headers.get(name)]));
  }
  return new Map(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
}

function headerValue(headers, name) {
  const normalized = name.toLowerCase();
  for (const [key, value] of parseHeaders(headers)) {
    if (String(key).toLowerCase() === normalized) return value;
  }
  return undefined;
}

function makeDeadline(clock, durationMs) {
  const startedAt = clock();
  return {
    startedAt,
    expiresAt: startedAt + durationMs,
    remaining() {
      return Math.max(0, this.expiresAt - clock());
    },
    child(durationMs) {
      return makeDeadline(clock, Math.min(durationMs, this.remaining()));
    },
  };
}

async function withDeadline(task, deadline, message) {
  const timeoutMs = deadline.remaining();
  if (timeoutMs <= 0) throw new Error(message);
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(task),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function withTimeout(task, timeoutMs, message) {
  return withDeadline(task, makeDeadline(() => Date.now(), timeoutMs), message);
}

async function fetchResponse(url, {
  request = globalThis.fetch,
  requestTimeoutMs = DEFAULTS.requestTimeoutMs,
  pages,
  headers,
  maxRedirects = 5,
  deadline,
  clock = () => Date.now(),
} = {}) {
  const operationDeadline = deadline
    ? deadline.child(requestTimeoutMs)
    : makeDeadline(clock, requestTimeoutMs);
  const controller = new AbortController();
  let timer = setTimeout(() => controller.abort(), operationDeadline.remaining());
  let currentUrl = url;
  try {
    for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
      assertAllowedUrl(currentUrl, pages);
      let response;
      try {
        response = await withDeadline(
          () => request(currentUrl, {
            headers,
            redirect: 'manual',
            signal: controller.signal,
          }),
          operationDeadline,
          `Request timed out after ${requestTimeoutMs}ms: ${redactUrl(currentUrl)}`,
        );
      } catch (error) {
        if (error?.name === 'AbortError') {
          throw new Error(`Request timed out after ${requestTimeoutMs}ms: ${redactUrl(currentUrl)}`);
        }
        throw error;
      }
      const status = Number(response.status);
      if (status >= 300 && status < 400) {
        const location = headerValue(response.headers, 'location');
        if (!location) throw new Error(`Redirect from ${redactUrl(currentUrl)} has no Location header`);
        const nextUrl = new URL(location, currentUrl).toString();
        assertAllowedUrl(nextUrl, pages);
        currentUrl = nextUrl;
        continue;
      }
      return {
        response,
        finalUrl: currentUrl,
        deadline: operationDeadline,
        cancel() { controller.abort(); clearTimeout(timer); timer = undefined; },
      };
    }
    throw new Error(`Too many redirects while fetching ${redactUrl(url)}`);
  } catch (error) {
    controller.abort();
    clearTimeout(timer);
    throw error;
  }
}

async function fetchBytes(url, options) {
  const requestTimeoutMs = options?.requestTimeoutMs || DEFAULTS.requestTimeoutMs;
  const { response, finalUrl, deadline, cancel } = await fetchResponse(url, options);
  try {
    if (Number(response.status) !== 200) {
      throw new Error(`Expected HTTP 200 from ${redactUrl(finalUrl)}; observed ${response.status}`);
    }
    const bytes = Buffer.from(await withDeadline(
      () => response.arrayBuffer(),
      deadline,
      `Response body timed out after ${requestTimeoutMs}ms: ${redactUrl(finalUrl)}`,
    ));
    return { bytes, finalUrl, contentType: headerValue(response.headers, 'content-type') || '' };
  } finally {
    cancel();
  }
}

function compareArtifactBytes({ name, expected, observed }) {
  const expectedSummary = summarizeBytes(expected);
  const observedSummary = summarizeBytes(observed);
  if (!expected.equals(observed)) {
    const error = new Error(
      `${name} mismatch: expected ${expectedSummary.bytes} bytes (${expectedSummary.sha256}), `
      + `observed ${observedSummary.bytes} bytes (${observedSummary.sha256})`,
    );
    error.expected = expectedSummary;
    error.observed = observedSummary;
    throw error;
  }
  return { expected: expectedSummary, observed: observedSummary };
}

function readExpectedArtifact(artifactDir) {
  const indexPath = path.join(artifactDir, 'index.html');
  const manifestPath = path.join(artifactDir, 'assets', 'asset-manifest.json');
  if (!fs.existsSync(indexPath) || !fs.existsSync(manifestPath)) {
    throw new Error(`Expected artifact is missing index.html or assets/asset-manifest.json under ${artifactDir}`);
  }
  return {
    index: fs.readFileSync(indexPath),
    manifest: fs.readFileSync(manifestPath),
  };
}

async function comparePublicArtifact({ artifact, pages, request, requestTimeoutMs, expectedSha, deadline, clock }) {
  const result = {
    expectedSha,
    index: { expected: summarizeBytes(artifact.index) },
    manifest: { expected: summarizeBytes(artifact.manifest) },
    errors: [],
  };
  let index;
  let manifest;
  try {
    index = await fetchBytes(pages.url, { pages, request, requestTimeoutMs, deadline, clock });
    result.urls = { ...(result.urls || {}), index: redactUrl(index.finalUrl) };
    result.index = { ...result.index, ...compareArtifactBytes({ name: 'public index.html', expected: artifact.index, observed: index.bytes }) };
  } catch (error) {
    result.errors.push(String(error.message || error));
    if (error.expected && error.observed) result.index = { expected: error.expected, observed: error.observed };
  }
  try {
    manifest = await fetchBytes(`${pages.url}assets/asset-manifest.json`, {
      pages,
      request,
      requestTimeoutMs, deadline, clock,
    });
    result.urls = { ...(result.urls || {}), manifest: redactUrl(manifest.finalUrl) };
    result.manifest = { ...result.manifest, ...compareArtifactBytes({ name: 'public asset-manifest.json', expected: artifact.manifest, observed: manifest.bytes }) };
  } catch (error) {
    result.errors.push(String(error.message || error));
    if (error.expected && error.observed) result.manifest = { expected: error.expected, observed: error.observed };
  }
  if (result.errors.length) {
    const error = new Error(result.errors.join('; '));
    error.comparison = result;
    throw error;
  }
  delete result.errors;
  return result;
}

async function getCurrentMainSha({ repository, token, request = globalThis.fetch, apiUrl = 'https://api.github.com', requestTimeoutMs = DEFAULTS.requestTimeoutMs, deadline, clock = () => Date.now() }) {
  if (!repository || !token) return { sha: null, status: 'missing-auth' };
  const endpoint = `${apiUrl.replace(/\/$/, '')}/repos/${repository}/branches/main`;
  const operationDeadline = deadline ? deadline.child(requestTimeoutMs) : makeDeadline(clock, requestTimeoutMs);
  const controller = new AbortController();
  let timer = setTimeout(() => controller.abort(), operationDeadline.remaining());
  try {
    const response = await withDeadline(
      () => request(endpoint, {
        headers: {
          accept: 'application/vnd.github+json',
          authorization: `Bearer ${token}`,
          'x-github-api-version': '2022-11-28',
        },
        signal: controller.signal,
      }),
      operationDeadline,
      `GitHub API request timed out after ${requestTimeoutMs}ms`,
    );
    if (response.status !== 200) return { sha: null, status: `http-${response.status}`, httpStatus: Number(response.status) };
    const body = await withDeadline(
      () => response.json(),
      operationDeadline,
      `GitHub API response body timed out after ${requestTimeoutMs}ms`,
    );
    if (typeof body?.commit?.sha !== 'string') return { sha: null, status: 'invalid-body' };
    return { sha: body.commit.sha, status: 'ok' };
  } catch (error) {
    return { sha: null, status: error?.message?.includes('timed out') ? 'timeout' : 'error' };
  } finally {
    controller.abort();
    clearTimeout(timer);
  }
}

async function runBrowserCheck({ pages, browserFactory, screenshotPath, browserTimeoutMs = DEFAULTS.browserTimeoutMs, requestTimeoutMs = DEFAULTS.requestTimeoutMs, deadline, clock = () => Date.now() }) {
  const scenarioDeadline = deadline || makeDeadline(clock, browserTimeoutMs);
  if (!browserFactory) {
    const { chromium } = require('playwright');
    browserFactory = () => chromium.launch({ headless: true });
  }
  const browser = await withDeadline(browserFactory, scenarioDeadline, 'Chromium launch timed out');
  const diagnostics = { requestFailures: [], consoleErrors: [], pageErrors: [], screenshots: [], screenshotErrors: [], pendingRequests: [] };
  const pending = new Map();
  const requestEpochs = new WeakMap();
  let navigationEpoch = 0;
  const clearPending = request => {
    const timer = pending.get(request);
    if (timer) clearTimeout(timer);
    pending.delete(request);
  };
  const recordFailure = (kind, request, extra = {}) => diagnostics.requestFailures.push({
    kind, url: redactUrl(request.url()), ...extra,
  });
  try {
    const context = await withDeadline(
      () => browser.newContext({ baseURL: pages.url }),
      scenarioDeadline,
      'Chromium context creation timed out',
    );
    try {
      const page = await withDeadline(() => context.newPage(), scenarioDeadline, 'Chromium page creation timed out');
      const owned = url => isAllowedUrl(url, pages);
      page.on('request', request => {
        if (!owned(request.url())) return;
        const epoch = navigationEpoch;
        requestEpochs.set(request, epoch);
        const timeout = Math.min(requestTimeoutMs, scenarioDeadline.remaining());
        const timer = setTimeout(() => {
          if (!pending.has(request)) return;
          pending.delete(request);
          diagnostics.pendingRequests.push(redactUrl(request.url()));
          recordFailure('timeout', request, { epoch });
        }, Math.max(1, timeout));
        pending.set(request, timer);
      });
      page.on('response', response => {
        if (owned(response.url()) && response.status() >= 400) {
          diagnostics.requestFailures.push({
            kind: 'response',
            url: redactUrl(response.url()),
            status: response.status(),
          });
        }
      });
      page.on('requestfailed', request => {
        if (owned(request.url())) {
          const errorText = request.failure()?.errorText || 'unknown request failure';
          clearPending(request);
          const resourceType = typeof request.resourceType === 'function' ? request.resourceType() : '';
          const intentionalNavigationAbort = errorText === 'net::ERR_ABORTED'
            && resourceType !== 'document' && (requestEpochs.get(request) ?? navigationEpoch) < navigationEpoch;
          if (!intentionalNavigationAbort) recordFailure('requestfailed', request, { error: errorText });
        }
      });
      page.on('requestfinished', request => clearPending(request));
      page.on('console', message => {
        if (message.type() === 'error') diagnostics.consoleErrors.push(message.text().slice(0, 500));
      });
      page.on('pageerror', error => diagnostics.pageErrors.push(String(error).slice(0, 500)));

      async function waitForReady(panel, name) {
        await withDeadline(
          () => panel.waitFor({ state: 'visible', timeout: browserTimeoutMs }),
          scenarioDeadline,
          `${name} ready panel did not become visible`,
        );
        let state;
        while (scenarioDeadline.remaining() > 0) {
          state = await panel.getAttribute('data-feature-state');
          if (state === 'ready') return;
          await withDeadline(() => page.waitForTimeout(Math.min(100, Math.max(1, scenarioDeadline.remaining()))), scenarioDeadline, `${name} readiness polling timed out`);
        }
        throw new Error(`${name} panel reached state ${state || 'missing'}, expected ready`);
      }

      async function visit(url, selector, name) {
        navigationEpoch += 1;
        await withDeadline(
          () => page.goto(url, { waitUntil: 'domcontentloaded', timeout: browserTimeoutMs }),
          scenarioDeadline,
          `${name} navigation timed out`,
        );
        assertAllowedUrl(page.url(), pages);
        await waitForReady(page.locator(selector), name);
        const stylesheets = await withDeadline(
          () => page.evaluate(() => Array.from(document.styleSheets).map(sheet => sheet.href || 'inline')),
          scenarioDeadline,
          `${name} stylesheet inspection timed out`,
        );
        if (!stylesheets.some(href => href !== 'inline')) throw new Error(`${name} loaded no external stylesheet`);
      }

      await visit('./', '#page-pulse', 'Home');
      const seasonLink = page.locator('#tabCurrentBtn');
      navigationEpoch += 1;
      await withDeadline(() => seasonLink.click(), scenarioDeadline, 'Season navigation click timed out');
      await waitForReady(page.locator('#page-current'), 'Season navigation');
      await visit('./?tab=current', '#page-current', 'Current deep link');
      await visit('./', '#page-pulse', 'Home return');
      if (screenshotPath) {
        try {
          await withDeadline(() => page.screenshot({ path: screenshotPath, fullPage: true }), scenarioDeadline, 'Browser screenshot timed out');
          diagnostics.screenshots.push(screenshotPath);
        } catch (error) {
          diagnostics.screenshotErrors.push(String(error.message || error));
          throw error;
        }
      }
      await withDeadline(() => page.waitForTimeout(Math.min(50, scenarioDeadline.remaining())), scenarioDeadline, 'Browser settle timed out');
      if (scenarioDeadline.remaining() <= 0) throw new Error('Browser verification exceeded its scenario budget');
      if (diagnostics.requestFailures.length || diagnostics.consoleErrors.length || diagnostics.pageErrors.length || diagnostics.pendingRequests.length) {
        throw new Error('Browser verification observed app-owned request or application errors');
      }
      await withDeadline(() => context.close(), scenarioDeadline, 'Chromium context cleanup timed out');
      return diagnostics;
    } catch (error) {
      try {
        if (screenshotPath) {
          const pagesInContext = context.pages();
          if (pagesInContext[0]) {
            await withDeadline(() => pagesInContext[0].screenshot({ path: screenshotPath, fullPage: true }), scenarioDeadline, 'Failure screenshot timed out');
            if (!diagnostics.screenshots.includes(screenshotPath)) diagnostics.screenshots.push(screenshotPath);
          }
        }
      } catch {
        // Preserve the original browser failure when screenshot capture is unavailable.
      }
      try { await context.close(); } catch { /* best effort cleanup */ }
      error.diagnostics = diagnostics;
      throw error;
    }
  } finally {
    for (const timer of pending.values()) clearTimeout(timer);
    pending.clear();
    try { await withDeadline(() => browser.close(), scenarioDeadline, 'Chromium cleanup timed out'); } catch { /* best effort cleanup */ }
  }
}

function appendSummary(summaryPath, result) {
  if (!summaryPath) return;
  const lines = [
    '### Pages deployment verification',
    `- Result: **${result.status}**`,
    `- Expected SHA: \`${result.expectedSha}\``,
    `- Attempts: ${result.attempts}`,
    `- Superseded: ${result.superseded ? 'yes' : 'no'}`,
  ];
  if (result.pages) lines.push(`- URL: ${result.pages.url}`);
  if (result.index) lines.push(`- index.html: expected ${result.index.expected?.sha256 || 'unknown'}, observed ${result.index.observed?.sha256 || 'unavailable'}`);
  if (result.manifest) lines.push(`- asset-manifest.json: expected ${result.manifest.expected?.sha256 || 'unknown'}, observed ${result.manifest.observed?.sha256 || 'unavailable'}`);
  if (result.urls) lines.push(`- Checked URLs: index ${result.urls.index || 'unavailable'}, manifest ${result.urls.manifest || 'unavailable'}`);
  if (result.supersessionChecks?.length) {
    lines.push(`- Supersession checks: ${result.supersessionChecks.map(check => `${check.stage}=${check.status}`).join(', ')}`);
  }
  if (result.error) lines.push(`- Error: ${result.error}`);
  fs.appendFileSync(summaryPath, `${lines.join('\n')}\n`);
}

async function runVerification(options) {
  const settings = { ...DEFAULTS, ...options };
  const numericLimits = [
    ['maxAttempts', 1, 12],
    ['deadlineMs', 1, 240_000],
    ['requestTimeoutMs', 1, 10_000],
    ['browserTimeoutMs', 1, 30_000],
    ['retryDelayMs', 0, 240_000],
  ];
  for (const [name, minimum, maximum] of numericLimits) {
    if (!Number.isFinite(settings[name]) || settings[name] < minimum || settings[name] > maximum) {
      throw new Error(`${name} must be a finite number between ${minimum} and ${maximum}`);
    }
  }
  const clock = settings.clock || (() => Date.now());
  const sleep = settings.sleep || (ms => new Promise(resolve => setTimeout(resolve, ms)));
  const artifact = settings.artifact || readExpectedArtifact(settings.artifactDir);
  const pages = settings.pages || normalizePagesUrl(settings.pagesUrl);
  const deadline = makeDeadline(clock, settings.deadlineMs);
  const result = {
    status: 'FAIL',
    expectedSha: settings.expectedSha,
    attempts: 0,
    superseded: false,
    pages,
    errors: [],
    supersessionChecks: [],
  };
  let lastError;

  async function checkSupersession(stage) {
    const check = await getCurrentMainSha({
      repository: settings.repository,
      token: settings.token,
      request: settings.apiRequest || settings.request,
      apiUrl: settings.apiUrl,
      requestTimeoutMs: Math.min(settings.requestTimeoutMs, deadline.remaining()),
      deadline,
      clock,
    });
    result.supersessionChecks.push({ stage, status: check.status, ...(check.sha ? { sha: check.sha } : {}) });
    if (settings.expectedSha && check.sha && check.sha !== settings.expectedSha) {
      result.status = 'SUPERSEDED';
      result.superseded = true;
      result.supersededBy = check.sha;
      return true;
    }
    return false;
  }

  for (let attempt = 1; attempt <= settings.maxAttempts; attempt += 1) {
    result.attempts = attempt;
    if (deadline.remaining() <= 0) break;
    try {
      if (await checkSupersession(`attempt-${attempt}-start`)) return result;
      const artifactResult = await comparePublicArtifact({
        artifact,
        pages,
        request: settings.request,
        requestTimeoutMs: Math.min(settings.requestTimeoutMs, deadline.remaining()),
        expectedSha: settings.expectedSha,
        deadline,
        clock,
      });
      result.index = artifactResult.index;
      result.manifest = artifactResult.manifest;
      const browserResult = await (settings.browserCheck || runBrowserCheck)({
          pages,
          browserFactory: settings.browserFactory,
          screenshotPath: settings.screenshotPath,
          browserTimeoutMs: Math.min(settings.browserTimeoutMs, deadline.remaining()),
          requestTimeoutMs: settings.requestTimeoutMs,
          deadline,
          clock,
        });
      result.browser = browserResult;
      if (deadline.remaining() <= 0) throw new Error('Verification deadline expired during browser verification');
      if (await checkSupersession(`attempt-${attempt}-end`)) return result;
      result.status = 'PASS';
      return result;
    } catch (error) {
      lastError = error;
      if (error.comparison) {
        result.index = error.comparison.index;
        result.manifest = error.comparison.manifest;
        result.urls = error.comparison.urls;
      }
      result.errors.push(String(error.message || error));
      if (await checkSupersession(`attempt-${attempt}-error`)) return result;
      if (attempt >= settings.maxAttempts || deadline.remaining() <= 0) break;
      await sleep(Math.min(settings.retryDelayMs, deadline.remaining()));
    }
  }

  if (lastError && !lastError.diagnostics && settings.screenshotPath && !settings.browserCheck && deadline.remaining() > 0) {
    try {
      result.browser = await runBrowserCheck({
          pages,
          browserFactory: settings.browserFactory,
          screenshotPath: settings.screenshotPath,
          browserTimeoutMs: Math.min(settings.browserTimeoutMs, deadline.remaining()),
          requestTimeoutMs: settings.requestTimeoutMs,
          deadline,
          clock,
        });
    } catch (browserError) {
      result.browser = browserError.diagnostics || { requestFailures: [], consoleErrors: [], pageErrors: [] };
    }
  }
  if (lastError?.diagnostics) result.browser = lastError.diagnostics;
  result.error = lastError ? String(lastError.message || lastError) : 'Verification deadline expired';
  return result;
}

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    values[key] = argv[index + 1] && !argv[index + 1].startsWith('--') ? argv[++index] : true;
  }
  return values;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const outputDir = path.resolve(args.outputDir || process.env.PAGES_VERIFICATION_OUTPUT_DIR || 'pages-verification');
  fs.mkdirSync(outputDir, { recursive: true });
  const screenshotPath = path.join(outputDir, 'pages-verification.png');
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  let result;
  try {
    result = await runVerification({
      artifactDir: path.resolve(args.artifactDir || process.env.ARTIFACT_DIR || 'dist'),
      expectedSha: args.expectedSha || process.env.EXPECTED_SHA || process.env.GITHUB_SHA,
      pagesUrl: args.pagesUrl || process.env.PAGES_URL || process.env.GITHUB_PAGES_URL,
      repository: args.repository || process.env.GITHUB_REPOSITORY,
      token: process.env.GITHUB_TOKEN || process.env.GH_TOKEN,
      apiUrl: process.env.GITHUB_API_URL || 'https://api.github.com',
      screenshotPath,
      maxAttempts: Number(args.maxAttempts || process.env.MAX_ATTEMPTS || DEFAULTS.maxAttempts),
      retryDelayMs: Number(args.retryDelayMs || process.env.RETRY_DELAY_MS || DEFAULTS.retryDelayMs),
      deadlineMs: Number(args.deadlineMs || process.env.DEADLINE_MS || DEFAULTS.deadlineMs),
    });
  } catch (error) {
    result = {
      status: 'FAIL',
      expectedSha: args.expectedSha || process.env.EXPECTED_SHA || process.env.GITHUB_SHA,
      attempts: 0,
      superseded: false,
      errors: [String(error.message || error)],
      error: String(error.message || error),
    };
  }
  const diagnosticsPath = path.join(outputDir, 'verification-summary.json');
  fs.writeFileSync(diagnosticsPath, `${JSON.stringify({ ...result, token: undefined }, null, 2)}\n`);
  appendSummary(summaryPath, result);
  console.log(JSON.stringify({
    status: result.status,
    expectedSha: result.expectedSha,
    attempts: result.attempts,
    superseded: result.superseded,
    error: result.error,
    diagnosticsPath,
  }));
  if (result.status === 'SUPERSEDED') return;
  if (result.status !== 'PASS') process.exitCode = 1;
}

if (require.main === module) {
  main().catch(error => {
    console.error(error.message || error);
    process.exitCode = 1;
  });
}

module.exports = {
  DEFAULTS,
  appendSummary,
  assertAllowedUrl,
  compareArtifactBytes,
  comparePublicArtifact,
  fetchBytes,
  fetchResponse,
  getCurrentMainSha,
  isAllowedUrl,
  normalizeBasePath,
  normalizePagesUrl,
  readExpectedArtifact,
  redactUrl,
  runBrowserCheck,
  runVerification,
  sha256,
};
