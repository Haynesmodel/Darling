import { expect, test } from './coverage-fixture.js';
import { activateFeature, featureDestination } from './navigation-helpers.js';

test('data freshness disclosure uses native keyboard activation', async ({ page }) => {
  await page.goto('/');
  const summary = page.locator('.data-freshness summary');
  const details = page.locator('.data-freshness');
  await summary.focus();
  await page.keyboard.press('Enter');
  await expect(details).toHaveAttribute('open', '');
  await expect(summary).toBeFocused();
  await page.keyboard.press('Space');
  await expect(details).not.toHaveAttribute('open', '');
});

test('Rivalry manual chart fallback is keyboard reachable and does not move focus', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'IntersectionObserver', { configurable: true, value: undefined });
  });
  await page.goto('/?tab=rivalry&rivalryTeamA=Joe&rivalryTeamB=Joel');
  await page.locator('#rivalry-section-jump').selectOption('rivalry-trend');
  const load = page.getByRole('button', { name: 'Load Lead Trend chart' });
  await load.focus();
  await expect(load).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#rivalryLeadPlot')).toHaveAttribute('data-chart-state', 'ready');
  await expect(page.locator('#rivalryLeadPlot svg[role="img"]')).toBeVisible();
});

test('primary navigation uses native link and disclosure keyboard order', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  const pulse = featureDestination(page, 'pulse');
  const current = featureDestination(page, 'current');
  const owners = page.locator('.primary-nav-group[data-navigation-group="owners"] > summary');
  const owner = featureDestination(page, 'owner');
  const transactions = featureDestination(page, 'transactions');
  const history = featureDestination(page, 'history');
  const rivalry = featureDestination(page, 'rivalry');
  const tools = page.locator('.primary-nav-group[data-navigation-group="tools"] > summary');

  await expect(pulse).toHaveAttribute('aria-current', 'page');
  await page.locator('[data-theme-preference="dark"]').focus();
  await page.keyboard.press('Tab');
  await expect(pulse).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(current).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(owners).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('.primary-nav-group[data-navigation-group="owners"]')).toHaveAttribute('open', '');
  await page.keyboard.press('Tab');
  await expect(owner).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(transactions).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(history).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(history).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('region', { name: 'League History', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'League Pulse', exact: true })).toBeHidden();

  await rivalry.focus();
  await page.keyboard.press('Tab');
  await expect(tools).toBeFocused();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  await expect(tools).toBeFocused();
  await expect(page.locator('.primary-nav-group[data-navigation-group="tools"]')).not.toHaveAttribute('open', '');
});

test('Draft Spot pick board supports spatial arrows, Home, End, and selection', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?tab=draft&draftMode=pick&draftPick=10');
  await page.waitForLoadState('networkidle');
  const picks = page.locator('.draft-pick-card:not(.empty)');
  await expect(picks.first()).toBeVisible();
  await picks.first().focus();
  await page.keyboard.press('End');
  await expect(picks.last()).toBeFocused();
  await page.keyboard.press('Home');
  await expect(picks.first()).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(picks.nth(1)).toBeFocused();
  await page.keyboard.press('ArrowDown');
  expect(await page.evaluate(() => document.activeElement?.classList.contains('draft-pick-card'))).toBe(true);
  await page.keyboard.press('Enter');
  await expect.poll(() => new URL(page.url()).searchParams.get('draftPick')).not.toBeNull();
  await expect(page.locator('.draft-pick-card[aria-pressed="true"]')).toHaveCount(1);
});

test('Draft Spot spatial navigation drops buttons removed by filters', async ({ page }) => {
  await page.goto('/?tab=draft&draftMode=pick&draftPick=1');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('.draft-pick-card[data-draft-pick="2"]')).toBeVisible();

  await page.locator('#draftOwnerSelect').selectOption('Joe');
  await page.locator('#draft-section-jump').selectOption('draft-picks');
  const visiblePicks = page.locator('.draft-pick-card:not(.empty)');
  await expect(visiblePicks).toHaveCount(5);
  const pickOne = page.locator('.draft-pick-card[data-draft-pick="1"]');
  const pickThree = page.locator('.draft-pick-card[data-draft-pick="3"]');
  await pickOne.focus();
  await page.keyboard.press('ArrowRight');
  await expect(pickThree).toBeFocused();
});

