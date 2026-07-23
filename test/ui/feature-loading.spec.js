import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from './coverage-fixture.js';

const preview = process.env.PLAYWRIGHT_SERVER === 'preview';
const manifest = preview
  ? JSON.parse(fs.readFileSync(path.join(process.cwd(), 'dist/.vite/manifest.json'), 'utf8'))
  : {};
const sources = {
  pulse: 'src/features/league-pulse/league-pulse-controller.ts',
  history: 'src/features/history/history-controller.ts',
  current: 'src/features/current-season/current-season-controller.ts',
  rivalry: 'src/features/rivalry/rivalry-controller.ts',
  trophy: 'src/features/trophy/trophy-controller.ts',
  dynasty: 'src/features/dynasty/dynasty-controller.ts',
  draft: 'src/features/draft-spot/draft-spot-feature.ts',
  gauntlet: 'src/features/gauntlet/gauntlet-controller.ts',
};
const files = preview
  ? Object.fromEntries(Object.entries(sources).map(([id, source]) => [id, manifest[source].file]))
  : {};
const chartRuntime = Object.values(manifest).find(entry => entry.name === 'chart-runtime')?.file;
const requestPattern = id => preview ? `**/${files[id]}` : `**/${sources[id]}*`;

async function waitForFeature(page, id) {
  const panel = page.locator(`#page-${id}`);
  await expect(panel).toHaveAttribute('data-feature-state', 'ready');
  await expect(panel.locator('[data-feature-message]')).toHaveCount(0);
}

function recordResources(page) {
  const urls = [];
  page.on('response', response => urls.push(new URL(response.url()).pathname));
  return urls;
}

test('cold Pulse, Draft Spot, and Trophy routes request only their feature entries', async ({ page }) => {
  test.skip(!preview, 'hashed resource-boundary assertions require the production preview build');
  let resources = recordResources(page);
  await page.goto('/');
  await waitForFeature(page, 'pulse');
  expect(resources.some(url => url.endsWith(files.pulse))).toBe(true);
  for (const id of Object.keys(files).filter(id => id !== 'pulse')) expect(resources.some(url => url.endsWith(files[id])), `${id} leaked into Pulse`).toBe(false);
  expect(resources.some(url => chartRuntime && url.endsWith(chartRuntime))).toBe(false);

  resources.length = 0;
  await page.goto('/?tab=draft');
  await waitForFeature(page, 'draft');
  expect(resources.some(url => url.endsWith(files.draft))).toBe(true);
  for (const id of Object.keys(files).filter(id => id !== 'draft')) expect(resources.some(url => url.endsWith(files[id])), `${id} leaked into Draft Spot`).toBe(false);
  await expect.poll(() => resources.some(url => chartRuntime && url.endsWith(chartRuntime))).toBe(true);

  resources.length = 0;
  await page.goto('/?tab=trophy&trophyOwner=Joe');
  await waitForFeature(page, 'trophy');
  expect(resources.some(url => url.endsWith(files.trophy))).toBe(true);
  for (const id of Object.keys(files).filter(id => id !== 'trophy')) expect(resources.some(url => url.endsWith(files[id])), `${id} leaked into Trophy`).toBe(false);
  expect(resources.some(url => chartRuntime && url.endsWith(chartRuntime))).toBe(true);
});

