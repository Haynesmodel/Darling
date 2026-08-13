import { expect, test } from './coverage-fixture.js';
import { activateFeature, featureDestination } from './navigation-helpers.js';

test('primary navigation exposes five semantic controls and all ten canonical destinations', async ({ page }) => {
  await page.goto('/');
  const navigation = page.locator('#primaryNavigation');
  await expect(navigation.locator(':scope > .primary-nav-control, :scope > .primary-nav-group')).toHaveCount(5);
  await expect(page.getByRole('link', { name: /Home/ })).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('[data-feature-id]')).toHaveCount(10);
  await expect(page.locator('#page-pulse')).toHaveAttribute('data-feature-state', 'ready');
  expect(await page.evaluate(() => ({
    activeFeature: window.darlingFeatureDiagnostics.activeFeature,
    activationCount: window.darlingFeatureDiagnostics.activationCount,
    registeredFeatures: Object.keys(window.darlingFeatureDiagnostics.features).length,
  }))).toEqual({
    activeFeature: 'pulse',
    activationCount: 1,
    registeredFeatures: 10,
  });
  await page.getByText('Owners', { exact: true }).click();
  await expect(featureDestination(page, 'owner')).toBeVisible();
  await expect(featureDestination(page, 'transactions')).toBeVisible();
  await expect(featureDestination(page, 'history')).toBeVisible();
  await expect(featureDestination(page, 'trophy')).toBeVisible();
  await expect(featureDestination(page, 'dynasty')).toBeVisible();
  await expect(featureDestination(page, 'history')).toHaveAttribute('href', /[?&]tab=history$/);

  await page.getByText('Tools', { exact: true }).click();
  await expect(page.locator('.primary-nav-group[data-navigation-group="owners"]')).not.toHaveAttribute('open', '');
  await expect(featureDestination(page, 'draft')).toBeVisible();
  await expect(featureDestination(page, 'gauntlet')).toBeVisible();
  await expect(featureDestination(page, 'gauntlet')).toHaveAttribute('href', /[?&]tab=gauntlet$/);
});

test('coverage build exercises the fallback freshness contract in authored coordinates', async ({ page }) => {
  test.skip(!process.env.COLLECT_COVERAGE, 'The source module is available only from the instrumented development server.');
  await page.goto('/');
  expect(await page.evaluate(async () => {
    const { createFallbackFreshness } = await import('/src/app/app-controller.ts');
    const assessment = { state: 'final', detail: 'Season complete' };
    const runtime = createFallbackFreshness(assessment);
    runtime.publish({ ignored: true });
    const unsubscribe = runtime.subscribe(() => {});
    return {
      current: runtime.current(),
      assessment: runtime.currentAssessment(),
      unsubscribed: unsubscribe(),
    };
  })).toEqual({
    current: null,
    assessment: { state: 'final', detail: 'Season complete' },
    unsubscribed: undefined,
  });
});

test('grouped menus close with Escape, outside activation, and destination selection', async ({ page }) => {
  await page.goto('/');
  const owners = page.getByText('Owners', { exact: true });
  const ownersGroup = page.locator('.primary-nav-group[data-navigation-group="owners"]');
  await owners.focus();
  await page.keyboard.press('Enter');
  await expect(ownersGroup).toHaveAttribute('open', '');
  await page.keyboard.press('Escape');
  await expect(ownersGroup).not.toHaveAttribute('open', '');
  await expect(owners).toBeFocused();

  await owners.click();
  await page.locator('#mainContent').click({ position: { x: 1, y: 1 } });
  await expect(ownersGroup).not.toHaveAttribute('open', '');

  await activateFeature(page, 'dynasty');
  await expect(page.locator('#page-dynasty')).toHaveAttribute('data-feature-state', 'ready');
  await expect(ownersGroup).not.toHaveAttribute('open', '');
  await expect(featureDestination(page, 'dynasty')).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('[data-feature-id][aria-current="page"]')).toHaveCount(1);
  await expect(ownersGroup).toHaveClass(/is-current-group/);
  await expect(ownersGroup.locator('[data-current-group-label]')).toHaveText(/current page: Dynasty Rankings/);
});

