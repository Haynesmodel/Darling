import { expect, test } from './coverage-fixture.js';
import { activateFeature, featureDestination } from './navigation-helpers.js';

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
  await expect(featureDestination(page, 'pulse')).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('region', { name: 'League Pulse', exact: true })).toBeVisible();
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
      url: '/?tab=owner&owner=Joe',
      id: 'owner',
      tab: 'Joe Owner Hub',
      verify: () => expect(page.locator('.owner-hub-owner-control select')).toHaveValue('Joe'),
    },
    {
      url: '/?tab=history&team=Joe&seasons=2024',
      id: 'history',
      tab: 'League History',
      verify: () => expect(page.locator('#teamSelect')).toHaveValue('Joe'),
    },
    {
      url: '/?tab=transactions&txView=owners&txOwner=Joe',
      id: 'transactions',
      tab: 'Transactions',
      verify: () => expect(page.locator('#transactions-owners tbody tr')).toHaveCount(1),
    },
    {
      url: '/?tab=rivalry&rivalryTeamA=Joe&rivalryTeamB=Joel',
      id: 'rivalry',
      tab: 'Head to Head',
      verify: async () => {
        await expect(page.locator('#rivalryTeamA')).toHaveValue('Joe');
        await expect(page.locator('#rivalryTeamB')).toHaveValue('Joel');
      },
    },
    {
      url: '/?tab=trophy&trophyOwner=Joe',
      id: 'trophy',
      tab: 'Trophy Case',
      verify: () => expect(page.locator('#trophyOwnerSelect')).toHaveValue('Joe'),
    },
  ];
  for (const route of routes) {
    await page.goto(route.url);
    await page.waitForLoadState('networkidle');
    await expect(featureDestination(page, route.id)).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('region', { name: route.tab, exact: true })).toBeVisible();
    await route.verify();
    await expect(page.locator('#appStatus')).toBeHidden();
  }

  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.goto('/?tab=history&team=Joe&seasons=2024');
  await page.waitForLoadState('networkidle');
  const historyUrl = page.url();
  await featureDestination(page, 'pulse').click();
  await page.goBack();
  await expect(page).toHaveURL(historyUrl);
  await expect(featureDestination(page, 'history')).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('#teamSelect')).toHaveValue('Joe');
});

test('WEBKIT-07 saves and restores My Team', async ({ page }) => {
  await page.goto('/?tab=owner&owner=Joe');
  await page.getByRole('button', { name: 'Make Joe My Team' }).click();
  await expect(page.getByRole('status')).toContainText('Joe is now My Team');
  await page.reload();
  await expect(page.locator('#page-owner-title')).toHaveText('Joe Owner Hub');
  await expect(page.getByText('Current My Team')).toBeVisible();
  await activateFeature(page, 'history');
  await expect(page.locator('#teamSelect')).toHaveValue('Joe');
});

test('WEBKIT-03 supports mobile native navigation activation', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/');
  const owners = page.locator('.primary-nav-group[data-navigation-group="owners"] > summary');
  const myTeam = featureDestination(page, 'owner');
  await owners.focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await expect(myTeam).toBeFocused();
  await expect(page.getByRole('region', { name: 'League Pulse', exact: true })).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(myTeam).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('region', { name: 'My Team', exact: true })).toBeVisible();
  await expect.poll(() => new URL(page.url()).searchParams.get('tab')).toBe('owner');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test('WEBKIT-04 contains focus and restores state for the Dynasty dialog', async ({ page }) => {
  await page.goto('/');
  const opener = page.locator('#dynastyBestWindows .dynasty-window-card').first();
  await activateFeature(page, 'dynasty');
  await page.locator('#dynasty-section-jump').selectOption('dynasty-windows');
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
  await expect(page.getByRole('region', { name: 'League Pulse', exact: true })).toBeVisible();
});

test('WEBKIT-05 keeps an interactive History header sticky', async ({ page }) => {
  await page.goto('/?tab=history&team=Joe');
  await page.locator('#history-section-jump').selectOption('history-games');
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

test('WEBKIT-09 mounts interactive tables across History, Rivalry, and Trophy', async ({ page }) => {
  await page.goto('/?tab=history&team=Joe');
  await page.locator('#history-section-jump').selectOption('history-games');
  const history = page.locator('[data-table-id="history-games"]');
  await expect(history.locator('tbody > tr:not(.table-expanded-row)')).not.toHaveCount(0);
  await history.locator('.table-expand-button').first().click();
  await expect(history.locator('.table-expanded-row').first()).toBeVisible();

  await page.goto('/?tab=rivalry&rivalryTeamA=Joe&rivalryTeamB=Joel');
  await page.locator('#rivalry-section-jump').selectOption('rivalry-games');
  const rivalry = page.locator('[data-table-id="rivalry-games"]');
  await expect(rivalry.locator('tbody > tr:not(.table-expanded-row)')).not.toHaveCount(0);
  await rivalry.getByRole('button', { name: 'Last five meetings' }).click();
  await rivalry.locator('.table-expand-button').first().click();
  await expect(rivalry.locator('.table-expanded-row').first()).toContainText('Running series record');

  await page.goto('/?tab=trophy&trophyOwner=Joe');
  await page.locator('#trophyLedgerDisclosure > summary').click();
  const trophy = page.locator('[data-table-id="trophy-seasons"]');
  await expect(trophy.locator('tbody > tr:not(.table-expanded-row)')).not.toHaveCount(0);
  await trophy.locator('.table-expand-button').first().click();
  await expect(trophy.locator('.table-expanded-row').first()).toContainText('Game log');
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
  await activateFeature(page, 'dynasty');
  await expect(page.locator('#page-dynasty')).toHaveAttribute('data-feature-state', 'ready');
  await expect(page.locator('.data-freshness summary')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test('WEBKIT-08 loads the Rivalry chart through the no-observer keyboard fallback', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'IntersectionObserver', { configurable: true, value: undefined });
  });
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto('/?tab=rivalry&rivalryTeamA=Joe&rivalryTeamB=Joel');
  await page.locator('#rivalry-section-jump').selectOption('rivalry-trend');
  const load = page.getByRole('button', { name: 'Load Lead Trend chart' });
  await load.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#rivalryLeadPlot')).toHaveAttribute('data-chart-state', 'ready');
  await expect(page.locator('#rivalryLeadPlot svg[role="img"]')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
