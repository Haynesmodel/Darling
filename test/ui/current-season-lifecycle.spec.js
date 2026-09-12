import { expect, test } from './coverage-fixture.js';
import { createSnapshotFixture } from './snapshot-fixture.js';
import {
  finalizing2026,
  postseason2026,
  regularSeason2026,
  scheduled2026,
} from './season-phase-fixtures.js';

test('canonical finalized Current opens a compact authoritative recap without odds work', async ({ page }) => {
  const requests = [];
  page.on('request', request => requests.push(request.url()));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?tab=current');
  await page.waitForLoadState('networkidle');

  await expect(page.locator('#currentViewSelect')).toHaveValue('recap');
  await expect(page.locator('#currentRecap')).toContainText('Zook');
  await expect(page.locator('#currentRecap')).toContainText('Singer');
  await expect(page.locator('#currentRecap')).toContainText('Connor');
  await expect(page.locator('#currentRecap')).toContainText('Final Standings');
  await expect(page.getByText('If Scores Hold', { exact: true })).toBeHidden();
  expect(requests.some(url => url.includes('current-season-odds'))).toBe(false);
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(9000);
  await expect(page.locator('#current-section-jump')).toHaveValue('current-recap');
});

test('empty upcoming Current data keeps the picker, recap, and title on one season', async ({ page }) => {
  const fixture = createSnapshotFixture({
    mutations: {
      CurrentSeason: current => {
        current.season = 2026;
        current.current_week = 1;
        current.weeks_fetched = [];
        current.games = [];
      },
    },
  });
  await fixture.install(page);

  await page.goto('/?tab=current');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('#currentSeasonSelect')).toHaveValue('2025');
  await expect(page.locator('#currentHero h3')).toHaveText('2025 Recap');
  await expect(page.locator('#currentRecap')).toContainText('Zook');

  await page.goto('/?tab=current&currentSeason=2026');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('#currentSeasonSelect')).toHaveValue('2026');
  await expect(page.locator('#currentHero h3')).toHaveText('2026 Recap');
  await expect(page.locator('#currentRecap')).toContainText('Authoritative honors pending');
  await expect(page.locator('#currentRecap')).not.toContainText('Zook');
});

test('explicit finalized command and recap views survive reload', async ({ page }) => {
  await page.goto('/?tab=current&currentView=command');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('#currentViewSelect')).toHaveValue('command');
  await expect(page).toHaveURL(/currentView=command/);
  await page.reload();
  await expect(page.locator('#currentViewSelect')).toHaveValue('command');
  await expect(page.locator('#currentHero')).toContainText('historical/final analysis');
  await expect(page.getByText('If Scores Hold', { exact: true })).toBeHidden();

  await page.goto('/?tab=current&currentView=recap');
  await page.waitForLoadState('networkidle');
  await page.reload();
  await expect(page.locator('#currentViewSelect')).toHaveValue('recap');
});

test('preseason defaults to preview and does not request probability work', async ({ page }) => {
  const fixture = createSnapshotFixture({ mutations: { CurrentSeason: scheduled2026 } });
  const requests = [];
  page.on('request', request => requests.push(request.url()));
  await fixture.install(page);
  await page.goto('/?tab=current');
  await page.waitForLoadState('networkidle');

  await expect(page.locator('#currentViewSelect')).toHaveValue('recap');
  await expect(page.locator('#currentRecap')).toContainText('Season Preview');
  await expect(page.locator('#currentRecap')).toContainText('Available Schedule');
  await expect(page.locator('#currentRecap')).toContainText('Defending champion');
  await expect(page.locator('#currentStandings')).toBeHidden();
  expect(requests.some(url => url.includes('current-season-odds'))).toBe(false);
});

