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
  await expect(page.locator('#currentScheduleOwnerLabel')).toContainText('Use schedule from:');
  await expect(page.locator('#currentScheduleOwnerLabel')).not.toContainText('Schedule donor:');
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
  const actualCell = page.locator('button[data-schedule-team="Joe"][data-schedule-donor="Joe"]');
  await expect(actualCell).toHaveAttribute('data-schedule-impact', 'actual');
  const normalActualStyle = await actualCell.evaluate(button => ({
    shadow: getComputedStyle(button).boxShadow,
    buttonBorder: getComputedStyle(button).borderWidth,
  }));
  expect(normalActualStyle.shadow).toContain('2px');
  expect(normalActualStyle.buttonBorder).toBe('0px');
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
  const forcedActualStyle = await actualCell.evaluate(button => ({
    outlineWidth: getComputedStyle(button).outlineWidth,
    outlineStyle: getComputedStyle(button).outlineStyle,
    buttonBorder: getComputedStyle(button).borderWidth,
    cellRightBorder: getComputedStyle(button.closest('td')).borderRightWidth,
    cellBottomBorder: getComputedStyle(button.closest('td')).borderBottomWidth,
  }));
  expect(forcedActualStyle.outlineWidth).toBe('2px');
  expect(forcedActualStyle.outlineStyle).toBe('solid');
  expect(forcedActualStyle.buttonBorder).toBe('0px');
  expect(forcedActualStyle.cellRightBorder).toBe('1px');
  expect(forcedActualStyle.cellBottomBorder).toBe('1px');
  await betterCell.focus();
  await expect(betterCell).toBeFocused();
  await expect(betterCell).toHaveCSS('outline-style', 'solid');
  await expect(betterCell).toHaveCSS('outline-width', '3px');
  await expect(betterCell).toHaveCSS('text-decoration-line', 'underline');
  expect(await betterCell.evaluate(button => getComputedStyle(button).borderBottomWidth)).toBe('0px');
  expect(await betterCell.evaluate(button => getComputedStyle(button, '::before').content)).toBe('none');
  await expect(betterCell).toHaveAttribute('aria-label', /Better than actual by 3 win-equivalents/);
  await expectNoViolations(page, '#currentScheduleRoot');
  await page.emulateMedia({ forcedColors: 'none' });
  await page.setViewportSize({ width: 1280, height: 900 });
  await actualCell.hover();
  expect(await actualCell.evaluate(button => getComputedStyle(button).boxShadow)).toContain('2px');
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
  await expect(page.locator('#currentScheduleRoot')).toContainText("Joe-lene was on Dr. Nuss's schedule this week, so Dr. Nuss is the opponent instead");
  await expect(page.locator('#currentScheduleRoot')).not.toContainText('T-D collision');
  await expect(page.locator('#currentScheduleRoot')).not.toContainText('donor substituted');
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

