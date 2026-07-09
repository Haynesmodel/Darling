import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';

function slugifyTitle(title) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

async function startBrowserCoverage(page, browserName) {
  if (browserName !== 'chromium') return null;
  const session = await page.context().newCDPSession(page);
  await session.send('Profiler.enable');
  await session.send('Profiler.startPreciseCoverage', {
    callCount: true,
    detailed: true,
  });
  return session;
}

async function stopBrowserCoverage(session, title) {
  if (!session) return;
  const coverage = await session.send('Profiler.takePreciseCoverage');
  await session.send('Profiler.stopPreciseCoverage');
  await session.send('Profiler.disable');

  const outDir = path.join(process.cwd(), 'coverage', '.v8');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, `ui-${slugifyTitle(title)}.json`),
    JSON.stringify({ result: coverage.result }, null, 2),
  );
}

async function downloadText(download) {
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

test.beforeEach(async ({ page, browserName }, testInfo) => {
  const browserErrors = [];
  const expectedFailureTest = testInfo.title.includes('fetch failure');

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      browserErrors.push(`console.error: ${msg.text()}`);
    }
  });
  page.on('pageerror', (err) => {
    browserErrors.push(`pageerror: ${err.message}`);
  });
  page.on('response', (response) => {
    const url = response.url();
    if (response.status() >= 400 && /\.(json|js|css|jpeg|jpg|png)$/.test(url)) {
      browserErrors.push(`asset ${response.status()}: ${url}`);
    }
  });

  page.__browserErrors = browserErrors;
  page.__allowExpectedFailure = expectedFailureTest;
  page.__browserCoverageSession = await startBrowserCoverage(page, browserName);
});

test.afterEach(async ({ page }, testInfo) => {
  await stopBrowserCoverage(page.__browserCoverageSession, testInfo.title);

  const errors = page.__browserErrors || [];
  if (page.__allowExpectedFailure) {
    const unexpected = errors.filter(error =>
      !error.includes('Failed to load league JSON') &&
      !error.includes('Failed to load resource: the server responded with a status of 500') &&
      !error.includes('asset 500:') &&
      !error.includes('/assets/H2H.json')
    );
    expect(unexpected).toEqual([]);
    return;
  }
  expect(errors).toEqual([]);
});

test('page loads and renders the history tables', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  await expect(page.locator('#appStatus')).toBeHidden();
  await expect(page.locator('header h2')).toHaveText('Joe');
  expect(await page.evaluate(() => typeof window.triggerGroupEgg)).toBe('undefined');
  expect(await page.evaluate(() => typeof window.setGroupBackdrop)).toBe('undefined');

  const seasonCount = await page.locator('#seasonRecapTable tbody tr').count();
  const weekCount = await page.locator('#weekTable tbody tr').count();
  const historyCount = await page.locator('#historyGamesTable tbody tr').count();

  expect(seasonCount).toBeGreaterThan(0);
  expect(weekCount).toBeGreaterThan(0);
  expect(historyCount).toBeGreaterThan(0);
  expect(weekCount).toBe(historyCount);
});

test('changing the team updates the rendered rows and url state', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  const teamSelect = page.locator('#teamSelect');
  const originalWeekCount = await page.locator('#weekTable tbody tr').count();

  const optionValues = await teamSelect.locator('option').evaluateAll(options =>
    options.map(option => option.value).filter(value => value && value !== '__ALL__')
  );
  const nextTeam = optionValues.find(value => value !== 'Joe');

  expect(nextTeam).toBeTruthy();

  await teamSelect.selectOption(nextTeam);
  await page.waitForLoadState('networkidle');

  const nextWeekCount = await page.locator('#weekTable tbody tr').count();
  const nextHistoryCount = await page.locator('#historyGamesTable tbody tr').count();

  expect(page.url()).toContain(`team=${encodeURIComponent(nextTeam)}`);
  expect(nextWeekCount).toBe(nextHistoryCount);
  expect(nextWeekCount).not.toBe(originalWeekCount);
});

