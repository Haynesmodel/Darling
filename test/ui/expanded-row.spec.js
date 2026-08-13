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

test('Trophy season expansions reset after sorting and clearing a Season filter', async ({ page }) => {
  await page.goto('/?tab=trophy&trophyOwner=Joe');
  await page.waitForLoadState('networkidle');
  await page.locator('#trophyLedgerDisclosure > summary').click();
  const table = page.locator('[data-table-id="trophy-seasons"]');
  const season2025 = () => table.locator('tbody > tr:not(.table-expanded-row)').filter({ hasText: '2025' }).first();

  await season2025().locator('.table-expand-button').click();
  await expect(table.locator('.table-expanded-row')).toHaveCount(1);

  await table.getByRole('button', { name: /Sort Finish/ }).click();
  await expect(table.locator('.table-expanded-row')).toHaveCount(0);

  await season2025().locator('.table-expand-button').click();
  await expect(table.locator('.table-expanded-row')).toHaveCount(1);
  await table.locator('.table-filter-menu > summary').click();
  const seasonMaximum = page.getByRole('spinbutton', { name: 'Season maximum' });
  await seasonMaximum.fill('2024');
  await expect(season2025()).toHaveCount(0);
  await expect(table.locator('.table-expanded-row')).toHaveCount(0);

  await seasonMaximum.fill('');
  await expect(season2025()).toBeVisible();
  await expect(table.locator('.table-expanded-row')).toHaveCount(0);
});

test('Trophy season adapter covers empty, singular, and complete game-log details', async ({ page }) => {
  await page.goto('/?tab=trophy&trophyOwner=Joe');
  await page.waitForLoadState('networkidle');
  await page.locator('#trophyLedgerDisclosure > summary').click();
  await page.evaluate(() => {
    window.darlingTables.render('trophy-seasons', {
      instanceKey: 'coverage-fixture',
      initialState: { sorting: [{ id: 'season', desc: false }] },
      rows: [{
      season: 2023,
      finish: 'unknown',
      pf: null,
      pa: null,
      diff: '',
      notes: null,
      games: null,
      }, {
      season: 2024,
      finish: '—',
      pf: '—',
      pa: '—',
      diff: '—',
      notes: [],
      games: [{}],
      }, {
      season: 2025,
      finish: '1',
      pf: '100.0',
      pa: '90.0',
      diff: '+10.0',
      notes: ['Champion'],
      games: [
        { date: '2025-09-07', week: '1', opponent: 'Shap', scoreline: '100.0 - 90.0', result: 'W', type: 'Regular', round: '—' },
        { date: '2025-12-21', week: '16', opponent: 'Alex', scoreline: '90.0 - 100.0', result: 'L', type: 'Playoff', round: 'Final' },
      ],
      }],
    });
  });
  const table = page.locator('[data-table-id="trophy-seasons"]');
  await expect(table.locator('tbody > tr:not(.table-expanded-row)')).toHaveCount(3);
  for (const [index, expected] of [[0, 'No games recorded'], [1, 'Opponent: —'], [2, 'Round: Final']]) {
    const row = table.locator('tbody > tr:not(.table-expanded-row)').nth(index);
    await row.locator('.table-expand-button').click();
    await expect(table.locator('.table-expanded-row').first()).toContainText(expected);
    await row.locator('.table-expand-button').click();
  }
  if (process.env.COLLECT_COVERAGE && process.env.PLAYWRIGHT_SERVER !== 'preview') {
    const defaultDetails = await page.evaluate(async () => {
      const { adaptTrophySeasonRows } = await import('/src/tables/rows/trophy-season-rows.ts');
      return adaptTrophySeasonRows([{ season: 2022, notes: null, games: null }])[0].details;
    });
    expect(defaultDetails[2]).toEqual({ label: 'Game log', value: 'No games recorded' });
  }
});
