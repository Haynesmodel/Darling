import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from './coverage-fixture.js';
import { createSnapshotFixture } from './snapshot-fixture.js';

const manifest = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'assets/asset-manifest.json'), 'utf8'));

function activeSnapshot(generatedAt, status = 'scheduled') {
  return current => {
    current.season = 2026;
    current.generated_at = generatedAt;
    current.current_week = 1;
    current.weeks_fetched = [1];
    current.games = current.games.filter(game => game.week === 1).map((game, index) => ({
      ...game,
      season: 2026,
      date: game.date.replace('2025', '2026'),
      status: index === 0 ? status : 'final',
      scoreA: status === 'scheduled' && index === 0 ? null : game.scoreA,
      scoreB: status === 'scheduled' && index === 0 ? null : game.scoreB,
    }));
  };
}

test('global freshness badge and Pulse share the finalized snapshot status', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.data-freshness summary')).toContainText('2025 season final');
  await expect(page.locator('.pulse-data-note')).toContainText('2025 season final');
  await page.locator('.data-freshness summary').click();
  await expect(page.locator('.data-freshness-panel')).toContainText('Core data verified with SHA-256');
  await expect(page.locator('.data-freshness-panel')).toContainText(manifest.data_version.replace('sha256:', '').slice(0, 12));
  await page.locator('#tabHistoryBtn').click();
  await expect(page.locator('.data-freshness summary')).toContainText('2025 season final');
});

test('runtime requests a no-store manifest and full per-asset versions', async ({ page }) => {
  const requests = [];
  page.on('request', request => {
    if (request.url().includes('/assets/') && request.url().includes('.json')) requests.push(request.url());
  });
  await page.goto('/');
  await expect(page.locator('.data-freshness summary')).toBeVisible();
  const manifestUrl = requests.find(url => new URL(url).pathname.endsWith('/assets/asset-manifest.json'));
  expect(new URL(manifestUrl).search).toBe('');
  for (const [name, entry] of Object.entries({ ...manifest.assets, DerivedStats: manifest.derived })) {
    if (name === 'DraftSpot') continue;
    const requestUrl = requests.find(url => new URL(url).pathname.endsWith(`/${entry.path}`));
    expect(requestUrl, `${name} request`).toBeTruthy();
    expect(new URL(requestUrl).searchParams.get('v')).toBe(entry.sha256.replace('sha256:', ''));
  }
});

test('a required integrity mismatch retries once and blocks app readiness', async ({ page }) => {
  let attempts = 0;
  await page.route('**/assets/H2H.json*', route => {
    attempts += 1;
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{"tampered":true}' });
  });
  await page.goto('/');
  await expect(page.locator('#appStatus')).toContainText('Could not verify league data');
  expect(attempts).toBe(2);
  await expect(page.locator('.data-freshness')).toHaveCount(0);
});

test('an optional integrity mismatch is visible as a partial snapshot', async ({ page }) => {
  let attempts = 0;
  await page.route('**/assets/CurrentSeason.json*', route => {
    attempts += 1;
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{"tampered":true}' });
  });
  await page.goto('/?tab=history');
  await expect(page.locator('#historyGamesTable')).toBeVisible();
  await expect(page.locator('.data-freshness summary')).toContainText('Snapshot partially available');
  expect(attempts).toBe(2);
  const diagnostics = await page.evaluate(() => window.darlingDataDiagnostics);
  expect(diagnostics.optionalFailures).toContainEqual({ asset: 'CurrentSeason', reason: 'integrity', code: 'SIZE_MISMATCH' });
});

test('warning disclosure is not clipped by the narrow mobile hero', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.route('**/assets/CurrentSeason.json*', route => {
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{"tampered":true}' });
  });
  await page.goto('/?tab=history');
  await expect(page.locator('.data-freshness summary')).toContainText('Snapshot partially available');
  await page.locator('.data-freshness summary').click();
  await page.locator('.data-freshness-panel p').evaluate(element => {
    element.textContent += ` ${'Additional verification guidance remains visible on narrow screens. '.repeat(4)}`;
  });

  const geometry = await page.evaluate(() => {
    const hero = document.querySelector('.site-hero');
    const panel = document.querySelector('.data-freshness-panel');
    const nav = document.querySelector('.primary-nav');
    if (!hero || !panel || !nav) return null;
    const heroBox = hero.getBoundingClientRect();
    const panelBox = panel.getBoundingClientRect();
    const overlapY = Math.max(panelBox.top, nav.getBoundingClientRect().top) + 1;
    const overlapX = panelBox.left + Math.min(16, panelBox.width / 2);
    return {
      overflow: getComputedStyle(hero).overflow,
      extendsPastHero: panelBox.bottom > heroBox.bottom,
      panelBottom: panelBox.bottom,
      viewportHeight: window.innerHeight,
      overlapOwner: document.elementFromPoint(overlapX, overlapY)?.closest('.data-freshness-panel') !== null,
    };
  });

  expect(geometry).not.toBeNull();
  expect(geometry.overflow).toBe('visible');
  expect(geometry.extendsPastHero).toBe(true);
  expect(geometry.panelBottom).toBeLessThanOrEqual(geometry.viewportHeight);
  expect(geometry.overlapOwner).toBe(true);
});

