import { existsSync, readFileSync } from 'node:fs';
import { expect, test } from './coverage-fixture.js';
import { createSnapshotFixture } from './snapshot-fixture.js';
import { regularSeason2026 } from './season-phase-fixtures.js';
import { activateFeature } from './navigation-helpers.js';

const productionChartRuntimeAsset = (() => {
  const manifestPath = new URL('../../dist/.vite/manifest.json', import.meta.url);
  if (!existsSync(manifestPath)) return null;
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  return Object.values(manifest).find(entry => entry.name === 'chart-runtime')?.file ?? null;
})();
const productionGauntletAdapterAsset = (() => {
  const manifestPath = new URL('../../dist/.vite/manifest.json', import.meta.url);
  if (!existsSync(manifestPath)) return null;
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  return Object.values(manifest).find(entry => entry.src === 'src/features/gauntlet/GauntletHistogramMount.tsx')?.file ?? null;
})();

async function installLiveCurrent(page) {
  const fixture = createSnapshotFixture({
    mutations: { CurrentSeason: current => regularSeason2026(current, true) },
  });
  await fixture.install(page);
}

async function assertChart(page, hostSelector, namePattern) {
  const host = page.locator(hostSelector);
  const svg = host.locator('svg[role="img"]');
  await expect(svg).toHaveCount(1);
  await expect(svg).toBeVisible();
  await expect(svg).toHaveAttribute('aria-label', namePattern);
  const box = await svg.boundingBox();
  expect(box?.width).toBeGreaterThan(0);
  expect(box?.height).toBeGreaterThan(0);
  await expect(host).toHaveAttribute('data-chart-state', 'ready');
}

async function expectNoPageOverflow(page) {
  await page.setViewportSize({ width: 320, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)).toBe(false);
}

test.beforeEach(async ({ page }) => {
  page.__chartErrors = [];
  page.on('pageerror', error => page.__chartErrors.push(error.message));
});

test.afterEach(async ({ page }) => {
  expect(page.__chartErrors).toEqual([]);
});

test('Current Season seed movement chart renders and redraws once', async ({ page }) => {
  await installLiveCurrent(page);
  await page.goto('/?tab=current&currentOwner=Joe');
  await assertChart(page, '#currentSeedMovementPlot', /Live seed movement by owner/);
  await page.locator('#currentProjectionSelect').selectOption('current');
  await assertChart(page, '#currentSeedMovementPlot', /Live seed movement by owner/);
  await expectNoPageOverflow(page);
});

test('Current Season playoff-odds movement chart completes asynchronously', async ({ page }) => {
  await installLiveCurrent(page);
  await page.goto('/?tab=current&currentOwner=Joe');
  await assertChart(page, '#currentOddsMovementPlot', /Playoff odds movement by owner/);
  await expect(page.locator('.current-odds-methodology')).toBeVisible();
  await expectNoPageOverflow(page);
});

test('Current Season projected standings chart retains owner and seed titles', async ({ page }) => {
  await installLiveCurrent(page);
  await page.goto('/?tab=current&currentOwner=Joe');
  await page.locator('#current-section-jump').selectOption('current-projected-standings');
  await assertChart(page, '#currentProjectedStandingsPlot', /Projected standings seed by owner/);
  expect(await page.locator('#currentProjectedStandingsPlot svg title').count()).toBeGreaterThan(0);
  await expectNoPageOverflow(page);
});

test('Rivalry cumulative lead chart redraws for a new opponent', async ({ page }) => {
  await page.goto('/?tab=rivalry&rivalryTeamA=Joe&rivalryTeamB=Joel');
  await expect(page.locator('#rivalryLeadPlot svg')).toHaveCount(0);
  await page.locator('#rivalry-section-jump').selectOption('rivalry-trend');
  await assertChart(page, '#rivalryLeadPlot', /Series lead over time relative to \.500/);
  await page.locator('#rivalryTeamB').selectOption('Shap');
  await page.locator('#rivalry-section-jump').selectOption('rivalry-trend');
  await assertChart(page, '#rivalryLeadPlot', /Series lead over time relative to \.500/);
  await expectNoPageOverflow(page);
});

