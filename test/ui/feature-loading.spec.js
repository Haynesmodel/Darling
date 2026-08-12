import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from './coverage-fixture.js';
import { activateFeature, featureDestination } from './navigation-helpers.js';

const preview = process.env.PLAYWRIGHT_SERVER === 'preview';
const manifest = preview
  ? JSON.parse(fs.readFileSync(path.join(process.cwd(), 'dist/.vite/manifest.json'), 'utf8'))
  : {};
const sources = {
  pulse: 'src/features/league-pulse/league-pulse-controller.ts',
  owner: 'src/features/owner-hub/owner-hub-controller.ts',
  transactions: 'src/features/transactions/transactions-controller.ts',
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
const commandPalette = manifest['src/components/search/CommandPalette.tsx'];
const gauntletAdapter = manifest['src/features/gauntlet/GauntletHistogramMount.tsx'];
const gauntletDeferredChart = preview && gauntletAdapter?.dynamicImports?.[0]
  ? manifest[gauntletAdapter.dynamicImports[0]]
  : null;
const gauntletDeferredChartRetry = preview && gauntletAdapter?.dynamicImports?.[1]
  ? manifest[gauntletAdapter.dynamicImports[1]]
  : null;
const requestPattern = id => preview ? `**/${files[id]}` : `**/${sources[id]}*`;
const commandPalettePattern = () => preview
  ? `**/${commandPalette.file}*`
  : '**/src/components/search/CommandPalette.tsx*';
const gauntletAdapterPattern = () => preview
  ? `**/${gauntletAdapter.file}*`
  : '**/src/features/gauntlet/GauntletHistogramMount.tsx*';
const gauntletDeferredChartPattern = () => preview
  ? `**/${gauntletDeferredChart.file}`
  : '**/src/components/charts/DeferredChart.tsx*';
const gauntletDeferredChartRetryPattern = () => preview
  ? `**/${gauntletDeferredChartRetry.file}`
  : '**/src/components/charts/DeferredChartRetry.tsx*';

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

test('every cold route requests only its feature entry and chart routes share one runtime', async ({ browser, baseURL }) => {
  test.skip(!preview, 'hashed resource-boundary assertions require the production preview build');
  expect(chartRuntime).toBeTruthy();
  const routes = {
    pulse: '/',
    owner: '/?tab=owner&owner=Joe',
    transactions: '/?tab=transactions',
    history: '/?tab=history',
    current: '/?tab=current&currentOwner=Joe',
    rivalry: '/?tab=rivalry&rivalryTeamA=Joe&rivalryTeamB=Joel',
    trophy: '/?tab=trophy&trophyOwner=Joe',
    dynasty: '/?tab=dynasty&dynastyOwner=Joe',
    draft: '/?tab=draft',
    gauntlet: '/?tab=gauntlet&ga=Joe%3A2024&gb=Zook%3A2019',
  };
  const coldRuntimeRoutes = new Set(['current', 'draft']);
  const observedChartRuntimeUrls = new Set();

  for (const [id, url] of Object.entries(routes)) {
    const context = await browser.newContext({ baseURL });
    const page = await context.newPage();
    const resources = recordResources(page);
    await page.goto(url);
    await waitForFeature(page, id);
    expect(resources.some(resource => resource.endsWith(files[id])), `${id} feature entry was not requested`).toBe(true);
    for (const otherId of Object.keys(files).filter(candidate => candidate !== id)) {
      expect(resources.some(resource => resource.endsWith(files[otherId])), `${otherId} leaked into ${id}`).toBe(false);
    }
    if (coldRuntimeRoutes.has(id)) {
      await expect.poll(() => resources.some(resource => resource.endsWith(chartRuntime))).toBe(true);
      resources.filter(resource => resource.endsWith(chartRuntime)).forEach(resource => observedChartRuntimeUrls.add(resource));
    } else if (id === 'rivalry' || id === 'dynasty') {
      expect(resources.some(resource => resource.endsWith(chartRuntime)), `${id} loaded chart-runtime before eligibility`).toBe(false);
      await page.locator(`#${id}-section-jump`).selectOption(id === 'rivalry' ? 'rivalry-trend' : 'dynasty-trend');
      await expect.poll(() => resources.filter(resource => resource.endsWith(chartRuntime)).length).toBe(1);
      await expect(page.locator(id === 'rivalry' ? '#rivalryLeadPlot' : '#dynastyTrendPlot')).toHaveAttribute('data-chart-state', 'ready');
      resources.filter(resource => resource.endsWith(chartRuntime)).forEach(resource => observedChartRuntimeUrls.add(resource));
    } else {
      expect(resources.some(resource => resource.endsWith(chartRuntime)), `${id} loaded chart-runtime`).toBe(false);
    }
    await context.close();
  }

  expect([...observedChartRuntimeUrls]).toEqual([expect.stringMatching(new RegExp(`${chartRuntime.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`))]);
});

test('Rivalry stays Plot-free when a far disclosure merely opens and loads once near the viewport', async ({ page }) => {
  test.skip(!preview, 'hashed resource-boundary assertions require the production preview build');
  const resources = recordResources(page);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/?tab=rivalry&rivalryTeamA=Joe&rivalryTeamB=Joel');
  await waitForFeature(page, 'rivalry');
  await page.locator('#rivalryTrendDisclosure').evaluate(details => {
    details.style.marginTop = '2400px';
    details.open = true;
  });
  await expect(page.getByRole('button', { name: 'Load Lead Trend chart' })).toBeVisible();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  expect(resources.some(resource => resource.endsWith(chartRuntime))).toBe(false);
  await page.locator('#rivalryLeadPlot').scrollIntoViewIfNeeded();
  await expect.poll(() => resources.filter(resource => resource.endsWith(chartRuntime)).length).toBe(1);
  await expect(page.locator('#rivalryLeadPlot')).toHaveAttribute('data-chart-state', 'ready');
  await page.locator('#rivalryTeamB').selectOption('Zook');
  await page.locator('#rivalry-section-jump').selectOption('rivalry-trend');
  await expect(page.locator('#rivalryLeadPlot')).toHaveAttribute('data-chart-state', 'ready');
  expect(resources.filter(resource => resource.endsWith(chartRuntime))).toHaveLength(1);
});

test('Gauntlet stays Plot-free when a far disclosure opens below the fold', async ({ page }) => {
  test.skip(!preview, 'hashed resource-boundary assertions require the production preview build');
  const resources = recordResources(page);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/?tab=gauntlet&ga=Joe%3A2024&gb=Zook%3A2019');
  await waitForFeature(page, 'gauntlet');
  await page.locator('#gauntletHistogramDisclosure').evaluate(details => {
    details.style.marginTop = '3000px';
    details.open = true;
  });
  await expect(page.getByRole('button', { name: 'Load Score Distribution chart' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await expect.poll(() => resources.some(resource => resource.endsWith(chartRuntime))).toBe(false);
  await page.locator('#gauntletHistogramPlot').scrollIntoViewIfNeeded();
  await expect.poll(() => resources.filter(resource => resource.endsWith(chartRuntime)).length).toBe(1);
  await expect(page.locator('#gauntletHistogramPlot')).toHaveAttribute('data-chart-state', 'ready');
});

test('Command Palette implementation and CSS load only after the first open', async ({ page }) => {
  test.skip(!preview, 'hashed resource-boundary assertions require the production preview build');
  const resources = recordResources(page);
  await page.goto('/');
  await waitForFeature(page, 'pulse');
  expect(resources.some(resource => resource.endsWith(commandPalette.file))).toBe(false);
  for (const css of commandPalette.css || []) expect(resources.some(resource => resource.endsWith(css))).toBe(false);
  const trigger = page.locator('.search-trigger');
  await trigger.click();
  await expect(page.getByRole('dialog', { name: 'Search The Darling' })).toBeVisible();
  expect(resources.filter(resource => resource.endsWith(commandPalette.file))).toHaveLength(1);
  for (const css of commandPalette.css || []) expect(resources.filter(resource => resource.endsWith(css))).toHaveLength(1);
  await page.keyboard.press('Escape');
  await trigger.click();
  await expect(page.getByRole('dialog', { name: 'Search The Darling' })).toBeVisible();
  expect(resources.filter(resource => resource.endsWith(commandPalette.file))).toHaveLength(1);
});

test('Command Palette keyboard movement reaches the first, last, and adjacent results', async ({ page }) => {
  await page.goto('/');
  await waitForFeature(page, 'pulse');
  await page.locator('.search-trigger').click();
  const dialog = page.getByRole('dialog', { name: 'Search The Darling' });
  const input = dialog.getByRole('combobox', { name: /Search owners, seasons/ });
  await input.fill('Joe');
  const options = dialog.getByRole('option');
  expect(await options.count()).toBeGreaterThan(1);
  await input.press('End');
  await expect(input).toHaveAttribute('aria-activedescendant', `global-search-option-${await options.count() - 1}`);
  await input.press('Home');
  await expect(input).toHaveAttribute('aria-activedescendant', 'global-search-option-0');
  await input.press('ArrowDown');
  await expect(input).toHaveAttribute('aria-activedescendant', 'global-search-option-1');
  await input.press('ArrowUp');
  await expect(input).toHaveAttribute('aria-activedescendant', 'global-search-option-0');
  await input.press('Enter');
  await expect(page).toHaveURL(/[?&]tab=owner/);
});

test('Command Palette reports a failed import and retries without a reload', async ({ page }) => {
  let attempts = 0;
  await page.route(commandPalettePattern(), async route => {
    attempts += 1;
    if (attempts === 1) await route.abort('failed');
    else await route.continue();
  });
  await page.goto('/');
  await waitForFeature(page, 'pulse');
  const trigger = page.locator('.search-trigger');
  await trigger.click();
  await expect(page.getByRole('alert')).toHaveText('Search could not be loaded. Try again.');
  await expect(trigger).toBeEnabled();
  await trigger.click();
  await expect(page.getByRole('dialog', { name: 'Search The Darling' })).toBeVisible();
  expect(attempts).toBeGreaterThanOrEqual(2);
});

const chartRuntimePattern = () => preview
  ? `**/${chartRuntime}`
  : '**/js/charting/vendor/charting-vendor.js*';

test('Rivalry contains a chart-runtime failure and recovers after reload', async ({ page }) => {
  const runtimePattern = chartRuntimePattern();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.route(runtimePattern, route => route.abort('failed'));
  await page.goto('/?tab=rivalry&rivalryTeamA=Joe&rivalryTeamB=Joel');
  await waitForFeature(page, 'rivalry');
  await page.locator('#rivalry-section-jump').selectOption('rivalry-trend');
  await expect(page.locator('#rivalryLeadPlot')).toHaveAttribute('data-chart-state', 'error');
  await expect(page.getByRole('button', { name: 'Retry Lead Trend chart' })).toBeVisible();
  await expect(page.locator('.rivalry-trend-fallback')).toBeVisible();
  await expect(page.locator('#rivalryTeamA')).toBeEnabled();
  await page.locator('#rivalry-section-jump').selectOption('rivalry-games');
  await expect(page.locator('#rivalryGameTable')).toBeVisible();
  expect(pageErrors).toEqual([]);
  await page.unroute(runtimePattern);
  await page.reload();
  await waitForFeature(page, 'rivalry');
  await page.locator('#rivalry-section-jump').selectOption('rivalry-trend');
  await expect(page.locator('#rivalryLeadPlot svg[role="img"]')).toBeVisible();
});

test('closing Rivalry during a delayed runtime load prevents stale chart DOM', async ({ page }) => {
  const runtimePattern = chartRuntimePattern();
  let release = null;
  let requestSeen = false;
  await page.route(runtimePattern, async route => {
    requestSeen = true;
    await new Promise(resolve => { release = resolve; });
    await route.continue();
  });
  await page.goto('/?tab=rivalry&rivalryTeamA=Joe&rivalryTeamB=Joel');
  await waitForFeature(page, 'rivalry');
  await page.locator('#rivalry-section-jump').selectOption('rivalry-trend');
  await expect.poll(() => requestSeen).toBe(true);
  await page.locator('#rivalryTrendDisclosure > summary').click();
  release();
  await expect(page.locator('#rivalryTrendDisclosure')).not.toHaveAttribute('open', '');
  await expect(page.locator('#rivalryLeadPlot')).toHaveAttribute('data-chart-state', 'idle');
  await expect(page.locator('#rivalryLeadPlot svg')).toHaveCount(0);
});

test('Draft contains a failed chart-runtime request without disabling its controls', async ({ page }) => {
  const runtimePattern = chartRuntimePattern();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.route(runtimePattern, route => route.abort('failed'));
  await page.goto('/?tab=draft');
  await waitForFeature(page, 'draft');
  await expect(page.locator('.draft-pick-chart')).toHaveAttribute('data-chart-state', 'error');
  await expect(page.locator('.draft-zone-chart')).toHaveAttribute('data-chart-state', 'idle');
  await page.locator('#draft-section-jump').selectOption('draft-zones');
  await expect(page.locator('.draft-zone-chart')).toHaveAttribute('data-chart-state', 'error');
  await expect(page.locator('.draft-pick-chart .chart-error')).toHaveAttribute('role', 'status');
  await expect(page.locator('.draft-zone-chart .chart-error')).toHaveAttribute('role', 'status');
  await expect(page.locator('.draft-pick-board')).toBeVisible();
  await expect(page.locator('.draft-zone-grid')).toBeVisible();
  await expect(page.locator('#draftMetricSelect')).toBeEnabled();
  expect(pageErrors).toEqual([]);
});

test('Draft charts recover on a normal reload after a runtime failure', async ({ page }) => {
  const runtimePattern = chartRuntimePattern();
  await page.route(runtimePattern, route => route.abort('failed'));
  await page.goto('/?tab=draft');
  await waitForFeature(page, 'draft');
  await expect(page.locator('.draft-pick-chart')).toHaveAttribute('data-chart-state', 'error');
  await page.unroute(runtimePattern);
  await page.reload();
  await waitForFeature(page, 'draft');
  await expect(page.locator('.draft-pick-chart svg[role="img"]')).toBeVisible();
  await page.locator('#draft-section-jump').selectOption('draft-zones');
  await expect(page.locator('.draft-zone-chart svg[role="img"]')).toBeVisible();
});

test('Gauntlet contains an adapter import failure and keeps Retry contained', async ({ page }) => {
  const adapterPattern = gauntletAdapterPattern();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.route(adapterPattern, route => route.abort('failed'));
  await page.goto('/?tab=gauntlet&ga=Joe%3A2024&gb=Zook%3A2019');
  await waitForFeature(page, 'gauntlet');
  await page.locator('#gauntlet-section-jump').selectOption('gauntlet-distribution');
  await expect(page.locator('#gauntletHistogramPlot')).toHaveAttribute('data-chart-state', 'error');
  const retry = page.getByRole('button', { name: 'Retry Score Distribution chart' });
  await expect(retry).toBeVisible();
  await expect(page.locator('.gauntlet-histogram-foot')).toBeVisible();
  await expect(page.locator('#gauntletRerollBtn')).toBeEnabled();
  expect(pageErrors).toEqual([]);
  await retry.click();
  await expect(page.locator('#gauntletHistogramPlot')).toHaveAttribute('data-chart-state', 'error');
  expect(pageErrors).toEqual([]);
});

test('Gauntlet recovers on reload after an adapter import failure', async ({ page }) => {
  const adapterPattern = gauntletAdapterPattern();
  await page.route(adapterPattern, route => route.abort('failed'));
  await page.goto('/?tab=gauntlet&ga=Joe%3A2024&gb=Zook%3A2019');
  await waitForFeature(page, 'gauntlet');
  await page.locator('#gauntlet-section-jump').selectOption('gauntlet-distribution');
  await expect(page.locator('#gauntletHistogramPlot')).toHaveAttribute('data-chart-state', 'error');
  await page.unroute(adapterPattern);
  await page.reload();
  await waitForFeature(page, 'gauntlet');
  await page.locator('#gauntlet-section-jump').selectOption('gauntlet-distribution');
  await expect(page.locator('#gauntletHistogramPlot svg[role="img"]')).toBeVisible();
});

test('Gauntlet reports and recovers from a DeferredChart import failure', async ({ page }) => {
  test.skip(!preview, 'hashed resource-boundary assertions require the production preview build');
  const deferredChartPattern = gauntletDeferredChartPattern();
  let attempts = 0;
  await page.route(deferredChartPattern, async route => {
    attempts += 1;
    if (attempts === 1) await route.abort('failed');
    else await route.continue();
  });
  await page.goto('/?tab=gauntlet&ga=Joe%3A2024&gb=Zook%3A2019');
  await waitForFeature(page, 'gauntlet');
  await page.locator('#gauntlet-section-jump').selectOption('gauntlet-distribution');
  await expect(page.locator('#gauntletHistogramPlot')).toHaveAttribute('data-chart-state', 'error');
  await expect(page.getByRole('button', { name: 'Retry Score Distribution chart' })).toBeVisible();
  await page.getByRole('button', { name: 'Retry Score Distribution chart' }).click();
  await waitForFeature(page, 'gauntlet');
  await page.locator('#gauntlet-section-jump').selectOption('gauntlet-distribution');
  await expect(page.locator('#gauntletHistogramPlot svg[role="img"]')).toBeVisible();
  expect(attempts).toBeGreaterThanOrEqual(2);
});

test('Gauntlet ignores a DeferredChart failure after the disclosure closes', async ({ page }) => {
  test.skip(!preview, 'hashed resource-boundary assertions require the production preview build');
  const deferredChartPattern = gauntletDeferredChartPattern();
  let attempts = 0;
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route(deferredChartPattern, async route => {
    attempts += 1;
    if (attempts === 1) {
      await gate;
      await route.abort('failed');
      return;
    }
    await route.continue();
  });
  await page.goto('/?tab=gauntlet&ga=Joe%3A2024&gb=Zook%3A2019');
  await waitForFeature(page, 'gauntlet');
  const deferredRequest = page.waitForRequest(deferredChartPattern);
  await page.locator('#gauntlet-section-jump').selectOption('gauntlet-distribution');
  await deferredRequest;
  await page.locator('#gauntletHistogramDisclosure').evaluate(details => details.removeAttribute('open'));
  release();
  await expect(page.locator('#gauntletHistogramPlot')).toHaveAttribute('data-chart-state', 'idle');
  const reopenedRequest = page.waitForRequest(gauntletDeferredChartRetryPattern());
  await page.locator('#gauntlet-section-jump').selectOption('gauntlet-distribution');
  await reopenedRequest;
  await expect(page.locator('#gauntletHistogramPlot')).toHaveAttribute('data-chart-state', 'ready');
});

test('Gauntlet histogram adapter handles a missing host and empty payload', async ({ page }) => {
  test.skip(preview, 'the authored adapter module is served only by Vite development mode');
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const adapter = await import('/src/features/gauntlet/GauntletHistogramMount.tsx');
    const disposeMissing = adapter.mountGauntletHistogram(null, { rows: [], means: [], domain: [0, 1], maxCount: 0 }, 'empty', false, () => undefined);
    disposeMissing();

    const host = document.createElement('div');
    document.body.append(host);
    const dispose = adapter.mountGauntletHistogram(host, { rows: [], means: [], domain: [0, 1], maxCount: 0 }, 'empty', false, () => undefined);
    const mirroredState = await new Promise(resolve => {
      const readState = () => {
        if (host.dataset.chartState) {
          resolve(host.dataset.chartState);
          return;
        }
        requestAnimationFrame(readState);
      };
      readState();
    });
    const state = host.dataset.chartState;
    dispose();
    const childCount = host.childElementCount;
    host.remove();
    return { state, mirroredState, childCount };
  });
  expect(result).toEqual({ state: 'empty', mirroredState: 'empty', childCount: 0 });
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

  await activateFeature(page, 'draft');
  await expect(page.locator('#draftOwnerSelect')).toBeVisible();
  await activateFeature(page, 'trophy');
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
  await page.getByRole('link', { name: 'Current Season' }).click();
  await interceptedPromise;
  await expect(featureDestination(page, 'current')).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('html')).toHaveAttribute('data-active-feature', 'current');
  await expect(page.locator('html')).toHaveAttribute('data-hero-mode', 'compact');
  await expect(page.locator('#page-current')).toBeVisible();
  await expect(page.locator('#page-current')).toHaveAttribute('aria-busy', 'true');
  await expect(page.locator('#appStatus')).toContainText('Loading Current Season');
  await activateFeature(page, 'trophy');
  await waitForFeature(page, 'trophy');
  release();
  await page.waitForTimeout(200);
  await expect(featureDestination(page, 'trophy')).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('#page-trophy')).toBeVisible();
  await expect(page).toHaveURL(/tab=trophy/);
  await expect(page.locator('header h2')).toHaveText('Connor');
});

test('a failed feature import is contained in its section and other destinations remain usable', async ({ page }) => {
  let attempts = 0;
  await page.route(requestPattern('trophy'), async route => {
    attempts += 1;
    if (attempts === 1) await route.abort('failed');
    else await route.continue();
  });
  await page.goto('/?tab=history');
  await waitForFeature(page, 'history');
  await activateFeature(page, 'trophy');
  const panel = page.locator('#page-trophy');
  await expect(panel).toHaveAttribute('data-feature-state', 'error');
  await expect(featureDestination(page, 'trophy')).toHaveAttribute('aria-current', 'page');
  await expect(panel.getByRole('alert')).toContainText('Trophy Case could not be loaded');
  await expect(panel.getByRole('button', { name: 'Retry' })).toBeVisible();
  await expect(page).toHaveURL(/tab=trophy/);
  await panel.getByRole('button', { name: 'Retry' }).click();
  await waitForFeature(page, 'trophy');
  expect(attempts).toBeGreaterThanOrEqual(2);
  await activateFeature(page, 'history');
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

  await field.evaluate(element => { element.value = ''; });
  await page.locator('#gauntletCopyBtn').click();
  await expect(field).toHaveValue('');
});