test('a delayed Draft ready callback cannot add history after an immediate tab switch', async ({ page }) => {
  await page.goto('/?tab=history');
  await waitForFeature(page, 'history');
  await page.evaluate(() => {
    const nativeSetTimeout = window.setTimeout.bind(window);
    const nativeClearTimeout = window.clearTimeout.bind(window);
    const nativeRequestAnimationFrame = window.requestAnimationFrame.bind(window);
    const nativeCancelAnimationFrame = window.cancelAnimationFrame.bind(window);
    const held = new Map();
    let nextId = 1_000_000;

    window.setTimeout = (callback, delay, ...args) => {
      if (delay === 35) {
        const id = nextId++;
        held.set(id, () => callback(...args));
        return id;
      }
      return nativeSetTimeout(callback, delay, ...args);
    };
    window.clearTimeout = id => {
      if (!held.delete(id)) nativeClearTimeout(id);
    };
    window.requestAnimationFrame = callback => {
      const id = nextId++;
      held.set(id, () => callback(performance.now()));
      return id;
    };
    window.cancelAnimationFrame = id => {
      if (!held.delete(id)) nativeCancelAnimationFrame(id);
    };
    window.__releaseDraftReady = () => {
      const callback = held.values().next().value;
      callback?.();
      window.setTimeout = nativeSetTimeout;
      window.clearTimeout = nativeClearTimeout;
      window.requestAnimationFrame = nativeRequestAnimationFrame;
      window.cancelAnimationFrame = nativeCancelAnimationFrame;
    };
  });

  await page.getByRole('tab', { name: 'Draft Spot' }).click();
  await expect(page.locator('#draftOwnerSelect')).toBeVisible();
  await page.getByRole('tab', { name: 'Trophy Case' }).click();
  await waitForFeature(page, 'trophy');
  await page.evaluate(() => window.__releaseDraftReady());
  await page.waitForTimeout(100);
  await expect(page).toHaveURL(/tab=trophy/);

  await page.goBack();
  await waitForFeature(page, 'draft');
  await expect(page).toHaveURL(/tab=draft/);
});

test('a delayed feature remains busy and cannot overwrite a newer activation', async ({ page }) => {
  await page.goto('/?tab=history');
  await waitForFeature(page, 'history');
  let intercepted;
  const interceptedPromise = new Promise(resolve => { intercepted = resolve; });
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route(requestPattern('current'), async route => {
    intercepted();
    await gate;
    await route.continue();
  });
  await page.getByRole('tab', { name: 'Current Season' }).click();
  await interceptedPromise;
  await expect(page.locator('#page-current')).toBeVisible();
  await expect(page.locator('#page-current')).toHaveAttribute('aria-busy', 'true');
  await expect(page.locator('#appStatus')).toContainText('Loading Current Season');
  await page.getByRole('tab', { name: 'Trophy Case' }).click();
  await waitForFeature(page, 'trophy');
  release();
  await page.waitForTimeout(200);
  await expect(page.getByRole('tab', { name: 'Trophy Case' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#page-trophy')).toBeVisible();
  await expect(page).toHaveURL(/tab=trophy/);
  await expect(page.locator('header h2')).toHaveText('Joe');
});

test('a failed feature import is contained in its panel and other tabs remain usable', async ({ page }) => {
  let attempts = 0;
  await page.route(requestPattern('trophy'), async route => {
    attempts += 1;
    if (attempts === 1) await route.abort('failed');
    else await route.continue();
  });
  await page.goto('/?tab=history');
  await waitForFeature(page, 'history');
  await page.getByRole('tab', { name: 'Trophy Case' }).click();
  const panel = page.locator('#page-trophy');
  await expect(panel).toHaveAttribute('data-feature-state', 'error');
  await expect(panel.getByRole('alert')).toContainText('Trophy Case could not be loaded');
  await expect(panel.getByRole('button', { name: 'Retry' })).toBeVisible();
  await expect(page).toHaveURL(/tab=trophy/);
  await panel.getByRole('button', { name: 'Retry' }).click();
  await waitForFeature(page, 'trophy');
  expect(attempts).toBeGreaterThanOrEqual(2);
  await page.getByRole('tab', { name: 'League History' }).click();
  await waitForFeature(page, 'history');
  await expect(page.locator('#historyGamesTable tbody tr')).not.toHaveCount(0);
});

test('Gauntlet copy selects its fallback text when Clipboard API is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
  });
  await page.goto('/?tab=gauntlet');
  await waitForFeature(page, 'gauntlet');
  const field = page.locator('#gauntletCopyText');
  await expect(field).not.toHaveValue('');
  await page.locator('#gauntletCopyBtn').click();
  await expect(field).toBeFocused();
  const length = (await field.inputValue()).length;
  await expect.poll(() => field.evaluate(element => ({
    start: element.selectionStart,
    end: element.selectionEnd,
    length: element.value.length,
  }))).toEqual({ start: 0, end: length, length });
});
