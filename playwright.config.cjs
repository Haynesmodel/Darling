const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './test/ui',
  timeout: 30_000,
  retries: 0,
  use: {
    baseURL: 'http://127.0.0.1:8000',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'node scripts/serve_static.cjs 8000 127.0.0.1',
    url: 'http://127.0.0.1:8000/index.html',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
