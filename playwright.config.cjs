const { defineConfig } = require('@playwright/test');

const usePreview = process.env.PLAYWRIGHT_SERVER === 'preview';
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
  workers: process.env.PLAYWRIGHT_WORKERS
    ? Number(process.env.PLAYWRIGHT_WORKERS)
    : (usePreview || process.env.CI ? 1 : undefined),
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  webServer: {
    command: serverCommand,
    url: serverURL,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