test('live regular season retains command movement, owner paths, and odds', async ({ page }) => {
  const fixture = createSnapshotFixture({
    mutations: { CurrentSeason: current => regularSeason2026(current, true) },
  });
  const requests = [];
  page.on('request', request => requests.push(request.url()));
  await fixture.install(page);
  await page.goto('/?tab=current');
  await page.waitForLoadState('networkidle');

  await expect(page.locator('#currentViewSelect')).toHaveValue('command');
  await expect(page.locator('#currentMatchups')).toBeVisible();
  await expect(page.locator('#currentPlayoffPicture')).toBeVisible();
  await expect(page.locator('#currentLiveMovement')).toBeVisible();
  await expect(page.locator('#currentLiveMovement')).toContainText('If scores hold');
  await expect(page.locator('#currentPlayoffPicture')).toContainText('Playoffs');
  await expect(page.locator('.current-odds-methodology')).toBeVisible();
  if (process.env.PLAYWRIGHT_SERVER !== 'preview') {
    expect(requests.some(url => url.includes('current-season-odds'))).toBe(true);
  }

  await page.locator('#current-section-jump').selectOption('current-projected-standings');
  await expect(page.locator('#currentProjectedStandingsPlot svg')).toHaveCount(1);
  await expect(page.locator('[data-table-id="current-projected"] tbody tr')).not.toHaveCount(0);
  await page.locator('#currentProjectedStandingsDisclosure > summary').click();
  await page.locator('#currentProjectedStandingsDisclosure > summary').click();
  await expect(page.locator('#currentProjectedStandingsPlot svg')).toHaveCount(1);
});

test('completed regular week removes live wording while retaining actual command context', async ({ page }) => {
  const fixture = createSnapshotFixture({
    mutations: { CurrentSeason: current => regularSeason2026(current, false) },
  });
  await fixture.install(page);
  await page.goto('/?tab=current');
  await page.waitForLoadState('networkidle');

  await expect(page.locator('#currentViewSelect')).toHaveValue('command');
  await expect(page.locator('#currentMatchups')).toBeVisible();
  await expect(page.locator('#currentLiveMovement')).toBeHidden();
  await expect(page.locator('#current-section-jump')).toContainText('Standings Movement');
});

test('postseason separates trophy paths and suppresses remaining-season odds', async ({ page }) => {
  const fixture = createSnapshotFixture({ mutations: { CurrentSeason: postseason2026 } });
  const requests = [];
  page.on('request', request => requests.push(request.url()));
  await fixture.install(page);
  await page.goto('/?tab=current');
  await page.waitForLoadState('networkidle');

  await expect(page.locator('#currentViewSelect')).toHaveValue('command');
  await expect(page.locator('#currentMatchups')).toContainText('Championship Path');
  await expect(page.locator('#currentMatchups')).toContainText('Saunders Path');
  await expect(page.locator('#currentProjectedStandings')).toBeHidden();
  expect(requests.some(url => url.includes('current-season-odds'))).toBe(false);
});

test('finalizing recap withholds honors and historical selection has no live claim', async ({ page }) => {
  const fixture = createSnapshotFixture({ mutations: { CurrentSeason: finalizing2026 } });
  await fixture.install(page);
  await page.goto('/?tab=current');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('#currentViewSelect')).toHaveValue('recap');
  await expect(page.locator('#currentRecap')).toContainText('Authoritative honors pending');
  await expect(page.locator('#currentRecap')).not.toContainText('Zook 153.74');

  await page.goto('/?tab=current&currentSeason=2024');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('#currentViewSelect')).toHaveValue('recap');
  await expect(page.locator('#currentHero')).toContainText('historical snapshot');
  await expect(page.locator('#currentHero')).not.toContainText('Sleeper');
});

test('section jump and focus links reveal targets without adding disclosure URL state', async ({ page }) => {
  await page.goto('/?tab=current&currentView=command');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('#currentStandingsDisclosure')).not.toHaveAttribute('open', '');
  const before = page.url();
  await page.locator('#current-section-jump').selectOption('current-standings');
  await expect(page.locator('#currentStandingsDisclosure')).toHaveAttribute('open', '');
  await expect(page.locator('#currentStandingsDisclosure > summary')).toBeFocused();
  expect(page.url()).toBe(before);

  await page.goto('/?tab=current&currentView=command&focus=standings');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('#currentStandingsDisclosure')).toHaveAttribute('open', '');
  await expect(page.locator('#currentStandings')).toBeFocused();
});
