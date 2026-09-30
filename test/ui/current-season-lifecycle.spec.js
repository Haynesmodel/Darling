import { expect, test } from './coverage-fixture.js';
import { expectNoViolations } from './accessibility-helpers.js';
import { createSnapshotFixture, finalized2025 } from './snapshot-fixture.js';
import {
  finalizing2026,
  postseason2026,
  regularSeason2026,
  scheduled2026,
} from './season-phase-fixtures.js';

test.beforeEach(async ({ page }) => {
  await createSnapshotFixture({ mutations: { CurrentSeason: finalized2025 } }).install(page);
});

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

test('schedule comparison deep link, keyboard drilldown, donor URL, history, and mobile scrolling', async ({ page }) => {
  await createSnapshotFixture().install(page);
  const requests = [];
  page.on('request', request => requests.push(request.url()));
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto('/?tab=current&currentSeason=2026&currentWeek=3&currentView=schedule&currentOwner=Joe&currentScheduleOwner=Plot');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('#currentScheduleDisclosure')).toHaveAttribute('open', '');
  await expect(page.locator('#currentScheduleRoot table')).toHaveCount(2);
  await expect(page.locator('#currentScheduleRoot')).toContainText('Week 3');
  await expect(page.locator('#currentScheduleRoot')).toContainText('Scoring owner ↓ · borrowed schedule →');
  await expect(page.locator('#currentHero')).toContainText('2026 Schedule Comparison');
  await expect(page.locator('#currentHero')).toContainText('Through Week 3 · 18 completed regular-season games');
  await expect(page.locator('#currentHero')).not.toContainText('Model:');
  await expect(page.locator('#currentScheduleOwnerSelect')).toHaveValue('Plot');
  await expect(page.locator('#currentScheduleOwnerSelect option[value="Plot"]')).toHaveText('Plot VanDam');
  const easiestHeader = page.locator('th[title="Borrowed schedule: Plot VanDam"]');
  const hardestHeader = page.locator('th[title="Borrowed schedule: Joe-lene"]');
  await expect(easiestHeader).toContainText('🧁');
  await expect(easiestHeader.locator('.visually-hidden')).toHaveText('Easiest borrowed schedule by total wins across scoring owners');
  await expect(hardestHeader).toContainText('💀');
  await expect(hardestHeader.locator('.visually-hidden')).toHaveText('Hardest borrowed schedule by total wins across scoring owners');
  await expect(page.locator('.current-schedule-matrix thead .visually-hidden')).toHaveCount(2);
  await expect(page.locator('.current-schedule-legend')).toContainText('🧁 Easiest (most total wins); 💀 Hardest (fewest total wins)');
  const betterCell = page.locator('button[data-schedule-team="Joe"][data-schedule-donor="Plot"]');
  await expect(betterCell).toHaveAttribute('data-schedule-impact', 'improved');
  await expect(betterCell).toHaveAttribute('aria-label', /Better than actual by 3 win-equivalents/);
  await expect(page.locator('button[data-schedule-team="Joe"][data-schedule-donor="Joe"]')).toHaveAttribute('data-schedule-impact', 'actual');
  await expect(page.locator('button[data-schedule-team="Plot"][data-schedule-donor="Zubs"]')).toHaveAttribute('aria-label', /Worse than actual by 1 win-equivalent/);
  await expect(page.locator('button[data-schedule-team="Plot"][data-schedule-donor="Connor"]')).toHaveAttribute('aria-label', /Same as actual schedule/);
  const matrixRegion = page.locator('[aria-label^="Schedule matrix:"]');
  await matrixRegion.scrollIntoViewIfNeeded();
  const visibleSelectedResult = await matrixRegion.evaluate(element => {
    const region = element.getBoundingClientRect();
    const stickyRight = element.querySelector('tbody th').getBoundingClientRect().right;
    const button = element.querySelector('button[data-schedule-team="Joe"][data-schedule-donor="Plot"]');
    element.scrollLeft += button.getBoundingClientRect().left - stickyRight - 8;
    const box = button.getBoundingClientRect();
    const point = document.elementFromPoint((box.left + box.right) / 2, (box.top + box.bottom) / 2);
    return box.width >= 52 && box.left >= stickyRight && box.right <= region.right && box.top >= region.top && box.bottom <= region.bottom && (point === button || button.contains(point));
  });
  expect(visibleSelectedResult).toBe(true);
  await betterCell.hover();
  await expect(betterCell).toHaveCSS('text-decoration-line', 'underline');
  await expect(page.locator('button[data-schedule-team="Joe"][data-schedule-donor="Plot"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('button[data-schedule-team="Joe"][data-schedule-donor="Plot"]')).toHaveAttribute('aria-label', /Joe-lene under Plot.*schedule: \d+ wins, \d+ losses, \d+ ties/);
  await expectNoViolations(page, '#currentScheduleRoot');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expectNoViolations(page, '#currentScheduleRoot');
  await page.emulateMedia({ colorScheme: 'light' });
  await page.emulateMedia({ forcedColors: 'active' });
  await expect(betterCell).toBeVisible();
  expect(await betterCell.evaluate(button => getComputedStyle(button, '::before').content)).toContain('+');
  await expectNoViolations(page, '#currentScheduleRoot');
  await page.emulateMedia({ forcedColors: 'none' });
  await page.setViewportSize({ width: 1280, height: 900 });
  const desktopColumns = await matrixRegion.evaluate(region => ({
    visible: [...region.querySelectorAll('thead th:not(:first-child)')].filter(cell => {
      const box = cell.getBoundingClientRect(), clip = region.getBoundingClientRect();
      return box.left >= clip.left && box.right <= clip.right;
    }).length,
    total: region.querySelectorAll('thead th:not(:first-child)').length,
  }));
  expect(desktopColumns.visible).toBeGreaterThanOrEqual(10);
  expect(desktopColumns.total).toBe(12);
  await page.setViewportSize({ width: 640, height: 720 }); // 200% zoom on a 1280px viewport.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  expect(requests.some(url => url.includes('current-season-odds') || url.includes('plot-charts'))).toBe(false);

  const collision = page.locator('button[data-schedule-team="Joe"][data-schedule-donor="Nuss"]');
  await collision.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#currentScheduleRoot')).toContainText('T-D collision');
  await expect(page).toHaveURL(/currentOwner=Joe/);
  await expect(page).toHaveURL(/currentScheduleOwner=Nuss/);
  await expect(page.locator('button[data-schedule-team="Joe"][data-schedule-donor="Nuss"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#currentOwnerSelect')).toHaveValue('Joe');
  await expect(page.locator('#currentScheduleOwnerSelect')).toHaveValue('Nuss');
  await expect(page.locator('button[data-schedule-team="Joe"][data-schedule-donor="Nuss"]')).toBeFocused();
  await expect(page.locator('#currentScheduleDetailHeading')).toContainText("Joe-lene schedule detail · borrowing Dr. Nuss's schedule");

  await page.locator('#currentScheduleOwnerSelect').selectOption('Joel');
  await expect(page).toHaveURL(/currentScheduleOwner=Joel/);
  await page.reload();
  await expect(page.locator('#currentScheduleOwnerSelect')).toHaveValue('Joel');
  await page.goBack();
  await expect(page.locator('#currentScheduleOwnerSelect')).toHaveValue('Nuss');
  await page.goForward();
  await expect(page.locator('#currentScheduleOwnerSelect')).toHaveValue('Joel');
  await page.locator('#currentScheduleOwnerSelect').selectOption('Plot');
  await expect(page).toHaveURL(/currentScheduleOwner=Plot/);
  const nussWeekCell = page.locator('button[data-schedule-team="Nuss"][data-schedule-week="1"]');
  await nussWeekCell.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#currentScheduleWeek1 h4')).toBeFocused();
  await expect(page.locator('#currentOwnerSelect')).toHaveValue('Nuss');
  await expect(page.locator('#currentScheduleOwnerSelect')).toHaveValue('Nuss');
  await expect(page).toHaveURL(/currentOwner=Nuss/);
  await expect(page).not.toHaveURL(/currentScheduleOwner=/);
  const totalCell = page.locator('button[data-schedule-team="Nuss"][data-schedule-total]');
  await totalCell.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('button[data-schedule-team="Nuss"][data-schedule-total]')).toBeFocused();
  await page.goto('/?tab=current&currentSeason=2026&currentView=schedule&currentOwner=bad&currentScheduleOwner=Plot');
  await expect(page.locator('#currentOwnerSelect')).toHaveValue('');
  await expect(page.locator('#currentScheduleOwnerSelect')).toHaveValue('');
  await expect(page).not.toHaveURL(/currentScheduleOwner/);
  await page.goto('/?tab=current&currentSeason=2026&currentWeek=3&currentView=schedule');
  await expect(page.locator('#currentOwnerSelect')).toHaveValue('');
  await expect(page.locator('#currentScheduleOwnerSelect')).toHaveValue('');
  await expect(page.locator('#currentScheduleRoot table')).toHaveCount(2);
  await expect(page.locator('#currentScheduleDetailHeading')).toHaveCount(0);
  await expect(page.locator('#currentScheduleRoot')).toContainText('Select a team or matrix cell to view its schedule detail.');
  await expect(page.locator('#currentScheduleRoot button[aria-pressed="true"]')).toHaveCount(0);
  await page.goto('/?tab=current&currentSeason=2026&currentWeek=3&currentView=command&currentOwner=Joe');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('#currentOwnerSelect')).toHaveValue('Joe');
  await expect(page).toHaveURL(/currentOwner=Joe/);
  await expect(page.locator('#currentHero')).toContainText('Joe: Week');
  await page.locator('#currentWeekSelect').selectOption('1');
  await expect(page.locator('#currentHero')).toContainText('Joe: Week');
  await expect(page).toHaveURL(/currentOwner=Joe/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  expect(await page.locator('.current-schedule-scroll').evaluateAll(rows => rows.every(row => row.scrollWidth >= row.clientWidth))).toBe(true);
});

