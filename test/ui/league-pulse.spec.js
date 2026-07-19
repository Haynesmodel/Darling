import { expect, test } from '@playwright/test';

test('bare route renders the canonical 2025 year in review', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('tab', { name: 'League Pulse' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tabpanel', { name: 'League Pulse' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '2025 Year in Review' })).toBeVisible();
  await expect(page.locator('.pulse-hero')).toContainText('Zook claimed the championship');
  await expect(page.locator('.pulse-hero')).toContainText('Connor won the Saunders Bowl');
  await expect(page.locator('.pulse-final-standings li').first()).toContainText('Zook');
  await expect(page).not.toHaveURL(/tab=pulse/);
});

test('explicit Pulse canonicalizes and browser history restores filtered History state', async ({ page }) => {
  await page.goto('/?tab=history&team=Joe&seasons=2024');
  await page.waitForLoadState('networkidle');
  const prior = page.url();
  await page.getByRole('tab', { name: 'League Pulse' }).click();
  await expect(page).not.toHaveURL(/\?/);
  await page.goBack();
  await expect(page).toHaveURL(prior);
  await expect(page.getByRole('tab', { name: 'League History' })).toHaveAttribute('aria-selected', 'true');
});

test('Pulse layout does not overflow a 320px viewport', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