test('current season tab renders matchups and links to head to head context', async ({ page }) => {
  await page.goto('/?tab=current');
  await page.waitForLoadState('networkidle');

  await expect(page.locator('#tabCurrentBtn')).toHaveClass(/active/);
  await expect(page.locator('#currentSeasonSelect')).toBeVisible();
  await expect(page.locator('#currentWeekSelect')).toBeVisible();
  await expect(page.locator('#currentViewSelect')).toBeVisible();
  await expect(page.locator('#currentOwnerSelect')).toBeVisible();
  await expect(page.locator('#currentProjectionSelect')).toBeVisible();
  await expect(page.locator('#currentProjectionSelect')).toHaveValue('ifScoresHold');
  await expect(page.locator('#currentHero')).toContainText('Current Season');
  await expect(page.locator('#currentPlayoffPicture')).toContainText('Playoff Picture');
  await expect(page.locator('#currentPlayoffPicture')).toContainText('Saunders danger');
  await expect(page.locator('#currentWeekNeeds')).toContainText('This Week Needs');
  await expect(page.locator('#currentProjectedStandings')).toContainText('Projected Standings');
  await expect(page.locator('#currentProjectedStandings')).toContainText('Method:');

  const matchupCount = await page.locator('.current-matchup-card').count();
  const standingsRows = await page.locator('#currentStandings tbody tr').count();
  const snapshotCount = await page.locator('.current-snapshot-card').count();
  expect(matchupCount).toBeGreaterThan(0);
  expect(standingsRows).toBeGreaterThan(0);
  expect(snapshotCount).toBeGreaterThan(0);

  await page.locator('.current-matchup-card a[href*="tab=rivalry"]').first().click();
  await expect(page.locator('#tabRivalryBtn')).toHaveClass(/active/);
  await expect(page.locator('#rivalryHeadline')).toBeVisible();
  await expect(page.locator('#rivalryScopeSelect')).toHaveValue('allTime');

  await page.goto('/?tab=current&currentOwner=Joe&currentView=owners');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('#currentOwnerSelect')).toHaveValue('Joe');
  await expect(page.locator('#currentViewSelect')).toHaveValue('owners');
  await expect(page.locator('#currentWeekNeeds .current-owner-focus')).toContainText('Joe');

  await page.goto('/?tab=current&currentProjection=current');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('#currentProjectionSelect')).toHaveValue('current');
  await expect(page.locator('#currentProjectedStandings')).toContainText('Completed games only');
  await expect(page.locator('#currentLiveMovement')).toContainText('Completed games only');

  await page.locator('#currentProjectionSelect').selectOption('ifScoresHold');
  await expect(page.locator('#currentProjectionSelect')).toHaveValue('ifScoresHold');
  await expect(page).not.toHaveURL(/currentProjection=current/);
});

test('current season view modes hide filtered section containers', async ({ page }) => {
  await page.goto('/?tab=current&currentView=matchups');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('#currentMatchups')).toBeVisible();
  await expect(page.locator('#currentPlayoffPicture')).toBeHidden();
  await expect(page.locator('#currentWeekNeeds')).toBeHidden();
  await expect(page.locator('#currentProjectedStandings')).toBeHidden();
  await expect(page.locator('#currentStandings')).toBeHidden();

  await page.goto('/?tab=current&currentView=standings');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('#currentPlayoffPicture')).toBeVisible();
  await expect(page.locator('#currentLiveMovement')).toBeVisible();
  await expect(page.locator('#currentProjectedStandings')).toBeVisible();
  await expect(page.locator('#currentStandings')).toBeVisible();
  await expect(page.locator('#currentMatchups')).toBeHidden();
  await expect(page.locator('#currentTeamSnapshots')).toBeHidden();

  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto('/?tab=current&currentView=owners&currentOwner=Joe');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('#currentWeekNeeds')).toBeVisible();
  await expect(page.locator('#currentTeamSnapshots')).toBeVisible();
  await expect(page.locator('#currentPlayoffPicture')).toBeHidden();
  await expect(page.locator('#currentProjectedStandings')).toBeHidden();
  const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(hasHorizontalOverflow).toBe(false);
});

test('rivalry tab renders a tale of the tape and saved rivalry selection', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  await page.locator('#teamSelect').selectOption('Joel');
  await expect(page.locator('header h2')).toHaveText('Joel');

  await page.locator('#tabRivalryBtn').click();
  await expect(page.locator('#tabRivalryBtn')).toHaveClass(/active/);
  await expect(page.locator('#rivalryTeamA')).toBeVisible();
  await expect(page.locator('#rivalryTeamB')).toBeVisible();
  await expect(page.locator('#page-rivalry')).toContainText('Head to Head');
  await expect(page.locator('header h2')).toHaveText('Joe');

  await page.locator('#tabHistoryBtn').click();
  await expect(page.locator('#tabHistoryBtn')).toHaveClass(/active/);
  await expect(page.locator('header h2')).toHaveText('Joel');

  await page.locator('#tabRivalryBtn').click();
  await page.locator('#rivalryTeamA').selectOption('Joe');
  await expect(page.locator('#rivalryTeamA')).toHaveValue('Joe');
  await expect(page.locator('#rivalryTeamB')).toHaveValue('Joel');
  await expect(page.locator('#rivalryTeamB option[value="Joe"]')).toHaveCount(0);
  await expect(page.locator('#rivalryHeadline')).toContainText('Joe vs Joel');
  await expect(page.locator('#rivalryHeadline')).toContainText('Current streak:');
  await expect(page.locator('#rivalryLeadMeter')).toContainText('Joe');
  await expect(page.locator('#rivalryHighlightBoard .rivalry-highlight')).toHaveCount(4);
  expect(await page.locator('#rivalryTapeGrid .stat').count()).toBeGreaterThan(0);
  await expect(page.locator('#rivalryLeadTrend svg')).toBeVisible();
  await expect(page.locator('#rivalryLeadTrend')).toContainText('.500');
  await expect(page.locator('#rivalryLeadTrend')).toContainText('G1');
  await expect(page.locator('#rivalryLeadTrend')).toContainText(/\d{2}\/\d{2}\/2024/);
  await expect(page.locator('#rivalryLeadTrend svg title').last()).toContainText('Series spread:');
  expect(await page.locator('#rivalryTimeline .rivalry-timeline-badge').count()).toBeGreaterThan(0);
  expect(await page.locator('#rivalryTimeline .rivalry-timeline-item').count()).toBeGreaterThan(0);
  expect(await page.locator('#rivalryTimeline').evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  await expect.poll(async () => page.evaluate(() => {
    const params = new URL(location.href).searchParams;
    return [params.get('tab'), params.get('rivalryTeamA'), params.get('rivalryTeamB')].join('|');
  })).toBe('rivalry|Joe|Joel');

  const tapeCount = await page.locator('#rivalryTapeGrid .stat').count();
  const gameCount = await page.locator('#rivalryGameTable tbody tr').count();
  const seasonCount = await page.locator('#rivalrySeasonTable tbody tr').count();

  expect(tapeCount).toBeGreaterThan(0);
  expect(gameCount).toBeGreaterThan(0);
  expect(seasonCount).toBeGreaterThan(0);
});

