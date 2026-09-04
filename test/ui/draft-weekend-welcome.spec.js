import { expect, test } from './coverage-fixture.js';
import { expectNoViolations } from './accessibility-helpers.js';

test.describe('Draft Weekend welcome', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-09-04T12:00:00Z'));
  });

  test('shows the required honors and dismisses with focus recovery', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Welcome to Draft Weekend, 2026' })).toBeVisible();
    for (const name of ['Reigning Champ: Zook', 'Reigning Saunders: Connor', 'VPC: Shap', 'Commish: Plotnick']) {
      await expect(page.getByRole('article', { name })).toBeVisible();
    }
    await expectNoViolations(page, '[data-draft-weekend-welcome]');
    await page.getByRole('button', { name: /Enter the league/ }).click();
    await expect(page.locator('[data-draft-weekend-welcome]')).toBeHidden();
    await expect(page.locator('#mainContent')).toBeFocused();
  });

  test('stays inside the viewport on compact screens', async ({ page }) => {
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto('/');
      await expect(page.getByRole('heading', { name: 'Welcome to Draft Weekend, 2026' })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
  });

  test('disables the football motion when reduced motion is requested', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Welcome to Draft Weekend, 2026' })).toBeVisible();
    const animations = await page.locator('.draft-weekend-ball, .draft-weekend-whistle, .draft-weekend-live-dot').evaluateAll(elements =>
      elements.map(element => getComputedStyle(element).animationName));
    expect(animations.every(name => name === 'none')).toBe(true);
  });

  test('is hidden before Friday and after Monday in New York', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-09-04T03:59:59Z'));
    await page.goto('/');
    await expect(page.locator('[data-draft-weekend-welcome]')).toBeHidden();
    await page.clock.setFixedTime(new Date('2026-09-08T04:00:00Z'));
    await page.reload();
    await expect(page.locator('[data-draft-weekend-welcome]')).toBeHidden();
  });

  test('stays hidden on deep-linked feature routes while the Draft chart loads', async ({ page }) => {
    await page.goto('/?tab=draft');
    await expect(page.locator('[data-draft-weekend-welcome]')).toBeHidden();
    await expect(page.locator('#page-draft')).toHaveAttribute('data-feature-state', 'ready');
    await expect(page.locator('.draft-pick-chart')).toHaveAttribute('data-chart-state', 'ready');
  });
});