test('Rivalry preserves a ready chart across an equal-signature parent rerender', async ({ page }) => {
  await page.goto('/?tab=rivalry&rivalryTeamA=Joe&rivalryTeamB=Joel');
  await page.locator('#rivalry-section-jump').selectOption('rivalry-trend');
  await assertChart(page, '#rivalryLeadPlot', /Series lead over time relative to \.500/);
  await page.locator('#rivalryLeadPlot svg').evaluate(svg => {
    const renderHost = svg.parentElement;
    const originalReplaceChildren = renderHost.replaceChildren;
    window.__equalSignatureChart = { svg, renderCalls: 0 };
    renderHost.replaceChildren = function replaceChildren(...nodes) {
      window.__equalSignatureChart.renderCalls += 1;
      return originalReplaceChildren.apply(this, nodes);
    };
  });

  await page.locator('#rivalryScopeSelect').selectOption('allTime');
  await expect(page.locator('#rivalryLeadPlot')).toHaveAttribute('data-chart-state', 'ready');
  expect(await page.locator('#rivalryLeadPlot svg').evaluate(svg => ({
    sameNode: svg === window.__equalSignatureChart.svg,
    renderCalls: window.__equalSignatureChart.renderCalls,
  }))).toEqual({ sameNode: true, renderCalls: 0 });
});

test('Rivalry explicit Load button works without IntersectionObserver', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'IntersectionObserver', { configurable: true, value: undefined });
  });
  await page.goto('/?tab=rivalry&rivalryTeamA=Joe&rivalryTeamB=Joel');
  await page.locator('#rivalry-section-jump').selectOption('rivalry-trend');
  const load = page.getByRole('button', { name: 'Load Lead Trend chart' });
  await expect(load).toBeVisible();
  await load.focus();
  await page.keyboard.press('Enter');
  await assertChart(page, '#rivalryLeadPlot', /Series lead over time relative to \.500/);
});

test('Trophy career chart redraws for a new owner', async ({ page }) => {
  await page.goto('/?tab=trophy&trophyOwner=Joe');
  const trophyArt = page.locator('.trophy-card-art').first();
  await expect(trophyArt).toBeVisible();
  expect(await trophyArt.evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
  await expect(page.locator('#trophyCareerPlot svg')).toHaveCount(0);
  await page.locator('#trophy-section-jump').selectOption('trophy-career');
  await assertChart(page, '#trophyCareerPlot', /Season finish trend/);
  await page.locator('#trophyOwnerSelect').selectOption('Joel');
  await page.locator('#trophy-section-jump').selectOption('trophy-career');
  await assertChart(page, '#trophyCareerPlot', /Season finish trend/);
  await expectNoPageOverflow(page);
});

test('Trophy deactivation invalidates an in-flight career chart', async ({ page }) => {
  let releaseRuntime;
  let runtimeRequested = false;
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    const isDevRuntime = url.pathname.endsWith('/src/charting/plot-charts.ts');
    const isProductionRuntime = productionChartRuntimeAsset && url.pathname.endsWith(`/${productionChartRuntimeAsset}`);
    if (!isDevRuntime && !isProductionRuntime) {
      await route.continue();
      return;
    }
    runtimeRequested = true;
    await new Promise(resolve => { releaseRuntime = resolve; });
    await route.continue();
  });
  await page.goto('/?tab=trophy&trophyOwner=Joe');
  await page.locator('#trophy-section-jump').selectOption('trophy-career');
  await expect.poll(() => runtimeRequested).toBe(true);
  await activateFeature(page, 'pulse');
  releaseRuntime();
  await expect(page.locator('#trophyCareerPlot svg')).toHaveCount(0);
  await expect(page.locator('#trophyCareerPlot')).toHaveAttribute('data-chart-state', 'idle');
});

test('Draft deactivation unmounts an in-flight chart', async ({ page }) => {
  let releaseRuntime;
  let runtimeRequested = false;
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    const isDevRuntime = url.pathname.endsWith('/src/charting/plot-charts.ts');
    const isProductionRuntime = productionChartRuntimeAsset && url.pathname.endsWith(`/${productionChartRuntimeAsset}`);
    if (!isDevRuntime && !isProductionRuntime) {
      await route.continue();
      return;
    }
    runtimeRequested = true;
    await new Promise(resolve => { releaseRuntime = resolve; });
    await route.continue();
  });
  await page.goto('/?tab=draft');
  await expect.poll(() => runtimeRequested).toBe(true);
  await activateFeature(page, 'pulse');
  releaseRuntime();
  await expect(page.locator('#draftSpotRoot .draft-pick-chart svg')).toHaveCount(0);
});

