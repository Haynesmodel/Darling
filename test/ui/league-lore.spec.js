import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from './coverage-fixture.js';

const manifest = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'dist/.vite/manifest.json'), 'utf8'));
const loreChunk = path.basename(manifest['src/lore/lore-presentation.ts'].file);

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-08-14T23:59:00Z'));
});

test('owner emblem is keyboard-operable and loads lore only after the third activation', async ({ page }) => {
  const loreRequests = [];
  page.on('request', request => {
    if (request.url().endsWith(`/${loreChunk}`)) loreRequests.push(request.url());
  });
  await page.goto('/?tab=owner&owner=Connor');
  const trigger = page.locator('[data-lore-trigger="owner-emblem"]');
  await expect(trigger).toBeVisible();
  expect(loreRequests).toEqual([]);
  await trigger.press('Enter');
  await trigger.press('Enter');
  await expect(page.locator('dialog')).toHaveCount(0);
  await trigger.press('Enter');
  await expect(page.locator('dialog')).toBeVisible();
  await expect(page.locator('dialog h2')).toContainText("Connor's Irish Goodbye");
  expect(loreRequests).toHaveLength(1);
  await page.locator('dialog button[aria-label="Close league lore"]').click();
  await expect(page.locator('dialog')).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test('lore dialog traps focus, closes on Escape, and survives motion/forced-color changes', async ({ page }) => {
  await page.goto('/?tab=owner&owner=Connor');
  const trigger = page.locator('[data-lore-trigger="owner-emblem"]');
  await trigger.press('Enter');
  await trigger.press('Enter');
  await trigger.press('Enter');
  const dialog = page.locator('dialog');
  await expect(dialog).toBeVisible();
  await page.emulateMedia({ reducedMotion: 'reduce', forcedColors: 'active' });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('h2')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(dialog.locator('button[aria-label="Close league lore"]')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.lore-overlay')).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test('lore incantations index the authored catalog and execute a result', async ({ page }) => {
  await page.goto('/?tab=history');
  await page.waitForLoadState('networkidle');
  const search = async (query, expectedTitle) => {
    await page.locator('.search-trigger').click();
    const palette = page.getByRole('dialog', { name: 'Search The Darling' });
    await palette.getByRole('combobox').fill(query);
    const result = palette.getByRole('option').filter({ hasText: expectedTitle }).first();
    await expect(result).toBeVisible();
    await page.keyboard.press('Escape');
  };
  await search('42', 'League Moments');
  await search('bagel', 'League Moments');
  await search('receipts', 'Hall of Asterisks');
  await search('birds clinch', 'League Moments');
  await search('who is the darling', 'League Moments');
  await search('what if', 'Hall of Asterisks');
  await search('Rashid Shaheed', 'Draft Weekend Museum');
  await search('Plot power rankings', 'League Moments');
  await search('commissioner', 'Commissioner Office');

  await page.locator('.search-trigger').click();
  const palette = page.getByRole('dialog', { name: 'Search The Darling' });
  await palette.getByRole('combobox').fill('42');
  await palette.getByRole('option').filter({ hasText: 'League Moments' }).first().click();
  await expect(page.getByRole('dialog', { name: /League Moments/ })).toBeVisible();
  await expect(page.locator('#global-search-dialog')).toHaveCount(0);
});

test('draft lore controls are limited to their canonical 2025 boundaries', async ({ page }) => {
  await page.goto('/?tab=draft&draftMode=pick&draftPick=1');
  await expect(page.locator('[data-lore-trigger="draft-boundary-first"]')).toHaveAttribute('data-lore-season', '2025');
  await expect(page.locator('[data-lore-trigger="draft-boundary-first"]')).toHaveAttribute('data-lore-facts', /"draft_slot":1/);
  await expect(page.locator('[data-lore-trigger="draft-podium"]')).toHaveAttribute('data-lore-owner', 'Snare');
  await expect(page.locator('[data-lore-trigger="draft-rishi-pick-four"]')).toHaveCount(0);

  await page.goto('/?tab=draft&draftMode=pick&draftPick=4');
  await expect(page.locator('[data-lore-trigger="draft-rishi-pick-four"]')).toHaveAttribute('data-lore-season', '2025');
  await expect(page.locator('[data-lore-trigger="draft-rishi-pick-four"]')).toHaveAttribute('data-lore-owner', 'Rishi');
  await expect(page.locator('[data-lore-trigger="draft-rishi-pick-four"]')).toHaveAttribute('data-lore-facts', /"draft_slot":4/);

  await page.goto('/?tab=draft&draftMode=pick&draftPick=12');
  await expect(page.locator('[data-lore-trigger="draft-snake-tail"]')).toHaveAttribute('data-lore-facts', /"draft_slot":12/);
  await expect(page.locator('[data-lore-trigger="draft-podium"], [data-lore-trigger="draft-rishi-pick-four"]')).toHaveCount(0);
});
