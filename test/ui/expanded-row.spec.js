import { expect, test } from './coverage-fixture.js';
import { expectNoViolations } from './accessibility-helpers.js';

test('expanded interactive table state has no automated violations', async ({ page }) => {
  await page.goto('/?tab=history');
  await page.waitForLoadState('networkidle');
  await page.locator('#history-section-jump').selectOption('history-games');
  await page.locator('#historyGamesTable .table-expand-button').first().click();
  await expect(page.locator('#historyGamesTable .table-expanded-row').first()).toBeVisible();
  await expectNoViolations(page, '#historyGamesCard');
});

test('Trophy ledger expansion shows the selected season game log and empty state', async ({ page }) => {
  await page.goto('/?tab=trophy&trophyOwner=Joe');
  await page.waitForLoadState('networkidle');
  await page.locator('#trophyLedgerDisclosure > summary').click();
  const table = page.locator('[data-table-id="trophy-seasons"]');
  const firstSeason = table.locator('tbody > tr:not(.table-expanded-row)').first();
  await firstSeason.locator('.table-expand-button').click();
  const expanded = table.locator('.table-expanded-row').first();
  await expect(expanded).toBeVisible();
  await expect(expanded.locator('.table-expanded-details')).toContainText('Game log');
  await expect(expanded.locator('.table-expanded-details')).toContainText('Opponent:');
  await expect(expanded.locator('.table-expanded-details')).toContainText('Score:');
  await expect(expanded.locator('.table-expanded-details')).toContainText('Result:');
  await expect(expanded.locator('.table-expanded-details')).toContainText('Type:');
  await expect(expanded.locator('.table-expanded-details')).toContainText('Round:');
  await expect(firstSeason.locator('.table-expand-button')).toHaveAttribute('aria-expanded', 'true');
  await page.screenshot({ path: 'test-results/trophy-season-game-log.png', fullPage: false });
});
