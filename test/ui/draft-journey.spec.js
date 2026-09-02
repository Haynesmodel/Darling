import { expect, test } from './coverage-fixture.js';
import { expectNoViolations } from './accessibility-helpers.js';
import { createSnapshotFixture } from './snapshot-fixture.js';

const preview = process.env.PLAYWRIGHT_SERVER === 'preview';

test.describe('Draft Journey', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/?tab=draft');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('#page-draft')).toHaveAttribute('data-feature-state', 'ready');
    await expect(page.locator('#draftJourneyDisclosure')).toBeVisible();
    await page.locator('#draftJourneyDisclosure summary').click();
    const skipTour = page.getByRole('button', { name: 'Skip tour' });
    if (await skipTour.isVisible()) await skipTour.click();
  });

  test('renders all five eras and synchronizes select, URL, and detail', async ({ page }) => {
    const filter = page.locator('select[aria-label="Filter draft journey by location"]');
    await expect(filter.locator('option')).toHaveText(['All locations', 'Remote / virtual · 2014–2016', 'Bethany Beach · 2017–2022', 'College Park · 2023–2024', 'Washington, DC · 2025', 'Vienna, Virginia · 2026']);
    await expect(page.locator('.draft-journey-detail')).toHaveCount(5);
    await expect(page.locator('.draft-journey-map')).toHaveAttribute('aria-label', 'Draft locations across the Mid-Atlantic');
    await expect(page.locator('.draft-journey-basemap')).toHaveAttribute('alt', '');
    await expect(page.locator('.draft-journey-basemap')).toHaveAttribute('aria-hidden', 'true');
    await expect(page.locator('.draft-journey-map svg')).toHaveAttribute('aria-hidden', 'true');
    await expect(page.locator('.draft-journey-leader')).toHaveCount(4);
    await filter.selectOption('washington-dc');
    await expect(page).toHaveURL(/draftLocation=washington-dc/);
    await expect(page.locator('.draft-journey-details')).toContainText('2025');
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

  test('guides physical stops from canonical champions and lore, then supports skip and replay', async ({ page }) => {
    const replay = page.getByRole('button', { name: 'Replay tour' });
    if (!(await replay.isVisible())) {
      const summary = page.locator('#draftJourneyDisclosure summary');
      await summary.click();
      await summary.click();
      const skip = page.getByRole('button', { name: 'Skip tour' });
      if (await skip.isVisible()) await skip.click();
    }
    await expect(replay).toBeVisible();
    await replay.click();
    const card = page.locator('.draft-journey-tour-card');
    await expect(card).toContainText('Stop 1 of 4');
    await expect(card).toContainText('Bethany Beach');
    await expect(card).toContainText('2017 · Joel');
    await expect(card).toContainText('From the lore:');
    await page.getByRole('button', { name: 'Skip tour' }).click();
    await expect(replay).toBeVisible();
    await replay.click();
    await expect(card).toContainText('Stop 1 of 4');
    await page.locator('[data-draft-location-marker="vienna-virginia"]').click();
    await expect(page).toHaveURL(/draftLocation=vienna-virginia/);
    await expect(card).toHaveCount(0);
    await expect(replay).toBeVisible();
  });

  test('reduced-motion tour advances and presents the incomplete 2026 outcome honestly', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.getByRole('button', { name: 'Replay tour' }).click();
    const card = page.locator('.draft-journey-tour-card');
    await expect(card).toContainText('Stop 1 of 4');
    await expect(card).toContainText('2017 · Joel');
    await expect(card).toContainText('Stop 2 of 4', { timeout: 2500 });
    await expect(card).toContainText('College Park');
    await expect(page.getByRole('button', { name: 'Replay tour' })).toBeVisible({ timeout: 5000 });
  });

  test('geographic markers are direct keyboard targets and map zoom preserves the projected stage', async ({ page }) => {
    const map = page.locator('.draft-journey-map');
    const markers = page.locator('[data-draft-location-marker]');
    await expect(markers).toHaveCount(4);
    expect(await markers.evaluateAll(nodes => nodes.every(node => node.getAttribute('title')?.includes('·')))).toBe(true);
    const markerSizes = await markers.evaluateAll(nodes => nodes.map(node => {
      const box = node.getBoundingClientRect();
      return { width: box.width, height: box.height };
    }));
    expect(markerSizes.every(box => box.width >= 44 && box.height >= 44)).toBe(true);

    const collegeMarker = page.locator('[data-draft-location-marker="college-park"]');
    const markerSizeBeforeZoom = await collegeMarker.evaluate(node => {
      const box = node.getBoundingClientRect();
      return { width: box.width, height: box.height };
    });
    await collegeMarker.focus();
    await collegeMarker.press('Enter');
    await expect(page).toHaveURL(/draftLocation=college-park/);
    await expect(collegeMarker).toHaveAttribute('aria-pressed', 'true');

    const stage = page.locator('.draft-journey-map-stage');
    await expect(stage).toHaveAttribute('style', /scale\(1\)/);
    await page.getByRole('button', { name: 'Zoom in' }).click();
    await expect(stage).toHaveAttribute('style', /scale\(1\.2\)/);
    await expect(map.locator('.draft-journey-map-tools > span')).toHaveText('120%');
    await expect(map.locator('.draft-journey-callout')).toHaveCount(0);
    await expect(map.locator('.draft-journey-leader')).toHaveCount(0);
    const markerSizeAfterZoom = await collegeMarker.evaluate(node => {
      const box = node.getBoundingClientRect();
      return { width: box.width, height: box.height };
    });
    expect(markerSizeAfterZoom).toEqual(markerSizeBeforeZoom);
    await expect(collegeMarker.locator('span')).toBeVisible();
    const zoomedBounds = await page.evaluate(() => {
      const mapNode = document.querySelector('.draft-journey-map');
      const mapBox = mapNode?.getBoundingClientRect();
      const controls = [...document.querySelectorAll('.draft-journey-map-tools button')].map(node => node.getBoundingClientRect());
      const labels = [...document.querySelectorAll('.draft-journey-marker span')].filter(node => getComputedStyle(node).clip !== 'rect(0px, 0px, 0px, 0px)').map(node => node.getBoundingClientRect());
      return mapBox && { map: mapBox.toJSON(), controls: controls.map(box => box.toJSON()), labels: labels.map(box => box.toJSON()) };
    });
    expect(zoomedBounds).not.toBeNull();
    expect(zoomedBounds.controls.every(box => box.height >= 44 && box.left >= zoomedBounds.map.left && box.right <= zoomedBounds.map.right && box.top >= zoomedBounds.map.top && box.bottom <= zoomedBounds.map.bottom)).toBe(true);
    expect(zoomedBounds.labels.every(box => box.left >= zoomedBounds.map.left && box.right <= zoomedBounds.map.right && box.top >= zoomedBounds.map.top && box.bottom <= zoomedBounds.map.bottom)).toBe(true);
    await page.getByRole('button', { name: 'Reset map zoom' }).click();
    await expect(stage).toHaveAttribute('style', /scale\(1\)/);
    await expect(page.getByRole('button', { name: 'Reset map zoom' })).toBeDisabled();

    await page.setViewportSize({ width: 320, height: 900 });
    const bounds = await page.evaluate(() => {
      const mapNode = document.querySelector('.draft-journey-map');
      const mapBox = mapNode?.getBoundingClientRect();
      const targets = [...document.querySelectorAll('[data-draft-location-marker]')].map(node => {
        const box = node.getBoundingClientRect();
        return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height };
      });
      return mapBox && { map: { left: mapBox.left, right: mapBox.right, top: mapBox.top, bottom: mapBox.bottom }, targets };
    });
    expect(bounds).not.toBeNull();
    expect(bounds.targets.every(target => target.width >= 44 && target.height >= 44 && target.left >= bounds.map.left && target.right <= bounds.map.right && target.top >= bounds.map.top && target.bottom <= bounds.map.bottom)).toBe(true);
    for (let step = 0; step < 3; step += 1) await page.getByRole('button', { name: 'Zoom in' }).click();
    await expect(map.locator('.draft-journey-map-tools > span')).toHaveText('160%');
    await collegeMarker.focus();
    const maxZoomBounds = await page.evaluate(() => {
      const mapNode = document.querySelector('.draft-journey-map');
      const mapBox = mapNode?.getBoundingClientRect();
      const targets = [...document.querySelectorAll('[data-draft-location-marker]')].map(node => node.getBoundingClientRect());
      const controls = [...document.querySelectorAll('.draft-journey-map-tools button')].map(node => node.getBoundingClientRect());
      const labels = [...document.querySelectorAll('.draft-journey-marker span')].filter(node => getComputedStyle(node).clip !== 'rect(0px, 0px, 0px, 0px)').map(node => node.getBoundingClientRect());
      return mapBox && { map: mapBox.toJSON(), targets: targets.map(box => box.toJSON()), controls: controls.map(box => box.toJSON()), labels: labels.map(box => box.toJSON()) };
    });
    expect(maxZoomBounds).not.toBeNull();
    expect(maxZoomBounds.targets.every(box => box.width >= 44 && box.height >= 44 && box.left >= maxZoomBounds.map.left && box.right <= maxZoomBounds.map.right && box.top >= maxZoomBounds.map.top && box.bottom <= maxZoomBounds.map.bottom)).toBe(true);
    expect(maxZoomBounds.controls.every(box => box.height >= 44 && box.left >= maxZoomBounds.map.left && box.right <= maxZoomBounds.map.right && box.top >= maxZoomBounds.map.top && box.bottom <= maxZoomBounds.map.bottom)).toBe(true);
    expect(maxZoomBounds.labels.every(box => box.left >= maxZoomBounds.map.left && box.right <= maxZoomBounds.map.right && box.top >= maxZoomBounds.map.top && box.bottom <= maxZoomBounds.map.bottom)).toBe(true);
  });

  test('invalid direct location is removed and optional lore suppression preserves Draft Spot', async ({ page }) => {
    await page.goto('/?tab=draft&draftStart=2017&draftLocation=unknown');
    await page.waitForLoadState('networkidle');
    await expect(page).not.toHaveURL(/draftLocation=unknown/);
    await expect(page).toHaveURL(/draftStart=2017/);
    await expect(page.locator('select[aria-label="Filter draft journey by location"]')).toHaveValue('');

    const suppressionCases = [
      {
        name: 'invalid optional lore',
        mutate: lore => { lore.entries = null; },
      },
      {
        name: 'root-disabled lore',
        mutate: lore => { lore.enabled = false; },
      },
      {
        name: 'draft_locations field absent',
        mutate: lore => { delete lore.draft_locations; },
      },
      {
        name: 'all location rows disabled',
        mutate: lore => { lore.draft_locations.forEach(location => { location.enabled = false; }); },
      },
    ];
    for (const { name, mutate } of suppressionCases) {
      await test.step(name, async () => {
        const fixture = createSnapshotFixture({ mutations: { LeagueLore: mutate } });
        await fixture.install(page);
        await page.goto('/?tab=draft&draftLocation=college-park');
        await page.waitForLoadState('networkidle');
        await expect(page.locator('#page-draft')).toHaveAttribute('data-feature-state', 'ready');
        await expect(page.locator('#draftOwnerSelect')).toBeVisible();
        await expect(page.locator('#draftJourneyDisclosure')).toHaveCount(0);
        await expect(page.locator('#draft-section-jump option[value="draft-journey"]')).toHaveCount(0);
        await expect(page).not.toHaveURL(/draftLocation=/);
      });
    }
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
      const disclosure = document.querySelector('#draftJourneyDisclosure');
      const journey = document.querySelector('.draft-journey');
      const layout = document.querySelector('.draft-journey-layout');
      const map = document.querySelector('.draft-journey-map');
      if (!disclosure || !journey || !layout || !map) return null;
      const disclosureBox = disclosure.getBoundingClientRect();
      const journeyBox = journey.getBoundingClientRect();
      const layoutBox = layout.getBoundingClientRect();
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
        disclosure: { left: disclosureBox.left, right: disclosureBox.right },
        journey: { left: journeyBox.left, right: journeyBox.right },
        layout: { left: layoutBox.left, right: layoutBox.right },
        map: { left: mapBox.left, top: mapBox.top, right: mapBox.right, bottom: mapBox.bottom },
        boxes,
        viewport: {
          innerWidth: window.innerWidth,
          clientWidth: document.documentElement.clientWidth,
        },
      };
    });
    const assertLayout = layout => {
      expect(layout).not.toBeNull();
      const diagnostics = JSON.stringify({ viewport: layout.viewport, disclosure: layout.disclosure, journey: layout.journey, layout: layout.layout, map: layout.map });
      expect(layout.disclosure.left >= 0 && layout.disclosure.right <= layout.viewport.clientWidth, diagnostics).toBe(true);
      expect(layout.journey.left >= 0 && layout.journey.right <= layout.viewport.clientWidth, diagnostics).toBe(true);
      expect(layout.layout.left >= layout.disclosure.left && layout.layout.right <= layout.disclosure.right, diagnostics).toBe(true);
      expect(layout.map.left >= layout.layout.left && layout.map.right <= layout.layout.right && layout.map.right <= layout.viewport.clientWidth && layout.boxes.every(box => box.left >= layout.map.left - 1 && box.right <= layout.map.right + 1 && box.top >= layout.map.top - 1 && box.bottom <= layout.map.bottom + 1 && box.width >= 44 && box.height >= 44 && box.labelFits), diagnostics).toBe(true);
      for (let index = 0; index < layout.boxes.length; index += 1) {
        for (let other = index + 1; other < layout.boxes.length; other += 1) {
          const first = layout.boxes[index];
          const second = layout.boxes[other];
          expect(first.right <= second.left || second.right <= first.left || first.bottom <= second.top || second.bottom <= first.top).toBe(true);
        }
      }
    };

    assertLayout(await readLayout());
    await page.setViewportSize({ width: 320, height: 900 });
    await expect.poll(async () => {
      const layout = await readLayout();
      if (!layout) return 'missing map layout';
      if (layout.boxes.every(box => box.width <= 120)) return 'settled compact layout';
      return JSON.stringify({ viewport: layout.viewport, compact: layout.boxes.every(box => box.width <= 120), disclosure: layout.disclosure, journey: layout.journey });
    }).toBe('settled compact layout');
    assertLayout(await readLayout());
  });

  test('has no document overflow on a direct 320px load', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 900 });
    await page.goto('/?tab=draft');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('#page-draft')).toHaveAttribute('data-feature-state', 'ready');
    await expect(page.locator('#draftJourneyDisclosure summary')).toBeVisible();
    await page.locator('#draftJourneyDisclosure summary').click();
    const controls = await page.evaluate(() => {
      const journey = document.querySelector('.draft-journey')?.getBoundingClientRect();
      const filter = document.querySelector('.draft-journey-filter')?.getBoundingClientRect();
      const select = document.querySelector('.draft-journey-filter select')?.getBoundingClientRect();
      const viewport = document.documentElement.clientWidth;
      return {
        journey: journey && { left: journey.left, right: journey.right },
        filter: filter && { left: filter.left, right: filter.right },
        select: select && { left: select.left, right: select.right },
        viewport,
      };
    });
    expect(controls.filter && controls.filter.left >= controls.journey.left && controls.filter.right <= controls.journey.right && controls.filter.right <= controls.viewport).toBe(true);
    expect(controls.select && controls.select.left >= controls.filter.left && controls.select.right <= controls.filter.right && controls.select.right <= controls.viewport).toBe(true);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
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
