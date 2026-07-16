import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const pages = [
  ['history', 'League History'],
  ['current', 'Current Season'],
  ['rivalry', 'Head to Head'],
  ['trophy', 'Trophy Case'],
  ['dynasty', 'Dynasty Rankings'],
  ['gauntlet', 'Historical Matchup'],
];

async function expectNoViolations(page, include) {
  let builder = new AxeBuilder({ page }).withTags(WCAG_TAGS);
  if (include) builder = builder.include(include);
  const results = await builder.analyze();
  expect(
    results.violations,
    results.violations.map(violation => `${violation.id}: ${violation.help}`).join('\n'),
  ).toEqual([]);
}

for (const theme of ['light', 'dark']) {
  test.describe(`${theme} theme`, () => {
    for (const [tab, name] of pages) {
      test(`${name} has no automated WCAG A/AA violations`, async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.goto(`/?tab=${tab}`);
        await page.waitForLoadState('networkidle');
        await page.locator(`[data-theme-preference="${theme}"]`).click();
        await expect(page.getByRole('tabpanel', { name })).toBeVisible();
        await expectNoViolations(page);
      });
    }
  });
}

test('mobile navigation and history disclosure have no automated violations', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.locator('.dropdown-toggle[data-target="seasonFilters"]').click();
  await expect(page.locator('#seasonFilters')).toBeVisible();
  await expectNoViolations(page);
});

test('command palette has no automated violations', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.locator('.search-trigger').click();
  await expect(page.getByRole('dialog', { name: 'Search The Darling' })).toBeVisible();
  await expectNoViolations(page, '#global-search-dialog');
});

test('Dynasty window dialog has no automated violations', async ({ page }) => {
  await page.goto('/?tab=dynasty');
  await page.waitForLoadState('networkidle');
  await page.locator('#dynastyBestWindows .dynasty-window-card').first().click();
  await expect(page.locator('#dynastyWindowModal')).toBeVisible();
  await expectNoViolations(page, '#dynastyWindowModal');
});

test('expanded interactive table state has no automated violations', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.locator('#historyGamesTable .table-expand-button').first().click();
  await expect(page.locator('#historyGamesTable .table-expanded-row').first()).toBeVisible();
  await expectNoViolations(page, '#historyGamesCard');
});