test('browser navigation restores current destination and visible named section', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await activateFeature(page, 'gauntlet');
  await activateFeature(page, 'trophy');
  await page.goBack();

  const gauntlet = featureDestination(page, 'gauntlet');
  await expect(gauntlet).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('region', { name: 'Historical Matchup', exact: true })).toBeVisible();
  await expect(page.locator('.primary-nav-group[data-navigation-group="tools"]')).toHaveClass(/is-current-group/);
});

test('native primary links do not emulate arrow-key focus movement', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  const pulse = featureDestination(page, 'pulse');
  await pulse.focus();
  await page.keyboard.press('ArrowRight');
  await expect(pulse).toBeFocused();
  await expect(pulse).toHaveAttribute('aria-current', 'page');
});

test('facet disclosure supports Arrow, Home, End, Space, Tab, and Escape', async ({ page }) => {
  await page.goto('/?tab=history');
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

test('shared controls keep lightweight states, native selection, disabled semantics, and touch targets', async ({ page }) => {
  await page.goto('/?tab=dynasty');
  await page.waitForLoadState('networkidle');

  const mode = page.locator('#dynastyModeSelect');
  const resting = await mode.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      topBorder: style.borderTopWidth,
      inlineStartBorder: style.borderLeftWidth,
      bottomBorder: style.borderBottomWidth,
      bottomBorderStyle: style.borderBottomStyle,
      background: style.backgroundColor,
    };
  });
  expect(resting.topBorder).toBe('0px');
  expect(resting.inlineStartBorder).toBe('0px');
  expect(resting.bottomBorder).toBe('1px');
  expect(resting.bottomBorderStyle).toBe('solid');
  expect(resting.background).toBe('rgba(0, 0, 0, 0)');

  await mode.focus();
  const focused = await mode.evaluate((element) => {
    const style = getComputedStyle(element);
    return { outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth };
  });
  expect(focused.outlineStyle).toBe('solid');
  expect(Number.parseFloat(focused.outlineWidth)).toBeGreaterThanOrEqual(3);

  await mode.selectOption('rolling-3');
  await expect(mode).toHaveValue('rolling-3');
  await mode.selectOption('all-time');
  await expect(page.locator('#dynastyOwnerSelect')).toBeDisabled();
  await expect(page.locator('#dynastyOwnerSelect')).toHaveCSS('opacity', '0.55');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?tab=history');
  await page.waitForLoadState('networkidle');
  const toggle = page.locator('.dropdown-toggle[data-target="seasonFilters"]');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  const open = await toggle.evaluate((element) => {
    const style = getComputedStyle(element);
    return { background: style.backgroundColor, border: style.borderBottomColor };
  });
  expect(open.background).not.toBe('rgba(0, 0, 0, 0)');
  expect(open.border).not.toBe('rgba(0, 0, 0, 0)');
  const firstOptionHeight = await page.locator('#seasonFilters label').first().evaluate((element) => element.getBoundingClientRect().height);
  expect(firstOptionHeight).toBeGreaterThanOrEqual(44);
  await page.keyboard.press('Escape');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');

  await page.locator('#historyGamesDisclosure > summary').click();
  await page.locator('[data-table-id="history-games"] .table-filter-menu > summary').click();
  const tableFilter = page.locator('[data-table-id="history-games"] .table-filter-field').first().locator('input, select');
  const tableFilterStyle = await tableFilter.evaluate((element) => {
    const style = getComputedStyle(element);
    return { topBorder: style.borderTopWidth, bottomBorder: style.borderBottomWidth, background: style.backgroundColor };
  });
  expect(tableFilterStyle.topBorder).toBe('0px');
  expect(tableFilterStyle.bottomBorder).toBe('1px');
  expect(tableFilterStyle.background).toBe('rgba(0, 0, 0, 0)');

  const assertLightweightRestingStyle = async (locator) => {
    const style = await locator.evaluate((element) => {
      const computed = getComputedStyle(element);
      return {
        topBorder: computed.borderTopWidth,
        inlineStartBorder: computed.borderLeftWidth,
        bottomBorder: computed.borderBottomWidth,
        bottomBorderStyle: computed.borderBottomStyle,
        background: computed.backgroundColor,
      };
    });
    expect(style.topBorder).toBe('0px');
    expect(style.inlineStartBorder).toBe('0px');
    expect(style.bottomBorder).toBe('1px');
    expect(style.bottomBorderStyle).toBe('solid');
    expect(style.background).toBe('rgba(0, 0, 0, 0)');
  };

  await page.goto('/?tab=trophy');
  await page.waitForLoadState('networkidle');
  await assertLightweightRestingStyle(page.locator('.trophy-toolbar select'));

  await page.goto('/?tab=gauntlet&ga=Joe%3A2024&gb=Zook%3A2019');
  await page.waitForLoadState('networkidle');
  await assertLightweightRestingStyle(page.locator('.gauntlet-controls-grid .gauntlet-field select').first());

  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await assertLightweightRestingStyle(page.locator('.pulse-newspaper-controls select').first());

  await page.goto('/?tab=transactions&txView=players');
  await page.waitForLoadState('networkidle');
  await assertLightweightRestingStyle(page.locator('.transaction-player-control input'));
  await assertLightweightRestingStyle(page.locator('.transaction-player-control select'));
});