test('Draft Spot uses its own version and evicts a failed verification promise', async ({ page }) => {
  let attempts = 0;
  const requests = [];
  page.on('request', request => {
    if (request.url().includes('/assets/DraftSpot.json')) requests.push(request.url());
  });
  await page.route('**/assets/DraftSpot.json*', route => {
    attempts += 1;
    if (attempts <= 2) return route.fulfill({ status: 200, contentType: 'application/json', body: '{"tampered":true}' });
    return route.continue();
  });
  await page.goto('/?tab=history');
  expect(requests).toEqual([]);
  await page.locator('#tabDraftBtn').click();
  await expect(page.locator('#draftSpotRoot')).toContainText('Draft Spot is unavailable');
  expect(attempts).toBe(2);
  await page.locator('#tabHistoryBtn').click();
  await expect(page.locator('#historyGamesTable')).toBeVisible();
  await page.locator('#tabDraftBtn').click();
  await expect(page.locator('.draft-hero')).toBeVisible();
  expect(attempts).toBe(3);
  expect(new URL(requests.at(-1)).searchParams.get('v')).toBe(manifest.assets.DraftSpot.sha256.replace('sha256:', ''));
});

test('a long-open Pulse and global badge reassess together without network polling', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-08-14T23:59:00Z'));
  let dataRequests = 0;
  page.on('request', request => {
    if (request.url().includes('/assets/') && request.url().includes('.json')) dataRequests += 1;
  });
  await page.goto('/');
  await expect(page.locator('.data-freshness summary')).toContainText('2025 season final');
  const bootRequests = dataRequests;
  await page.clock.setFixedTime(new Date('2026-08-15T00:01:00Z'));
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(page.locator('.data-freshness summary')).toContainText('2026 data not available');
  await expect(page.locator('.pulse-data-note')).toContainText('2026 data not available');
  expect(dataRequests).toBe(bootRequests);
});

test('freshness disclosure remains available after visiting all eight tabs', async ({ page }) => {
  await page.goto('/');
  const tabs = [
    'League Pulse',
    'League History',
    'Current Season',
    'Head to Head',
    'Trophy Case',
    'Dynasty Rankings',
    'Draft Spot',
    'Historical Matchup',
  ];
  for (const name of tabs) {
    await page.getByRole('tab', { name }).click();
    await expect(page.getByRole('tabpanel', { name })).toBeVisible();
    await expect(page.locator('.data-freshness summary')).toContainText('2025 season final');
  }
});

const renderedStates = [
  {
    name: 'current',
    now: '2026-09-01T00:10:00Z',
    mutations: { CurrentSeason: activeSnapshot('2026-09-01T00:00:00Z') },
    label: 'Data current',
    detail: 'within the weekly update cadence',
  },
  {
    name: 'stale',
    now: '2026-09-20T00:00:00Z',
    mutations: { CurrentSeason: activeSnapshot('2026-09-01T00:00:00Z') },
    label: 'Data may be stale',
    detail: 'well beyond its expected weekly refresh',
  },
  {
    name: 'live-stale',
    now: '2026-09-01T01:00:00Z',
    mutations: { CurrentSeason: activeSnapshot('2026-09-01T00:00:00Z', 'live') },
    label: 'Live scores may be behind',
    detail: 'older than 30 minutes',
  },
  {
    name: 'season-gap',
    now: '2026-08-15T00:00:00Z',
    mutations: {},
    label: '2026 data not available',
    detail: 'expected but has not been published',
  },
  {
    name: 'unknown',
    now: '2026-07-23T00:00:00Z',
    mutations: {
      CurrentSeason(current) {
        current.generated_at = 'invalid';
      },
      SeasonSummary(rows) {
        rows.filter(row => row.season === 2025).forEach(row => {
          row.champion = false;
          row.saunders = false;
        });
      },
    },
    label: 'Freshness unknown',
    detail: 'No current-season snapshot is available',
  },
  {
    name: 'partial',
    now: '2026-07-23T00:00:00Z',
    mutations: {
      CurrentSeason(current) {
        current.generated_at = 'invalid';
      },
    },
    label: 'Snapshot partially available',
    detail: 'Unavailable: CurrentSeason',
  },
];

