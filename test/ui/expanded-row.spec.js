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

test('Trophy season adapter covers empty, singular, and complete game-log details', async ({ page }) => {
  test.skip(process.env.PLAYWRIGHT_SERVER === 'preview', 'The authored adapter import is exercised by the coverage dev-server lane.');
  await page.goto('/');
  const details = await page.evaluate(async () => {
    const { adaptTrophySeasonRows } = await import('/src/tables/rows/trophy-season-rows.ts');
    const fallback = adaptTrophySeasonRows([{
      season: 2023,
      finish: 'unknown',
      pf: null,
      pa: null,
      diff: '',
      notes: null,
      games: null,
    }]);
    const singular = adaptTrophySeasonRows([{
      season: 2024,
      finish: '—',
      pf: '—',
      pa: '—',
      diff: '—',
      notes: [],
      games: [{}],
    }]);
    const complete = adaptTrophySeasonRows([{
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
    }], { owner: 'Joe' });
    return {
      fallback: fallback[0].details,
      singular: singular[0].details,
      complete: complete[0].details,
    };
  });
  expect(details.fallback[2]).toEqual({ label: 'Game log', value: 'No games recorded' });
  expect(details.singular[2]).toEqual({ label: 'Game log', value: '1 game' });
  expect(details.singular[3].value).toContain('Opponent: —');
  expect(details.complete[2]).toEqual({ label: 'Game log', value: '2 games' });
  expect(details.complete[4].value).toContain('Round: Final');
});