test('head to head url restores the rivalry page and selected teams', async ({ page }) => {
  await page.goto('/?tab=rivalry&rivalryTeamA=Joe&rivalryTeamB=Joel');
  await page.waitForLoadState('networkidle');

  await expect(page.locator('#tabRivalryBtn')).toHaveClass(/active/);
  await expect(page.locator('#rivalryTeamA')).toHaveValue('Joe');
  await expect(page.locator('#rivalryTeamB')).toHaveValue('Joel');
  await expect(page.locator('#rivalryHeadline')).toContainText('Joe vs Joel');
  await expect.poll(async () => page.evaluate(() => {
    const params = new URL(location.href).searchParams;
    return [params.get('tab'), params.get('rivalryTeamA'), params.get('rivalryTeamB')].join('|');
  })).toBe('rivalry|Joe|Joel');
});

test('trophy case url restores the trophy page and owner selection', async ({ page }) => {
  await page.goto('/?tab=trophy&trophyOwner=Joe');
  await page.waitForLoadState('networkidle');

  await expect(page.locator('#tabTrophyBtn')).toHaveClass(/active/);
  await expect(page.locator('#trophyOwnerSelect')).toHaveValue('Joe');
  expect(await page.locator('#headerBanners .banner').count()).toBeGreaterThan(0);
  await expect(page.locator('#trophyHero')).toContainText('Joe');
  await expect(page.locator('#trophyHero')).toContainText(/Dynasty Threat|Contender Profile|Regular Season Merchant|Playoff Riser|Snakebitten|Boom\/Bust|Saunders Survivor|Chaos Team|Rebuild Resume/);
  expect(await page.locator('#trophyHardwareShelf .trophy-hardware-card').count()).toBeGreaterThan(0);
  await expect(page.locator('#trophyHardwareShelf')).toContainText('Byes');
  expect(await page.locator('#trophyRankStrip .trophy-rank-pill').count()).toBeGreaterThan(0);
  await expect(page.locator('#trophyRankStrip')).not.toContainText('Actual:');
  await expect(page.locator('#trophyCareerShape')).toContainText('Playoff cutoff is 6th');
  await expect(page.locator('#trophyAchievementList')).toContainText('Best regular season');
  await expect(page.locator('#trophyScarList')).toContainText('Most unlucky season');
  expect(await page.locator('#trophySeasonTable tbody tr').count()).toBeGreaterThan(0);

  const ownerOptions = await page.locator('#trophyOwnerSelect option').evaluateAll(options =>
    options.map(option => option.value).filter(value => value && value !== '__ALL__')
  );
  expect(ownerOptions.length).toBeGreaterThan(1);

  await page.locator('#trophyOwnerSelect').selectOption('Joel');
  await expect(page.locator('#trophyOwnerSelect')).toHaveValue('Joel');
  await expect(page.locator('#trophyHero')).toContainText('Joel');
  await expect.poll(async () => page.evaluate(() => {
    const params = new URL(location.href).searchParams;
    return [params.get('tab'), params.get('trophyOwner')].join('|');
  })).toBe('trophy|Joel');

  await page.locator('#tabHistoryBtn').click();
  await expect(page.locator('#tabHistoryBtn')).toHaveClass(/active/);
  await expect(page.locator('#teamSelect')).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await page.locator('#exportCsv').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('history_Joe.csv');
});

