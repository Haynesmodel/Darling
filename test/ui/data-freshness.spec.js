import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const manifest = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'assets/asset-manifest.json'), 'utf8'));

test('global freshness badge and Pulse share the finalized snapshot status', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.data-freshness summary')).toContainText('2025 season final');
  await expect(page.locator('.pulse-data-note')).toContainText('2025 season final');
  await page.locator('.data-freshness summary').click();
  await expect(page.locator('.data-freshness-panel')).toContainText('Core data verified with SHA-256');
  await expect(page.locator('.data-freshness-panel')).toContainText(manifest.data_version.replace('sha256:', '').slice(0, 12));
  await page.locator('#tabHistoryBtn').click();
  await expect(page.locator('.data-freshness summary')).toContainText('2025 season final');
});

test('runtime requests a no-store manifest and full per-asset versions', async ({ page }) => {
  const requests = [];
  page.on('request', request => {
    if (request.url().includes('/assets/') && request.url().includes('.json')) requests.push(request.url());
  });
  await page.goto('/');
  await expect(page.locator('.data-freshness summary')).toBeVisible();
  const manifestUrl = requests.find(url => new URL(url).pathname.endsWith('/assets/asset-manifest.json'));
  expect(new URL(manifestUrl).search).toBe('');
  for (const [name, entry] of Object.entries({ ...manifest.assets, DerivedStats: manifest.derived })) {
    if (name === 'DraftSpot') continue;
    const requestUrl = requests.find(url => new URL(url).pathname.endsWith(`/${entry.path}`));
    expect(requestUrl, `${name} request`).toBeTruthy();
    expect(new URL(requestUrl).searchParams.get('v')).toBe(entry.sha256.replace('sha256:', ''));
  }
});

test('a required integrity mismatch retries once and blocks app readiness', async ({ page }) => {
  let attempts = 0;
  await page.route('**/assets/H2H.json*', route => {
    attempts += 1;
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{"tampered":true}' });
  });
  await page.goto('/');
  await expect(page.locator('#appStatus')).toContainText('Could not verify league data');
  expect(attempts).toBe(2);
  await expect(page.locator('.data-freshness')).toHaveCount(0);
});

test('an optional integrity mismatch is visible as a partial snapshot', async ({ page }) => {
  let attempts = 0;
  await page.route('**/assets/CurrentSeason.json*', route => {
    attempts += 1;
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{"tampered":true}' });
  });
  await page.goto('/?tab=history');
  await expect(page.locator('#historyGamesTable')).toBeVisible();
  await expect(page.locator('.data-freshness summary')).toContainText('Snapshot partially available');
  expect(attempts).toBe(2);
  const diagnostics = await page.evaluate(() => window.darlingDataDiagnostics);
  expect(diagnostics.optionalFailures).toContainEqual({ asset: 'CurrentSeason', reason: 'integrity', code: 'SIZE_MISMATCH' });
});

test('Draft Spot uses its own version and evicts a failed verification promise', async ({ page }) => {
  let attempts = 0;
  const requests = [];
  page.on('request', request => {
    if (request.url().includes('/assets/DraftSpot.json')) requests.push(request.url());
  });
  await page.route('**/assets/DraftSpot.json*', route => {
    attempts += 1;
    if (attempts <= 2) return route.fulfill({ status: 200, contentType: 'application/json', body: '{"tampered":true}' });
    return route.continue();
  });
  await page.goto('/?tab=history');
  expect(requests).toEqual([]);
  await page.locator('#tabDraftBtn').click();
  await expect(page.locator('#draftSpotRoot')).toContainText('Draft Spot is unavailable');
  expect(attempts).toBe(2);
  await page.locator('#tabHistoryBtn').click();
  await expect(page.locator('#historyGamesTable')).toBeVisible();
  await page.locator('#tabDraftBtn').click();
  await expect(page.locator('.draft-hero')).toBeVisible();
  expect(attempts).toBe(3);
  expect(new URL(requests.at(-1)).searchParams.get('v')).toBe(manifest.assets.DraftSpot.sha256.replace('sha256:', ''));
});

test('a long-open Pulse and global badge reassess together without network polling', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-08-14T23:59:00Z') });
  let dataRequests = 0;
  page.on('request', request => {
    if (request.url().includes('/assets/') && request.url().includes('.json')) dataRequests += 1;
  });
  await page.goto('/');
  await expect(page.locator('.data-freshness summary')).toContainText('2025 season final');
  const bootRequests = dataRequests;
  await page.clock.fastForward(2 * 60 * 1000);
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(page.locator('.data-freshness summary')).toContainText('2026 data not available');
  await expect(page.locator('.pulse-data-note')).toContainText('2026 data not available');
  expect(dataRequests).toBe(bootRequests);
});
