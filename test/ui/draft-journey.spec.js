import { expect, test } from './coverage-fixture.js';

test.describe('Draft Journey', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/?tab=draft');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('#page-draft')).toHaveAttribute('data-feature-state', 'ready');
    await expect(page.locator('#draftJourneyDisclosure')).toBeVisible();
    await page.locator('#draftJourneyDisclosure summary').click();
  });

  test('renders all four eras and synchronizes select, URL, and detail', async ({ page }) => {
    const filter = page.locator('select[aria-label="Filter draft journey by location"]');
    await expect(filter.locator('option')).toHaveText(['All locations', 'Remote / virtual · 2014–2016', 'Bethany Beach · 2017–2022', 'College Park · 2023–2024', 'Washington, DC · 2025–2026']);
    await expect(page.locator('.draft-journey-detail')).toHaveCount(4);
    await filter.selectOption('washington-dc');
    await expect(page).toHaveURL(/draftLocation=washington-dc/);
    await expect(page.locator('.draft-journey-details')).toContainText('2025–2026');
    await expect(page.locator('#draftEndSeason')).toHaveValue('2025');
  });

  test('keeps virtual era off-map and physical callouts keyboard-operable', async ({ page }) => {
    const filter = page.locator('select[aria-label="Filter draft journey by location"]');
    await filter.selectOption('remote-virtual');
    await expect(page.locator('.draft-journey-virtual-button')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.draft-journey-details')).toContainText('Virtual era; no physical location assigned.');
    await page.getByRole('button', { name: 'Show College Park, 2023–2024' }).press('Enter');
    await expect(page).toHaveURL(/draftLocation=college-park/);
    await expect(page.locator('.draft-journey-details')).toContainText('University of Maryland Stadium');
  });

  test('invalid direct location is removed without an error', async ({ page }) => {
    await page.goto('/?tab=draft&draftLocation=unknown');
    await page.waitForLoadState('networkidle');
    await expect(page).not.toHaveURL(/draftLocation=unknown/);
    await expect(page.locator('select[aria-label="Filter draft journey by location"]')).toHaveValue('');
  });

  test('has no horizontal overflow at 320px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 900 });
    await page.reload();
    await page.waitForLoadState('networkidle');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });
});