test('history filters do not leak into dynasty controls', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  await page.locator('#teamSelect').selectOption('Joel');
  await page.locator('#seasonFilters .season-cb').last().evaluate((input) => {
    input.checked = true;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect(page.locator('#seasonCountText')).toHaveText('1 selected');

  await page.locator('#tabDynastyBtn').click();
  await expect(page.locator('#tabDynastyBtn')).toHaveClass(/active/);
  await expect(page.locator('#dynastyModeSelect')).toHaveValue('calculator');
  await expect(page.locator('#dynastyOwnerSelect')).toHaveValue('Joe');
  await expect(page.locator('#dynastyStartSeason')).toHaveValue('2023');
  await expect(page.locator('#dynastyEndSeason')).toHaveValue('2025');
  await expect(page.locator('#dynastyCalculatorHero')).toContainText('Joe Dynasty Score');
  await expect(page.locator('#dynastyCalculatorHero')).toContainText('2023-2025');
});

test('browser back restores the previous history state after a tab change', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  await page.locator('#teamSelect').selectOption('Joel');
  await page.locator('#seasonFilters .season-cb').last().evaluate((input) => {
    input.checked = true;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect(page.locator('#seasonCountText')).toHaveText('1 selected');
  await expect.poll(async () => page.url()).toContain('team=Joel');

  await page.locator('#tabTrophyBtn').click();
  await expect(page.locator('#tabTrophyBtn')).toHaveClass(/active/);
  await expect(page.locator('#trophyOwnerSelect')).toHaveValue('Joel');

  await page.goBack();
  await page.waitForLoadState('networkidle');
  await expect(page.locator('#tabHistoryBtn')).toHaveClass(/active/);
  await expect(page.locator('#page-history')).toBeVisible();
  await expect(page.locator('#teamSelect')).toHaveValue('Joel');
  await expect(page.locator('#seasonCountText')).toHaveText('1 selected');
  await expect(page.locator('#historyGamesTable tbody tr')).not.toHaveCount(0);
  await expect(page).toHaveURL(/team=Joel/);
  await expect(page).toHaveURL(/seasons=/);
});

test('dynasty tab renders controls and responds to calculator changes', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  await page.locator('#tabDynastyBtn').click();
  await expect(page.locator('#tabDynastyBtn')).toHaveClass(/active/);
  await expect(page.locator('#page-dynasty')).toBeVisible();
  await expect(page.locator('#dynastyModeSelect')).toBeVisible();
  await expect(page.locator('#dynastyOwnerSelect')).toBeVisible();
  await expect(page.locator('#dynastyStartSeason')).toBeVisible();
  await expect(page.locator('#dynastyEndSeason')).toBeVisible();
  await expect(page.locator('#dynastyModeSelect')).toHaveValue('calculator');
  await expect(page.locator('#dynastyOwnerSelect')).toHaveValue('Joe');
  await expect(page.locator('#dynastyCalculatorHero')).toContainText('Dynasty Score');

  await page.locator('#dynastyStartSeason').selectOption('2021');
  await page.locator('#dynastyEndSeason').selectOption('2023');
  await page.locator('#dynastyOwnerSelect').selectOption('Joe');
  await page.waitForLoadState('networkidle');

  await expect(page.locator('#dynastyCalculatorHero')).toContainText('Joe Dynasty Score');
  await expect(page.locator('#dynastyCalculatorHero')).toContainText('2021-2023');
  await expect(page.locator('#dynastyCalculatorHero')).toContainText(/Dynasty Run|Contender Stretch|Mini-Dynasty/);
  await expect(page.locator('#dynastyPeriodLeaderboard')).toContainText('Joe');
  expect(await page.locator('#dynastyBestWindows .dynasty-window-card').count()).toBeGreaterThan(0);
  await page.locator('#dynastyBestWindows .dynasty-window-card').first().click();
  await expect(page.locator('#dynastyWindowModal')).toBeVisible();
  await expect(page.locator('#dynastyWindowModal')).toContainText('Total Record');
  await expect(page.locator('#dynastyWindowModal')).toContainText('Playoff Appearances');
  await expect(page.locator('#dynastyWindowModal')).toContainText('Playoff Record');
  expect(await page.locator('#dynastyWindowModal tbody tr').count()).toBeGreaterThan(0);
  await page.locator('#dynastyWindowModal .dynasty-modal-close').click();
  await expect(page.locator('#dynastyWindowModal')).toBeHidden();
  await expect(page.locator('#dynastyTrendChart .dynasty-trend-svg')).toBeVisible();
  expect(await page.locator('#dynastyTrendChart [data-dynasty-trend-toggle="1"]').count()).toBeGreaterThan(0);
  const initialTrendSeriesCount = await page.locator('#dynastyTrendChart .dynasty-trend-series').count();
  expect(initialTrendSeriesCount).toBeGreaterThan(0);
  await page.locator('#dynastyTrendChart [data-dynasty-trend-toggle="1"]').first().click();
  await expect(page.locator('#dynastyTrendChart [data-dynasty-trend-toggle="1"]').first()).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(async () => page.locator('#dynastyTrendChart .dynasty-trend-series').count()).toBe(initialTrendSeriesCount - 1);
  expect(await page.locator('#dynastyHeatmap .dynasty-heatmap-row').count()).toBeGreaterThan(0);
  await page.locator('#dynastyStartSeason').selectOption('2014');
  await page.locator('#dynastyEndSeason').selectOption('2023');
  await page.locator('#dynastyModeSelect').selectOption('rolling-5');
  await page.waitForFunction(() => document.querySelectorAll('#dynastySlumps .dynasty-slump-item').length > 0);
  expect(await page.locator('#dynastySlumps .dynasty-slump-item').count()).toBeGreaterThan(0);
  await page.locator('#dynastySlumps .dynasty-slump-item').first().click();
  await expect(page.locator('#dynastyWindowModal')).toBeVisible();
  await expect(page.locator('#dynastyWindowModal')).toContainText('Saunders Bowl Appearances');
  await expect(page.locator('#dynastyWindowModal')).toContainText('Saunders Record');
  await expect(page.locator('#dynastyWindowModal')).toContainText('Final Result');
  await page.locator('#dynastyWindowModal .dynasty-modal-close').click();
  await expect(page.locator('#dynastyWindowModal')).toBeHidden();
  await expect(page.locator('#dynastyFormula')).toHaveCount(0);
  await expect.poll(async () => page.evaluate(() => {
    const params = new URL(location.href).searchParams;
    return [
      params.get('tab'),
      params.get('dynastyMode'),
      params.get('dynastyOwner'),
      params.get('dynastyStart'),
      params.get('dynastyEnd'),
    ].join('|');
  })).toBe('dynasty|rolling-5|Joe|2014|2023');
});

test('dynasty url restores the requested owner and period', async ({ page }) => {
  await page.goto('/?tab=dynasty&dynastyMode=calculator&dynastyOwner=Joe&dynastyStart=2021&dynastyEnd=2023&dynastyMinSeasons=2&dynastySaunders=1');
  await page.waitForLoadState('networkidle');

  await expect(page.locator('#tabDynastyBtn')).toHaveClass(/active/);
  await expect(page.locator('#dynastyModeSelect')).toHaveValue('calculator');
  await expect(page.locator('#dynastyOwnerSelect')).toHaveValue('Joe');
  await expect(page.locator('#dynastyStartSeason')).toHaveValue('2021');
  await expect(page.locator('#dynastyEndSeason')).toHaveValue('2023');
  await expect(page.locator('#dynastyCalculatorHero')).toContainText('Joe Dynasty Score');
  await expect(page.locator('#dynastyCalculatorHero')).toContainText('2021-2023');
  await expect(page.locator('#dynastyCalculatorHero')).toContainText('#1');
  await expect(page.locator('#dynastyScoreBreakdown')).toContainText('regularSeason');
  await expect(page.locator('#dynastyScoreBreakdown')).toContainText('hardware');
  await expect(page.locator('#dynastyScoreBreakdown')).toContainText('Coverage');
  await expect.poll(async () => page.evaluate(() => {
    const params = new URL(location.href).searchParams;
    return [
      params.get('tab'),
      params.get('dynastyMode'),
      params.get('dynastyOwner'),
      params.get('dynastyStart'),
      params.get('dynastyEnd'),
      params.get('dynastyMinSeasons'),
      params.get('dynastySaunders'),
    ].join('|');
  })).toBe('dynasty|calculator|Joe|2021|2023|2|1');
});

test('gauntlet url restores matchup controls and renders simulation output', async ({ page }) => {
  await page.goto('/?tab=gauntlet&ga=Joe%3A2024&gb=Zook%3A2019&gm=hybrid&gp=1&gn=10000');
  await page.waitForLoadState('networkidle');

  await expect(page.locator('#tabGauntletBtn')).toHaveClass(/active/);
  await expect(page.locator('#page-gauntlet')).toBeVisible();
  await expect(page.locator('#gauntletOwnerA')).toHaveValue('Joe');
  await expect(page.locator('#gauntletSeasonA')).toHaveValue('2024');
  await expect(page.locator('#gauntletOwnerB')).toHaveValue('Zook');
  await expect(page.locator('#gauntletSeasonB')).toHaveValue('2019');
  await expect(page.locator('#gauntletEraAdjusted')).toBeChecked();
  await expect(page.locator('#gauntletIncludePostseason')).toBeChecked();
  await expect(page.locator('#gauntletSimulations')).toHaveValue('10000');
  await expect(page.locator('#gauntletProbability')).toContainText('Era-adjusted + postseason model, 10,000 sims');
  await expect(page.locator('#gauntletProbability')).toContainText('wins');
  const distributionCharts = page.locator('#gauntletHistogram svg');
  await expect(distributionCharts).toHaveCount(1);
  await expect(distributionCharts.first()).toBeVisible();
  await expect(page.locator('#gauntletStats')).toContainText('Simulated average');
  await expect(page.locator('#gauntletContext')).toContainText('All-time record');
  await expect(page.locator('#gauntletNarrative')).toContainText('Joe 2024');
  await expect(page.locator('#gauntletCopyText')).toHaveValue(/Joe 2024 vs Zook 2019/);
  await expect(page.locator('#gauntletCopyText')).toHaveValue(/Model: Era-adjusted \+ postseason/);
  await expect(page.locator('#gauntletCopyText')).toHaveValue(/Current URL:/);
  await expect.poll(async () => page.evaluate(() => {
    const params = new URL(location.href).searchParams;
    return [params.get('tab'), params.get('ga'), params.get('gb'), params.get('gm'), params.get('gp'), params.get('gn')].join('|');
  })).toBe('gauntlet|Joe:2024|Zook:2019|hybrid|1|10000');
});

test('gauntlet controls update the url and browser back restores the previous matchup', async ({ page }) => {
  await page.goto('/?tab=gauntlet&ga=Joe%3A2024&gb=Zook%3A2019&gm=hybrid&gp=1&gn=10000');
  await page.waitForLoadState('networkidle');

  const initialCopy = await page.locator('#gauntletCopyText').inputValue();
  await page.locator('#gauntletIncludePostseason').uncheck();
  await page.waitForLoadState('networkidle');

  await expect(page.locator('#gauntletIncludePostseason')).not.toBeChecked();
  await expect(page.locator('#gauntletCopyText')).toHaveValue(/Model: Era-adjusted$/m);
  await expect.poll(async () => page.evaluate(() => {
    const params = new URL(location.href).searchParams;
    return [params.get('tab'), params.get('gp')].join('|');
  })).toBe('gauntlet|0');

  await page.locator('#gauntletEraAdjusted').uncheck();
  await page.waitForLoadState('networkidle');

  await expect(page.locator('#gauntletEraAdjusted')).not.toBeChecked();
  await expect(page.locator('#gauntletCopyText')).toHaveValue(/Historical/);
  await expect.poll(async () => page.evaluate(() => {
    const params = new URL(location.href).searchParams;
    return [params.get('tab'), params.get('gm'), params.get('gp')].join('|');
  })).toBe('gauntlet|historical|0');

  await page.goBack();
  await page.waitForLoadState('networkidle');

  await expect(page.locator('#gauntletEraAdjusted')).toBeChecked();
  await expect(page.locator('#gauntletIncludePostseason')).not.toBeChecked();
  await expect(page.locator('#gauntletCopyText')).toHaveValue(/Model: Era-adjusted$/m);
  await expect.poll(async () => page.evaluate(() => {
    const params = new URL(location.href).searchParams;
    return [params.get('tab'), params.get('gm'), params.get('gp')].join('|');
  })).toBe('gauntlet|hybrid|0');

  await page.goBack();
  await page.waitForLoadState('networkidle');

  await expect(page.locator('#gauntletEraAdjusted')).toBeChecked();
  await expect(page.locator('#gauntletIncludePostseason')).toBeChecked();
  await expect(page.locator('#gauntletCopyText')).toHaveValue(initialCopy);
  await expect.poll(async () => page.evaluate(() => {
    const params = new URL(location.href).searchParams;
    return [params.get('tab'), params.get('gm'), params.get('gp')].join('|');
  })).toBe('gauntlet|hybrid|1');
});

test('gauntlet mobile layout stacks the matchup and keeps the histogram visible', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?tab=gauntlet&ga=Joe%3A2024&gb=Zook%3A2019');
  await page.waitForLoadState('networkidle');

  const matchup = page.locator('#gauntletMatchup');
  const histogram = page.locator('#gauntletHistogram');
  const narrative = page.locator('#gauntletNarrative');

  await expect(matchup).toBeVisible();
  await expect(histogram.locator('svg')).toHaveCount(1);
  await expect(histogram.locator('svg').first()).toBeVisible();
  await expect(narrative).toBeVisible();

  const matchupBox = await matchup.boundingBox();
  const histogramBox = await histogram.boundingBox();
  const narrativeBox = await narrative.boundingBox();
  expect(matchupBox).toBeTruthy();
  expect(histogramBox).toBeTruthy();
  expect(narrativeBox).toBeTruthy();
  expect(matchupBox.width).toBeLessThanOrEqual(390);
  expect(histogramBox.width).toBeLessThanOrEqual(390);
  expect(narrativeBox.width).toBeLessThanOrEqual(390);
});

