import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from './coverage-fixture.js';
import { expectNoViolations } from './accessibility-helpers.js';
import { createSnapshotFixture } from './snapshot-fixture.js';
const pages = [
  ['pulse', 'League Pulse'],
  ['owner', 'My Team'],
  ['transactions', 'Transactions'],
  ['history', 'League History'],
  ['current', 'Current Season'],
  ['rivalry', 'Head to Head'],
  ['trophy', 'Trophy Case'],
  ['dynasty', 'Dynasty Rankings'],
  ['draft', 'Draft Spot'],
  ['gauntlet', 'Historical Matchup'],
];
const preview = process.env.PLAYWRIGHT_SERVER === 'preview';
const manifest = preview ? JSON.parse(fs.readFileSync(path.join(process.cwd(), 'dist/.vite/manifest.json'), 'utf8')) : {};
const chartRuntime = Object.values(manifest).find(entry => entry.name === 'chart-runtime')?.file;
const chartRuntimePattern = preview ? `**/${chartRuntime}` : '**/js/charting/vendor/charting-vendor.js*';

for (const theme of ['light', 'dark']) {
  test.describe(`${theme} theme`, () => {
    for (const [tab, name] of pages) {
      test(`${name} has no automated WCAG A/AA violations`, async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.goto(`/?tab=${tab}`);
        await page.waitForLoadState('networkidle');
        await page.locator(`[data-theme-preference="${theme}"]`).click();
        const panel = page.getByRole('region', { name, exact: true });
        await expect(panel).toBeVisible();
        await expect(panel).toHaveAttribute('data-feature-state', 'ready');
        await expectNoViolations(page);
      });
    }
  });
}

test('mobile navigation and history disclosure have no automated violations', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?tab=history');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('#page-history')).toHaveAttribute('data-feature-state', 'ready');
  await page.locator('.dropdown-toggle[data-target="seasonFilters"]').click();
  await expect(page.locator('#seasonFilters')).toBeVisible();
  await expectNoViolations(page);
});

for (const group of ['Owners', 'Tools']) {
  test(`${group} navigation disclosure has no automated violations`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.getByText(group, { exact: true }).click();
    await expect(page.locator(`.primary-nav-group[data-navigation-group="${group.toLowerCase()}"]`)).toHaveAttribute('open', '');
    await expectNoViolations(page);
  });
}

for (const theme of ['light', 'dark']) {
  test(`primary action links keep readable text in ${theme} theme`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.locator(`[data-theme-preference="${theme}"]`).click();
    await expect(page.locator('.pulse-actions > .primary.btn').first()).toBeVisible();
    expect(await page.locator('.pulse-actions > .primary.btn').first().evaluate(element => getComputedStyle(element).color)).toBe('rgb(255, 255, 255)');
  });
}

test('expanded data freshness disclosure has no automated violations or mobile hero overlap', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.locator('.data-freshness summary').click();
  await expect(page.locator('.data-freshness-panel')).toBeVisible();
  await expect.poll(async () => {
    const toolbar = await page.locator('.site-hero-toolbar').boundingBox();
    const title = await page.locator('.site-hero .inner').boundingBox();
    return toolbar && title ? toolbar.y + toolbar.height <= title.y : false;
  }).toBe(true);
  await expectNoViolations(page, '.site-hero-toolbar');
});

test('command palette has no automated violations', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.locator('.search-trigger').click();
  await expect(page.getByRole('dialog', { name: 'Search The Darling' })).toBeVisible();
  await expectNoViolations(page, '#global-search-dialog');
});

test('Rivalry ready chart state has no automated violations or 320px overflow', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto('/?tab=rivalry&rivalryTeamA=Joe&rivalryTeamB=Joel');
  await page.locator('#rivalry-section-jump').selectOption('rivalry-trend');
  await expect(page.locator('#rivalryLeadPlot')).toHaveAttribute('data-chart-state', 'ready');
  await expectNoViolations(page, '#page-rivalry');
  const chartBounds = await page.locator('#rivalryLeadPlot').evaluate(element => {
    const rect = element.getBoundingClientRect();
    return { right: rect.right, viewport: document.documentElement.clientWidth };
  });
  expect(chartBounds.right).toBeLessThanOrEqual(chartBounds.viewport);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test('Rivalry chart error state has no automated violations', async ({ page }) => {
  await page.route(chartRuntimePattern, route => route.abort('failed'));
  await page.goto('/?tab=rivalry&rivalryTeamA=Joe&rivalryTeamB=Joel');
  await page.locator('#rivalry-section-jump').selectOption('rivalry-trend');
  await expect(page.locator('#rivalryLeadPlot')).toHaveAttribute('data-chart-state', 'error');
  await expectNoViolations(page, '#page-rivalry');
});

for (const theme of ['light', 'dark']) {
  test(`live Pulse active state has no violations or clipping in ${theme} theme`, async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-09-15T12:10:00Z'));
    const fixture = createSnapshotFixture({
      mutations: {
        CurrentSeason(current) {
          current.season = 2026;
          current.generated_at = '2026-09-15T12:00:00Z';
          current.current_week = 2;
          current.weeks_fetched = [1, 2];
          current.games = current.games.filter(game => game.week <= 2).map(game => ({
            ...game,
            season: 2026,
            date: game.date.replace('2025', '2026'),
            status: game.week === 1 ? 'final' : 'live',
          }));
        },
      },
    });
    await fixture.install(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.locator(`[data-theme-preference="${theme}"]`).click();
    await expect(page.locator('.pulse-badge')).toHaveText('Live');
    await expectNoViolations(page, '#page-pulse');
    await expect.poll(() => page.evaluate(() => (
      document.documentElement.scrollWidth <= document.documentElement.clientWidth
    ))).toBe(true);
  });
}

test('Dynasty window dialog has no automated violations', async ({ page }) => {
  await page.goto('/?tab=dynasty');
  await page.waitForLoadState('networkidle');
  await page.locator('#dynasty-section-jump').selectOption('dynasty-windows');
  await page.locator('#dynastyBestWindows .dynasty-window-card').first().click();
  await expect(page.locator('#dynastyWindowModal')).toBeVisible();
  await expectNoViolations(page, '#dynastyWindowModal');
});