test('Playoff Machine deep link, provisional picks, exact score inputs, reset, and visit lifecycle', async ({ page }) => {
  const fixture = createSnapshotFixture({ mutations: { CurrentSeason: (current, assets) => regularSeason2026(current, true, assets) } });
  const requests = [];
  page.on('request', request => requests.push(request.url()));
  await fixture.install(page);
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto('/?tab=current&currentSeason=2026&currentView=machine');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('#currentViewSelect')).toHaveValue('machine');
  await expect(page.locator('#currentViewSelect option[value="machine"]')).toHaveText('Playoff Machine');
  await expect(page.locator('#currentPlayoffMachineDisclosure')).toHaveAttribute('open', '');
  await expect(page.locator('#currentPlayoffMachine')).toContainText('Provisional');
  await expect(page.locator('#currentPlayoffMachine .current-machine-race tbody tr')).toHaveCount(7);
  await expect(page.locator('#currentPlayoffMachine .current-machine-results tbody tr')).toHaveCount(12);
  await expect(page.locator('#currentPlayoffMachine')).toContainText('schedule has missing or duplicate team appearances');
  const pick = page.locator('#currentPlayoffMachine button[data-machine-action="outcome"]').first();
  const announcement = page.locator('#currentMachineAnnouncement');
  const beforePickAnnouncement = await announcement.textContent();
  await pick.focus();
  await page.keyboard.press('Enter');
  await expect(pick).toHaveAttribute('aria-pressed', 'true');
  await expect(pick).toBeFocused();
  await expect(announcement).not.toHaveText(beforePickAnnouncement || '');
  await expect(announcement).toContainText('Picked Connor');
  const firstScore = page.locator('#currentPlayoffMachine input[data-machine-score="a"]').first();
  const beforeScoreAnnouncement = await announcement.textContent();
  await firstScore.fill('0');
  await expect(firstScore).toBeFocused();
  await expect(announcement).not.toHaveText(beforeScoreAnnouncement || '');
  await expect(announcement).toContainText('Updated Connor score to 0');
  const beforeOtherScoreAnnouncement = await announcement.textContent();
  await page.locator('#currentPlayoffMachine input[data-machine-score="b"]').first().fill('0');
  await expect(announcement).not.toHaveText(beforeOtherScoreAnnouncement || '');
  await expect(announcement).toContainText('Updated Singer score to 0');
  await expect(page.locator('#currentPlayoffMachine')).toContainText('Winner picks are provisional; exact placement needs scores for all remaining games.');
  await page.locator('#currentPlayoffMachine button[data-machine-action="reset"]').click();
  await expect(page.locator('#currentPlayoffMachine input[data-machine-score="a"]').first()).toHaveValue('');
  await page.screenshot({ path: test.info().outputPath('playoff-machine-mobile.png'), fullPage: true });
  await expect(page).toHaveURL(/currentView=machine/);
  expect(requests.some(url => url.includes('current-season-odds'))).toBe(false);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  const scoreControlHeights = await page.locator('#currentPlayoffMachine .current-machine-scores input, #currentPlayoffMachine .current-machine-scores button')
    .evaluateAll(elements => elements.map(element => element.getBoundingClientRect().height));
  expect(scoreControlHeights.length).toBeGreaterThan(0);
  expect(scoreControlHeights.every(height => height >= 40)).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await expectNoViolations(page, '#currentPlayoffMachine');

  await page.locator('#currentViewSelect').selectOption('matchups');
  await page.locator('#currentViewSelect').selectOption('machine');
  await expect(page.locator('#currentPlayoffMachine input[data-machine-score="a"]').first()).toHaveValue('');
  await page.reload();
  await expect(page.locator('#currentViewSelect')).toHaveValue('machine');
  await expect(page.locator('#currentPlayoffMachine input[data-machine-score="a"]').first()).toHaveValue('');
  await page.locator('#currentSeasonSelect').selectOption('2025');
  await expect(page.locator('#currentPlayoffMachine')).toContainText('available during the active regular season');
});

test('Playoff Machine disables duplicate-game controls in production DOM', async ({ page }) => {
  const fixture = createSnapshotFixture({ mutations: { CurrentSeason: (current, assets) => {
    regularSeason2026(current, false, assets);
    const unresolved = current.games.find(game => game.week === 2);
    current.games.push({ ...unresolved });
  } } });
  await fixture.install(page);
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto('/?tab=current&currentSeason=2026&currentView=machine');
  await page.waitForLoadState('networkidle');

  const duplicateButton = page.locator('#currentPlayoffMachine button[data-machine-action="clear-game"]').first();
  await expect(duplicateButton).toHaveAttribute('disabled', '');
  const duplicateKey = await duplicateButton.getAttribute('data-game-key');
  const controls = page.locator(`#currentPlayoffMachine [data-game-key="${duplicateKey}"]`);
  await expect(controls).toHaveCount(12);
  expect(await controls.evaluateAll(elements => elements.every(element => element.disabled))).toBe(true);
  expect(await page.locator('#currentPlayoffMachine').evaluate(element => element.innerHTML.includes('=""=""'))).toBe(false);
  await expectNoViolations(page, '#currentPlayoffMachine');
});