test('primary navigation has no horizontal overflow at required viewports', async ({ page }) => {
  for (const width of [320, 390, 768, 1280, 1440]) {
    await page.setViewportSize({ width, height: width < 700 ? 844 : 900 });
    await page.goto('/');
    await expect(page.locator('#page-pulse')).toHaveAttribute('data-feature-state', 'ready');
    const geometry = await page.locator('#primaryNavigation').evaluate(element => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
      documentClientWidth: document.documentElement.clientWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
    }));
    expect(geometry.scrollWidth, `${width}px navigation overflow`).toBeLessThanOrEqual(geometry.clientWidth);
    expect(geometry.documentScrollWidth, `${width}px document overflow`).toBeLessThanOrEqual(geometry.documentClientWidth);
  }
});

test('Pulse keeps its full hero while analytical routes publish compact chrome', async ({ page }) => {
  for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 800 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await expect(page.locator('#page-pulse')).toHaveAttribute('data-feature-state', 'ready');
    const pulse = await page.evaluate(() => ({
      mode: document.documentElement.dataset.heroMode,
      hero: document.querySelector('.site-hero').getBoundingClientRect().height,
    }));
    expect(pulse.mode).toBe('full');
    expect(pulse.hero).toBeGreaterThanOrEqual(viewport.width === 390 ? 260 : 360);
    expect(pulse.hero).toBeLessThanOrEqual(viewport.width === 390 ? 300 : 400);

    for (const id of ['owner', 'transactions', 'history', 'current', 'rivalry', 'trophy', 'dynasty', 'draft', 'gauntlet']) {
      await page.goto(`/?tab=${id}`);
      await expect(page.locator(`#page-${id}`)).toHaveAttribute('data-feature-state', 'ready');
      const compact = await page.evaluate(() => ({
        mode: document.documentElement.dataset.heroMode,
        hero: document.querySelector('.site-hero').getBoundingClientRect().height,
        mainTop: document.querySelector('main').getBoundingClientRect().top,
      }));
      expect(compact.mode).toBe('compact');
      expect(compact.hero, `${id} compact hero at ${viewport.width}px`).toBeLessThanOrEqual(180);
      expect(compact.mainTop, `${id} main top at ${viewport.width}px`).toBeLessThanOrEqual(260);
    }
  }
});

test('modifier activation remains a normal link and leaves the current SPA unchanged', async ({ page, context }) => {
  await page.goto('/');
  await page.getByText('Tools', { exact: true }).click();
  const popupPromise = context.waitForEvent('page');
  await featureDestination(page, 'draft').click({ button: 'middle' });
  const popup = await popupPromise;
  await popup.waitForLoadState('networkidle');
  await expect(popup.locator('#page-draft')).toHaveAttribute('data-feature-state', 'ready');
  await expect(page.locator('#page-pulse')).toBeVisible();
  await expect(page).not.toHaveURL(/tab=draft/);
  await popup.close();
});

const analyticalRoutes = [
  { id: 'history', url: '/?tab=history&team=Joe', jump: '#history-section-jump', height: 5000 },
  { id: 'rivalry', url: '/?tab=rivalry&rivalryTeamA=Joe&rivalryTeamB=Joel', jump: '#rivalry-section-jump', height: 5200 },
  { id: 'trophy', url: '/?tab=trophy&trophyOwner=Joe', jump: '#trophy-section-jump', height: 4200 },
  { id: 'dynasty', url: '/?tab=dynasty&dynastyMode=calculator&dynastyOwner=Joe', jump: '#dynasty-section-jump', height: 6200 },
  { id: 'draft', url: '/?tab=draft&draftMode=pick&draftPick=10', jump: '#draft-section-jump', height: 6200 },
  { id: 'gauntlet', url: '/?tab=gauntlet&ga=Joe%3A2024&gb=Zook%3A2019', jump: '#gauntlet-section-jump', height: 5000 },
];

