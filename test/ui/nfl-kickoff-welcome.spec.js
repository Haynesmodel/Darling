import { expect, test } from './coverage-fixture.js';
import { expectNoViolations } from './accessibility-helpers.js';

test.describe('NFL kickoff welcome', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-09-10T12:00:00Z'));
  });

  test('shows kickoff headlines, animates, and dismisses with focus recovery', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Welcome back to The Darling' })).toBeVisible();
    await expect(page.locator('.nfl-kickoff-scoreboard')).toContainText('2026 NFL Kickoff');
    await expect(page.getByText('Bowers + A.J. Brown')).toBeVisible();
    await expect(page.getByText('Rosh Hashana', { exact: true })).toBeVisible();
    await expect(page.getByText('Nussbaum is sad', { exact: true })).toBeVisible();
    await expect(page.locator('.nfl-kickoff-confetti i')).toHaveCount(12);
    await expect(page.locator('.nfl-kickoff-stadium-lights span')).toHaveCount(3);
    const motionNames = await page.locator('.nfl-kickoff-confetti i, .nfl-kickoff-stadium-lights span').evaluateAll(elements => elements.map(element => getComputedStyle(element).animationName));
    expect(motionNames.every(name => name !== 'none')).toBe(true);
    await expectNoViolations(page, '[data-nfl-kickoff-welcome]');
    await page.getByRole('button', { name: /Enter the league/ }).click();
    await expect(page.locator('[data-nfl-kickoff-welcome]')).toBeHidden();
    await expect(page.locator('#mainContent')).toBeFocused();
  });

  test('rotates the three briefing stories and supports pausing', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('[data-nfl-kickoff-status]')).toHaveText('Story 1 of 3');
    await page.clock.fastForward(5000);
    await expect(page.locator('[data-nfl-kickoff-status]')).toHaveText('Story 2 of 3');
    await page.locator('[data-nfl-kickoff-toggle]').click();
    await expect(page.locator('[data-nfl-kickoff-toggle]')).toHaveText('Play slideshow');
    await page.clock.fastForward(6000);
    await expect(page.locator('[data-nfl-kickoff-status]')).toHaveText('Story 2 of 3');
    await page.locator('[data-nfl-kickoff-next]').click();
    await expect(page.getByText('Nussbaum watch')).toBeVisible();
  });

  test('uses the kickoff window, hides on feature routes, and respects reduced motion', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Welcome back to The Darling' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.reload();
    const animations = await page.locator('.nfl-kickoff-ball, .nfl-kickoff-whistle, .nfl-kickoff-live-dot, .nfl-kickoff-stadium-lights span, .nfl-kickoff-confetti i, .nfl-kickoff-announcement span, .nfl-kickoff-headline').evaluateAll(elements => elements.map(element => getComputedStyle(element).animationName));
    expect(animations.every(name => name === 'none')).toBe(true);
    await expect(page.locator('[data-nfl-kickoff-toggle]')).toBeHidden();
    await page.goto('/?tab=draft');
    await expect(page.locator('[data-nfl-kickoff-welcome]')).toBeHidden();
  });
});