test('Playoff Machine click controls navigate weeks and clear scoped or all edits', async ({ page }) => {
  await createSnapshotFixture().install(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/?tab=current&currentSeason=2026&currentView=machine');
  await page.waitForLoadState('networkidle');
  const machine = page.locator('#currentPlayoffMachine');
  const announcement = page.locator('#currentMachineAnnouncement');
  const weekLabel = machine.locator('.current-machine-week-nav strong');
  const weekNumber = async () => Number((await weekLabel.textContent()).match(/Week (\d+)/)?.[1]);
  const startWeek = await weekNumber();

  await machine.locator('button[data-machine-action="week-next"]').click();
  await expect(weekLabel).toContainText(`Week ${startWeek + 1}`);
  await expect(announcement).toContainText(`Showing week ${startWeek + 1}`);
  await machine.locator('button[data-machine-action="week-prev"]').click();
  await expect(weekLabel).toContainText(`Week ${startWeek}`);

  const firstGame = machine.locator('.current-machine-game').first();
  const pick = firstGame.locator('button[data-machine-action="outcome"]').first();
  await pick.click();
  await expect(pick).toHaveAttribute('aria-pressed', 'true');
  await expect(announcement).toContainText('Picked');
  await firstGame.locator('button[data-machine-action="clear-game"]').click();
  await expect(firstGame.locator('button[data-machine-action="outcome"]').first()).toHaveAttribute('aria-pressed', 'false');
  await expect(announcement).toContainText('Cleared a matchup pick');

  await firstGame.locator('button[data-machine-action="outcome"]').first().click();
  await machine.locator('button[data-machine-action="clear-week"]').click();
  await expect(firstGame.locator('button[data-machine-action="outcome"]').first()).toHaveAttribute('aria-pressed', 'false');
  await expect(announcement).toContainText(`Cleared week ${startWeek}`);

  await firstGame.locator('button[data-machine-action="outcome"]').first().click();
  await machine.locator('button[data-machine-action="reset"]').click();
  await expect(machine.locator('button[data-machine-action="outcome"][aria-pressed="true"]')).toHaveCount(0);
  await expect(announcement).toContainText('Reset all scenario picks');
});

test('Playoff Machine shows exact six-seed board when every remaining game has scores', async ({ page }) => {
  const fixture = createSnapshotFixture({ mutations: { CurrentSeason: current => {
    const unresolved = current.games.find(game => !['final', 'complete', 'completed'].includes(String(game.status).toLowerCase()));
    current.current_week = 14;
    current.games = current.games.map(game => game === unresolved
      ? { ...game, status: 'scheduled', scoreA: null, scoreB: null }
      : ['final', 'complete', 'completed'].includes(String(game.status).toLowerCase())
        ? game
        : { ...game, status: 'final', scoreA: 100, scoreB: 90 });
  } } });
  await fixture.install(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/?tab=current&currentSeason=2026&currentView=machine');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('#currentPlayoffMachine')).toContainText('Provisional');
  const bracketTrigger = page.locator('#currentPlayoffMachine button[data-machine-action="view-bracket"]');
  const bracketDialog = page.locator('#currentMachineBracketDialog');
  await bracketTrigger.click();
  await expect(bracketDialog).toBeVisible();
  await expect(bracketDialog).toContainText('0 of 1 remaining games have complete scenario scores');
  await expect(bracketDialog).toContainText('Seeds and matchups are withheld');
  await expect(bracketDialog).not.toContainText('Seed 6');
  await page.keyboard.press('Escape');
  await expect(bracketDialog).not.toBeVisible();
  await expect(bracketTrigger).toBeFocused();
  await page.screenshot({ path: test.info().outputPath('playoff-machine-provisional-desktop.png'), fullPage: true });
  await page.locator('#currentPlayoffMachine input[data-machine-score="a"]').fill('100');
  await page.locator('#currentPlayoffMachine input[data-machine-score="b"]').fill('90');

  await expect(page.locator('#currentPlayoffMachine')).toContainText('Exact for this scenario');
  await expect(page.locator('#currentPlayoffMachine button[data-outcome="a"]').first()).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#currentPlayoffMachine .current-machine-seed-board article')).toHaveCount(6);
  await expect(page.locator('#currentPlayoffMachine .current-machine-race tbody tr')).toHaveCount(7);
  const sixthSeedOwner = await page.locator('#currentPlayoffMachine .current-machine-seed-board article').last().locator('strong').textContent();
  await expect(page.locator('#currentPlayoffMachine .current-machine-race tbody tr').filter({ hasText: sixthSeedOwner || '' })).toHaveCount(1);
  await expect(page.locator('#currentPlayoffMachine .current-machine-game').first().locator(':scope > div')).toHaveCount(3);
  await expect(page.locator('#currentPlayoffMachine .current-machine-results tbody tr')).toHaveCount(12);
  await expect(page.locator('#currentPlayoffMachine .current-machine-seed-board')).toContainText('Seed 6');
  await bracketTrigger.click();
  await expect(bracketDialog).toBeVisible();
  await expect(bracketDialog).toContainText('Exact six-seed bracket for this regular-season score scenario');
  await expect(bracketDialog.locator('.current-machine-bracket-grid > section').first()).toContainText('Seed 1');
  await expect(bracketDialog.locator('.current-machine-bracket-grid > section').first()).toContainText('Seed 2');
  await expect(bracketDialog.locator('.current-machine-bracket-openers section')).toHaveCount(2);
  await expect(bracketDialog.locator('.current-machine-bracket-openers')).toContainText('Seed 3');
  await expect(bracketDialog.locator('.current-machine-bracket-openers')).toContainText('Seed 6');
  await expect(bracketDialog).toContainText('Winner TBD');
  await page.screenshot({ path: test.info().outputPath('playoff-machine-exact-bracket-dialog.png') });
  await expectNoViolations(page, '#currentMachineBracketDialog');
  await page.setViewportSize({ width: 320, height: 720 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  expect(await bracketDialog.evaluate(dialog => dialog.scrollHeight > dialog.clientHeight)).toBe(true);
  await page.screenshot({ path: test.info().outputPath('playoff-machine-exact-bracket-dialog-mobile.png') });
  await bracketDialog.getByRole('button', { name: 'Close playoff bracket' }).click();
  await expect(bracketDialog).not.toBeVisible();
  await expect(bracketTrigger).toBeFocused();
  await page.screenshot({ path: test.info().outputPath('playoff-machine-exact-seed-board.png'), fullPage: true });
  await page.emulateMedia({ forcedColors: 'active' });
  await expect(page.locator('#currentPlayoffMachine .current-machine-seed-board')).toBeVisible();
  await page.setViewportSize({ width: 640, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await expectNoViolations(page, '#currentPlayoffMachine');
  await bracketTrigger.click();
  await page.locator('#primaryNavigation a[data-feature-id="pulse"]').evaluate(anchor => anchor.click());
  await expect(bracketDialog).not.toBeVisible();
  await expect(page.locator('#currentMachineBracketTitle')).toHaveText('Playoff bracket');
  await page.locator('#primaryNavigation a[data-feature-id="current"]').evaluate(anchor => anchor.click());
  await expect(page.locator('#currentPlayoffMachine button[data-machine-action="view-bracket"]')).toBeVisible();
  await page.locator('#currentPlayoffMachine button[data-machine-action="view-bracket"]').click();
  await expect(bracketDialog).toBeVisible();
  await expect(bracketDialog).toContainText('Exact six-seed bracket');
  await page.keyboard.press('Escape');
});

test('Playoff Machine bracket stays unresolved for a completed points-for tie', async ({ page }) => {
  const fixture = createSnapshotFixture({ mutations: { CurrentSeason: current => {
    current.current_week = 14;
    const remaining = current.games.at(-1);
    current.games = current.games.map(game => game === remaining
      ? { ...game, status: 'scheduled', scoreA: null, scoreB: null }
      : { ...game, status: 'final', scoreA: 100, scoreB: 100 });
  } } });
  await fixture.install(page);
  await page.goto('/?tab=current&currentSeason=2026&currentView=machine');
  await page.waitForLoadState('networkidle');
  await page.locator('#currentPlayoffMachine input[data-machine-score="a"]').fill('100');
  await page.locator('#currentPlayoffMachine input[data-machine-score="b"]').fill('100');
  await expect(page.locator('#currentPlayoffMachine')).toContainText('Scores complete · sixth spot unresolved');
  const dialog = page.locator('#currentMachineBracketDialog');
  await page.locator('#currentPlayoffMachine button[data-machine-action="view-bracket"]').click();
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('No official points-for tiebreak has been set');
  await expect(dialog).not.toContainText('Opening round');
  await expect(dialog).not.toContainText('Seed 6');
  await expectNoViolations(page, '#currentMachineBracketDialog');
  await page.keyboard.press('Escape');
});
