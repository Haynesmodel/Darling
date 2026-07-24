import { expect, test } from './coverage-fixture.js';

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

test('primary tabs use manual activation with roving focus', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  const pulse = page.getByRole('tab', { name: 'League Pulse' });
  const history = page.getByRole('tab', { name: 'League History' });
  const current = page.getByRole('tab', { name: 'Current Season' });
  const gauntlet = page.getByRole('tab', { name: 'Historical Matchup' });

  await expect(pulse).toHaveAttribute('aria-selected', 'true');
  await expect(pulse).toHaveAttribute('tabindex', '0');
  await expect(history).toHaveAttribute('tabindex', '-1');
  await expect(current).toHaveAttribute('tabindex', '-1');
  await page.locator('[data-theme-preference="dark"]').focus();
  await page.keyboard.press('Tab');
  await expect(pulse).toBeFocused();
  await pulse.focus();
  await page.keyboard.press('ArrowLeft');
  await expect(gauntlet).toBeFocused();
  await expect(gauntlet).toHaveAttribute('aria-selected', 'false');
  await expect(page.getByRole('tabpanel', { name: 'League Pulse' })).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(pulse).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(history).toBeFocused();
  await expect(history).toHaveAttribute('aria-selected', 'false');
  await expect(page.getByRole('tabpanel', { name: 'League Pulse' })).toBeVisible();

  await page.keyboard.press('Enter');
  await expect(history).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tabpanel', { name: 'League History' })).toBeVisible();
  await expect(page.getByRole('tabpanel', { name: 'League Pulse' })).toBeHidden();

  await page.keyboard.press('End');
  await expect(gauntlet).toBeFocused();
  await page.keyboard.press(' ');
  await expect(gauntlet).toHaveAttribute('aria-selected', 'true');
  await expect.poll(() => new URL(page.url()).searchParams.get('tab')).toBe('gauntlet');

  await page.keyboard.press('Home');
  await expect(pulse).toBeFocused();
  await expect(pulse).toHaveAttribute('aria-selected', 'false');
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
  const visiblePicks = page.locator('.draft-pick-card:not(.empty)');
  await expect(visiblePicks).toHaveCount(5);
  const pickOne = page.locator('.draft-pick-card[data-draft-pick="1"]');
  const pickThree = page.locator('.draft-pick-card[data-draft-pick="3"]');
  await pickOne.focus();
  await page.keyboard.press('ArrowRight');
  await expect(pickThree).toBeFocused();
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
    const previous = document.querySelector('#tabScrollPrev');
    const next = document.querySelector('#tabScrollNext');
    const tabBox = tab.getBoundingClientRect();
    const stripBox = strip.getBoundingClientRect();
    const visibleEdge = (control, edge) => {
      if (!control || control.hidden || getComputedStyle(control).display === 'none') return edge === 'start' ? stripBox.left : stripBox.right;
      const box = control.getBoundingClientRect();
      return edge === 'start' ? Math.max(stripBox.left, box.right) : Math.min(stripBox.right, box.left);
    };
    return tabBox.left >= visibleEdge(previous, 'start') - 1
      && tabBox.right <= visibleEdge(next, 'end') + 1;
  })).toBe(true);
});

test('wrapped edge focus is revealed in the mobile tab strip without activating it', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  const pulse = page.getByRole('tab', { name: 'League Pulse' });
  const gauntlet = page.getByRole('tab', { name: 'Historical Matchup' });
  await pulse.focus();
  await page.keyboard.press('ArrowLeft');
  await expect(gauntlet).toBeFocused();
  await expect(pulse).toHaveAttribute('aria-selected', 'true');
  await expect.poll(() => gauntlet.evaluate(tab => {
    const strip = tab.parentElement;
    const tabBox = tab.getBoundingClientRect();
    const stripBox = strip.getBoundingClientRect();
    return tabBox.left >= stripBox.left - 1 && tabBox.right <= stripBox.right + 1;
  })).toBe(true);
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

test('browser Back closes the Dynasty dialog before hiding its tabpanel', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  const pulse = page.getByRole('tab', { name: 'League Pulse' });
  await page.getByRole('tab', { name: 'Dynasty Rankings' }).click();
  await page.locator('#dynastyBestWindows .dynasty-window-card').first().click();

  const dialog = page.locator('#dynastyWindowModal');
  await expect(dialog).toBeVisible();
  await expect(page.locator('body')).toHaveClass(/no-scroll/);
  await page.goBack();

  await expect(dialog).toBeHidden();
  await expect(dialog).toBeEmpty();
  await expect(page.locator('body')).not.toHaveClass(/no-scroll/);
  await expect(page.getByRole('tabpanel', { name: 'League Pulse' })).toBeVisible();
  await expect(pulse).toBeFocused();
  await expect.poll(() => page.evaluate(() => ({
    tab: new URL(window.location.href).searchParams.get('tab'),
    header: document.querySelector('header h2')?.textContent,
    title: document.title,
    accentTheme: document.documentElement.dataset.accentTheme,
    ownerTheme: document.documentElement.dataset.ownerTheme || null,
    seasonMode: document.documentElement.dataset.seasonMode,
    selectedTab: document.querySelector('[role="tab"][aria-selected="true"]')?.id,
    visiblePanel: document.querySelector('[role="tabpanel"]:not([hidden])')?.id,
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
  const heatmap = page.getByRole('region', { name: 'Dynasty rankings by season' });
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
    await page.locator('#dynastyBestWindows .dynasty-window-card').first().click();
    const box = await page.locator('#dynastyWindowModal').boundingBox();
    expect(box.width).toBeLessThanOrEqual(viewport.width);
    expect(box.height).toBeLessThanOrEqual(viewport.height);
  });
}
