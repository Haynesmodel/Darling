const { test, expect } = require('@playwright/test');

test('page loads and renders the history tables', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  await expect(page.locator('#appStatus')).toBeHidden();
  await expect(page.locator('header h2')).toHaveText('Joe');

  const seasonCount = await page.locator('#seasonRecapTable tbody tr').count();
  const weekCount = await page.locator('#weekTable tbody tr').count();
  const historyCount = await page.locator('#historyGamesTable tbody tr').count();

  expect(seasonCount).toBeGreaterThan(0);
  expect(weekCount).toBeGreaterThan(0);
  expect(historyCount).toBeGreaterThan(0);
  expect(weekCount).toBe(historyCount);
});

test('changing the team updates the rendered rows and url state', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  const teamSelect = page.locator('#teamSelect');
  const originalWeekCount = await page.locator('#weekTable tbody tr').count();

  const optionValues = await teamSelect.locator('option').evaluateAll(options =>
    options.map(option => option.value).filter(value => value && value !== '__ALL__')
  );
  const nextTeam = optionValues.find(value => value !== 'Joe');

  expect(nextTeam).toBeTruthy();

  await teamSelect.selectOption(nextTeam);
  await page.waitForLoadState('networkidle');

  const nextWeekCount = await page.locator('#weekTable tbody tr').count();
  const nextHistoryCount = await page.locator('#historyGamesTable tbody tr').count();

  expect(page.url()).toContain(`team=${encodeURIComponent(nextTeam)}`);
  expect(nextWeekCount).toBe(nextHistoryCount);
  expect(nextWeekCount).not.toBe(originalWeekCount);
});

test('fetch failure surfaces an error banner instead of a blank page', async ({ page }) => {
  await page.route('**/assets/H2H.json', route => {
    route.fulfill({
      status: 500,
      contentType: 'text/plain',
      body: 'upstream failed',
    });
  });

  await page.goto('/');
  await page.waitForLoadState('networkidle');

  await expect(page.locator('#appStatus')).toBeVisible();
  await expect(page.locator('#appStatus')).toContainText('Could not load league data');
  await expect(page.locator('#teamSelect option')).toHaveCount(0);
});