test('dynasty mobile layout stacks the main panels without overlap', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?tab=dynasty&dynastyMode=calculator&dynastyOwner=Joe&dynastyStart=2021&dynastyEnd=2023');
  await page.waitForLoadState('networkidle');

  const hero = page.locator('#dynastyCalculatorHero');
  const breakdown = page.locator('#dynastyScoreBreakdown');
  const heatmap = page.locator('#dynastyHeatmap');

  await expect(hero).toBeVisible();
  await expect(breakdown).toBeVisible();
  await expect(heatmap).toBeVisible();

  const heroBox = await hero.boundingBox();
  const breakdownBox = await breakdown.boundingBox();
  const heatmapBox = await heatmap.boundingBox();
  expect(heroBox).toBeTruthy();
  expect(breakdownBox).toBeTruthy();
  expect(heatmapBox).toBeTruthy();
  expect(heroBox.width).toBeLessThanOrEqual(390);
  expect(breakdownBox.width).toBeLessThanOrEqual(390);
  expect(heatmapBox.width).toBeLessThanOrEqual(390);
  expect(heroBox.y + heroBox.height).toBeLessThanOrEqual(breakdownBox.y + 2);
  expect(breakdownBox.y + breakdownBox.height).toBeLessThanOrEqual(heatmapBox.y + 2);
});

