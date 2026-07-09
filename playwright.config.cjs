const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './test/ui',
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: 'http://127.0.0.1:8000',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npm run dev -- --port 8000',
    url: 'http://127.0.0.1:8000/index.html',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
