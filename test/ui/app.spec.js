import { expect, test } from './coverage-fixture.js';

async function downloadText(download) {
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

async function computedContrastRatio(locator) {
  return locator.evaluate((element) => {
    const channels = (value) => (value.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
    const luminance = (value) => {
      const [red, green, blue] = channels(value).map(channel => {
        const normalized = channel / 255;
        return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    };
    const style = getComputedStyle(element);
    const foreground = luminance(style.color);
    const background = luminance(style.backgroundColor);
    return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
  });
}

test.beforeEach(async ({ page }, testInfo) => {
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
    if (response.status() >= 400 && /\.(json|js|css|jpeg|jpg|png|webp|avif)$/.test(url)) {
      browserErrors.push(`asset ${response.status()}: ${url}`);
    }
  });

  page.__browserErrors = browserErrors;
  page.__allowExpectedFailure = expectedFailureTest;
});

test.afterEach(async ({ page }, testInfo) => {
  const errors = page.__browserErrors || [];
  if (page.__allowExpectedFailure) {
    const unexpected = errors.filter(error =>
      !error.includes('Failed to load league JSON') &&
      !error.includes('Failed to load resource: the server responded with a status of 500') &&
      !error.includes('asset 500:') &&
      !error.includes('/assets/H2H.json') &&
      !error.includes('/assets/CurrentSeason.json')
    );
    expect(unexpected).toEqual([]);
    return;
  }
  expect(errors).toEqual([]);
});

test('page loads and renders the history tables', async ({ page }) => {
  await page.goto('/?tab=history');
  await page.waitForLoadState('networkidle');

  await expect(page.locator('#appStatus')).toBeHidden();
  await expect(page.locator('header h2')).toHaveText('Joe');
  await expect(page.locator('.site-hero-media img')).toBeVisible();
  const heroBox = await page.locator('.site-hero-media img').boundingBox();
  expect(heroBox?.width).toBeGreaterThan(0);
  expect(heroBox?.height).toBeGreaterThan(0);
  expect(await page.evaluate(() => typeof window.triggerGroupEgg)).toBe('undefined');
  expect(await page.evaluate(() => typeof window.setGroupBackdrop)).toBe('undefined');

  const seasonCount = await page.locator('#seasonRecapTable tbody tr').count();
  const weekCount = await page.locator('#weekTable tbody tr').count();
  const historyCount = await page.locator('#historyGamesTable tbody tr').count();

  expect(seasonCount).toBeGreaterThan(0);
  expect(weekCount).toBeGreaterThan(0);
  expect(historyCount).toBeGreaterThan(0);
  expect(weekCount).toBe(historyCount);
  const diagnostics = await page.evaluate(() => window.darlingDataDiagnostics);
  expect(diagnostics.dataVersion).toMatch(/^sha256:[a-f0-9]{64}$/);
  expect(diagnostics.manifestVersion).toBe(2);
  expect(diagnostics.loadedAssets).toContain('DerivedStats');
  expect(diagnostics.optionalAssetFailures).toEqual([]);
});

test('optional CurrentSeason fetch failure leaves history usable', async ({ page }) => {
  await page.route('**/assets/CurrentSeason.json*', route => route.fulfill({ status: 500, body: '{}' }));
  await page.goto('/?tab=history');
  await page.waitForLoadState('networkidle');

  await expect(page.locator('#appStatus')).toBeHidden();
  await expect(page.locator('#historyGamesTable tbody tr').first()).toBeVisible();
  const diagnostics = await page.evaluate(() => window.darlingDataDiagnostics);
  expect(diagnostics.optionalAssetFailures).toContain('CurrentSeason');
  expect(diagnostics.loadedAssets).not.toContain('CurrentSeason');
});

test('theme toggle switches color scheme and persists after reload', async ({ page }) => {
  await page.goto('/?tab=history');
  await page.waitForLoadState('networkidle');

  await expect(page.locator('#themeControls .theme-toggle')).toBeVisible();
  await page.getByRole('button', { name: 'Dark' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-color-scheme', 'dark');
  await expect(page.locator('html')).toHaveAttribute('data-color-scheme-preference', 'dark');

  await page.reload();
  await page.waitForLoadState('networkidle');
  await expect(page.locator('html')).toHaveAttribute('data-color-scheme', 'dark');
  await expect(page.locator('html')).toHaveAttribute('data-color-scheme-preference', 'dark');

  await page.getByRole('button', { name: 'Light' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-color-scheme', 'light');
});

test('changing the team updates the rendered rows and url state', async ({ page }) => {
  await page.goto('/?tab=history');
  await page.waitForLoadState('networkidle');

  const teamSelect = page.locator('#teamSelect');
  const originalFirstWeek = await page.locator('#weekTable tbody tr').first().innerText();

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
  await expect(page.locator('html')).toHaveAttribute('data-accent-theme', 'owner');
  await expect(page.locator('html')).toHaveAttribute('data-owner-theme', nextTeam);
  expect(nextWeekCount).toBe(nextHistoryCount);
  await expect(page.locator('#weekTable tbody tr').first()).not.toHaveText(originalFirstWeek);
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
  await expect(page.locator('html')).toHaveAttribute('data-season-mode', 'saunders');

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
  await page.waitForLoadState('networkidle');

  await page.goto('/?tab=current&currentOwner=Joe&currentView=owners');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('#currentOwnerSelect')).toHaveValue('Joe');
  await expect(page.locator('#currentViewSelect')).toHaveValue('owners');
  await expect(page.locator('html')).toHaveAttribute('data-accent-theme', 'owner');
  await expect(page.locator('html')).toHaveAttribute('data-owner-theme', 'Joe');
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

test('browser navigation restores omitted Current Season defaults', async ({ page }) => {
  await page.goto('/?tab=current');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('#currentViewSelect')).toHaveValue('command');
  await expect(page.locator('#currentOwnerSelect')).toHaveValue('');
  await expect(page.locator('#currentProjectionSelect')).toHaveValue('ifScoresHold');

  await page.locator('#currentViewSelect').selectOption('owners');
  await expect.poll(() => new URL(page.url()).searchParams.get('currentView')).toBe('owners');

  await page.goBack();
  await expect.poll(() => new URL(page.url()).searchParams.get('currentView')).toBeNull();
  await expect(page.locator('#currentViewSelect')).toHaveValue('command');
  await expect(page.locator('#currentOwnerSelect')).toHaveValue('');
  await expect(page.locator('#currentProjectionSelect')).toHaveValue('ifScoresHold');

  await page.goForward();
  await expect(page.locator('#currentViewSelect')).toHaveValue('owners');
});

test('historical Current Season standings match the selected week snapshot', async ({ page }) => {
  await page.goto('/?tab=current&currentSeason=2024&currentWeek=7');
  await page.waitForLoadState('networkidle');

  await expect(page.locator('#currentSeasonSelect')).toHaveValue('2024');
  await expect(page.locator('#currentWeekSelect')).toHaveValue('7');
  const zubs = page.locator('#currentPlayoffPicture .current-seed-row').filter({ hasText: 'Zubs' });
  await expect(zubs.locator('.current-seed-badge')).toHaveText('3');
  await expect(zubs.locator('.current-seed-main')).toContainText('5-2');
  await expect(zubs.locator('.current-status-badge')).toHaveText('In control');
  await expect(zubs).not.toContainText('Clinched bye');
});

test('rivalry tab renders a tale of the tape and saved rivalry selection', async ({ page }) => {
  await page.goto('/?tab=history');
  await page.waitForLoadState('networkidle');

  await page.locator('#teamSelect').selectOption('Joel');
  await expect(page.locator('header h2')).toHaveText('Joel');

  await page.locator('#tabRivalryBtn').click();
  await expect(page.locator('#tabRivalryBtn')).toHaveClass(/active/);
  await expect(page.locator('#rivalryTeamA')).toBeVisible();
  await expect(page.locator('#rivalryTeamB')).toBeVisible();
  await expect(page.locator('#page-rivalry')).toContainText('Head to Head');
  await expect(page.locator('#rivalryTeamA')).toHaveValue('Joel');
  await expect(page.locator('header h2')).toHaveText('Joel');

  await page.locator('#tabHistoryBtn').click();
  await expect(page.locator('#tabHistoryBtn')).toHaveClass(/active/);
  await expect(page.locator('header h2')).toHaveText('Joel');

  await page.locator('#tabRivalryBtn').click();
  await expect(page.locator('#rivalryTeamA')).toHaveValue('Joel');
  await page.locator('#rivalryTeamB').selectOption('Zook');
  await page.locator('#rivalryTeamA').selectOption('Joe');
  await page.locator('#rivalryTeamB').selectOption('Joel');
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
  await expect(page.locator('html')).toHaveAttribute('data-accent-theme', 'rivalry');
  await expect(page.locator('html')).toHaveAttribute('data-rivalry-a', 'Joe');
  await expect(page.locator('html')).toHaveAttribute('data-rivalry-b', 'Joel');
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
  await page.goto('/?tab=history');
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
  await page.goto('/?tab=history');
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
  await page.goto('/?tab=history');
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
  const firstTrendOwner = await page.locator('#dynastyTrendChart [data-dynasty-trend-toggle="1"]').first().getAttribute('data-owner');
  const firstOwnerTitles = page.locator('#dynastyTrendChart svg title').filter({ hasText: `${firstTrendOwner}:` });
  expect(await firstOwnerTitles.count()).toBeGreaterThan(0);
  await page.locator('#dynastyTrendChart [data-dynasty-trend-toggle="1"]').first().click();
  await expect(page.locator('#dynastyTrendChart [data-dynasty-trend-toggle="1"]').first()).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(async () => firstOwnerTitles.count()).toBe(0);
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

test('Gauntlet preserves selections across ordinary tab reactivation', async ({ page }) => {
  await page.goto('/?tab=gauntlet');
  await page.waitForLoadState('networkidle');
  await page.locator('#gauntletOwnerA').selectOption('Zook');
  await expect.poll(() => new URL(page.url()).searchParams.get('ga')).toMatch(/^Zook:/);

  await page.locator('#tabTrophyBtn').click();
  await expect(page.locator('#trophyOwnerSelect')).toBeVisible();
  await page.locator('#tabGauntletBtn').click();
  await expect(page.locator('#gauntletOwnerA')).toHaveValue('Zook');
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

test('global search opens by shortcut and navigates to an owner season', async ({ page }) => {
  await page.goto('/?tab=history');
  await page.waitForLoadState('networkidle');

  const trigger = page.locator('.search-trigger');
  await expect(trigger).toBeEnabled();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+K' : 'Control+K');
  const dialog = page.getByRole('dialog', { name: 'Search The Darling' });
  await expect(dialog).toBeVisible();
  const input = dialog.getByRole('combobox');
  await expect(input).toBeFocused();
  await input.fill('Joe 2021');
  await expect(dialog.getByRole('option').first()).toContainText('Joe - 2021 season');
  await page.keyboard.press('Enter');

  await expect(page).toHaveURL(/tab=history/);
  await expect(page).toHaveURL(/team=Joe/);
  await expect(page).toHaveURL(/seasons=2021/);
  await expect(page.locator('#teamSelect')).toHaveValue('Joe');
});

test('global search resolves rivalry and browser back restores the previous view', async ({ page }) => {
  await page.goto('/?tab=current');
  await page.waitForLoadState('networkidle');
  await page.locator('.search-trigger').click();
  const dialog = page.getByRole('dialog', { name: 'Search The Darling' });
  await dialog.getByRole('combobox').fill('Zubs vs Joel');
  await expect(dialog.getByRole('option').first()).toContainText('Zubs vs Joel');
  await page.keyboard.press('Enter');

  await expect(page).toHaveURL(/tab=rivalry/);
  await expect(page.locator('#rivalryTeamA')).toHaveValue('Zubs');
  await expect(page.locator('#rivalryTeamB')).toHaveValue('Joel');
  await page.goBack();
  await expect(page).toHaveURL(/tab=current/);
  await expect(page.locator('#page-current')).toBeVisible();
});

test('global search navigates to season, score threshold, and record deep links', async ({ page }) => {
  await page.goto('/?tab=history');
  await page.waitForLoadState('networkidle');

  const search = async (query) => {
    await page.locator('.search-trigger').click();
    const dialog = page.getByRole('dialog', { name: 'Search The Darling' });
    await dialog.getByRole('combobox').fill(query);
    await page.keyboard.press('Enter');
  };

  await search('2024 playoffs');
  await expect(page).toHaveURL(/seasons=2024/);
  await expect(page).toHaveURL(/types=Playoff/);
  await expect(page.locator('#teamSelect')).toHaveValue('__ALL__');

  await search('150 point games');
  await expect(page).toHaveURL(/gameMinScore=150/);
  await expect(page).toHaveURL(/gameSort=scoreDesc/);
  await expect(page.locator('#historyGamesQuerySummary')).toContainText('scores of at least 150');
  const scoreCells = await page.locator('#historyGamesTable tbody tr td:nth-child(5)').allTextContents();
  expect(scoreCells.length).toBeGreaterThan(0);
  expect(scoreCells.every(value => Number(value.split(' - ')[0]) >= 150)).toBe(true);

  await search('biggest loss');
  await expect(page).toHaveURL(/gameResult=L/);
  await expect(page).toHaveURL(/gameSort=marginAsc/);
  await expect(page).toHaveURL(/gameLimit=1/);
  await expect(page.locator('#historyGamesTable tbody tr')).toHaveCount(1);
});

test('interactive history games sort, filter, expand, and persist saved views', async ({ page }) => {
  await page.goto('/?tab=history&team=Joe');
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => localStorage.removeItem('darling.tableViews.v1'));
  await page.reload();
  await page.waitForLoadState('networkidle');

  const shell = page.locator('[data-table-id="history-games"]');
  await shell.getByRole('button', { name: 'Sort Score; currently unsorted' }).click();
  await expect(page).toHaveURL(/gameSort=scoreDesc/);
  await expect(shell.locator('th').filter({ hasText: 'Score' })).toHaveAttribute('aria-sort', 'descending');

  await shell.getByRole('button', { name: '150+' }).click();
  await expect(page).toHaveURL(/gameMinScore=150/);
  const scoreCells = await shell.locator('tbody > tr:not(.table-expanded-row) td:nth-child(4)').allTextContents();
  expect(scoreCells.length).toBeGreaterThan(0);
  expect(scoreCells.every(value => Number(value.split(' - ')[0]) >= 150)).toBe(true);

  await shell.locator('.table-filter-menu > summary').click();
  await shell.getByPlaceholder('Search opponent').fill('Singer');
  await expect(shell.locator('tbody > tr:not(.table-expanded-row)')).not.toHaveCount(0);
  const opponents = await shell.locator('tbody > tr:not(.table-expanded-row) td:nth-child(2)').allTextContents();
  expect(opponents.every(value => value.includes('Singer'))).toBe(true);

  await shell.locator('.table-expand-button').first().click();
  await expect(shell.locator('.table-expanded-row')).toHaveCount(1);
  await expect(shell.locator('.table-expanded-row')).toContainText('Combined score');
  await expect(shell.locator('.table-expand-button').first()).toHaveAttribute('aria-expanded', 'true');

  await shell.locator('.table-view-menu > summary').click();
  await shell.getByPlaceholder('View name').fill('Singer 150 audit');
  await shell.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(shell.locator('.table-menu-message')).toContainText('Saved');

  await page.reload();
  await page.waitForLoadState('networkidle');
  const reloaded = page.locator('[data-table-id="history-games"]');
  await expect(reloaded.locator('.table-view-menu')).toContainText('Singer 150 audit');
  await expect(reloaded.locator('.table-expanded-row')).toHaveCount(0);

  await page.locator('#teamSelect').selectOption('Joel');
  await expect(page).toHaveURL(/team=Joel/);
  const switched = page.locator('[data-table-id="history-games"]');
  await switched.locator('.table-view-menu > summary').click();
  await switched.getByRole('button', { name: 'Singer 150 audit', exact: true }).click();
  await expect(page).toHaveURL(/team=Joe/);
  await expect(page).toHaveURL(/gameMinScore=150/);
  await expect(page.locator('#teamSelect')).toHaveValue('Joe');
  const restored = page.locator('[data-table-id="history-games"]');
  const restoredOpponents = await restored.locator('tbody > tr:not(.table-expanded-row) td:nth-child(2)').allTextContents();
  expect(restoredOpponents.length).toBeGreaterThan(0);
  expect(restoredOpponents.every(value => value.includes('Singer'))).toBe(true);
});

test('saved history views restore canonical facets and game-query limits', async ({ page }) => {
  await page.goto('/?tab=history&team=Joe&seasons=2024&types=Playoff&rounds=Semi%20Final&gameResult=L&gameSort=marginAsc&gameLimit=1');
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => localStorage.removeItem('darling.tableViews.v1'));
  await page.reload();
  await page.waitForLoadState('networkidle');

  const original = page.locator('[data-table-id="history-games"]');
  await expect(original.locator('tbody > tr:not(.table-expanded-row)')).toHaveCount(1);
  await original.locator('.table-view-menu > summary').click();
  await original.getByPlaceholder('View name').fill('Joe 2024 semifinal loss');
  await original.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(original.locator('.table-menu-message')).toContainText('Saved');

  await page.goto('/?tab=history&team=Joel&seasons=2025&types=Regular');
  await page.waitForLoadState('networkidle');
  const switched = page.locator('[data-table-id="history-games"]');
  await switched.locator('.table-view-menu > summary').click();
  await switched.getByRole('button', { name: 'Joe 2024 semifinal loss', exact: true }).click();

  await expect(page.locator('#teamSelect')).toHaveValue('Joe');
  await expect.poll(() => page.evaluate(() => Object.fromEntries(new URLSearchParams(location.search)))).toMatchObject({
    team: 'Joe',
    seasons: '2024',
    types: 'Playoff',
    rounds: 'Semi Final',
    gameResult: 'L',
    gameSort: 'marginAsc',
    gameLimit: '1',
  });
  await expect(page.locator('[data-table-id="history-games"] tbody > tr:not(.table-expanded-row)')).toHaveCount(1);
});

test('saved rivalry and trophy views restore initialized control contexts', async ({ page }) => {
  await page.goto('/?tab=rivalry&rivalryTeamA=Joe&rivalryTeamB=Joel');
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => localStorage.removeItem('darling.tableViews.v1'));
  await page.reload();
  await page.waitForLoadState('networkidle');

  const rivalry = page.locator('[data-table-id="rivalry-games"]');
  await rivalry.getByRole('button', { name: 'Last five meetings' }).click();
  await rivalry.locator('.table-view-menu > summary').click();
  await rivalry.getByPlaceholder('View name').fill('Joe vs Joel last five');
  await rivalry.getByRole('button', { name: 'Save', exact: true }).click();
  await page.locator('#rivalryTeamB').selectOption('Shap');
  await expect(page).toHaveURL(/rivalryTeamB=Shap/);

  const switchedRivalry = page.locator('[data-table-id="rivalry-games"]');
  await switchedRivalry.locator('.table-view-menu > summary').click();
  await switchedRivalry.getByRole('button', { name: 'Joe vs Joel last five', exact: true }).click();
  await expect(page.locator('#rivalryTeamA')).toHaveValue('Joe');
  await expect(page.locator('#rivalryTeamB')).toHaveValue('Joel');
  await expect(page).toHaveURL(/rivalryTeamB=Joel/);
  await expect(page.locator('[data-table-id="rivalry-games"] tbody > tr:not(.table-expanded-row)')).toHaveCount(5);

  await page.goto('/?tab=trophy&trophyOwner=Joe');
  await page.waitForLoadState('networkidle');
  const trophy = page.locator('[data-table-id="trophy-seasons"]');
  await trophy.getByRole('button', { name: 'Sort Finish; currently unsorted' }).click();
  await trophy.locator('.table-view-menu > summary').click();
  await trophy.getByPlaceholder('View name').fill('Joe trophy ledger');
  await trophy.getByRole('button', { name: 'Save', exact: true }).click();
  await page.locator('#trophyOwnerSelect').selectOption('Joel');
  await expect(page).toHaveURL(/trophyOwner=Joel/);

  const switchedTrophy = page.locator('[data-table-id="trophy-seasons"]');
  await switchedTrophy.locator('.table-view-menu > summary').click();
  await switchedTrophy.getByRole('button', { name: 'Joe trophy ledger', exact: true }).click();
  await expect(page.locator('#trophyOwnerSelect')).toHaveValue('Joe');
  await expect(page).toHaveURL(/trophyOwner=Joe/);
  await expect(page.locator('[data-table-id="trophy-seasons"] th').filter({ hasText: 'Finish' })).toHaveAttribute('aria-sort', 'ascending');
});

test('interactive tables mount across rivalry, current season, and trophy pages', async ({ page }) => {
  await page.goto('/?tab=rivalry&rivalryTeamA=Joe&rivalryTeamB=Joel');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('[data-table-id="rivalry-seasons"] tbody tr')).not.toHaveCount(0);
  const rivalryGames = page.locator('[data-table-id="rivalry-games"]');
  await expect(rivalryGames.locator('tbody tr')).not.toHaveCount(0);
  await rivalryGames.getByRole('button', { name: 'Last five meetings' }).click();
  await expect(rivalryGames.locator('tbody > tr:not(.table-expanded-row)')).toHaveCount(5);
  await rivalryGames.locator('.table-expand-button').first().click();
  await expect(rivalryGames.locator('.table-expanded-row')).toContainText('Running series record');

  await page.goto('/?tab=current&currentOwner=Joe');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('[data-table-id="current-standings"] tbody tr')).not.toHaveCount(0);
  await expect(page.locator('[data-table-id="current-projected"] tbody tr')).not.toHaveCount(0);
  await expect(page.locator('[data-table-id="current-standings"] .current-owner-focus-row')).toHaveCount(1);

  await page.goto('/?tab=trophy&trophyOwner=Joe');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('[data-table-id="trophy-seasons"] tbody tr')).toHaveCount(12);
  await expect(page.locator('[data-table-id="trophy-seasons"] .table-note-chip').first()).toBeVisible();
});

test('trophy ledger note chips meet light and dark contrast requirements', async ({ page }) => {
  await page.goto('/?tab=trophy&trophyOwner=Joe');
  await page.waitForLoadState('networkidle');
  const chip = page.locator('[data-table-id="trophy-seasons"] .table-note-chip').first();
  await expect(chip).toBeVisible();
  await expect(page.locator('[data-table-id="trophy-seasons"] .trophy-chip')).toHaveCount(0);

  await page.getByRole('button', { name: 'Light' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-color-scheme', 'light');
  expect(await computedContrastRatio(chip)).toBeGreaterThanOrEqual(4.5);

  await page.getByRole('button', { name: 'Dark' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-color-scheme', 'dark');
  expect(await computedContrastRatio(chip)).toBeGreaterThanOrEqual(4.5);
});

test('interactive tables keep sticky identity cells readable on mobile and dark mode', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?tab=history&team=Joe');
  await page.waitForLoadState('networkidle');

  const shell = page.locator('[data-table-id="history-games"]');
  const scroller = shell.locator('.interactive-table-scroll');
  expect(await scroller.evaluate(element => element.scrollWidth > element.clientWidth)).toBe(true);
  const pinned = shell.locator('tbody .table-column-pinned').first();
  expect(await pinned.evaluate(element => getComputedStyle(element).position)).toBe('sticky');
  expect(await pinned.evaluate(element => getComputedStyle(element).left)).toBe('0px');

  await page.getByRole('button', { name: 'Dark' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-color-scheme', 'dark');
  expect(await pinned.evaluate(element => getComputedStyle(element).backgroundColor)).not.toContain('rgba');
  expect(await pinned.evaluate(element => getComputedStyle(element).color)).toBe('rgb(248, 250, 252)');
});

test('history game-query deep links survive direct loads and reloads', async ({ page }) => {
  const scoreUrl = '/?tab=history&gameMinScore=150&gameSort=scoreDesc&focus=games';
  await page.goto(scoreUrl);
  await page.waitForLoadState('networkidle');
  await expect(page).toHaveURL(/gameMinScore=150/);
  await expect(page.locator('#teamSelect')).toHaveValue('__ALL__');
  await expect(page.locator('#historyGamesQuerySummary')).toContainText('scores of at least 150');
  const scoreCount = await page.locator('#historyGamesTable tbody tr').count();
  expect(scoreCount).toBeGreaterThan(0);

  await page.reload();
  await page.waitForLoadState('networkidle');
  await expect(page).toHaveURL(/gameMinScore=150/);
  await expect(page.locator('#historyGamesTable tbody tr')).toHaveCount(scoreCount);

  const recordUrl = '/?tab=history&gameResult=L&gameSort=marginAsc&gameLimit=1&focus=games';
  await page.goto(recordUrl);
  await page.waitForLoadState('networkidle');
  await expect(page).toHaveURL(/gameResult=L/);
  await expect(page.locator('#historyGamesTable tbody tr')).toHaveCount(1);

  await page.reload();
  await page.waitForLoadState('networkidle');
  await expect(page).toHaveURL(/gameLimit=1/);
  await expect(page.locator('#historyGamesTable tbody tr')).toHaveCount(1);

  await page.goto('/?tab=history&team=Joe&gameLimit=100&focus=games');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('[data-table-id="history-games"] .table-result-count')).toContainText('100 of');
  await expect(page.locator('#historyGamesTable tbody tr:not(:has(.table-empty-state))')).toHaveCount(100);
  await expect(page.locator('[data-table-id="history-games"] .table-pagination')).toHaveCount(0);
});

test('dynamic structured results remain in recents after reopen and reload', async ({ page }) => {
  await page.goto('/?tab=history');
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => window.darlingSearch.clearRecent());
  const trigger = page.locator('.search-trigger');
  await trigger.click();
  let dialog = page.getByRole('dialog', { name: 'Search The Darling' });
  await dialog.getByRole('combobox').fill('games over 140');
  await dialog.getByRole('option').first().click();
  await expect(page).toHaveURL(/gameMinScore=140/);

  await trigger.click();
  dialog = page.getByRole('dialog', { name: 'Search The Darling' });
  await expect(dialog.getByRole('option').first()).toContainText('140+ point games');
  await page.keyboard.press('Escape');

  await page.reload();
  await page.waitForLoadState('networkidle');
  await trigger.click();
  dialog = page.getByRole('dialog', { name: 'Search The Darling' });
  await expect(dialog.getByRole('option').first()).toContainText('140+ point games');

  await page.keyboard.press('Escape');
  const dynamicIds = await page.evaluate(() => {
    window.darlingSearch.clearRecent();
    const results = ['2024 regular season', 'Zubs vs Joe'].map(query => window.darlingSearch.search(query)[0]);
    results.forEach(result => window.darlingSearch.execute(result));
    return results.map(result => result.id);
  });
  expect(dynamicIds).toEqual(['season-type:2024:Regular', 'rivalry:Zubs:Joe']);

  await page.reload();
  await page.waitForLoadState('networkidle');
  const restoredIds = await page.evaluate(() => window.darlingSearch.search('').map(result => result.id));
  expect(restoredIds).toEqual(expect.arrayContaining(dynamicIds));
});

test('global search parser recognizes supported league phrases without guessing invalid entities', async ({ page }) => {
  await page.goto('/?tab=history');
  await page.waitForLoadState('networkidle');

  const results = await page.evaluate(() => {
    const queries = [
      'Joe 2021',
      '2021 Joe',
      'Zubs versus Joel',
      'Plot Joel head to head',
      'Joel versus Joe',
      'Joel Joe h2h',
      '2024 Saunders',
      'games over 140',
      'Joe biggest loss',
      'Joe trophy case',
      'Joe dynasty',
      'The Browns vs When it Haynes, it Pours',
      'games over 100.38',
      'DefinitelyNotAnOwner trophy case',
      'Joe Shap biggest loss',
      'DefinitelyNotAnOwner 2022',
      'Joe vs Joe',
      'Joe vs Joel 2024',
      'Joe vs Joel biggest loss',
      'vs Joe Joel',
    ];
    return Object.fromEntries(queries.map(query => {
      const first = window.darlingSearch.search(query)[0];
      return [query, first ? { title: first.title, score: first.score, interpretation: first.interpretation } : null];
    }));
  });

  expect(results['Joe 2021'].title).toContain('Joe - 2021 season');
  expect(results['2021 Joe'].title).toContain('Joe - 2021 season');
  expect(results['Zubs versus Joel'].title).toBe('Zubs vs Joel');
  expect(results['Plot Joel head to head'].title).toBe('Plot vs Joel');
  expect(results['Joel versus Joe'].title).toBe('Joel vs Joe');
  expect(results['Joel Joe h2h'].title).toBe('Joel vs Joe');
  expect(results['2024 Saunders'].title).toContain('2024 Saunders games');
  expect(results['games over 140'].title).toContain('140+ point games');
  expect(results['Joe biggest loss'].title).toContain('Joe Biggest loss');
  expect(results['Joe trophy case'].title).toContain('Joe Trophy Case');
  expect(results['Joe dynasty'].title).toContain('Joe Dynasty Rankings');
  expect(results['The Browns vs When it Haynes, it Pours'].title).toBe('Zubs vs Joe');
  expect(results['games over 100.38'].title).toContain('100.38+ point games');
  expect(results['DefinitelyNotAnOwner trophy case']?.score || 0).toBeLessThan(1000);
  expect(results['Joe Shap biggest loss']?.score || 0).toBeLessThan(1000);
  expect(results['DefinitelyNotAnOwner 2022']?.score || 0).toBeLessThan(1000);
  expect(results['Joe vs Joe']?.score || 0).toBeLessThan(1000);
  expect(results['Joe vs Joel 2024']?.score || 0).toBeLessThan(1000);
  expect(results['Joe vs Joel biggest loss']?.score || 0).toBeLessThan(1000);
  expect(results['vs Joe Joel']?.score || 0).toBeLessThan(1000);
});

test('global search executes theme commands and uses a keyboard-safe mobile sheet', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?tab=history');
  await page.waitForLoadState('networkidle');
  const trigger = page.locator('.search-trigger');
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Search The Darling' });
  const box = await dialog.boundingBox();
  expect(box.width).toBeLessThanOrEqual(390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await dialog.getByRole('combobox').fill('dark mode');
  await expect(dialog.getByRole('option').first()).toContainText('Dark mode');
  expect(await page.evaluate(() => window.darlingSearch.search('dark mode')[0].action)).toEqual({ kind: 'command', command: 'theme-dark' });
  await dialog.getByRole('option').first().click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('darling.search.recent') || '[]'))).toContain('command:theme-dark');
  await expect(page.locator('html')).toHaveAttribute('data-color-scheme', 'dark');

  await trigger.click();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test('global search restores focus to the keyboard shortcut invoker', async ({ page }) => {
  await page.goto('/?tab=history');
  await page.waitForLoadState('networkidle');
  const teamSelect = page.locator('#teamSelect');
  await teamSelect.focus();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+K' : 'Control+K');
  const dialog = page.getByRole('dialog', { name: 'Search The Darling' });
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(teamSelect).toBeFocused();
});

test('facet dropdowns keep expanded state in sync and close with escape', async ({ page }) => {
  await page.goto('/?tab=history');
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
  await page.goto('/?tab=history');
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

test('export history command honors game-query filters, ordering, and limit', async ({ page }) => {
  await page.goto('/?tab=history&gameMinScore=150&gameSort=scoreDesc&gameLimit=5&focus=games');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('#historyGamesTable tbody tr')).toHaveCount(5);

  await page.locator('.search-trigger').click();
  const dialog = page.getByRole('dialog', { name: 'Search The Darling' });
  await dialog.getByRole('combobox').fill('export history');
  const downloadPromise = page.waitForEvent('download');
  await dialog.getByRole('option').first().click();
  const download = await downloadPromise;
  const lines = (await downloadText(download)).trim().split('\n');

  expect(download.suggestedFilename()).toBe('history_ALL.csv');
  expect(lines).toHaveLength(6);
  const scores = lines.slice(1).map(line => Number(line.split(',')[5].replaceAll('"', '')));
  expect(scores.every(score => score >= 150)).toBe(true);
  expect(scores).toEqual([...scores].sort((a, b) => b - a));
});

test('unchanged history state does not rebuild rendered table rows', async ({ page }) => {
  await page.goto('/?tab=history');
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
  await page.goto('/?tab=history');
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
  await page.goto('/?tab=history');
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
  await expect(page.locator('#historyGamesTable tbody tr:not(:has(.table-empty-state))')).toHaveCount(0);
  await expect(page.locator('#historyGamesTable .table-empty-state')).toHaveText('No games match the current table filters.');
  await expect(page.locator('#weekTable tbody tr:not(:has(.table-empty-state))')).toHaveCount(0);
  await expect(page.locator('#weekTable .table-empty-state')).toHaveText('Select a team or broaden the filters to see weekly games.');
  await expect(page.locator('#oppTable tbody tr:not(:has(.table-empty-state))')).toHaveCount(0);
  await expect(page.locator('#oppTable .table-empty-state')).toHaveText('No opponents match the current table filters.');
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
  await page.route('**/assets/H2H.json*', route => {
    route.fulfill({
      status: 500,
      contentType: 'text/plain',
      body: 'upstream failed',
    });
  });

  await page.goto('/?tab=history');
  await page.waitForLoadState('networkidle');

  await expect(page.locator('#appStatus')).toBeVisible();
  await expect(page.locator('#appStatus')).toContainText('Could not load league data');
  await expect(page.locator('#teamSelect option')).toHaveCount(0);
});

test('Draft Spot direct URLs restore controls, receipts, themes, and browser history', async ({ page }) => {
  await page.goto('/?tab=draft&draftMode=pick&draftOwner=Joe&draftStart=2021&draftEnd=2025&draftMetric=playoffRate&draftMinSample=2&draftNormalize=percentile&draftPick=10');
  await page.waitForLoadState('networkidle');

  await expect(page.locator('#tabDraftBtn')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tabpanel', { name: 'Draft Spot' })).toBeVisible();
  await expect(page.locator('#draftOwnerSelect')).toHaveValue('Joe');
  await expect(page.locator('#draftMetricSelect')).toHaveValue('playoffRate');
  await expect(page.locator('#draftNormalizeToggle')).toBeChecked();
  await expect(page.locator('.draft-pick-card[data-draft-pick="10"], .draft-pick-card[aria-label^="Pick 10:"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#draftRowsTable tbody tr:not(:has(.table-empty-state))')).toHaveCount(1);
  await expect(page.locator('html')).toHaveAttribute('data-accent-theme', 'owner');
  await expect(page.locator('html')).toHaveAttribute('data-owner-theme', 'Joe');

  await page.locator('.draft-zone-card').filter({ hasText: 'Late (8+)' }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get('draftZone')).toBe('late');
  await expect.poll(() => new URL(page.url()).searchParams.get('draftPick')).toBeNull();
  await page.goBack();
  await expect(page.locator('.draft-pick-card[aria-pressed="true"]')).toContainText('12-team slot 10');
});

test('Draft Spot normalized slots combine equivalent 10-team and 12-team positions', async ({ page }) => {
  await page.goto('/?tab=draft&draftMode=pick&draftNormalize=percentile&draftPick=12');
  await page.waitForLoadState('networkidle');

  const slot = page.locator('.draft-pick-card[data-draft-pick="12"]');
  await expect(slot).toHaveAttribute('aria-pressed', 'true');
  await expect(slot).toContainText('12-team slot 12');
  await expect(slot).toContainText('n=9');
  await expect(page.locator('#draftRowsTable tbody tr:not(:has(.table-empty-state))')).toHaveCount(9);
});

test('Draft Spot preserves selections across ordinary tab reactivation', async ({ page }) => {
  await page.goto('/?tab=draft');
  await page.waitForLoadState('networkidle');
  await page.locator('#draftOwnerSelect').selectOption('Joe');
  await expect.poll(() => new URL(page.url()).searchParams.get('draftOwner')).toBe('Joe');

  await page.locator('#tabTrophyBtn').click();
  await expect(page.locator('#trophyOwnerSelect')).toBeVisible();
  await page.locator('#tabDraftBtn').click();
  await expect(page.locator('#draftOwnerSelect')).toHaveValue('Joe');
});

test('Draft Spot timeline highlights normalized selections using the normalized slot', async ({ page }) => {
  await page.goto('/?tab=draft&draftMode=owner&draftOwner=Joel&draftNormalize=percentile');
  await page.waitForLoadState('networkidle');

  const tenthPick = page.locator('.draft-timeline-item[data-draft-pick="12"]').first();
  await expect(tenthPick).toContainText('Pick 10');
  expect(await tenthPick.evaluate(element => element.tagName)).toBe('BUTTON');
  expect(await tenthPick.getAttribute('role')).toBeNull();
  await expect(tenthPick).toHaveAttribute('aria-pressed', 'false');
  await tenthPick.click();

  await expect.poll(() => new URL(page.url()).searchParams.get('draftPick')).toBe('12');
  await expect(tenthPick).toHaveClass(/selected/);
  await expect(tenthPick).toHaveAttribute('aria-pressed', 'true');
});

test('global search reaches Draft Spot picks, zones, and owner history', async ({ page }) => {
  await page.goto('/?tab=history');
  await page.waitForLoadState('networkidle');
  await page.locator('.search-trigger').click();
  const search = page.getByRole('combobox', { name: /Search owners, seasons/i });
  await search.fill('Joe draft history');
  await expect(page.getByRole('option', { name: /Joe draft history/i })).toBeVisible();
  await page.getByRole('option', { name: /Joe draft history/i }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get('tab')).toBe('draft');
  await expect.poll(() => new URL(page.url()).searchParams.get('draftOwner')).toBe('Joe');

  await page.locator('.search-trigger').click();
  await page.getByRole('combobox', { name: /Search owners, seasons/i }).fill('pick 10');
  await page.getByRole('option', { name: /Draft pick 10/i }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get('draftPick')).toBe('10');
});

test('optional Draft Spot fetch failure leaves the rest of the app usable', async ({ page }) => {
  await page.route('**/assets/DraftSpot.json*', route => route.fulfill({ status: 500, body: '{}' }));
  await page.goto('/?tab=draft');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('#draftSpotRoot')).toContainText('Draft Spot is unavailable');
  await page.locator('#tabHistoryBtn').click();
  await expect(page.locator('#historyGamesTable')).toBeVisible();
});

test('Current Season displays deterministic playoff odds without replacing status labels', async ({ page }) => {
  await page.goto('/?tab=current&currentOwner=Joe');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('.current-odds-methodology')).toBeVisible();
  await expect(page.locator('.current-odds-chip').first()).toContainText(/Playoffs \d+%|Playoffs <1%|Playoffs >99%/);
  await expect(page.locator('.current-status-badge').first()).toBeVisible();
  await expect(page.locator('#currentOddsMovementPlot svg')).toBeVisible();
});