test('trophy case first viewport stacks hero shelf and rank strip without overlap on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?tab=trophy&trophyOwner=Joe');
  await page.waitForLoadState('networkidle');

  const hero = page.locator('#trophyHero');
  const shelf = page.locator('#trophyHardwareShelf');
  const rankStrip = page.locator('#trophyRankStrip');

  await expect(hero).toBeVisible();
  await expect(shelf).toBeVisible();
  await expect(rankStrip).toBeVisible();

  const heroBox = await hero.boundingBox();
  const shelfBox = await shelf.boundingBox();
  const rankBox = await rankStrip.boundingBox();
  expect(heroBox).toBeTruthy();
  expect(shelfBox).toBeTruthy();
  expect(rankBox).toBeTruthy();
  expect(heroBox.width).toBeLessThanOrEqual(390);
  expect(shelfBox.width).toBeLessThanOrEqual(390);
  expect(rankBox.width).toBeLessThanOrEqual(390);
  expect(heroBox.y + heroBox.height).toBeLessThanOrEqual(shelfBox.y + 2);
  expect(shelfBox.y + shelfBox.height).toBeLessThanOrEqual(rankBox.y + 2);
  expect(await page.locator('#trophyHero').textContent()).toContain('Joe');
});

test('url state restores selected team and facet filters on load', async ({ page }) => {
  await page.goto('/?team=Joe&seasons=2025&weeks=1&opps=Shemer&types=Regular');
  await page.waitForLoadState('networkidle');

  await expect(page.locator('#appStatus')).toBeHidden();
  await expect(page.locator('#teamSelect')).toHaveValue('Joe');
  await expect(page.locator('#seasonFilters .season-cb[data-value="2025"]')).toBeChecked();
  await expect(page.locator('#weekFilters .week-cb[data-value="1"]')).toBeChecked();
  await expect(page.locator('#oppFilters .opp-cb[data-value="Shemer"]')).toBeChecked();
  await expect(page.locator('#typeFilters .type-cb[data-value="Regular"]')).toBeChecked();
  await expect(page.locator('#seasonCountText')).toHaveText('1 selected');
  await expect(page.locator('#weekCountText')).toHaveText('1 selected');
  await expect(page.locator('#oppCountText')).toHaveText('1 selected');
  await expect(page.locator('#typeCountText')).toHaveText('1 selected');

  await expect(page.locator('#historyGamesTable tbody tr')).toHaveCount(1);
  await expect(page.locator('#historyGamesTable tbody tr').first()).toContainText('Shemer');
  await expect(page.locator('#historyGamesTable tbody tr').first()).toContainText('2025-09-07');
});