test('analytical routes publish their mode-specific primary sections and defer supporting charts', async ({ page }) => {
  const cases = [
    {
      url: analyticalRoutes[0].url,
      open: ['historyOverviewDisclosure', 'historyFunFactsDisclosure'],
      closed: 'historyGamesDisclosure',
      options: ['Owner Overview', 'Fun Facts', 'Curse Tracker', 'Opponent Breakdown', 'Season Recap', 'Week-by-Week', 'All Games'],
    },
    {
      url: analyticalRoutes[1].url,
      open: ['rivalryLeadDisclosure', 'rivalryHighlightsDisclosure'],
      closed: 'rivalryTrendDisclosure',
      options: ['Series Lead', 'Highlights', 'Tale of the Tape', 'Lead Trend', 'Timeline', 'Season Breakdown', 'Game Log'],
      emptyChart: '#rivalryLeadPlot svg',
    },
    {
      url: analyticalRoutes[2].url,
      open: ['trophyHardwareDisclosure'],
      closed: 'trophyCareerDisclosure',
      options: ['Hardware Shelf', 'League Rank', 'Career Shape', 'Highlights and Low Points', 'Season Ledger'],
      emptyChart: '#trophyCareerPlot svg',
    },
    {
      url: analyticalRoutes[3].url,
      open: ['dynastyScoreDisclosure'],
      closed: 'dynastyTrendDisclosure',
      options: ['Score Breakdown', 'Period Comparison', 'Best Dynasty Windows', 'Dynasty Trend', 'Era Heatmap', 'Slumps'],
      emptyChart: '#dynastyTrendPlot svg',
    },
    {
      url: analyticalRoutes[4].url,
      open: ['draftPickDisclosure', 'draftSelectionDisclosure'],
      closed: 'draftZoneDisclosure',
      options: ['Pick Board', 'Zone Comparison', 'Owner Recommendations', 'Owner Timeline', 'Selection Detail', 'Draft Spot Data'],
      emptyChart: '.draft-zone-chart svg',
    },
    {
      url: analyticalRoutes[5].url,
      open: ['gauntletMatchupDisclosure', 'gauntletCopyDisclosure'],
      closed: 'gauntletHistogramDisclosure',
      options: ['Matchup', 'Score Distribution', 'Key Stats', 'Head to Head Context', 'Narrative and Copy'],
      emptyChart: '#gauntletHistogramPlot svg',
    },
  ];

  for (const entry of cases) {
    await page.goto(entry.url);
    await expect(page.locator('.page:not([hidden])')).toHaveAttribute('data-feature-state', 'ready');
    for (const id of entry.open) await expect(page.locator(`#${id}`)).toHaveAttribute('open', '');
    await expect(page.locator(`#${entry.closed}`)).not.toHaveAttribute('open', '');
    await expect(page.locator('.page:not([hidden]) .feature-section-nav option')).toHaveText(entry.options);
    if (entry.emptyChart) await expect(page.locator(entry.emptyChart)).toHaveCount(0);
  }
});

test('section jumps reveal and focus without mutating product URLs', async ({ page }) => {
  const targets = [
    [analyticalRoutes[1], 'rivalry-trend', '#rivalryTrendDisclosure', '#rivalryLeadPlot svg'],
    [analyticalRoutes[2], 'trophy-career', '#trophyCareerDisclosure', '#trophyCareerPlot svg'],
    [analyticalRoutes[3], 'dynasty-trend', '#dynastyTrendDisclosure', '#dynastyTrendPlot svg'],
    [analyticalRoutes[4], 'draft-zones', '#draftZoneDisclosure', '.draft-zone-chart svg'],
    [analyticalRoutes[5], 'gauntlet-distribution', '#gauntletHistogramDisclosure', '#gauntletHistogramPlot svg'],
  ];
  for (const [route, section, detailsSelector, chartSelector] of targets) {
    await page.goto(route.url);
    await expect(page.locator(`#page-${route.id}`)).toHaveAttribute('data-feature-state', 'ready');
    if (route.id === 'draft') {
      await expect.poll(() => new URL(page.url()).searchParams.get('draftStart')).not.toBeNull();
    }
    const before = page.url();
    await page.locator(route.jump).selectOption(section);
    await expect(page.locator(detailsSelector)).toHaveAttribute('open', '');
    await expect(page.locator(`${detailsSelector} > summary`)).toBeFocused();
    await expect(page.locator(chartSelector)).toHaveCount(1);
    expect(page.url()).toBe(before);
  }
});

