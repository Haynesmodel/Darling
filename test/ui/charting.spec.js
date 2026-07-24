import { expect, test } from './coverage-fixture.js';

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
  await page.goto('/?tab=current&currentOwner=Joe');
  await assertChart(page, '#currentSeedMovementPlot', /Live seed movement by owner/);
  await page.locator('#currentProjectionSelect').selectOption('current');
  await assertChart(page, '#currentSeedMovementPlot', /Live seed movement by owner/);
  await expectNoPageOverflow(page);
});

test('Current Season playoff-odds movement chart completes asynchronously', async ({ page }) => {
  await page.goto('/?tab=current&currentOwner=Joe');
  await assertChart(page, '#currentOddsMovementPlot', /Playoff odds movement by owner/);
  await expect(page.locator('.current-odds-methodology')).toBeVisible();
  await expectNoPageOverflow(page);
});

test('Current Season projected standings chart retains owner and seed titles', async ({ page }) => {
  await page.goto('/?tab=current&currentOwner=Joe');
  await assertChart(page, '#currentProjectedStandingsPlot', /Projected standings seed by owner/);
  expect(await page.locator('#currentProjectedStandingsPlot svg title').count()).toBeGreaterThan(0);
  await expectNoPageOverflow(page);
});

test('Rivalry cumulative lead chart redraws for a new opponent', async ({ page }) => {
  await page.goto('/?tab=rivalry&rivalryTeamA=Joe&rivalryTeamB=Joel');
  await assertChart(page, '#rivalryLeadPlot', /Series lead over time relative to \.500/);
  await page.locator('#rivalryTeamB').selectOption('Shap');
  await assertChart(page, '#rivalryLeadPlot', /Series lead over time relative to \.500/);
  await expectNoPageOverflow(page);
});

test('Trophy career chart redraws for a new owner', async ({ page }) => {
  await page.goto('/?tab=trophy&trophyOwner=Joe');
  await assertChart(page, '#trophyCareerPlot', /Season finish trend/);
  await page.locator('#trophyOwnerSelect').selectOption('Joel');
  await assertChart(page, '#trophyCareerPlot', /Season finish trend/);
  await expectNoPageOverflow(page);
});

test('Dynasty trend chart toggle changes marks without duplicating SVG', async ({ page }) => {
  await page.goto('/?tab=dynasty&dynastyMode=calculator&dynastyOwner=Joe&dynastyStart=2021&dynastyEnd=2025');
  await assertChart(page, '#dynastyTrendPlot', /All-time dynasty score through the years/);
  const toggle = page.locator('[data-dynasty-trend-toggle="1"]').first();
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await assertChart(page, '#dynastyTrendPlot', /All-time dynasty score through the years/);
  await expectNoPageOverflow(page);
});

test('Gauntlet histogram rerun replaces its SVG', async ({ page }) => {
  await page.goto('/?tab=gauntlet&ga=Joe%3A2024&gb=Zook%3A2019&gn=1000');
  await assertChart(page, '#gauntletHistogramPlot', /Overlaid score distribution histogram/);
  await page.locator('#gauntletRerollBtn').click();
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
  await assertChart(page, '.draft-zone-chart', /Draft zone comparison by/);
  await page.locator('#draftMetricSelect').selectOption('championships');
  await assertChart(page, '.draft-zone-chart', /Draft zone comparison by Championship Count/);
  await expectNoPageOverflow(page);
});
