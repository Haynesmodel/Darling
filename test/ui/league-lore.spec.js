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