test('Dynasty dialog contains focus, locks the page, ignores search shortcuts, and restores its opener', async ({ page }) => {
  await page.goto('/?tab=dynasty');
  await page.waitForLoadState('networkidle');
  await page.locator('#dynasty-section-jump').selectOption('dynasty-windows');
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

test('Dynasty lowest-score rows are single-box keyboard buttons with focus restoration', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await activateFeature(page, 'dynasty');
  await page.locator('#dynastyModeSelect').selectOption('rolling-5');
  await page.locator('#dynastyStartSeason').selectOption('2014');
  await page.locator('#dynastyEndSeason').selectOption('2023');
  await page.waitForFunction(() => document.querySelectorAll('#dynastySlumps .dynasty-slump-item').length > 0);
  await page.locator('#dynasty-section-jump').selectOption('dynasty-slumps');

  const button = page.locator('#dynastySlumps .dynasty-slump-card').first().locator('.dynasty-slump-item').first();
  const row = button.locator('..');
  await expect(row).toHaveClass(/dynasty-slump-interactive-row/);
  await expect(button).toHaveCSS('min-height', '44px');
  await expect(row).toHaveCSS('border-top-width', '0px');
  await expect(button).toHaveCSS('border-top-width', '1px');

  await button.focus();
  await page.keyboard.press('Enter');
  const dialog = page.locator('#dynastyWindowModal');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('#dynastyWindowModalTitle')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(button).toBeFocused();

  await page.keyboard.press('Space');
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(button).toBeFocused();
});

test('browser Back closes the Dynasty dialog before hiding its feature section', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  const pulse = featureDestination(page, 'pulse');
  await activateFeature(page, 'dynasty');
  await page.locator('#dynasty-section-jump').selectOption('dynasty-windows');
  await page.locator('#dynastyBestWindows .dynasty-window-card').first().click();

  const dialog = page.locator('#dynastyWindowModal');
  await expect(dialog).toBeVisible();
  await expect(page.locator('body')).toHaveClass(/no-scroll/);
  await page.goBack();

  await expect(dialog).toBeHidden();
  await expect(dialog).toBeEmpty();
  await expect(page.locator('body')).not.toHaveClass(/no-scroll/);
  await expect(page.getByRole('region', { name: 'League Pulse', exact: true })).toBeVisible();
  await expect(pulse).toBeFocused();
  await expect.poll(() => page.evaluate(() => ({
    tab: new URL(window.location.href).searchParams.get('tab'),
    header: document.querySelector('header h2')?.textContent,
    title: document.title,
    accentTheme: document.documentElement.dataset.accentTheme,
    ownerTheme: document.documentElement.dataset.ownerTheme || null,
    seasonMode: document.documentElement.dataset.seasonMode,
    selectedTab: document.querySelector('[data-feature-id][aria-current="page"]')?.id,
    visiblePanel: document.querySelector('.page:not([hidden])')?.id,
  }))).toEqual({
    tab: null,
    header: 'League Pulse',
    title: '2025 Year in Review',
    accentTheme: 'league',
    ownerTheme: null,
    seasonMode: 'regular',
    selectedTab: 'tabPulseBtn',
    visiblePanel: 'page-pulse',
  });
});

