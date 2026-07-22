import fs from 'node:fs';
import path from 'node:path';
import { expect, test as base } from '@playwright/test';

function slugifyTitle(title) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

async function startBrowserCoverage(page, browserName) {
  if (browserName !== 'chromium') return null;
  const session = await page.context().newCDPSession(page);
  await session.send('Profiler.enable');
  await session.send('Profiler.startPreciseCoverage', {
    callCount: true,
    detailed: true,
  });
  return session;
}

async function stopBrowserCoverage(session, testInfo) {
  if (!session) return;
  let coverage;
  try {
    coverage = await session.send('Profiler.takePreciseCoverage');
    await session.send('Profiler.stopPreciseCoverage');
    await session.send('Profiler.disable');
  } finally {
    await session.detach();
  }

  const outDir = path.join(process.cwd(), 'coverage', '.v8');
  const suite = path.basename(testInfo.file, path.extname(testInfo.file));
  const outputName = slugifyTitle(`${suite}-${testInfo.title}`);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, `ui-${outputName}.json`),
    JSON.stringify({ result: coverage.result }, null, 2),
  );
}

const test = base.extend({
  browserCoverage: [async ({ page, browserName }, use, testInfo) => {
    const session = await startBrowserCoverage(page, browserName);
    try {
      await use(session);
    } finally {
      await stopBrowserCoverage(session, testInfo);
    }
  }, { auto: true }],
});

export { expect, test };
