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
  };
}

async function withTimeout(task, timeoutMs, message) {
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

async function fetchResponse(url, {
  request = globalThis.fetch,
  requestTimeoutMs = DEFAULTS.requestTimeoutMs,
  pages,
  headers,
  maxRedirects = 5,
} = {}) {
  let currentUrl = url;
  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    assertAllowedUrl(currentUrl, pages);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
    let response;
    try {
      response = await withTimeout(
        () => request(currentUrl, {
          headers,
          redirect: 'manual',
          signal: controller.signal,
        }),
        requestTimeoutMs,
        `Request timed out after ${requestTimeoutMs}ms: ${redactUrl(currentUrl)}`,
      );
      const status = Number(response.status);
      if (status >= 300 && status < 400) {
        const location = headerValue(response.headers, 'location');
        if (!location) throw new Error(`Redirect from ${redactUrl(currentUrl)} has no Location header`);
        const nextUrl = new URL(location, currentUrl).toString();
        assertAllowedUrl(nextUrl, pages);
        currentUrl = nextUrl;
        continue;
      }
      return { response, finalUrl: currentUrl };
    } catch (error) {
      if (error?.name === 'AbortError') {
        throw new Error(`Request timed out after ${requestTimeoutMs}ms: ${redactUrl(currentUrl)}`);
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(`Too many redirects while fetching ${redactUrl(url)}`);
}

async function fetchBytes(url, options) {
  const { response, finalUrl } = await fetchResponse(url, options);
  if (Number(response.status) !== 200) {
    throw new Error(`Expected HTTP 200 from ${redactUrl(finalUrl)}; observed ${response.status}`);
  }
  const bytes = Buffer.from(await withTimeout(
    () => response.arrayBuffer(),
    options?.requestTimeoutMs || DEFAULTS.requestTimeoutMs,
    `Response body timed out after ${options?.requestTimeoutMs || DEFAULTS.requestTimeoutMs}ms: ${redactUrl(finalUrl)}`,
  ));
  return {
    bytes,
    finalUrl,
    contentType: headerValue(response.headers, 'content-type') || '',
  };
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

async function comparePublicArtifact({ artifact, pages, request, requestTimeoutMs, expectedSha }) {
  const index = await fetchBytes(pages.url, { pages, request, requestTimeoutMs });
  const manifest = await fetchBytes(`${pages.url}assets/asset-manifest.json`, {
    pages,
    request,
    requestTimeoutMs,
  });
  return {
    expectedSha,
    index: compareArtifactBytes({ name: 'public index.html', expected: artifact.index, observed: index.bytes }),
    manifest: compareArtifactBytes({ name: 'public asset-manifest.json', expected: artifact.manifest, observed: manifest.bytes }),
    urls: { index: redactUrl(index.finalUrl), manifest: redactUrl(manifest.finalUrl) },
  };
}

async function getCurrentMainSha({ repository, token, request = globalThis.fetch, apiUrl = 'https://api.github.com', requestTimeoutMs }) {
  if (!repository || !token) return null;
  const endpoint = `${apiUrl.replace(/\/$/, '')}/repos/${repository}/branches/main`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    const response = await withTimeout(
      () => request(endpoint, {
        headers: {
          accept: 'application/vnd.github+json',
          authorization: `Bearer ${token}`,
          'x-github-api-version': '2022-11-28',
        },
        signal: controller.signal,
      }),
      requestTimeoutMs,
      `GitHub API request timed out after ${requestTimeoutMs}ms`,
    );
    if (response.status !== 200) return null;
    const body = await withTimeout(
      () => response.json(),
      requestTimeoutMs,
      `GitHub API response body timed out after ${requestTimeoutMs}ms`,
    );
    return typeof body?.commit?.sha === 'string' ? body.commit.sha : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function runBrowserCheck({ pages, browserFactory, screenshotPath, browserTimeoutMs }) {
  if (!browserFactory) {
    const { chromium } = require('playwright');
    browserFactory = () => chromium.launch({ headless: true });
  }
  const browser = await withTimeout(browserFactory, browserTimeoutMs, 'Chromium launch timed out');
  const diagnostics = { requestFailures: [], consoleErrors: [], pageErrors: [], screenshots: [] };
  try {
    const context = await withTimeout(
      () => browser.newContext({ baseURL: pages.url }),
      browserTimeoutMs,
      'Chromium context creation timed out',
    );
    try {
      const page = await context.newPage();
      const owned = url => isAllowedUrl(url, pages);
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
          if (errorText === 'net::ERR_ABORTED') return;
          diagnostics.requestFailures.push({
            kind: 'requestfailed',
            url: redactUrl(request.url()),
            error: errorText,
          });
        }
      });
      page.on('console', message => {
        if (message.type() === 'error') diagnostics.consoleErrors.push(message.text().slice(0, 500));
      });
      page.on('pageerror', error => diagnostics.pageErrors.push(String(error).slice(0, 500)));

      async function waitForReady(panel, name) {
        await withTimeout(
          () => panel.waitFor({ state: 'visible', timeout: browserTimeoutMs }),
          browserTimeoutMs,
          `${name} ready panel did not become visible`,
        );
        const readyUntil = Date.now() + browserTimeoutMs;
        let state;
        do {
          state = await panel.getAttribute('data-feature-state');
          if (state === 'ready') return;
          if (Date.now() >= readyUntil) break;
          await page.waitForTimeout(Math.min(100, Math.max(1, readyUntil - Date.now())));
        } while (Date.now() < readyUntil);
        throw new Error(`${name} panel reached state ${state || 'missing'}, expected ready`);
      }

      async function visit(url, selector, name) {
        await withTimeout(
          () => page.goto(url, { waitUntil: 'domcontentloaded', timeout: browserTimeoutMs }),
          browserTimeoutMs,
          `${name} navigation timed out`,
        );
        assertAllowedUrl(page.url(), pages);
        await waitForReady(page.locator(selector), name);
      }

      await visit('./', '#page-pulse', 'Home');
      const stylesheets = await page.evaluate(() => Array.from(document.styleSheets).map(sheet => sheet.href || 'inline'));
      if (!stylesheets.some(href => href !== 'inline')) throw new Error('Home loaded no external stylesheet');
      const seasonLink = page.locator('#tabCurrentBtn');
      await seasonLink.click();
      await waitForReady(page.locator('#page-current'), 'Season navigation');
      await visit('./?tab=current', '#page-current', 'Current deep link');
      await visit('./', '#page-pulse', 'Home return');
      if (diagnostics.requestFailures.length || diagnostics.consoleErrors.length || diagnostics.pageErrors.length) {
        throw new Error('Browser verification observed app-owned request or application errors');
      }
      if (screenshotPath) {
        await page.screenshot({ path: screenshotPath, fullPage: true });
        diagnostics.screenshots.push(screenshotPath);
      }
      await context.close();
      return diagnostics;
    } catch (error) {
      try {
        if (screenshotPath) {
          const pagesInContext = context.pages();
          if (pagesInContext[0]) {
            await pagesInContext[0].screenshot({ path: screenshotPath, fullPage: true });
            diagnostics.screenshots.push(screenshotPath);
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
    try { await browser.close(); } catch { /* best effort cleanup */ }
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
  if (result.index) lines.push(`- index.html: expected ${result.index.expected.sha256}, observed ${result.index.observed.sha256}`);
  if (result.manifest) lines.push(`- asset-manifest.json: expected ${result.manifest.expected.sha256}, observed ${result.manifest.observed.sha256}`);
  if (result.error) lines.push(`- Error: ${result.error}`);
  fs.appendFileSync(summaryPath, `${lines.join('\n')}\n`);
}

async function runVerification(options) {
  const settings = { ...DEFAULTS, ...options };
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
  };
  let lastError;

  for (let attempt = 1; attempt <= settings.maxAttempts; attempt += 1) {
    result.attempts = attempt;
    if (deadline.remaining() <= 0) break;
    try {
      const artifactResult = await comparePublicArtifact({
        artifact,
        pages,
        request: settings.request,
        requestTimeoutMs: Math.min(settings.requestTimeoutMs, deadline.remaining()),
        expectedSha: settings.expectedSha,
      });
      result.index = artifactResult.index;
      result.manifest = artifactResult.manifest;
      const browserResult = await withTimeout(
        () => (settings.browserCheck || runBrowserCheck)({
          pages,
          browserFactory: settings.browserFactory,
          screenshotPath: settings.screenshotPath,
          browserTimeoutMs: Math.min(settings.browserTimeoutMs, deadline.remaining()),
        }),
        Math.min(settings.browserTimeoutMs, deadline.remaining()),
        'Browser verification exceeded its 30-second scenario budget',
      );
      result.browser = browserResult;
      result.status = 'PASS';
      return result;
    } catch (error) {
      lastError = error;
      result.errors.push(String(error.message || error));
      const currentMainSha = await getCurrentMainSha({
        repository: settings.repository,
        token: settings.token,
        request: settings.apiRequest || settings.request,
        apiUrl: settings.apiUrl,
        requestTimeoutMs: Math.min(settings.requestTimeoutMs, deadline.remaining()),
      });
      if (settings.expectedSha && currentMainSha && currentMainSha !== settings.expectedSha) {
        result.status = 'SUPERSEDED';
        result.superseded = true;
        result.supersededBy = currentMainSha;
        return result;
      }
      if (attempt >= settings.maxAttempts || deadline.remaining() <= 0) break;
      await sleep(Math.min(settings.retryDelayMs, deadline.remaining()));
    }
  }

  if (lastError && !lastError.diagnostics && settings.screenshotPath && !settings.browserCheck && deadline.remaining() > 0) {
    try {
      result.browser = await withTimeout(
        () => runBrowserCheck({
          pages,
          browserFactory: settings.browserFactory,
          screenshotPath: settings.screenshotPath,
          browserTimeoutMs: Math.min(settings.browserTimeoutMs, deadline.remaining()),
        }),
        Math.min(settings.browserTimeoutMs, deadline.remaining()),
        'Failure screenshot browser check exceeded its remaining deadline',
      );
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
  const result = await runVerification({
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
