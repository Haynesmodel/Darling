import { expect, test } from './coverage-fixture.js';
import { expectNoViolations } from './accessibility-helpers.js';

test.describe('IU weekend welcome', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-09-19T12:00:00Z'));
  });

  test('hypes the Hoosiers, animates, and dismisses with focus recovery', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Hoosier Weekend has entered the chat' })).toBeVisible();
    await expect(page.locator('.nfl-kickoff-scoreboard')).toContainText('2–0 • Defending Champs');
    await expect(page.getByText('55–0. No notes.')).toBeVisible();
    await expect(page.getByText('Defending champs', { exact: true })).toBeVisible();
    await expect(page.getByText('WKU at 4 p.m.')).toBeVisible();
    await expect(page.getByText('Extra points are optional')).toBeVisible();
    await expect(page.locator('[data-nfl-kickoff-carousel]')).toHaveCount(0);
    await expect(page.locator('.nfl-kickoff-confetti i')).toHaveCount(12);
    await expect(page.locator('.nfl-kickoff-stadium-lights span')).toHaveCount(3);
    const motionNames = await page.locator('.nfl-kickoff-confetti i, .nfl-kickoff-stadium-lights span').evaluateAll(elements => elements.map(element => getComputedStyle(element).animationName));
    expect(motionNames.every(name => name !== 'none')).toBe(true);
    await expectNoViolations(page, '[data-nfl-kickoff-welcome]');
    await page.getByRole('button', { name: /Enter the league/ }).click();
    await expect(page.locator('[data-nfl-kickoff-welcome]')).toBeHidden();
    await expect(page.locator('#mainContent')).toBeFocused();
  });

  test('uses the weekend window, hides on feature routes, and respects reduced motion', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Hoosier Weekend has entered the chat' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.reload();
    const animations = await page.locator('.nfl-kickoff-ball, .nfl-kickoff-whistle, .nfl-kickoff-live-dot, .nfl-kickoff-stadium-lights span, .nfl-kickoff-confetti i, .nfl-kickoff-announcement span, .nfl-kickoff-headline').evaluateAll(elements => elements.map(element => getComputedStyle(element).animationName));
    expect(animations.every(name => name === 'none')).toBe(true);
    await page.goto('/?tab=draft');
    await expect(page.locator('[data-nfl-kickoff-welcome]')).toBeHidden();
  });
});
