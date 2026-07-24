const test = require('node:test');
const assert = require('node:assert/strict');
const esbuild = require('esbuild');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.join(__dirname, '..');
let temp;
let browser;
let bundle;

test.before(async () => {
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
  browser = await chromium.launch({ headless: true });
});

test.after(async () => {
  await browser?.close();
  fs.rmSync(temp, { recursive: true, force: true });
});

async function fixture() {
  const page = await browser.newPage();
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
    window.updateDisclosure = (signature = 'one', betaAvailable = true) => window.disclosure.update({
      signature,
      sections: [
        { id: 'alpha-section', label: 'Alpha', details: document.querySelector('#alpha'), defaultOpen: true, onVisible: () => { window.visibleCalls.alpha += 1; } },
        { id: 'beta-section', label: 'Beta', details: document.querySelector('#beta'), available: betaAvailable, defaultOpen: false, onVisible: () => { window.visibleCalls.beta += 1; } },
      ],
    });
    window.updateDisclosure();
  });
  await page.waitForTimeout(40);
  return page;
}

test('signature defaults, user overrides, empty reconciliation, and reveal work together', async () => {
  const page = await fixture();
  assert.equal(await page.locator('#alpha').getAttribute('open'), '');
  assert.equal(await page.locator('#beta').getAttribute('open'), null);
  assert.deepEqual(await page.locator('#fixture-section-jump option').allTextContents(), ['Alpha', 'Beta']);

  await page.evaluate(() => window.disclosure.setOpen('alpha-section', false));
  await page.evaluate(() => window.updateDisclosure('one'));
  assert.equal(await page.locator('#alpha').getAttribute('open'), null, 'same signature remembers a user close');

  await page.evaluate(() => window.updateDisclosure('two'));
  assert.equal(await page.locator('#alpha').getAttribute('open'), '', 'new signature recalculates defaults');

  await page.evaluate(() => window.updateDisclosure('two', false));
  assert.deepEqual(await page.locator('#fixture-section-jump option').allTextContents(), ['Alpha']);
  assert.equal(await page.locator('#beta').isHidden(), true);
  assert.equal(await page.evaluate(() => window.disclosure.reveal('beta-section')), false);

  await page.evaluate(() => window.updateDisclosure('two', true));
  assert.equal(await page.evaluate(() => window.disclosure.reveal('beta-section')), true);
  await page.waitForTimeout(40);
  assert.equal(await page.locator('#beta').getAttribute('open'), '');
  assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'Beta');
  await page.close();
});

test('closing is focus-safe and repeated updates do not duplicate visible callbacks', async () => {
  const page = await fixture();
  await page.locator('#inside').focus();
  await page.evaluate(() => window.disclosure.setOpen('alpha-section', false));
  assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'Alpha');

  await page.evaluate(() => {
    window.visibleCalls.alpha = 0;
    window.updateDisclosure('callbacks');
  });
  await page.waitForTimeout(40);
  assert.equal(await page.evaluate(() => window.visibleCalls.alpha), 1);

  await page.evaluate(() => window.disclosure.setOpen('alpha-section', false));
  await page.waitForTimeout(20);
  await page.evaluate(() => window.disclosure.setOpen('alpha-section', true));
  await page.waitForTimeout(40);
  assert.equal(await page.evaluate(() => window.visibleCalls.alpha), 2);

  await page.evaluate(() => window.disclosure.dispose());
  assert.equal(await page.locator('#mount').textContent(), '');
  assert.equal(await page.evaluate(() => window.disclosure.reveal('alpha-section')), false);
  await page.close();
});
