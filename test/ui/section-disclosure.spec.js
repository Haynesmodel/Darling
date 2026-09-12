import { test, expect } from '@playwright/test';
import esbuild from 'esbuild';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
let temp;
let bundle;

test.beforeAll(async () => {
  temp = fs.mkdtempSync(path.join(os.tmpdir(), 'darling-disclosure-'));
  bundle = path.join(temp, 'disclosure.js');
  await esbuild.build({
    entryPoints: [path.join(root, 'src/app/section-disclosure.ts')],
    outfile: bundle,
    bundle: true,
    platform: 'browser',
    format: 'iife',
    globalName: 'DarlingDisclosure',
    target: 'es2022',
    logLevel: 'silent',
  });
});

test.afterAll(() => {
  fs.rmSync(temp, { recursive: true, force: true });
});

async function fixture(page) {
  await page.setContent(`
    <main>
      <div id="mount"></div>
      <details id="alpha"><summary>Alpha</summary><div><button id="inside">Inside</button></div></details>
      <details id="beta"><summary>Beta</summary><div>Beta content</div></details>
    </main>
  `);
  await page.addScriptTag({ path: bundle });
  await page.evaluate(() => {
    window.visibleCalls = { alpha: 0, beta: 0 };
    window.disclosure = DarlingDisclosure.createSectionDisclosure({
      doc: document,
      mount: document.querySelector('#mount'),
      featureId: 'fixture',
      featureLabel: 'Fixture',
    });
    window.updateDisclosure = (signature = 'one', betaAvailable = true, preserveFocusedSection = false) => window.disclosure.update({
      signature,
      preserveFocusedSection,
      sections: [
        { id: 'alpha-section', label: 'Alpha', details: document.querySelector('#alpha'), defaultOpen: true, onVisible: () => { window.visibleCalls.alpha += 1; } },
        { id: 'beta-section', label: 'Beta', details: document.querySelector('#beta'), available: betaAvailable, defaultOpen: false, onVisible: () => { window.visibleCalls.beta += 1; } },
      ],
    });
    window.updateDisclosure();
  });
  await page.waitForTimeout(40);
}

test('signature defaults, user overrides, empty reconciliation, and reveal work together', async ({ page }) => {
  await fixture(page);
  await expect(page.locator('#alpha')).toHaveAttribute('open', '');
  await expect(page.locator('#beta')).not.toHaveAttribute('open', '');
  await expect(page.locator('#fixture-section-jump option')).toHaveText(['Alpha', 'Beta']);

  await page.evaluate(() => window.disclosure.setOpen('alpha-section', false));
  await page.evaluate(() => window.updateDisclosure('one'));
  await expect(page.locator('#alpha')).not.toHaveAttribute('open', '');

  await page.evaluate(() => window.updateDisclosure('two'));
  await expect(page.locator('#alpha')).toHaveAttribute('open', '');

  await page.evaluate(() => window.updateDisclosure('two', false));
  await expect(page.locator('#fixture-section-jump option')).toHaveText(['Alpha']);
  await expect(page.locator('#beta')).toBeHidden();
  expect(await page.evaluate(() => window.disclosure.reveal('beta-section'))).toBe(false);

  await page.evaluate(() => window.updateDisclosure('two', true));
  expect(await page.evaluate(() => window.disclosure.reveal('beta-section'))).toBe(true);
  await page.waitForTimeout(40);
  await expect(page.locator('#beta')).toHaveAttribute('open', '');
  expect(await page.evaluate(() => document.activeElement?.textContent)).toBe('Beta');
});

test('closing is focus-safe and repeated updates do not duplicate visible callbacks', async ({ page }) => {
  await fixture(page);
  await page.locator('#inside').focus();
  await page.evaluate(() => window.disclosure.setOpen('alpha-section', false));
  expect(await page.evaluate(() => document.activeElement?.textContent)).toBe('Alpha');

  await page.evaluate(() => {
    window.visibleCalls.alpha = 0;
    window.updateDisclosure('callbacks');
  });
  await page.waitForTimeout(40);
  expect(await page.evaluate(() => window.visibleCalls.alpha)).toBe(1);

  await page.evaluate(() => window.disclosure.setOpen('alpha-section', false));
  await page.waitForTimeout(20);
  await page.evaluate(() => window.disclosure.setOpen('alpha-section', true));
  await page.waitForTimeout(40);
  expect(await page.evaluate(() => window.visibleCalls.alpha)).toBe(2);

  await page.evaluate(() => window.disclosure.dispose());
  await expect(page.locator('#mount')).toHaveText('');
  expect(await page.evaluate(() => window.disclosure.reveal('alpha-section'))).toBe(false);
});

test('a delayed signature update does not close the section a user just focused', async ({ page }) => {
  await fixture(page);
  await page.evaluate(() => window.disclosure.reveal('beta-section'));
  await expect(page.locator('#beta')).toHaveAttribute('open', '');
  await expect(page.locator('#beta summary')).toBeFocused();

  await page.evaluate(() => window.updateDisclosure('focused-context', true, true));
  await expect(page.locator('#beta')).toHaveAttribute('open', '');
  await expect(page.locator('#beta summary')).toBeFocused();

  await page.locator('#fixture-section-jump').focus();
  await page.evaluate(() => window.updateDisclosure('unfocused-context'));
  await expect(page.locator('#beta')).not.toHaveAttribute('open', '');
});