test('Gauntlet adapter does not mount into a closed disclosure', async ({ page }) => {
  let releaseAdapter;
  let adapterRequested = false;
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    const isDevAdapter = url.pathname.endsWith('/src/features/gauntlet/GauntletHistogramMount.tsx');
    const isProductionAdapter = productionGauntletAdapterAsset && url.pathname.endsWith(`/${productionGauntletAdapterAsset}`);
    if (!isDevAdapter && !isProductionAdapter) {
      await route.continue();
      return;
    }
    adapterRequested = true;
    await new Promise(resolve => { releaseAdapter = resolve; });
    await route.continue();
  });
  await page.goto('/?tab=gauntlet&ga=Joe%3A2024&gb=Zook%3A2019');
  await page.locator('#gauntlet-section-jump').selectOption('gauntlet-distribution');
  await expect.poll(() => adapterRequested).toBe(true);
  await page.locator('#gauntletHistogramDisclosure summary').click();
  releaseAdapter();
  await expect(page.locator('#gauntletHistogramPlot .gauntlet-histogram-mount')).toHaveCount(0);
  await expect(page.locator('#gauntletHistogramPlot')).toHaveAttribute('data-chart-state', 'idle');
});

test('Dynasty trend chart toggle changes marks without duplicating SVG', async ({ page }) => {
  await page.goto('/?tab=dynasty&dynastyMode=calculator&dynastyOwner=Joe&dynastyStart=2021&dynastyEnd=2025');
  await expect(page.locator('#dynastyTrendPlot svg')).toHaveCount(0);
  await page.locator('#dynasty-section-jump').selectOption('dynasty-trend');
  await assertChart(page, '#dynastyTrendPlot', /All-time dynasty score through the years/);
  const toggle = page.locator('[data-dynasty-trend-toggle="1"]').first();
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await assertChart(page, '#dynastyTrendPlot', /All-time dynasty score through the years/);
  await expectNoPageOverflow(page);
});

test('Gauntlet histogram rerun replaces its SVG', async ({ page }) => {
  await page.goto('/?tab=gauntlet&ga=Joe%3A2024&gb=Zook%3A2019&gn=1000');
  await expect(page.locator('#gauntletHistogramPlot svg')).toHaveCount(0);
  await page.locator('#gauntlet-section-jump').selectOption('gauntlet-distribution');
  await assertChart(page, '#gauntletHistogramPlot', /Overlaid score distribution histogram/);
  const titles = await page.locator('#gauntletHistogramPlot svg title').allTextContents();
  expect(titles.length).toBeGreaterThan(0);
  expect(titles.some(title => title.includes('Joe 2024'))).toBe(true);
  await page.locator('#gauntletRerollBtn').click();
  await expect(page.locator('#gauntletHistogramDisclosure')).toHaveAttribute('open', '');
  await assertChart(page, '#gauntletHistogramPlot', /Overlaid score distribution histogram/);
  await expectNoPageOverflow(page);
});

test('Draft pick chart loads dynamically and redraws for metric and normalization', async ({ page }) => {
  await page.goto('/?tab=draft');
  await assertChart(page, '.draft-pick-chart', /Draft pick comparison by/);
  await page.locator('#draftMetricSelect').selectOption('playoffRate');
  await page.locator('#draftNormalizeToggle').check();
  await assertChart(page, '.draft-pick-chart', /Normalized draft slot comparison by Playoff Rate/);
  await expectNoPageOverflow(page);
});

test('Draft zone chart loads dynamically and redraws for metric changes', async ({ page }) => {
  await page.goto('/?tab=draft');
  await expect(page.locator('.draft-zone-chart svg')).toHaveCount(0);
  await page.locator('#draft-section-jump').selectOption('draft-zones');
  await assertChart(page, '.draft-zone-chart', /Draft zone comparison by/);
  await page.locator('#draftMetricSelect').selectOption('championships');
  await assertChart(page, '.draft-zone-chart', /Draft zone comparison by Championship Count/);
  await expectNoPageOverflow(page);
});
