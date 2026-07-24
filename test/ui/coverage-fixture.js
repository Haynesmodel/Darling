import path from 'node:path';
import coverageLibrary from 'istanbul-lib-coverage';
import { expect, test as base } from '@playwright/test';
import {
  coverageModeEnabled,
  persistWorkerCoverage,
  safeName,
} from './coverage-runtime.js';

const coverageEnabled = coverageModeEnabled();
const { createCoverageMap } = coverageLibrary;

const test = base.extend({
  coverageState: [async ({}, use, workerInfo) => {
    if (!coverageEnabled) {
      await use(null);
      return;
    }

    if (workerInfo.project.name !== 'chromium') {
      throw new Error(`COLLECT_COVERAGE=1 requires the chromium project, received ${workerInfo.project.name}`);
    }

    const state = {
      map: createCoverageMap({}),
      failedTests: 0,
    };
    await use(state);

    const runId = safeName(process.env.COVERAGE_RUN_ID || process.env.GITHUB_RUN_ID || 'local');
    const filename = [
      'worker',
      workerInfo.workerIndex,
      safeName(workerInfo.project.name),
      process.pid,
      runId,
    ].join('-');
    const outputPath = path.join(process.cwd(), 'coverage', 'raw', 'browser', `${filename}.json`);
    persistWorkerCoverage({ enabled: coverageEnabled, state, outputPath });
  }, { scope: 'worker' }],

  browserCoverage: [async ({ page, browserName, coverageState }, use, testInfo) => {
    if (!coverageState) {
      await use();
      return;
    }
    if (browserName !== 'chromium') {
      throw new Error(`Browser coverage requires Chromium, received ${browserName}`);
    }

    try {
      await use();
    } finally {
      if (testInfo.status !== testInfo.expectedStatus) coverageState.failedTests += 1;
      try {
        const browserMap = await page.evaluate(() => globalThis.__coverage__ || null);
        if (browserMap) coverageState.map.merge(browserMap);
      } catch (error) {
        if (testInfo.status === testInfo.expectedStatus) throw error;
        console.error(`Could not read browser coverage after failed test ${testInfo.title}: ${error.message}`);
      }
    }
  }, { auto: true }],
});

export { expect, test };
