import { expect, test } from '@playwright/test';

test('primary tabs use manual activation with roving focus', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  const history = page.getByRole('tab', { name: 'League History' });
  const current = page.getByRole('tab', { name: 'Current Season' });
  const gauntlet = page.getByRole('tab', { name: 'Historical Matchup' });

  await expect(history).toHaveAttribute('aria-selected', 'true');
  await expect(history).toHaveAttribute('tabindex', '0');
  await expect(current).toHaveAttribute('tabindex', '-1');
  await page.locator('[data-theme-preference="dark"]').focus();
  await page.keyboard.press('Tab');
  await expect(history).toBeFocused();
  await history.focus();
  await page.keyboard.press('ArrowRight');
  await expect(current).toBeFocused();
  await expect(current).toHaveAttribute('aria-selected', 'false');
  await expect(page.getByRole('tabpanel', { name: 'League History' })).toBeVisible();

  await page.keyboard.press('Enter');
  await expect(current).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tabpanel', { name: 'Current Season' })).toBeVisible();
  await expect(page.getByRole('tabpanel', { name: 'League History' })).toBeHidden();

  await page.keyboard.press('End');
  await expect(gauntlet).toBeFocused();
  await page.keyboard.press(' ');
  await expect(gauntlet).toHaveAttribute('aria-selected', 'true');
  await expect.poll(() => new URL(page.url()).searchParams.get('tab')).toBe('gauntlet');

  await page.keyboard.press('Home');
  await expect(history).toBeFocused();
  await expect(history).toHaveAttribute('aria-selected', 'false');
});

test('browser navigation restores tab semantics and reveals the selected mobile tab', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.getByRole('tab', { name: 'Historical Matchup' }).click();
  await page.getByRole('tab', { name: 'Trophy Case' }).click();
  await page.goBack();

  const gauntlet = page.getByRole('tab', { name: 'Historical Matchup' });
  await expect(gauntlet).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tabpanel', { name: 'Historical Matchup' })).toBeVisible();
  await expect.poll(() => gauntlet.evaluate((tab) => {
    const strip = tab.parentElement;
    const tabBox = tab.getBoundingClientRect();
    const stripBox = strip.getBoundingClientRect();
    return tabBox.left >= stripBox.left - 1 && tabBox.right <= stripBox.right + 1;
  })).toBe(true);
});

test('facet disclosure supports Arrow, Home, End, Space, Tab, and Escape', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  const toggle = page.locator('.dropdown-toggle[data-target="seasonFilters"]');
  const all = page.locator('#seasonFilters .season-all');
  const options = page.locator('#seasonFilters .season-cb');

  await toggle.focus();
  await page.keyboard.press('ArrowDown');
  await expect(all).toBeFocused();
  await page.keyboard.press('End');
  await expect(options.last()).toBeFocused();
  await page.keyboard.press('Home');
  await expect(all).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(options.first()).toBeFocused();
  await page.keyboard.press('Space');
  await expect(options.first()).toBeChecked();
  await page.keyboard.press('Escape');
  await expect(toggle).toBeFocused();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');

  await toggle.focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  await expect(toggle).toBeFocused();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
});

test('Dynasty dialog contains focus, locks the page, ignores search shortcuts, and restores its opener', async ({ page }) => {
  await page.goto('/?tab=dynasty');
  await page.waitForLoadState('networkidle');
  const opener = page.locator('#dynastyBestWindows .dynasty-window-card').first();
  await opener.focus();
  await opener.click();

  const dialog = page.locator('#dynastyWindowModal');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('#dynastyWindowModalTitle')).toBeFocused();
  await expect(page.locator('body')).toHaveClass(/no-scroll/);
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+K' : 'Control+K');
  await expect(page.getByRole('dialog', { name: 'Search The Darling' })).toBeHidden();

  const close = dialog.locator('.dynasty-modal-close');
  await close.focus();
  await page.keyboard.press('Shift+Tab');
  expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.locator('body')).not.toHaveClass(/no-scroll/);
  await expect(opener).toBeFocused();
});

test('skip link is first and sticky navigation does not obscure its target', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Skip to league content' });
  await expect(skip).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#mainContent')).toBeFocused();
  expect(await page.locator('#mainContent').evaluate((main) => {
    const nav = document.querySelector('.primary-nav');
    return main.getBoundingClientRect().top >= nav.getBoundingClientRect().bottom - 1;
  })).toBe(true);
});

test('reduced motion skips decorative effects and hover transforms', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?team=Joe&seasons=2021');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('#fxCrown .crown')).toHaveCount(0);
  expect(await page.locator('#funFacts .stat').first().evaluate(element => (
    getComputedStyle(element).transitionDuration
  ))).toMatch(/^(0s(?:, 0s)?|)$/);
});

for (const viewport of [
  { width: 320, height: 568 },
  { width: 375, height: 667 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
]) {
  test(`layout reflows without document overflow at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/?tab=dynasty');
    await page.waitForLoadState('networkidle');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(page.locator('.search-trigger')).toBeVisible();
    await page.locator('#dynastyBestWindows .dynasty-window-card').first().click();
    const box = await page.locator('#dynastyWindowModal').boundingBox();
    expect(box.width).toBeLessThanOrEqual(viewport.width);
    expect(box.height).toBeLessThanOrEqual(viewport.height);
  });
}
