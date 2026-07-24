import { expect, test } from './coverage-fixture.js';
import { activateFeature, featureDestination } from './navigation-helpers.js';

test('primary navigation exposes five semantic controls and all eight canonical destinations', async ({ page }) => {
  await page.goto('/');
  const navigation = page.locator('#primaryNavigation');
  await expect(navigation.locator(':scope > .primary-nav-control, :scope > .primary-nav-group')).toHaveCount(5);
  await expect(page.getByRole('link', { name: /Home/ })).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('[data-feature-id]')).toHaveCount(8);
  await expect(page.locator('#page-pulse')).toHaveAttribute('data-feature-state', 'ready');
  expect(await page.evaluate(() => ({
    activeFeature: window.darlingFeatureDiagnostics.activeFeature,
    activationCount: window.darlingFeatureDiagnostics.activationCount,
    registeredFeatures: Object.keys(window.darlingFeatureDiagnostics.features).length,
  }))).toEqual({
    activeFeature: 'pulse',
    activationCount: 1,
    registeredFeatures: 8,
  });
  await page.getByText('Owners', { exact: true }).click();
  await expect(featureDestination(page, 'history')).toBeVisible();
  await expect(featureDestination(page, 'trophy')).toBeVisible();
  await expect(featureDestination(page, 'dynasty')).toBeVisible();
  await expect(featureDestination(page, 'history')).toHaveAttribute('href', /[?&]tab=history$/);

  await page.getByText('Tools', { exact: true }).click();
  await expect(page.locator('.primary-nav-group[data-navigation-group="owners"]')).not.toHaveAttribute('open', '');
  await expect(featureDestination(page, 'draft')).toBeVisible();
  await expect(featureDestination(page, 'gauntlet')).toBeVisible();
  await expect(featureDestination(page, 'gauntlet')).toHaveAttribute('href', /[?&]tab=gauntlet$/);
});

test('coverage build exercises the fallback freshness contract in authored coordinates', async ({ page }) => {
  test.skip(!process.env.COLLECT_COVERAGE, 'The source module is available only from the instrumented development server.');
  await page.goto('/');
  expect(await page.evaluate(async () => {
    const { createFallbackFreshness } = await import('/src/app/app-controller.ts');
    const assessment = { state: 'final', detail: 'Season complete' };
    const runtime = createFallbackFreshness(assessment);
    runtime.publish({ ignored: true });
    const unsubscribe = runtime.subscribe(() => {});
    return {
      current: runtime.current(),
      assessment: runtime.currentAssessment(),
      unsubscribed: unsubscribe(),
    };
  })).toEqual({
    current: null,
    assessment: { state: 'final', detail: 'Season complete' },
    unsubscribed: undefined,
  });
});

test('grouped menus close with Escape, outside activation, and destination selection', async ({ page }) => {
  await page.goto('/');
  const owners = page.getByText('Owners', { exact: true });
  const ownersGroup = page.locator('.primary-nav-group[data-navigation-group="owners"]');
  await owners.focus();
  await page.keyboard.press('Enter');
  await expect(ownersGroup).toHaveAttribute('open', '');
  await page.keyboard.press('Escape');
  await expect(ownersGroup).not.toHaveAttribute('open', '');
  await expect(owners).toBeFocused();

  await owners.click();
  await page.locator('#mainContent').click({ position: { x: 1, y: 1 } });
  await expect(ownersGroup).not.toHaveAttribute('open', '');

  await activateFeature(page, 'dynasty');
  await expect(page.locator('#page-dynasty')).toHaveAttribute('data-feature-state', 'ready');
  await expect(ownersGroup).not.toHaveAttribute('open', '');
  await expect(featureDestination(page, 'dynasty')).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('[data-feature-id][aria-current="page"]')).toHaveCount(1);
  await expect(ownersGroup).toHaveClass(/is-current-group/);
  await expect(ownersGroup.locator('[data-current-group-label]')).toHaveText(/current page: Dynasty Rankings/);
});

test('primary navigation has no horizontal overflow at required viewports', async ({ page }) => {
  for (const width of [320, 390, 768, 1280, 1440]) {
    await page.setViewportSize({ width, height: width < 700 ? 844 : 900 });
    await page.goto('/');
    await expect(page.locator('#page-pulse')).toHaveAttribute('data-feature-state', 'ready');
    const geometry = await page.locator('#primaryNavigation').evaluate(element => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
      documentClientWidth: document.documentElement.clientWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
    }));
    expect(geometry.scrollWidth, `${width}px navigation overflow`).toBeLessThanOrEqual(geometry.clientWidth);
    expect(geometry.documentScrollWidth, `${width}px document overflow`).toBeLessThanOrEqual(geometry.documentClientWidth);
  }
});

test('Pulse keeps its full hero while analytical routes publish compact chrome', async ({ page }) => {
  for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 800 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await expect(page.locator('#page-pulse')).toHaveAttribute('data-feature-state', 'ready');
    const pulse = await page.evaluate(() => ({
      mode: document.documentElement.dataset.heroMode,
      hero: document.querySelector('.site-hero').getBoundingClientRect().height,
    }));
    expect(pulse.mode).toBe('full');
    expect(pulse.hero).toBeGreaterThanOrEqual(viewport.width === 390 ? 260 : 360);
    expect(pulse.hero).toBeLessThanOrEqual(viewport.width === 390 ? 300 : 400);

    for (const id of ['history', 'current', 'rivalry', 'trophy', 'dynasty', 'draft', 'gauntlet']) {
      await page.goto(`/?tab=${id}`);
      await expect(page.locator(`#page-${id}`)).toHaveAttribute('data-feature-state', 'ready');
      const compact = await page.evaluate(() => ({
        mode: document.documentElement.dataset.heroMode,
        hero: document.querySelector('.site-hero').getBoundingClientRect().height,
        mainTop: document.querySelector('main').getBoundingClientRect().top,
      }));
      expect(compact.mode).toBe('compact');
      expect(compact.hero, `${id} compact hero at ${viewport.width}px`).toBeLessThanOrEqual(180);
      expect(compact.mainTop, `${id} main top at ${viewport.width}px`).toBeLessThanOrEqual(260);
    }
  }
});

test('modifier activation remains a normal link and leaves the current SPA unchanged', async ({ page, context }) => {
  await page.goto('/');
  await page.getByText('Tools', { exact: true }).click();
  const popupPromise = context.waitForEvent('page');
  await featureDestination(page, 'draft').click({ button: 'middle' });
  const popup = await popupPromise;
  await popup.waitForLoadState('networkidle');
  await expect(popup.locator('#page-draft')).toHaveAttribute('data-feature-state', 'ready');
  await expect(page.locator('#page-pulse')).toBeVisible();
  await expect(page).not.toHaveURL(/tab=draft/);
  await popup.close();
});
