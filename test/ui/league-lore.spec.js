import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from './coverage-fixture.js';
import { createSnapshotFixture } from './snapshot-fixture.js';

const preview = process.env.PLAYWRIGHT_SERVER === 'preview';
const loreRequest = preview
  ? `/${path.basename(JSON.parse(fs.readFileSync(path.join(process.cwd(), 'dist/.vite/manifest.json'), 'utf8'))['src/lore/lore-presentation.ts'].file)}`
  : '/src/lore/lore-presentation.ts';

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-08-14T23:59:00Z'));
});

test('owner emblem is keyboard-operable and loads lore only after the third activation', async ({ page }) => {
  const loreRequests = [];
  page.on('request', request => {
    if (request.url().includes(loreRequest)) loreRequests.push(request.url());
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

test('owner emblem fails closed when the selected owner has no micro-entry', async ({ page }) => {
  await page.goto('/?tab=owner&owner=Plot');
  const trigger = page.locator('[data-lore-trigger="owner-emblem"]');
  await expect(trigger).toBeVisible();
  await trigger.press('Enter'); await trigger.press('Enter'); await trigger.press('Enter');
  await expect(page.locator('dialog')).toHaveCount(0);
  await expect(page.locator('.lore-overlay, .lore-backdrop')).toHaveCount(0);
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
  await search('42', 'Lowest-Score Record');
  await search('bagel', 'Bagel Shower');
  await search('receipts', 'Hall of Asterisks');
  await search('birds clinch', 'Clinched');
  await search('who is the darling', 'League Moments');
  await search('what if', 'Hall of Asterisks');
  await search('Rashid Shaheed', 'The Rashid Shaheed Declaration');
  await search('Plot power rankings', "Plot's Missing Power Rankings");
  await search('commissioner', 'Commissioner Office');

  await page.locator('.search-trigger').click();
  const palette = page.getByRole('dialog', { name: 'Search The Darling' });
  await palette.getByRole('combobox').fill('42');
  await palette.getByRole('option').filter({ hasText: 'Lowest-Score Record' }).first().click();
  await expect(page.getByRole('dialog', { name: /Lowest-Score Record/ })).toBeVisible();
  await expect(page.locator('#global-search-dialog')).toHaveCount(0);
});

test('cached lore search action keeps modal focus and restores the search opener', async ({ page }) => {
  await page.goto('/?tab=owner&owner=Connor');
  const emblem = page.locator('[data-lore-trigger="owner-emblem"]');
  await emblem.press('Enter'); await emblem.press('Enter'); await emblem.press('Enter');
  await expect(page.locator('dialog h2')).toBeFocused();
  await page.locator('dialog button[aria-label="Close league lore"]').click();
  await expect(page.locator('dialog')).toHaveCount(0);
  const searchTrigger = page.locator('.search-trigger');
  await searchTrigger.click();
  const palette = page.getByRole('dialog', { name: 'Search The Darling' });
  await palette.getByRole('combobox').fill('42');
  const result = palette.getByRole('option').filter({ hasText: 'Lowest-Score Record' }).first();
  await result.click();
  const loreDialog = page.locator('dialog[aria-labelledby="lore-dialog-title"]');
  await expect(loreDialog).toBeVisible();
  await expect(loreDialog.locator('h2')).toBeFocused();
  await loreDialog.locator('button[aria-label="Close league lore"]').click();
  await expect(searchTrigger).toBeFocused();
});

test('same-feature route changes clear an open lore presentation', async ({ page }) => {
  await page.goto('/?tab=owner&owner=Connor');
  const emblem = page.locator('[data-lore-trigger="owner-emblem"]');
  await emblem.press('Enter'); await emblem.press('Enter'); await emblem.press('Enter');
  await expect(page.locator('dialog')).toBeVisible();
  await page.locator('.owner-hub-owner-control select').selectOption('Rishi');
  await expect(page.locator('dialog, .lore-overlay')).toHaveCount(0);
  await expect(page.locator('.owner-hub-emblem[data-lore-owner="Rishi"]')).toBeVisible();
});

test('draft lore controls are limited to their canonical 2025 boundaries', async ({ page }) => {
  await page.goto('/?tab=draft&draftMode=pick&draftPick=1');
  await expect(page.locator('[data-lore-trigger="draft-boundary-first"]')).not.toHaveAttribute('data-lore-season', '2025');
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

  await page.goto('/?tab=draft&draftMode=pick&draftPick=10&draftStart=2017&draftEnd=2024');
  await expect(page.locator('[data-lore-trigger="draft-snake-tail"]')).toHaveAttribute('data-lore-facts', /"range":"2017-2024"/);
  await expect(page.locator('[data-lore-trigger="expansion-story"], [data-lore-trigger="draft-podium"], [data-lore-trigger="draft-rishi-pick-four"]')).toHaveCount(0);

  await page.goto('/?tab=draft&draftMode=pick&draftPick=1&draftOwner=Snare');
  await expect(page.locator('[data-lore-trigger="draft-snake-tail"]')).toHaveCount(0);
  await page.goto('/?tab=draft&draftMode=pick&draftPick=8&draftOwner=Connor');
  await expect(page.locator('[data-lore-trigger="draft-snake-tail"]')).toHaveCount(0);
});

test('2025 current stories remain reachable from History with canonical facts', async ({ page }) => {
  for (const [owner, trigger] of [['Zook', 'zook-points-story'], ['Connor', 'connor-collapse-story'], ['Plot', 'plot-rankings-story']]) {
    await page.goto(`/?tab=history&team=${owner}&seasons=2025`);
    const button = page.locator(`[data-lore-trigger="${trigger}"]`);
    await expect(button).toHaveAttribute('data-lore-season', '2025');
    await expect(button).toHaveAttribute('data-lore-owner', owner);
    await expect(button).toHaveAttribute('data-lore-facts', /"record":"/);
  }
  await expect(page.locator('[data-lore-trigger="plot-admin"]')).toBeVisible();
  await page.goto('/?tab=history&team=Plot&seasons=2024');
  await expect(page.locator('[data-lore-trigger="plot-rankings-story"], [data-lore-trigger="plot-admin"]')).toHaveCount(0);
});

test('2022 championship lore displays owner-oriented canonical H2H scores', async ({ page }) => {
  await page.goto('/?tab=history&team=Zubs&seasons=2022');
  const button = page.locator('[data-lore-trigger="championship-context"]');
  await expect(button).toBeVisible();
  await button.click();
  const dialog = page.locator('dialog');
  await expect(dialog).toContainText('Zubs 101.08 – Rishi 100.40');
  await expect(dialog).toContainText('record');
  await expect(page.locator('.lore-overlay')).toHaveCount(0);
  await dialog.locator('button[aria-label="Close league lore"]').click();
});

test('2022 championship lore orients the same canonical game for Rishi', async ({ page }) => {
  await page.goto('/?tab=history&team=Rishi&seasons=2022');
  const button = page.locator('[data-lore-trigger="championship-context"]');
  await expect(button).toBeVisible();
  await button.click();
  const dialog = page.locator('dialog');
  await expect(dialog).toContainText('Rishi 100.40 – Zubs 101.08');
  await dialog.locator('button[aria-label="Close league lore"]').click();
});

test('2022 championship lore follows a mutated canonical H2H fixture', async ({ page }) => {
  const fixture = createSnapshotFixture({
    mutations: {
      H2H: games => {
        const championship = games.find(game => game.season === 2022 && game.week === 17 && game.round === 'Championship' && game.teamA === 'Zubs' && game.teamB === 'Rishi');
        championship.scoreA = 123.45;
        championship.scoreB = 67.89;
      },
    },
  });
  await fixture.install(page);
  await page.goto('/?tab=history&team=Zubs&seasons=2022');
  const button = page.locator('[data-lore-trigger="championship-context"]');
  await expect(button).toBeVisible();
  await button.click();
  const dialog = page.locator('dialog');
  await expect(dialog).toContainText('Zubs 123.45 – Rishi 67.89');
  await expect(dialog).not.toContainText('Zubs 101.08 – Rishi 100.40');
  await dialog.locator('button[aria-label="Close league lore"]').click();
});

test('low-score lore follows the anchored canonical H2H fixture', async ({ page }) => {
  const fixture = createSnapshotFixture({
    mutations: {
      H2H: games => {
        const record = games.find(game => game.season === 2019 && game.week === 12 && game.teamA === 'Joe' && game.teamB === 'Nuss');
        record.scoreB = 77.77;
      },
    },
  });
  await fixture.install(page);
  await page.goto('/?tab=history&team=Nuss&seasons=2019');
  const button = page.locator('[data-lore-trigger="record-42-history"]');
  await expect(button).toBeVisible();
  await button.click();
  const dialog = page.locator('dialog');
  await expect(dialog).toContainText('Nuss 77.77');
  await expect(dialog).not.toContainText('42.00');
  await dialog.locator('button[aria-label="Close league lore"]').click();
});

test('global search low-score incantation uses canonical mutated H2H facts', async ({ page }) => {
  const fixture = createSnapshotFixture({ mutations: { H2H: games => { const record = games.find(game => game.season === 2019 && game.week === 12 && game.teamA === 'Joe' && game.teamB === 'Nuss'); record.scoreB = 66.66; } } });
  await fixture.install(page);
  await page.goto('/?tab=history');
  await page.locator('.search-trigger').click();
  const palette = page.getByRole('dialog', { name: 'Search The Darling' });
  await palette.getByRole('combobox').fill('42');
  await palette.getByRole('option').filter({ hasText: 'Lowest-Score Record' }).first().click();
  const dialog = page.locator('dialog[aria-labelledby="lore-dialog-title"]');
  await expect(dialog).toContainText('Nuss 66.66');
  await expect(dialog).not.toContainText('42.00');
  await dialog.locator('button[aria-label="Close league lore"]').click();
});

test('lore presentation primitives render bounded distinct decorations and clean up', async ({ page }) => {
  const reveal = async (url, trigger, presentation, count, activations = 1) => {
    await page.goto(url);
    const button = page.locator(`[data-lore-trigger="${trigger}"]`);
    await expect(button).toBeVisible();
    for (let index = 0; index < activations; index += 1) await button.click();
    const overlay = page.locator(`.lore-overlay[data-lore-presentation="${presentation}"]`);
    await expect(overlay).toHaveCount(1);
    await expect(overlay.locator('.lore-decoration')).toHaveCount(count);
    await page.locator('dialog button[aria-label="Close league lore"]').click();
    await expect(page.locator('.lore-overlay, dialog')).toHaveCount(0);
  };

  await reveal('/?tab=draft&draftMode=pick&draftPick=4', 'draft-rishi-pick-four', 'target', 3);
  await reveal('/?tab=draft&draftMode=pick&draftPick=1', 'expansion-story', 'chairs', 2);
  await reveal('/?tab=history&team=Connor&seasons=2025', 'connor-collapse-story', 'ticket', 1);
  await reveal('/?tab=history&team=Plot&seasons=2025', 'plot-rankings-story', 'blank-document', 1);
  await reveal('/?tab=trophy&team=Zook', 'trophy-bagel', 'bagel-shower', 14, 3);
  await reveal('/?tab=trophy&team=Connor', 'trophy-saunders', 'flies', 9, 3);
});

test('reduced motion keeps lore readable without creating decorative particles', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?tab=draft&draftMode=pick&draftPick=4');
  await page.locator('[data-lore-trigger="draft-rishi-pick-four"]').click();
  await expect(page.getByRole('dialog', { name: 'Rishi Was Deadly' })).toBeVisible();
  await expect(page.locator('.lore-overlay, .lore-decoration')).toHaveCount(0);
});
