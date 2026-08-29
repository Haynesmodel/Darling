import { expect, test } from './coverage-fixture.js';
import { expectNoViolations } from './accessibility-helpers.js';

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

  test('location model handles empty, virtual, and boundary inputs', async ({ page }) => {
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

  test('has no horizontal overflow at 320px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 900 });
    await page.reload();
    await page.waitForLoadState('networkidle');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });

  for (const theme of ['light', 'dark']) {
    test(`has no automated violations in ${theme} theme`, async ({ page }) => {
      await page.locator(`[data-theme-preference="${theme}"]`).click();
      await expectNoViolations(page, '#draftJourneyDisclosure');
    });
  }
});
