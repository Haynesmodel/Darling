import { expect, test } from './coverage-fixture.js';
import { expectNoViolations } from './accessibility-helpers.js';
import { createSnapshotFixture } from './snapshot-fixture.js';
const pages = [
  ['pulse', 'League Pulse'],
  ['history', 'League History'],
  ['current', 'Current Season'],
  ['rivalry', 'Head to Head'],
  ['trophy', 'Trophy Case'],
  ['dynasty', 'Dynasty Rankings'],
  ['draft', 'Draft Spot'],
  ['gauntlet', 'Historical Matchup'],
];

for (const theme of ['light', 'dark']) {
  test.describe(`${theme} theme`, () => {
    for (const [tab, name] of pages) {
      test(`${name} has no automated WCAG A/AA violations`, async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.goto(`/?tab=${tab}`);
        await page.waitForLoadState('networkidle');
        await page.locator(`[data-theme-preference="${theme}"]`).click();
        const panel = page.getByRole('tabpanel', { name });
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
  await page.locator('.dropdown-toggle[data-target="seasonFilters"]').click();
  await expect(page.locator('#seasonFilters')).toBeVisible();
  await expectNoViolations(page);
});

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
  await page.locator('#dynastyBestWindows .dynasty-window-card').first().click();
  await expect(page.locator('#dynastyWindowModal')).toBeVisible();
  await expectNoViolations(page, '#dynastyWindowModal');
});