test('schedule matrix and all-play selections update state and retain usable focus', async ({ page }) => {
  await createSnapshotFixture().install(page);
  await page.goto('/?tab=current&currentSeason=2026&currentWeek=3&currentView=schedule&currentOwner=Joe&currentScheduleOwner=Plot');
  await expect(page.locator('#currentScheduleOwnerSelect')).toHaveValue('Plot');

  const matrixCell = page.locator('button[data-schedule-team="Joe"][data-schedule-donor="Nuss"]');
  await matrixCell.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/currentScheduleOwner=Nuss/);
  await expect(page.locator('button[data-schedule-team="Joe"][data-schedule-donor="Nuss"]')).toBeFocused();

  const weekCell = page.locator('button[data-schedule-team="Nuss"][data-schedule-week="1"]');
  await weekCell.click();
  await expect(page.locator('#currentScheduleWeek1 h4')).toBeFocused();
  await expect(page.locator('#currentOwnerSelect')).toHaveValue('Nuss');
  await expect(page.locator('#currentScheduleOwnerSelect')).toHaveValue('Nuss');

  const totalCell = page.locator('button[data-schedule-team="Joe"][data-schedule-total]');
  await totalCell.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('button[data-schedule-team="Joe"][data-schedule-total]')).toBeFocused();
  await expect(page.locator('#currentOwnerSelect')).toHaveValue('Joe');
  await expect(page.locator('#currentScheduleOwnerSelect')).toHaveValue('Joe');
  await expect(page).not.toHaveURL(/currentScheduleOwner=/);
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
      SeasonSummary: rows => [...rows, { ...rows.find(row => Number(row.season) === 2025), season: 2026, owner: 'StaleOwner' }],
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

  await page.goto('/?tab=current&currentSeason=2026&currentView=schedule');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('#currentWeekSelect')).toBeEnabled();
  await expect(page.locator('#currentWeekSelect')).toHaveValue('1');
  await expect(page.locator('#currentOwnerSelect')).toBeEnabled();
  await expect(page.locator('#currentScheduleOwnerSelect')).toBeEnabled();
  await expect(page.locator('#currentOwnerSelect option[value="Joe"]')).toHaveCount(1);
  await expect(page.locator('#currentOwnerSelect option[value="StaleOwner"]')).toHaveCount(0);
  await expect(page.locator('#currentScheduleOwnerSelect option[value="StaleOwner"]')).toHaveCount(0);
  await page.locator('#currentOwnerSelect').selectOption('Joe');
  await page.locator('#currentScheduleOwnerSelect').selectOption('Plot');
  await expect(page.locator('#currentScheduleRoot')).toContainText('No complete final regular-season weeks');
});