test('repeating the search shortcut does not retain a duplicate scroll lock', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  const trigger = page.locator('.search-trigger');
  const shortcut = process.platform === 'darwin' ? 'Meta+K' : 'Control+K';
  await trigger.focus();
  await page.keyboard.press(shortcut);
  await expect(page.getByRole('dialog', { name: 'Search The Darling' })).toBeVisible();
  await expect(page.locator('body')).toHaveClass(/no-scroll/);
  await page.keyboard.press(shortcut);
  await page.keyboard.press('Escape');

  await expect(page.getByRole('dialog', { name: 'Search The Darling' })).toBeHidden();
  await expect(page.locator('body')).not.toHaveClass(/no-scroll/);
  await expect(trigger).toBeFocused();
});

test('command palette wraps focus in both Tab directions', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.locator('.search-trigger').click();

  const dialog = page.getByRole('dialog', { name: 'Search The Darling' });
  const first = dialog.getByRole('button', { name: 'Close search' });
  const last = dialog.getByRole('option').last();
  await expect(dialog).toBeVisible();
  await expect(last).toBeVisible();
  await expect(dialog.getByRole('combobox')).toBeFocused();

  await first.focus();
  await page.keyboard.press('Shift+Tab');
  await expect(last).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(first).toBeFocused();
});

test('the Dynasty heatmap is locally scrollable on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?tab=dynasty');
  await page.waitForLoadState('networkidle');
  await page.locator('#dynasty-section-jump').selectOption('dynasty-heatmap');
  const heatmap = page.getByRole('region', { name: 'Dynasty rankings by season', exact: true });
  await expect(heatmap).toBeVisible();
  const metrics = await heatmap.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
    overflowX: getComputedStyle(element).overflowX,
    mainOverflowX: getComputedStyle(document.querySelector('main')).overflowX,
  }));
  expect(metrics.scrollWidth).toBeGreaterThan(metrics.clientWidth);
  expect(metrics.overflowX).toBe('auto');
  expect(metrics.mainOverflowX).not.toBe('hidden');
  await heatmap.evaluate(element => element.scrollTo({ left: element.scrollWidth }));
  await expect.poll(() => heatmap.evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
  await heatmap.focus();
  await expect(heatmap).toBeFocused();
  const focusOutline = await heatmap.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      color: style.outlineColor,
      style: style.outlineStyle,
      width: Number.parseFloat(style.outlineWidth),
    };
  });
  expect(focusOutline.style).toBe('solid');
  expect(focusOutline.width).toBeGreaterThanOrEqual(2);
  expect(focusOutline.color).not.toBe('transparent');
  expect(focusOutline.color).not.toBe('rgba(0, 0, 0, 0)');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
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
    await page.locator('#dynasty-section-jump').selectOption('dynasty-windows');
    await page.locator('#dynastyBestWindows .dynasty-window-card').first().click();
    const modal = page.locator('#dynastyWindowModal');
    await expect(modal).toBeVisible();
    const box = await modal.boundingBox();
    expect(box).not.toBeNull();
    expect(box.width).toBeLessThanOrEqual(viewport.width);
    expect(box.height).toBeLessThanOrEqual(viewport.height);
  });
}
