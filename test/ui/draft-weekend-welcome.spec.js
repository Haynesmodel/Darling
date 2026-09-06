import { expect, test } from './coverage-fixture.js';
import { expectNoViolations } from './accessibility-helpers.js';

test.describe('Draft Weekend welcome', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-09-04T12:00:00Z'));
  });

  test('shows the required honors and dismisses with focus recovery', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Welcome to Draft Weekend, 2026' })).toBeVisible();
    await expect(page.locator('.draft-weekend-scoreboard')).toContainText('2026 Draft Night');
    await expect(page.locator('.draft-weekend-scoreboard')).toContainText('12 Teams • One Board');
    await expect(page.getByText('THE MAIN EVENT IS HERE')).toBeVisible();
    await expect(page.locator('.draft-weekend-confetti i')).toHaveCount(12);
    await expect(page.locator('.draft-weekend-stadium-lights span')).toHaveCount(3);
    const motionNames = await page.locator('.draft-weekend-confetti i, .draft-weekend-stadium-lights span').evaluateAll(elements =>
      elements.map(element => getComputedStyle(element).animationName));
    expect(motionNames.every(name => name !== 'none')).toBe(true);
    const beamAngles = await page.locator('.draft-weekend-stadium-lights span').evaluateAll(elements =>
      elements.map(element => getComputedStyle(element).getPropertyValue('--draft-weekend-beam-angle').trim()));
    expect(beamAngles).toEqual(['24deg', '-4deg', '-25deg']);
    for (const name of ['Reigning Champ: Zook', 'Reigning Saunders: Connor', 'VPC: Shap', 'Commish: Plotnick']) {
      await expect(page.getByRole('article', { name })).toBeVisible();
    }
    await expectNoViolations(page, '[data-draft-weekend-welcome]');
    await page.getByRole('button', { name: /Enter the league/ }).click();
    await expect(page.locator('[data-draft-weekend-welcome]')).toBeHidden();
    await expect(page.locator('#mainContent')).toBeFocused();
  });

  test('reveals every competition finish, final draft slot, and origin story', async ({ page }) => {
    await page.goto('/');
    const cards = await page.locator('.draft-order-card').evaluateAll(elements => elements.map(element => ({
      name: element.querySelector('h4')?.textContent,
      finish: element.querySelector('.draft-order-finish')?.textContent,
      pick: element.querySelector('strong')?.textContent,
      reason: element.querySelector('p')?.textContent,
    })));
    expect(cards).toEqual([
      { name: 'Nuss', finish: 'Competition 1st', pick: 'Drafting #1', reason: 'First legit fish' },
      { name: 'Snare', finish: 'Competition 2nd', pick: 'Drafting #2', reason: 'Chesapeake Chicken; crab got his nipple' },
      { name: 'Haynes', finish: 'Competition 3rd', pick: 'Drafting #5', reason: 'Chesapeake Chicken, ate a fish eye, caught a crab' },
      { name: 'Shap', finish: 'Competition 4th', pick: 'Drafting #7', reason: 'Chesapeake Chicken' },
      { name: 'Connor', finish: 'Competition 5th', pick: 'Drafting #12', reason: 'Chesapeake Chicken; at one point caught a fish but had it overturned' },
      { name: 'Singer', finish: 'Competition 6th', pick: 'Drafting #11', reason: 'Picked Connor' },
      { name: 'Plot', finish: 'Competition 7th', pick: 'Drafting #3', reason: 'Chesapeake Chicken' },
      { name: 'Zubs', finish: 'Competition 8th', pick: 'Drafting #4', reason: 'Ate a fish eye' },
      { name: 'Joel', finish: 'Competition 9th', pick: 'Drafting #10', reason: 'Ate a fish eye' },
      { name: 'Zook', finish: 'Competition 10th', pick: 'Drafting #8', reason: 'Random number generator' },
      { name: 'Shemer', finish: 'Competition 11th', pick: 'Drafting #6', reason: 'Random number generator' },
      { name: 'Rishi', finish: 'Competition 12th', pick: 'Drafting #9', reason: "Random number generator. Originally had the tiebreaker for hitting Nussbaum's fish head-on, but got overruled by Captain Mike" },
    ]);
    await expect(page.locator('[data-draft-order-status]')).toHaveText('Group 1 of 3');
    await page.locator('[data-draft-order-next]').click();
    await expect(page.locator('[data-draft-order-status]')).toHaveText('Group 2 of 3');
    await expect(page.getByRole('article', { name: /Connor finished 5th/ })).toBeVisible();
    await expectNoViolations(page, '[data-draft-order-carousel]');
    await page.locator('[data-draft-order-next]').click();
    await expect(page.locator('[data-draft-order-status]')).toHaveText('Group 3 of 3');
    await expect(page.getByRole('article', { name: /Rishi finished 12th/ })).toBeVisible();
    await expectNoViolations(page, '[data-draft-order-carousel]');
    await page.locator('[data-draft-order-previous]').click();
    await expect(page.locator('[data-draft-order-status]')).toHaveText('Group 2 of 3');
  });

  test('auto-advances every five seconds and can be paused', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('[data-draft-order-status]')).toHaveText('Group 1 of 3');
    await page.clock.fastForward(5000);
    await expect(page.locator('[data-draft-order-status]')).toHaveText('Group 2 of 3');
    await page.locator('[data-draft-order-toggle]').click();
    await expect(page.locator('[data-draft-order-toggle]')).toHaveText('Play slideshow');
    await page.clock.fastForward(6000);
    await expect(page.locator('[data-draft-order-status]')).toHaveText('Group 2 of 3');
  });

  test('stays inside the viewport on compact screens', async ({ page }) => {
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto('/');
      await expect(page.getByRole('heading', { name: 'Welcome to Draft Weekend, 2026' })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.locator('[data-draft-order-next]').click();
      await page.locator('[data-draft-order-next]').click();
      await expect(page.getByRole('article', { name: /Rishi finished 12th/ })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
  });

  test('disables the football motion when reduced motion is requested', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Welcome to Draft Weekend, 2026' })).toBeVisible();
    const animations = await page.locator('.draft-weekend-ball, .draft-weekend-whistle, .draft-weekend-live-dot, .draft-weekend-stadium-lights span, .draft-weekend-confetti i, .draft-weekend-announcement span').evaluateAll(elements =>
      elements.map(element => getComputedStyle(element).animationName));
    expect(animations.every(name => name === 'none')).toBe(true);
    await expect(page.locator('[data-draft-order-toggle]')).toBeHidden();
    await page.clock.fastForward(6000);
    await expect(page.locator('[data-draft-order-status]')).toHaveText('Group 1 of 3');
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

  test('hides when SPA navigation leaves the homepage before Draft chart loading', async ({ page }) => {
    await page.goto('/?tab=draft');
    await expect(page.locator('[data-draft-weekend-welcome]')).toBeHidden();
    await page.locator('#tabPulseBtn').click();
    await expect(page.getByRole('heading', { name: 'Welcome to Draft Weekend, 2026' })).toBeVisible();
    await page.getByText('Tools', { exact: true }).click();
    await page.locator('#primaryNavigation #tabDraftBtn').click();
    await expect(page.locator('[data-draft-weekend-welcome]')).toBeHidden();
    await expect(page.locator('.draft-pick-chart')).toHaveAttribute('data-chart-state', 'ready');
    await page.goto('/?draftMetric=playoffRate');
    await expect(page.locator('[data-draft-weekend-welcome]')).toBeHidden();
  });
});