test('schedule falls back to historical games when optional Current Season data fails', async ({ page }) => {
  const fixture = createSnapshotFixture({ mutations: { CurrentSeason: finalized2025 } });
  await fixture.install(page);
  await page.route('**/assets/CurrentSeason.json*', route => route.fulfill({ status: 404, body: 'unavailable' }));
  await page.goto('/?tab=current&currentSeason=2025&currentWeek=17&currentView=schedule&currentOwner=Joe');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('#currentScheduleRoot table')).toHaveCount(2);
  await expect(page.locator('#currentHero')).toContainText('Through Postseason Week 17');
  await expect(page.locator('#currentScheduleRoot')).toContainText('Actual record');
  await expect(page.locator('#currentScheduleOwnerSelect option[value="Joe"]')).toHaveText('Joe');
  await expect(page.locator('#currentScheduleRoot table:first-of-type tbody tr')).not.toHaveCount(0);
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

test('provisional current scores do not create final recap claims', async ({ page }) => {
  const fixture = createSnapshotFixture({ mutations: { CurrentSeason: (current, assets) => regularSeason2026(current, true, assets) } });
  await fixture.install(page);
  await page.goto('/?tab=current&currentView=recap');
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('button', { name: /Share .* card/i })).toHaveCount(0);
  await expect(page.locator('#currentRecap')).not.toContainText(/Joe\s+defeated\s+Shap/i);
  await page.goto('/?tab=current&currentView=command');
  await page.waitForLoadState('networkidle');
  await expect(page.getByText('Copy matchup link').first()).toBeVisible();
});

test('live regular season retains command movement, owner paths, and odds', async ({ page }) => {
  const fixture = createSnapshotFixture({
    mutations: { CurrentSeason: (current, assets) => regularSeason2026(current, true, assets) },
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
    mutations: { CurrentSeason: (current, assets) => regularSeason2026(current, false, assets) },
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
