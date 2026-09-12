import { expect, test } from './coverage-fixture.js';
import { activateFeature, featureDestination } from './navigation-helpers.js';

const PREFERENCE_KEY = 'darling.favoriteOwner.v1';

async function seedFavorite(page, owner = 'Joe') {
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), {
    key: PREFERENCE_KEY,
    value: owner,
  });
}

test('first visit stays neutral until preview is explicitly saved as My Team', async ({ page }) => {
  await page.goto('/?tab=owner');
  await expect(page.getByRole('region', { name: 'My Team', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Choose an owner' })).toBeVisible();
  await expect(page.locator('.owner-hub-grid')).toHaveCount(0);
  await expect(page.locator('.owner-hub-owner-control select')).toHaveValue('');
  await expect(featureDestination(page, 'owner')).toHaveAttribute('href', /[?&]tab=owner$/);

  await page.locator('.owner-hub-owner-control select').selectOption('Joe');
  await expect(page).toHaveURL(/[?&]owner=Joe(?:&|$)/);
  await expect(page.locator('.owner-hub-lead').getByRole('heading', { level: 3, name: 'Joe', exact: true })).toBeVisible();
  expect(await page.evaluate(key => localStorage.getItem(key), PREFERENCE_KEY)).toBeNull();
  await page.locator('.owner-hub-owner-control select').selectOption('');
  await page.locator('.owner-hub-owner-control select').selectOption('Joe');

  await page.getByRole('button', { name: 'Make Joe My Team' }).click();
  await expect(page.getByRole('status')).toContainText('Joe is now My Team');
  expect(await page.evaluate(key => localStorage.getItem(key), PREFERENCE_KEY)).toBe('Joe');
  await expect(featureDestination(page, 'owner')).toHaveAttribute('href', /[?&]owner=Joe(?:&|$)/);

  await page.reload();
  await expect(page.locator('#page-owner-title')).toHaveText('Joe Owner Hub');
  await expect(page.getByText('Current My Team')).toBeVisible();
});

test('clearing My Team preserves the explicit Owner Hub preview', async ({ page }) => {
  await seedFavorite(page);
  await page.goto('/?tab=owner&owner=Joe');
  await page.getByRole('button', { name: 'Clear My Team' }).click();
  await expect(page).toHaveURL(/[?&]owner=Joe(?:&|$)/);
  await expect(page.locator('.owner-hub-lead').getByRole('heading', { level: 3, name: 'Joe', exact: true })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('My Team cleared');
  expect(await page.evaluate(key => localStorage.getItem(key), PREFERENCE_KEY)).toBeNull();
});

test('a bare Hub follows cross-tab preference changes and makes clear state explicit', async ({ page }) => {
  await seedFavorite(page, 'Joe');
  await page.goto('/?tab=owner');
  await expect(page.locator('.owner-hub-owner-control select')).toHaveValue('Joe');

  await page.evaluate(key => {
    localStorage.setItem(key, 'Joel');
    dispatchEvent(new StorageEvent('storage', { key, newValue: 'Joel' }));
  }, PREFERENCE_KEY);
  await expect(page.locator('.owner-hub-owner-control select')).toHaveValue('Joel');
  await expect(page.locator('#page-owner-title')).toHaveText('Joel Owner Hub');
  await expect(page.locator('html')).toHaveAttribute('data-accent-theme', 'owner');

  await page.getByRole('button', { name: 'Clear My Team' }).click();
  await expect(page).toHaveURL(/[?&]owner=Joel(?:&|$)/);
  await expect(page.locator('.owner-hub-owner-control select')).toHaveValue('Joel');
});

test('explicit shared URLs override My Team without changing the saved preference', async ({ page }) => {
  await seedFavorite(page, 'Joe');
  const cases = [
    ['/?tab=history&team=Joel', '#teamSelect', 'Joel'],
    ['/?tab=current&currentOwner=Joel', '#currentOwnerSelect', 'Joel'],
    ['/?tab=trophy&trophyOwner=Joel', '#trophyOwnerSelect', 'Joel'],
    ['/?tab=dynasty&dynastyMode=calculator&dynastyOwner=Joel', '#dynastyOwnerSelect', 'Joel'],
    ['/?tab=draft&draftMode=owner&draftOwner=Joel', '#draftOwnerSelect', 'Joel'],
    ['/?tab=rivalry&rivalryTeamA=Joel&rivalryTeamB=Joe', '#rivalryTeamA', 'Joel'],
  ];
  for (const [url, selector, value] of cases) {
    await page.goto(url);
    await expect(page.locator(selector)).toHaveValue(value);
  }
  expect(await page.evaluate(key => localStorage.getItem(key), PREFERENCE_KEY)).toBe('Joe');
});

test('partial owner deep links select their owner-specific modes', async ({ page }) => {
  await page.goto('/?tab=dynasty&dynastyOwner=Joel');
  await expect(page.locator('#dynastyModeSelect')).toHaveValue('calculator');
  await expect(page.locator('#dynastyOwnerSelect')).toHaveValue('Joel');

  await page.goto('/?tab=draft&draftOwner=Joel');
  await expect(page.locator('#draftModeSelect')).toHaveValue('owner');
  await expect(page.locator('#draftOwnerSelect')).toHaveValue('Joel');
});

test('fresh feature defaults use My Team', async ({ page }) => {
  await seedFavorite(page, 'Joe');

  await page.goto('/?tab=history');
  await expect(page.locator('#teamSelect')).toHaveValue('Joe');
  await page.goto('/?tab=current');
  await expect(page.locator('#currentOwnerSelect')).toHaveValue('Joe');
  await page.goto('/?tab=trophy');
  await expect(page.locator('#trophyOwnerSelect')).toHaveValue('Joe');
  await page.goto('/?tab=draft');
  await expect(page.locator('#draftOwnerSelect')).toHaveValue('Joe');
  await page.goto('/?tab=rivalry');
  await expect(page.locator('#rivalryTeamA')).toHaveValue('Joe');
});

test('without My Team, neutral feature defaults remain league-wide', async ({ page }) => {
  await page.goto('/?tab=history');
  await expect(page.locator('#teamSelect')).toHaveValue('__ALL__');
  await page.goto('/?tab=dynasty');
  await expect(page.locator('#dynastyModeSelect')).toHaveValue('all-time');
  await page.goto('/?tab=rivalry');
  await expect(page.locator('#rivalryTeamA')).not.toHaveValue('');
});

test('an invalid owner URL shows a recovery state and preserves My Team', async ({ page }) => {
  await seedFavorite(page, 'Joe');
  await page.goto('/?tab=owner&owner=Not%20A%20Real%20Owner');
  await expect(page.getByRole('alert')).toContainText('Owner not found: Not A Real Owner');
  await expect(page.locator('.owner-hub-grid')).toHaveCount(0);
  await expect(page.locator('.owner-hub-owner-control select')).toHaveValue('');
  expect(await page.evaluate(key => localStorage.getItem(key), PREFERENCE_KEY)).toBe('Joe');
});

test('exact owner Search opens Owner Hub first without mutating My Team', async ({ page }) => {
  await seedFavorite(page, 'Joel');
  await page.goto('/');
  await page.locator('.search-trigger').click();
  const search = page.getByRole('dialog', { name: 'Search The Darling' });
  await search.getByRole('combobox', { name: /Search owners, seasons/ }).fill('Joe');
  const results = search.getByRole('option');
  await expect(results.first()).toContainText('Joe Owner Hub');
  await results.first().click();
  await expect(page).toHaveURL(/[?&]tab=owner/);
  await expect(page).toHaveURL(/[?&]owner=Joe(?:&|$)/);
  expect(await page.evaluate(key => localStorage.getItem(key), PREFERENCE_KEY)).toBe('Joel');
});

test('storage denial falls back to the active session and announces the limitation', async ({ page }) => {
  await page.addInitScript(key => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function setItem(name, value) {
      if (name === key) throw new DOMException('Storage blocked', 'SecurityError');
      return original.call(this, name, value);
    };
  }, PREFERENCE_KEY);
  await page.goto('/?tab=owner&owner=Joe');
  await page.getByRole('button', { name: 'Make Joe My Team' }).click();
  await expect(page.getByRole('status')).toContainText('Saved for this visit');
  await activateFeature(page, 'history');
  await expect(page.locator('#teamSelect')).toHaveValue('Joe');
});

for (const width of [320, 390, 768, 1440]) {
  test(`Owner Hub has no horizontal overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width < 700 ? 844 : 900 });
    await page.goto('/?tab=owner&owner=Joe');
    await expect(page.locator('#page-owner')).toHaveAttribute('data-feature-state', 'ready');
    await expect.poll(() => page.evaluate(() =>
      document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    )).toBe(true);
  });
}