test('facet dropdowns keep expanded state in sync and close with escape', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  const seasonButton = page.locator('.dropdown-toggle[data-target="seasonFilters"]');
  const weekButton = page.locator('.dropdown-toggle[data-target="weekFilters"]');

  await expect(seasonButton).toHaveAttribute('aria-controls', 'seasonFilters');
  await expect(seasonButton).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#seasonFilters')).toHaveAttribute('aria-hidden', 'true');

  await seasonButton.click();
  await expect(seasonButton).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#seasonFilters')).toHaveAttribute('aria-hidden', 'false');
  await expect(page.locator('#seasonFilters')).toBeVisible();

  await weekButton.click();
  await expect(seasonButton).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#seasonFilters')).toHaveAttribute('aria-hidden', 'true');
  await expect(weekButton).toHaveAttribute('aria-expanded', 'true');

  await page.keyboard.press('Escape');
  await expect(weekButton).toHaveAttribute('aria-expanded', 'false');
  await expect(weekButton).toBeFocused();
});

test('facet dropdowns support keyboard navigation and checkbox toggling', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  const seasonButton = page.locator('.dropdown-toggle[data-target="seasonFilters"]');
  await seasonButton.focus();
  await page.keyboard.press('Enter');
  await expect(seasonButton).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#seasonFilters')).toHaveAttribute('aria-hidden', 'false');

  await page.keyboard.press('Tab');
  await expect(page.locator('#season-all-option')).toBeFocused();

  await page.keyboard.press('Tab');
  const firstSeason = page.locator('#seasonFilters .season-cb').first();
  await expect(firstSeason).toBeFocused();
  await expect(firstSeason).not.toBeChecked();

  await page.keyboard.press('Space');
  await expect(firstSeason).toBeChecked();
  await expect(page.locator('#seasonFilters .season-all')).not.toBeChecked();
  await expect(page.locator('#seasonCountText')).toHaveText('1 selected');

  await page.keyboard.press('Escape');
  await expect(seasonButton).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#seasonFilters')).toHaveAttribute('aria-hidden', 'true');
  await expect(seasonButton).toBeFocused();
});

test('single-season filters render the season callout', async ({ page }) => {
  await page.goto('/?team=Joe&seasons=2025');
  await page.waitForLoadState('networkidle');

  const callout = page.locator('#seasonCallout .callout');
  await expect(callout).toBeVisible();
  await expect(callout).toContainText('Joe in 2025');
  await expect(callout).toContainText('Record:');
});

test('csv export downloads the currently filtered history rows', async ({ page }) => {
  await page.goto('/?team=Joe&seasons=2025&weeks=1&opps=Shemer&types=Regular');
  await page.waitForLoadState('networkidle');

  const downloadPromise = page.waitForEvent('download');
  await page.locator('#exportCsv').click();
  const download = await downloadPromise;
  const csv = await downloadText(download);
  const lines = csv.split('\n');

  expect(download.suggestedFilename()).toBe('history_Joe.csv');
  expect(lines).toHaveLength(2);
  expect(lines[0]).toBe('date,season,team,opponent,result,pf,pa,type,round,week,xw');
  expect(lines[1]).toContain('"2025-09-07","2025","Joe","Shemer","L","81.32","94.56","Regular","","1"');
});

test('unchanged history state does not rebuild rendered table rows', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  const mutationCount = await page.locator('#historyGamesTable tbody').evaluate((tbody) => {
    let count = 0;
    const observer = new MutationObserver((records) => {
      count += records.length;
    });
    observer.observe(tbody, { childList: true, subtree: true, characterData: true });
    window.__historyTableMutationObserver = observer;
    window.__historyTableMutationCount = () => count;
    return count;
  });
  expect(mutationCount).toBe(0);
  const filterRunsBefore = await page.evaluate(() => window.__darlingRenderMetrics.filterRuns);

  await page.locator('#clearFilters').click();
  await page.waitForTimeout(100);

  const afterClear = await page.evaluate(() => window.__historyTableMutationCount());
  const filterRunsAfter = await page.evaluate(() => window.__darlingRenderMetrics.filterRuns);
  expect(afterClear).toBe(0);
  expect(filterRunsAfter).toBe(filterRunsBefore);
});

