import { expect, test } from './coverage-fixture.js';

test.beforeEach(async ({ page }) => {
  const errors = [];
  page.on('console', message => {
    if (message.type() === 'error') errors.push(`console.error: ${message.text()}`);
  });
  page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
  page.__webkitErrors = errors;
});

test.afterEach(async ({ page }) => {
  expect(page.__webkitErrors || []).toEqual([]);
});

test('WEBKIT-01 boots the verified Pulse snapshot without overflow', async ({ page }) => {
  const jsonResponses = [];
  page.on('response', response => {
    if (new URL(response.url()).pathname.includes('/assets/') && response.url().includes('.json')) {
      jsonResponses.push(response.url());
    }
  });
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('tab', { name: 'League Pulse' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tabpanel', { name: 'League Pulse' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '2025 Year in Review' })).toBeVisible();
  await expect(page.locator('.data-freshness summary')).toContainText('2025 season final');
  const diagnostics = await page.evaluate(() => globalThis.darlingDataDiagnostics);
  expect(diagnostics.dataVersion).toMatch(/^sha256:[a-f0-9]{64}$/);
  expect(diagnostics.loadedAssets).toEqual(expect.arrayContaining(['H2H', 'SeasonSummary', 'DerivedStats']));
  expect(jsonResponses.some(url => new URL(url).pathname.endsWith('/assets/asset-manifest.json'))).toBe(true);
  expect(jsonResponses.some(url => new URL(url).searchParams.has('v'))).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test('WEBKIT-02 restores deep links and browser history', async ({ page }) => {
  const routes = [
    {
      url: '/?tab=history&team=Joe&seasons=2024',
      tab: 'League History',
      verify: () => expect(page.locator('#teamSelect')).toHaveValue('Joe'),
    },
    {
      url: '/?tab=rivalry&rivalryTeamA=Joe&rivalryTeamB=Joel',
      tab: 'Head to Head',
      verify: async () => {
        await expect(page.locator('#rivalryTeamA')).toHaveValue('Joe');
        await expect(page.locator('#rivalryTeamB')).toHaveValue('Joel');
      },
    },
    {
      url: '/?tab=trophy&trophyOwner=Joe',
      tab: 'Trophy Case',
      verify: () => expect(page.locator('#trophyOwnerSelect')).toHaveValue('Joe'),
    },
  ];
  for (const route of routes) {
    await page.goto(route.url);
    await expect(page.getByRole('tab', { name: route.tab })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tabpanel', { name: route.tab })).toBeVisible();
    await route.verify();
    await expect(page.locator('#appStatus')).toBeHidden();
  }

  await page.goto('/');
  await page.goto('/?tab=history&team=Joe&seasons=2024');
  const historyUrl = page.url();
  await page.getByRole('tab', { name: 'League Pulse' }).click();
  await page.goBack();
  await expect(page).toHaveURL(historyUrl);
  await expect(page.getByRole('tab', { name: 'League History' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#teamSelect')).toHaveValue('Joe');
});

test('WEBKIT-03 supports mobile manual tab activation and reveal', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/');
  const pulse = page.getByRole('tab', { name: 'League Pulse' });
  const history = page.getByRole('tab', { name: 'League History' });
  await pulse.focus();
  await page.keyboard.press('ArrowRight');
  await expect(history).toBeFocused();
  await expect(history).toHaveAttribute('aria-selected', 'false');
  await expect(page.getByRole('tabpanel', { name: 'League Pulse' })).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(history).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tabpanel', { name: 'League History' })).toBeVisible();
  await expect.poll(() => new URL(page.url()).searchParams.get('tab')).toBe('history');
  expect(await history.evaluate(element => {
    const tab = element.getBoundingClientRect();
    const strip = element.parentElement.getBoundingClientRect();
    return tab.left >= strip.left - 1 && tab.right <= strip.right + 1;
  })).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test('WEBKIT-04 contains focus and restores state for the Dynasty dialog', async ({ page }) => {
  await page.goto('/');
  const opener = page.locator('#dynastyBestWindows .dynasty-window-card').first();
  await page.getByRole('tab', { name: 'Dynasty Rankings' }).click();
  await opener.focus();
  await opener.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('#dynastyWindowModalTitle')).toBeFocused();
  await expect(page.locator('body')).toHaveClass(/no-scroll/);
  const close = dialog.locator('.dynasty-modal-close');
  await close.focus();
  await page.keyboard.press('Shift+Tab');
  expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.locator('body')).not.toHaveClass(/no-scroll/);
  await expect(opener).toBeFocused();

  await opener.click();
  await page.goBack();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('tabpanel', { name: 'League Pulse' })).toBeVisible();
});

test('WEBKIT-05 keeps an interactive History header sticky', async ({ page }) => {
  await page.goto('/?tab=history&team=Joe');
  const shell = page.locator('[data-table-id="history-games"]');
  const scroller = shell.locator('.interactive-table-scroll');
  const header = scroller.locator('thead th').first();
  await expect(shell.locator('tbody tr').first()).toBeVisible();
  expect(await header.evaluate(element => getComputedStyle(element).position)).toBe('sticky');
  await scroller.evaluate(element => {
    element.style.maxHeight = '280px';
    element.style.overflow = 'auto';
    element.scrollTo({ top: 180, left: 120 });
  });
  await expect.poll(async () => {
    const [headerBox, scrollerBox] = await Promise.all([header.boundingBox(), scroller.boundingBox()]);
    return headerBox && scrollerBox ? Math.abs(headerBox.y - scrollerBox.y) <= 2 : false;
  }).toBe(true);
  await shell.locator('.table-expand-button').first().click();
  await expect(shell.locator('.table-expanded-row').first()).toBeVisible();
});

test('WEBKIT-06 preserves the responsive shell and skip target', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/');
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Skip to league content' });
  await expect(skip).toBeFocused();
  await page.keyboard.press('Enter');
  const main = page.locator('#mainContent');
  await expect(main).toBeFocused();
  expect(await main.evaluate(element => {
    const nav = document.querySelector('.primary-nav');
    return element.getBoundingClientRect().top >= nav.getBoundingClientRect().bottom - 1;
  })).toBe(true);
  await page.getByRole('tab', { name: 'Dynasty Rankings' }).click();
  await expect(page.locator('#page-dynasty')).toHaveAttribute('data-feature-state', 'ready');
  await expect(page.locator('.data-freshness summary')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
