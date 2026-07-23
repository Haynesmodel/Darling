const { defineConfig, devices } = require('@playwright/test');

const usePreview = process.env.PLAYWRIGHT_SERVER === 'preview';
const collectCoverage = process.env.COLLECT_COVERAGE === '1';
const host = 'http://127.0.0.1:8000';
const basePath = process.env.PLAYWRIGHT_BASE_PATH || '/Darling/';
const strippedBasePath = basePath.replace(/^\/+|\/+$/g, '');
const normalizedBasePath = strippedBasePath ? `/${strippedBasePath}/` : '/';
const baseURL = usePreview ? `${host}${normalizedBasePath}` : host;
const serverURL = usePreview ? `${host}${normalizedBasePath}` : `${host}/index.html`;
const serverCommand = usePreview
  ? `node scripts/serve_static.cjs 8000 127.0.0.1 dist ${normalizedBasePath}`
  : 'npm run dev -- --port 8000';

module.exports = defineConfig({
  testDir: './test/ui',
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  forbidOnly: Boolean(process.env.CI),
  failOnFlakyTests: Boolean(process.env.CI),
  reporter: process.env.CI ? [['dot'], ['html', { open: 'never' }]] : 'list',
  workers: process.env.PLAYWRIGHT_WORKERS
    ? Number(process.env.PLAYWRIGHT_WORKERS)
    : (usePreview || process.env.CI || process.env.COLLECT_COVERAGE === '1' ? 1 : undefined),
  projects: [
    {
      name: 'chromium',
      // Axe behavior remains authoritative in the production-preview lane; it
      // does not add application execution paths to the instrumented lane.
      testIgnore: collectCoverage
        ? [/webkit-smoke\.spec\.js/, /accessibility\.spec\.js/]
        : /webkit-smoke\.spec\.js/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'webkit-smoke',
      testMatch: /webkit-smoke\.spec\.js/,
      use: { ...devices['Desktop Safari'] },
    },
  ],
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    command: serverCommand,
    url: serverURL,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