test('all-teams fun facts do not rebuild for unrelated filter changes', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  await page.locator('#teamSelect').selectOption('__ALL__');
  await expect(page.locator('#oppTableTitle')).toHaveText('Team Breakdown');

  await page.locator('#funFacts').evaluate((el) => {
    let count = 0;
    const observer = new MutationObserver((records) => {
      count += records.length;
    });
    observer.observe(el, { childList: true, subtree: true, characterData: true });
    window.__funFactsMutationObserver = observer;
    window.__funFactsMutationCount = () => count;
  });

  await page.locator('#seasonFilters .season-cb').first().evaluate((input) => {
    input.checked = true;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForTimeout(100);

  const afterSeasonFilter = await page.evaluate(() => window.__funFactsMutationCount());
  expect(afterSeasonFilter).toBe(0);
});

test('league summary is removed after returning from all-teams view', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  await page.locator('#teamSelect').selectOption('__ALL__');
  await expect(page.locator('#leagueSummary')).toBeVisible();

  await page.locator('#teamSelect').selectOption('Joe');
  await expect(page.locator('#leagueSummary')).toHaveCount(0);
  await expect(page.locator('header h2')).toHaveText('Joe');
});

test('switching between all-teams and single-team modes preserves active filters', async ({ page }) => {
  await page.goto('/?team=Joe&seasons=2025&weeks=1&opps=Shemer&types=Regular');
  await page.waitForLoadState('networkidle');

  await expect(page.locator('#seasonCountText')).toHaveText('1 selected');
  await expect(page.locator('#weekCountText')).toHaveText('1 selected');
  await expect(page.locator('#oppCountText')).toHaveText('1 selected');
  await expect(page.locator('#typeCountText')).toHaveText('1 selected');

  await page.locator('#teamSelect').selectOption('__ALL__');
  await expect(page.locator('#oppTableTitle')).toHaveText('Team Breakdown');
  await expect(page.locator('#leagueSummary')).toBeVisible();
  await expect(page.locator('#seasonCountText')).toHaveText('1 selected');
  await expect(page.locator('#weekCountText')).toHaveText('1 selected');
  await expect(page.locator('#oppCountText')).toHaveText('1 selected');
  await expect(page.locator('#typeCountText')).toHaveText('1 selected');

  await page.locator('#teamSelect').selectOption('Joe');
  await expect(page.locator('#leagueSummary')).toHaveCount(0);
  await expect(page.locator('header h2')).toHaveText('Joe');
  await expect(page.locator('#historyGamesTable tbody tr')).toHaveCount(1);
  await expect(page.locator('#seasonCountText')).toHaveText('1 selected');
  await expect(page.locator('#weekCountText')).toHaveText('1 selected');
  await expect(page.locator('#oppCountText')).toHaveText('1 selected');
  await expect(page.locator('#typeCountText')).toHaveText('1 selected');
});

test('empty-result filters leave the tables empty without breaking the page', async ({ page }) => {
  await page.goto('/?team=Connor&seasons=2014&weeks=1&types=Regular');
  await page.waitForLoadState('networkidle');

  await expect(page.locator('header h2')).toHaveText('Connor');
  await expect(page.locator('#seasonCountText')).toHaveText('1 selected');
  await expect(page.locator('#weekCountText')).toHaveText('1 selected');
  await expect(page.locator('#typeCountText')).toHaveText('1 selected');
  await expect(page.locator('#historyGamesTable tbody tr')).toHaveCount(0);
  await expect(page.locator('#weekTable tbody tr')).toHaveCount(0);
  await expect(page.locator('#oppTable tbody tr')).toHaveCount(0);
});

test('all-teams export uses the ALL filename and includes both sides of a game', async ({ page }) => {
  await page.goto('/?team=Joe&seasons=2025&types=Regular');
  await page.waitForLoadState('networkidle');

  await page.locator('#teamSelect').selectOption('__ALL__');
  await expect(page.locator('#leagueSummary')).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await page.locator('#exportCsv').click();
  const download = await downloadPromise;
  const csv = await downloadText(download);

  expect(download.suggestedFilename()).toBe('history_ALL.csv');
  expect(csv.split('\n')[0]).toBe('date,season,team,opponent,result,pf,pa,type,round,week,xw');
  expect(csv).toContain('"2025-09-07","2025","Joe"');
  expect(csv).toContain('"2025-09-07","2025","Shemer"');
});

test('fetch failure surfaces an error banner instead of a blank page', async ({ page }) => {
  await page.route('**/assets/H2H.json', route => {
    route.fulfill({
      status: 500,
      contentType: 'text/plain',
      body: 'upstream failed',
    });
  });

  await page.goto('/');
  await page.waitForLoadState('networkidle');

  await expect(page.locator('#appStatus')).toBeVisible();
  await expect(page.locator('#appStatus')).toContainText('Could not load league data');
  await expect(page.locator('#teamSelect option')).toHaveCount(0);
});