test('disclosure memory is scoped by owner signature and restored on return', async ({ page }) => {
  await page.goto('/?tab=trophy&trophyOwner=Joe');
  await page.locator('#trophy-section-jump').selectOption('trophy-moments');
  await expect(page.locator('#trophyMomentsDisclosure')).toHaveAttribute('open', '');

  await page.locator('#trophyOwnerSelect').selectOption('Joel');
  await expect(page.locator('#trophyMomentsDisclosure')).not.toHaveAttribute('open', '');
  await expect(page.locator('#trophyHardwareDisclosure')).toHaveAttribute('open', '');

  await page.locator('#trophyOwnerSelect').selectOption('Joe');
  await expect(page.locator('#trophyMomentsDisclosure')).toHaveAttribute('open', '');
});

test('table state survives disclosure close and reopen', async ({ page }) => {
  await page.goto('/?tab=trophy&trophyOwner=Joe');
  await page.locator('#trophy-section-jump').selectOption('trophy-ledger');
  const table = page.locator('[data-table-id="trophy-seasons"]');
  const finish = table.getByRole('button', { name: 'Sort Finish; currently unsorted' });
  await finish.click();
  await expect(table.locator('th').filter({ hasText: 'Finish' })).toHaveAttribute('aria-sort', 'ascending');

  await page.locator('#trophyLedgerDisclosure > summary').click();
  await expect(page.locator('#trophyLedgerDisclosure')).not.toHaveAttribute('open', '');
  await page.locator('#trophyLedgerDisclosure > summary').click();
  await expect(table.locator('th').filter({ hasText: 'Finish' })).toHaveAttribute('aria-sort', 'ascending');
  await expect(page.locator('#trophyOwnerSelect')).toHaveValue('Joe');
});

test('History focus links reveal their existing targets and unavailable sections leave the jump menu', async ({ page }) => {
  await page.goto('/?tab=history&team=Joe&focus=games');
  await expect(page.locator('#historyGamesDisclosure')).toHaveAttribute('open', '');
  await expect(page.locator('#historyGamesCard')).toBeFocused();

  await page.goto('/?tab=history&team=Joe&focus=curses');
  await expect(page.locator('#historyCurseDisclosure')).toHaveAttribute('open', '');
  await expect(page.locator('#curseTracker')).toBeFocused();

  await page.locator('#teamSelect').selectOption('__ALL__');
  await expect(page.locator('#historySeasonsDisclosure')).toBeHidden();
  await expect(page.locator('#historyWeeksDisclosure')).toBeHidden();
  expect(await page.locator('#history-section-jump option').allTextContents()).not.toEqual(
    expect.arrayContaining(['Season Recap', 'Week-by-Week']),
  );
});

test('Rivalry normalizes invalid scope and ignores inactive control events', async ({ page }) => {
  await page.goto('/?tab=pulse&rivalryScope=invalid');
  await activateFeature(page, 'rivalry');
  await expect(page.locator('#page-rivalry')).toHaveAttribute('data-feature-state', 'ready');
  await page.locator('#rivalryScopeSelect').selectOption('historic');
  await activateFeature(page, 'pulse');
  await page.locator('#rivalryScopeSelect').dispatchEvent('change');
});

test('Trophy tolerates a missing disclosure mount and inactive owner events', async ({ page }) => {
  await page.goto('/?tab=pulse&team=Joel');
  await page.locator('#trophySectionNav').evaluate(element => element.remove());
  await activateFeature(page, 'trophy');
  await expect(page.locator('#page-trophy')).toHaveAttribute('data-feature-state', 'ready');
  await page.locator('#trophyOwnerSelect').selectOption('Joe');
  await activateFeature(page, 'pulse');
  await page.locator('#trophyOwnerSelect').dispatchEvent('change');
});

test('Trophy tolerates missing optional disclosure sections', async ({ page }) => {
  await page.goto('/');
  await page.locator('#trophyCareerDisclosure').evaluate(element => element.remove());
  await page.locator('#trophyRankDisclosure .feature-section-content').evaluate(element => element.remove());
  await activateFeature(page, 'trophy');
  await expect(page.locator('#page-trophy')).toHaveAttribute('data-feature-state', 'ready');
});

