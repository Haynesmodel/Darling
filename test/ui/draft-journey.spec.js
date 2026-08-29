import { expect, test } from './coverage-fixture.js';
import { expectNoViolations } from './accessibility-helpers.js';

const preview = process.env.PLAYWRIGHT_SERVER === 'preview';

test.describe('Draft Journey', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/?tab=draft');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('#page-draft')).toHaveAttribute('data-feature-state', 'ready');
    await expect(page.locator('#draftJourneyDisclosure')).toBeVisible();
    await page.locator('#draftJourneyDisclosure summary').click();
  });

  test('renders all four eras and synchronizes select, URL, and detail', async ({ page }) => {
    const filter = page.locator('select[aria-label="Filter draft journey by location"]');
    await expect(filter.locator('option')).toHaveText(['All locations', 'Remote / virtual · 2014–2016', 'Bethany Beach · 2017–2022', 'College Park · 2023–2024', 'Washington, DC · 2025–2026']);
    await expect(page.locator('.draft-journey-detail')).toHaveCount(4);
    await expect(page.locator('.draft-journey-map svg')).toHaveAttribute('aria-hidden', 'true');
    await expect(page.locator('.draft-journey-leader')).toHaveCount(3);
    await filter.selectOption('washington-dc');
    await expect(page).toHaveURL(/draftLocation=washington-dc/);
    await expect(page.locator('.draft-journey-details')).toContainText('2025–2026');
    await expect(page.locator('#draftEndSeason')).toHaveValue('2025');
  });

  test('keeps virtual era off-map and physical callouts keyboard-operable', async ({ page }) => {
    const filter = page.locator('select[aria-label="Filter draft journey by location"]');
    await filter.selectOption('remote-virtual');
    await expect(page.locator('.draft-journey-virtual-button')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.draft-journey-details')).toContainText('Virtual era; no physical location assigned.');
    await page.getByRole('button', { name: 'Show College Park, 2023–2024' }).press('Enter');
    await expect(page).toHaveURL(/draftLocation=college-park/);
    await expect(page.locator('.draft-journey-details')).toContainText('University of Maryland Stadium');
  });

  test('invalid direct location is removed without an error', async ({ page }) => {
    await page.goto('/?tab=draft&draftStart=2017&draftLocation=unknown');
    await page.waitForLoadState('networkidle');
    await expect(page).not.toHaveURL(/draftLocation=unknown/);
    await expect(page).toHaveURL(/draftStart=2017/);
    await expect(page.locator('select[aria-label="Filter draft journey by location"]')).toHaveValue('');
  });

  test('location selection survives Back and Forward with analytics controls preserved', async ({ page }) => {
    const filter = page.locator('select[aria-label="Filter draft journey by location"]');
    await page.locator('#draftOwnerSelect').selectOption('Joe');
    await filter.selectOption('college-park');
    await page.locator('#draftMetricSelect').selectOption('playoffRate');
    await expect(page.locator('#draftOwnerSelect')).toHaveValue('Joe');
    await expect(filter).toHaveValue('college-park');
    await expect(page.locator('#draftMetricSelect')).toHaveValue('playoffRate');

    await page.goBack();
    await expect.poll(() => new URL(page.url()).searchParams.get('draftLocation')).toBe('college-park');
    await expect(page.locator('#draftOwnerSelect')).toHaveValue('Joe');
    await expect(page.locator('#draftMetricSelect')).toHaveValue('avgFinish');
    await expect(filter).toHaveValue('college-park');

    await page.goBack();
    await expect.poll(() => new URL(page.url()).searchParams.get('draftLocation')).toBeNull();
    await expect(page.locator('#draftOwnerSelect')).toHaveValue('Joe');
    await expect(page.locator('#draftMetricSelect')).toHaveValue('avgFinish');
    await expect(filter).toHaveValue('');

    await page.goForward();
    await expect.poll(() => new URL(page.url()).searchParams.get('draftLocation')).toBe('college-park');
    await expect(page.locator('#draftOwnerSelect')).toHaveValue('Joe');
    await expect(page.locator('#draftMetricSelect')).toHaveValue('avgFinish');
    await expect(filter).toHaveValue('college-park');
    await expect(page.locator('.draft-journey-details')).toContainText('University of Maryland Stadium');

    await page.goForward();
    await expect.poll(() => new URL(page.url()).searchParams.get('draftLocation')).toBe('college-park');
    await expect(page.locator('#draftOwnerSelect')).toHaveValue('Joe');
    await expect(page.locator('#draftMetricSelect')).toHaveValue('playoffRate');
    await expect(filter).toHaveValue('college-park');
  });

  test('invalid direct location replacement does not add a Back entry', async ({ page }) => {
    await page.goto('/?tab=draft');
    await page.waitForLoadState('networkidle');
    const priorUrl = page.url();
    await page.goto('/?tab=draft&draftOwner=Joe&draftLocation=disabled');
    await page.waitForLoadState('networkidle');
    await expect(page).not.toHaveURL(/draftLocation=disabled/);
    await expect(page.locator('#draftOwnerSelect')).toHaveValue('Joe');
    await page.goBack();
    await expect(page).toHaveURL(priorUrl);
  });

  test('closing a location lore dialog restores focus to its initiating button', async ({ page }) => {
    const filter = page.locator('select[aria-label="Filter draft journey by location"]');
    await filter.selectOption('college-park');
    const opener = page.getByRole('button', { name: 'Open College Park lore' });
    await opener.focus();
    await opener.click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: 'Close league lore' }).click();
    await expect(opener).toBeFocused();
  });

  test('location model handles empty, virtual, and boundary inputs', async ({ page }) => {
    test.skip(preview, 'The source model is available only from the instrumented development server.');
    const result = await page.evaluate(async () => {
      const model = await import('/src/features/draft-spot/draft-location-model.ts');
      const virtual = {
        id: 'virtual', label: 'Remote / virtual', location_type: 'virtual', season_start: 2014, season_end: 2016,
        venue: null, coordinates: null, coordinate_precision: 'none', entry_id: 'entry', enabled: true,
      };
      const physical = {
        id: 'physical', label: 'A place', location_type: 'physical', season_start: 2017, season_end: 2018,
        venue: null, coordinates: { latitude: 90, longitude: 180 }, coordinate_precision: 'municipality', entry_id: 'entry', enabled: true,
      };
      return {
        emptyEnabled: model.enabledDraftLocations().length,
        emptySelection: model.normalizeDraftLocation(undefined),
        emptyId: model.normalizeDraftLocation('', []),
        missingSelection: model.selectedDraftLocation('missing', [virtual]),
        missingDetails: model.draftLocationDetails('missing', [virtual]).map(row => row.id),
        noPhysical: model.projectDraftLocations([virtual]).length,
        onePhysical: model.projectDraftLocations([physical]).length,
        tinyLayout: model.layoutDraftCallouts([physical], 0, 0).length,
        virtualPrecision: model.draftLocationPrecisionLabel(virtual),
        municipalityPrecision: model.draftLocationPrecisionLabel(physical),
      };
    });
    expect(result).toEqual({
      emptyEnabled: 0,
      emptySelection: null,
      emptyId: null,
      missingSelection: null,
      missingDetails: ['virtual'],
      noPhysical: 0,
      onePhysical: 1,
      tinyLayout: 1,
      virtualPrecision: 'Virtual era; no physical location assigned.',
      municipalityPrecision: 'Municipality reference point; approximate.',
    });
  });

  test('controller renders verified, empty, invalid, mismatched, and stale responses', async ({ page }) => {
    test.skip(preview, 'The source controller is available only from the instrumented development server.');
    const fixtures = await page.evaluate(async () => {
      const source = await fetch('/assets/DraftSpot.json').then(response => response.json());
      const sortJson = value => Array.isArray(value)
        ? value.map(sortJson)
        : value && typeof value === 'object'
          ? Object.fromEntries(Object.keys(value).sort().map(key => [key, sortJson(value[key])]))
          : value;
      const encode = value => new TextEncoder().encode(`${JSON.stringify(sortJson(value), null, 2)}\n`);
      const digest = async value => {
        const bytes = encode(value);
        const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
        return { body: new TextDecoder().decode(bytes), hash: `sha256:${hash}`, bytes: bytes.byteLength };
      };
      return {
        valid: await digest(source),
        mismatch: await digest({ ...source, generated_at: '2026-07-17T00:00:00Z' }),
        empty: await digest({ ...source, rows: [] }),
        invalid: await digest({ ...source, rows: null }),
        stale: await digest({ ...source, rows: { stale: true } }),
        sourceHash: source.source_sha256,
      };
    });
    await page.route('**/assets/DraftSpot.json*', async route => {
      const hash = new URL(route.request().url()).searchParams.get('v');
      const fixture = Object.values(fixtures).find(value => value && typeof value === 'object' && value.hash === `sha256:${hash}`);
      if (!fixture) {
        await route.continue();
        return;
      }
      if (fixture === fixtures.stale) await new Promise(resolve => setTimeout(resolve, 100));
      await route.fulfill({ status: 200, contentType: 'application/json', body: fixture.body });
    });
    const result = await page.evaluate(async input => {
      const { mountDraftSpot, unmountDraftSpot } = await import('/src/features/draft-spot/draft-spot-controller.ts');
      const mount = document.createElement('div');
      document.body.append(mount);
      const options = (fixture, sourceHash = input.sourceHash) => ({
        mount,
        assetPath: 'assets/DraftSpot.json',
        assetSha256: fixture.hash,
        assetBytes: fixture.bytes,
        sourceHash,
        dataVersion: 'controller-coverage',
      });
      await mountDraftSpot(options(input.empty));
      const empty = mount.textContent;
      await mountDraftSpot(options(input.mismatch, 'not-the-source'));
      const mismatch = mount.textContent;
      await mountDraftSpot(options(input.invalid));
      const invalid = mount.textContent;
      const pending = mountDraftSpot(options(input.stale));
      unmountDraftSpot();
      await pending;
      return { empty, mismatch, invalid, staleUnmounted: mount.textContent === '' };
    }, fixtures);
    await page.unroute('**/assets/DraftSpot.json*');
    expect(result.empty).toContain('no seasons contain draft-pick data');
    expect(result.mismatch).toContain('older SeasonSummary snapshot');
    expect(result.invalid).toContain('Draft Spot is unavailable');
    expect(result.staleUnmounted).toBe(true);
  });

  test('keeps callouts bounded and collision-safe when resized to 320px', async ({ page }) => {
    const readLayout = () => page.evaluate(() => {
      const map = document.querySelector('.draft-journey-map');
      if (!map) return null;
      const mapBox = map.getBoundingClientRect();
      const boxes = [...map.querySelectorAll('.draft-journey-callout')].map(node => {
        const box = node.getBoundingClientRect();
        const label = node.querySelector('span');
        return {
          left: box.left,
          top: box.top,
          right: box.right,
          bottom: box.bottom,
          width: box.width,
          height: box.height,
          labelFits: label ? label.scrollWidth <= label.clientWidth + 1 && label.scrollHeight <= label.clientHeight + 1 : false,
        };
      });
      return {
        map: { left: mapBox.left, top: mapBox.top, right: mapBox.right, bottom: mapBox.bottom },
        boxes,
        viewport: {
          innerWidth: window.innerWidth,
          clientWidth: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth,
        },
        overflowers: [...document.querySelectorAll('body *')].map(node => {
          const box = node.getBoundingClientRect();
          return { tag: node.tagName.toLowerCase(), className: typeof node.className === 'string' ? node.className : '', left: box.left, right: box.right, width: box.width };
        }).filter(item => item.left < 0 || item.right > document.documentElement.clientWidth).sort((a, b) => b.right - a.right || a.left - b.left).slice(0, 5),
        noOverflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      };
    });
    const assertLayout = layout => {
      expect(layout).not.toBeNull();
      const diagnostics = JSON.stringify({ viewport: layout.viewport, overflowers: layout.overflowers });
      expect(layout.boxes.every(box => box.left >= layout.map.left - 1 && box.right <= layout.map.right + 1 && box.top >= layout.map.top - 1 && box.bottom <= layout.map.bottom + 1 && box.width >= 44 && box.height >= 44 && box.labelFits), diagnostics).toBe(true);
      for (let index = 0; index < layout.boxes.length; index += 1) {
        for (let other = index + 1; other < layout.boxes.length; other += 1) {
          const first = layout.boxes[index];
          const second = layout.boxes[other];
          expect(first.right <= second.left || second.right <= first.left || first.bottom <= second.top || second.bottom <= first.top).toBe(true);
        }
      }
      expect(layout.noOverflow, diagnostics).toBe(true);
    };

    assertLayout(await readLayout());
    await page.setViewportSize({ width: 320, height: 900 });
    await expect.poll(async () => {
      const layout = await readLayout();
      if (!layout) return 'missing map layout';
      if (layout.boxes.every(box => box.width <= 120) && layout.noOverflow) return 'settled compact layout';
      return JSON.stringify({ viewport: layout.viewport, compact: layout.boxes.every(box => box.width <= 120), noOverflow: layout.noOverflow, overflowers: layout.overflowers });
    }).toBe('settled compact layout');
    assertLayout(await readLayout());
  });

  test('desktop map callouts are bounded, target-sized, and non-overlapping', async ({ page }) => {
    const layout = await page.evaluate(() => {
      const map = document.querySelector('.draft-journey-map');
      if (!map) return null;
      const mapBox = map.getBoundingClientRect();
      const boxes = [...map.querySelectorAll('.draft-journey-callout')].map(node => {
      const box = node.getBoundingClientRect();
      return { left: box.left, top: box.top, right: box.right, bottom: box.bottom, width: box.width, height: box.height };
      });
      return { map: { left: mapBox.left, top: mapBox.top, right: mapBox.right, bottom: mapBox.bottom }, boxes };
    });
    expect(layout).not.toBeNull();
    expect(layout.boxes.every(box => box.left >= layout.map.left - 1 && box.right <= layout.map.right + 1 && box.top >= layout.map.top - 1 && box.bottom <= layout.map.bottom + 1 && box.width >= 44 && box.height >= 44)).toBe(true);
    for (let index = 0; index < layout.boxes.length; index += 1) {
      for (let other = index + 1; other < layout.boxes.length; other += 1) {
        const first = layout.boxes[index];
        const second = layout.boxes[other];
        expect(first.right <= second.left || second.right <= first.left || first.bottom <= second.top || second.bottom <= first.top).toBe(true);
      }
    }
  });

  for (const theme of ['light', 'dark']) {
    test(`has no automated violations in ${theme} theme`, async ({ page }) => {
      await page.locator(`[data-theme-preference="${theme}"]`).click();
      await expectNoViolations(page, '#draftJourneyDisclosure');
    });
  }
});