for (const state of renderedStates) {
  test(`${state.name} freshness renders its complete disclosure copy`, async ({ page }) => {
    await page.clock.setFixedTime(new Date(state.now));
    const fixture = createSnapshotFixture({ mutations: state.mutations });
    await fixture.install(page);
    await page.goto('/');
    await expect(page.locator('.data-freshness summary')).toContainText(state.label);
    await page.locator('.data-freshness summary').click();
    await expect(page.locator('.data-freshness-panel')).toContainText(state.detail);
    expect(fixture.rejected).toEqual([]);
  });
}

test('reload action performs a real reload and revalidates the no-store manifest', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-09-20T00:00:00Z'));
  const fixture = createSnapshotFixture({
    mutations: { CurrentSeason: activeSnapshot('2026-09-01T00:00:00Z') },
  });
  await fixture.install(page);
  await page.goto('/');
  await page.locator('.data-freshness summary').click();
  await expect(page.getByRole('button', { name: 'Reload to check again' })).toBeVisible();
  await Promise.all([
    page.waitForNavigation(),
    page.getByRole('button', { name: 'Reload to check again' }).click(),
  ]);
  await expect.poll(() => fixture.count('assets/asset-manifest.json')).toBe(2);
  const manifestFetches = (await fixture.observations(page))
    .filter(request => new URL(request.url, page.url()).pathname.endsWith('/assets/asset-manifest.json'));
  expect(manifestFetches).toHaveLength(2);
  expect(manifestFetches.every(request => request.cache === 'no-store')).toBe(true);
});

test('every runtime JSON request uses the deployment base path and full manifest version', async ({ page }) => {
  const basePath = process.env.PLAYWRIGHT_SERVER === 'preview' ? '/Darling/' : '/';
  const fixture = createSnapshotFixture({ basePath });
  await fixture.install(page);
  await page.goto('/');
  await page.getByRole('tab', { name: 'Draft Spot' }).click();
  await expect(page.locator('.draft-hero')).toBeVisible();

  const entries = { ...fixture.manifest.assets, DerivedStats: fixture.manifest.derived };
  for (const [name, entry] of Object.entries(entries)) {
    const requests = fixture.requests.filter(request => request.relativePath === entry.path);
    expect(requests.length, `${name} request count`).toBeGreaterThan(0);
    expect(requests.every(request => request.basePath === basePath), `${name} base path`).toBe(true);
    expect(requests.every(request => request.version === entry.sha256.replace('sha256:', '')), `${name} version`).toBe(true);
  }
  expect(fixture.rejected).toEqual([]);
});

test('forced-colors warning disclosure keeps logical focus and reading order', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-09-20T00:00:00Z'));
  await page.emulateMedia({ forcedColors: 'active' });
  const fixture = createSnapshotFixture({
    mutations: { CurrentSeason: activeSnapshot('2026-09-01T00:00:00Z') },
  });
  await fixture.install(page);
  await page.goto('/');
  const summary = page.locator('.data-freshness summary');
  await summary.focus();
  await page.keyboard.press('Enter');
  await expect(summary).toBeFocused();
  await expect(page.locator('.data-freshness')).toHaveAttribute('open', '');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Reload to check again' })).toBeFocused();
  const order = await page.locator('.data-freshness').evaluate(element => {
    const summaryBox = element.querySelector('summary').getBoundingClientRect();
    const panelBox = element.querySelector('.data-freshness-panel').getBoundingClientRect();
    return { summaryBottom: summaryBox.bottom, panelTop: panelBox.top };
  });
  expect(order.panelTop).toBeGreaterThanOrEqual(order.summaryBottom - 1);
});

test('time-only reassessment creates no assertive or duplicate announcement', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-09-07T00:00:00Z'));
  const fixture = createSnapshotFixture({
    mutations: { CurrentSeason: activeSnapshot('2026-09-01T00:00:00Z') },
  });
  await fixture.install(page);
  await page.goto('/');
  await expect(page.locator('.data-freshness summary')).toContainText('Data current');
  await page.clock.setFixedTime(new Date('2026-09-10T00:00:00Z'));
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(page.locator('.data-freshness summary')).toContainText('Data may be stale');
  await expect(page.locator('[aria-live="assertive"], [role="alert"]')).toHaveCount(0);
  await expect(page.locator('.data-freshness summary', { hasText: 'Data may be stale' })).toHaveCount(1);
});
