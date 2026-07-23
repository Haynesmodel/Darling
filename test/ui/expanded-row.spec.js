import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './coverage-fixture.js';

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

test('expanded interactive table state has no automated violations', async ({ page }) => {
  await page.goto('/?tab=history');
  await page.waitForLoadState('networkidle');
  await page.locator('#historyGamesTable .table-expand-button').first().click();
  await expect(page.locator('#historyGamesTable .table-expanded-row').first()).toBeVisible();
  const results = await new AxeBuilder({ page })
    .withTags(WCAG_TAGS)
    .include('#historyGamesCard')
    .analyze();
  expect(
    results.violations,
    results.violations.map(violation => `${violation.id}: ${violation.help}`).join('\n'),
  ).toEqual([]);
});