test('Gauntlet tolerates missing optional disclosure controls and sections', async ({ page }) => {
  await page.goto('/');
  await page.locator('#gauntletCopyBtn').evaluate(element => element.remove());
  await page.locator('#gauntletHistogramDisclosure').evaluate(element => element.remove());
  await page.locator('#gauntletStatsDisclosure .feature-section-content').evaluate(element => element.remove());
  await activateFeature(page, 'gauntlet');
  await expect(page.locator('#page-gauntlet')).toHaveAttribute('data-feature-state', 'ready');
});

for (const width of [320, 390, 768, 1280, 1440]) {
  test(`analytical disclosure layouts fit ${width}px in light and dark themes`, async ({ page }) => {
    await page.setViewportSize({ width, height: width < 700 ? 844 : 900 });
    for (const route of analyticalRoutes) {
      await page.goto(route.url);
      await expect(page.locator(`#page-${route.id}`)).toHaveAttribute('data-feature-state', 'ready');
      for (const theme of ['light', 'dark']) {
        await page.locator(`[data-theme-preference="${theme}"]`).click();
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
          `${route.id} ${theme} overflow at ${width}px`,
        ).toBe(true);
        if (width === 320 && route.id === 'history') {
          const funLists = await page.locator('#funLists').evaluate(element => {
            const rect = element.getBoundingClientRect();
            return { left: rect.left, right: rect.right, width: rect.width, viewport: document.documentElement.clientWidth };
          });
          expect(funLists.right, 'History fun facts fit the 320px viewport').toBeLessThanOrEqual(funLists.viewport);
          expect(funLists.width, 'History fun facts stay within their available content width').toBeLessThanOrEqual(funLists.viewport - funLists.left);
        }
      }
      if (width === 390) {
        expect(await page.evaluate(() => document.documentElement.scrollHeight), `${route.id} compact height`).toBeLessThanOrEqual(route.height);
      }
    }
  });
}

test('opening every analytical section preserves rendered data and URLs', async ({ page }) => {
  test.setTimeout(60_000);
  const readParity = () => page.evaluate(() => ({
    url: location.href,
    historyGames: document.querySelectorAll('[data-table-id="history-games"] tbody > tr:not(.table-expanded-row)').length,
    rivalryGames: document.querySelectorAll('[data-table-id="rivalry-games"] tbody > tr:not(.table-expanded-row)').length,
    trophySeasons: document.querySelectorAll('[data-table-id="trophy-seasons"] tbody > tr:not(.table-expanded-row)').length,
    dynastyWindows: document.querySelectorAll('#dynastyBestWindows .dynasty-window-card').length,
    draftRows: document.querySelectorAll('[data-table-id="draft-rows"] tbody > tr:not(.table-expanded-row)').length,
    gauntletCopy: document.querySelector('#gauntletCopyText')?.value || '',
  }));

  for (const route of analyticalRoutes) {
    await page.goto(route.url);
    await expect(page.locator(`#page-${route.id}`)).toHaveAttribute('data-feature-state', 'ready');
    if (route.id === 'draft') {
      await expect.poll(() => new URL(page.url()).searchParams.get('draftStart')).not.toBeNull();
    }
    const beforeUrl = page.url();
    const closed = page.locator(`#page-${route.id} details.feature-disclosure:not([hidden]):not([open])`);
    for (let index = 0; index < 10 && await closed.count(); index += 1) {
      await closed.first().locator(':scope > summary').click();
    }
    await expect(closed).toHaveCount(0);
    await page.waitForTimeout(50);
    const expanded = await readParity();
    const opened = page.locator(`#page-${route.id} details.feature-disclosure:not([hidden])[open]`);
    for (let index = 0; index < 10 && await opened.count(); index += 1) {
      await opened.first().locator(':scope > summary').click();
    }
    for (let index = 0; index < 10 && await closed.count(); index += 1) {
      await closed.first().locator(':scope > summary').click();
    }
    await expect(closed).toHaveCount(0);
    await page.waitForTimeout(50);
    expect(await readParity()).toEqual(expanded);
    expect(page.url()).toBe(beforeUrl);
    for (const host of await page.locator(`#page-${route.id} .chart-host`).all()) {
      expect(await host.locator('svg').count()).toBeLessThanOrEqual(1);
    }
  }
});
