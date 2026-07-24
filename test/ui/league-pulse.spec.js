import { expect, test } from './coverage-fixture.js';
import { createSnapshotFixture } from './snapshot-fixture.js';

function scheduled2026(current) {
  current.season = 2026;
  current.generated_at = '2026-08-20T12:00:00Z';
  current.current_week = 1;
  current.weeks_fetched = [1];
  current.games = current.games.filter(game => game.week === 1).map(game => ({
    ...game,
    season: 2026,
    date: game.date.replace('2025', '2026'),
    status: 'scheduled',
    scoreA: null,
    scoreB: null,
  }));
}

function regularSeason2026(current, live) {
  current.season = 2026;
  current.generated_at = '2026-09-15T12:00:00Z';
  current.current_week = live ? 2 : 1;
  current.weeks_fetched = [1, 2];
  current.games = current.games.filter(game => game.week <= 2).map(game => ({
    ...game,
    season: 2026,
    date: game.date.replace('2025', '2026'),
    status: game.week === 1 ? 'final' : live ? 'live' : 'scheduled',
    scoreA: game.week === 1 || live ? game.scoreA : null,
    scoreB: game.week === 1 || live ? game.scoreB : null,
  }));
}

function postseason2026(current) {
  current.season = 2026;
  current.generated_at = '2026-12-20T12:00:00Z';
  current.current_week = 16;
  current.weeks_fetched = [16];
  current.games = current.games.filter(game => game.week === 16).map(game => ({
    ...game,
    season: 2026,
    date: game.date.replace('2025', '2026'),
    status: 'live',
  }));
}

function finalizing2026(current) {
  current.season = 2026;
  current.generated_at = '2026-12-30T12:00:00Z';
  current.games = current.games.map(game => ({
    ...game,
    season: 2026,
    date: game.date.replace('2025', '2026'),
    status: 'final',
  }));
}

test('bare route renders the canonical 2025 year in review', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('tab', { name: 'League Pulse' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tabpanel', { name: 'League Pulse' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '2025 Year in Review' })).toBeVisible();
  await expect(page.locator('.pulse-hero')).toContainText('Zook claimed the championship');
  await expect(page.locator('.pulse-hero')).toContainText('Connor won the Saunders Bowl');
  await expect(page.locator('.pulse-final-standings li').first()).toContainText('Zook');
  await expect(page).not.toHaveURL(/tab=pulse/);
});

test('explicit Pulse canonicalizes and browser history restores filtered History state', async ({ page }) => {
  await page.goto('/?tab=pulse');
  await page.waitForLoadState('networkidle');
  await expect(page).not.toHaveURL(/tab=pulse/);

  await page.goto('/?tab=history&team=Joe&seasons=2024');
  await page.waitForLoadState('networkidle');
  const prior = page.url();
  await page.getByRole('tab', { name: 'League Pulse' }).click();
  await expect(page).not.toHaveURL(/\?/);
  await page.goBack();
  await expect(page).toHaveURL(prior);
  await expect(page.getByRole('tab', { name: 'League History' })).toHaveAttribute('aria-selected', 'true');
});

test('Pulse layout does not overflow a 320px viewport', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test('scheduled-only 2026 snapshot renders preseason without zeroed standings', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-08-20T12:10:00Z'));
  const fixture = createSnapshotFixture({ mutations: { CurrentSeason: scheduled2026 } });
  await fixture.install(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '2026 Preview' })).toBeVisible();
  await expect(page.locator('.pulse-badge')).toHaveText('Scheduled');
  await expect(page.locator('.pulse-matchup-card').first()).toContainText('Kickoff pending');
  await expect(page.locator('.pulse-standings')).toHaveCount(0);
  await expect(page.locator('.pulse-final-standings')).toContainText('2025 final standings');
  expect(fixture.rejected).toEqual([]);
});

test('live regular season renders snapshot time and if-scores-hold movement', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-09-15T12:10:00Z'));
  const fixture = createSnapshotFixture({
    mutations: { CurrentSeason: current => regularSeason2026(current, true) },
  });
  await fixture.install(page);
  await page.goto('/');
  await expect(page.locator('.pulse-badge')).toHaveText('Live');
  await expect(page.getByRole('heading', { name: 'If scores hold' })).toBeVisible();
  await expect(page.locator('.pulse-matchup-card').first()).toContainText('In progress');
  await expect(page.locator('.data-freshness-panel')).toContainText('Updated');
});

test('completed regular week uses actual standings and excludes live movement', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-09-15T12:10:00Z'));
  const fixture = createSnapshotFixture({
    mutations: { CurrentSeason: current => regularSeason2026(current, false) },
  });
  await fixture.install(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Current standings' })).toBeVisible();
  await expect(page.locator('.pulse-movement')).toHaveCount(0);
  await expect(page.locator('.pulse-matchup-card').first()).toContainText('Final');
});

test('live postseason separates Championship and Saunders groups', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-12-20T12:10:00Z'));
  const fixture = createSnapshotFixture({ mutations: { CurrentSeason: postseason2026 } });
  await fixture.install(page);
  await page.goto('/');
  await expect(page.locator('.pulse-badge')).toHaveText('Live');
  await expect(page.getByRole('heading', { name: 'Championship bracket' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Saunders bracket' })).toBeVisible();
  await expect(page.locator('.pulse-matchup-group')).toHaveCount(2);
});

test('all-final games with an incomplete summary render finalizing copy without a champion claim', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-12-30T12:10:00Z'));
  const fixture = createSnapshotFixture({ mutations: { CurrentSeason: finalizing2026 } });
  await fixture.install(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Season complete — recap pending' })).toBeVisible();
  await expect(page.locator('.pulse-hero')).toContainText('authoritative season honors await');
  await expect(page.locator('.pulse-final-standings')).toHaveCount(0);
  await expect(page.locator('.pulse-hero')).not.toContainText('claimed the championship');
});

test('missing CurrentSeason falls back to the latest complete historical offseason', async ({ page }) => {
  const fixture = createSnapshotFixture({
    mutations: {
      CurrentSeason(current) {
        current.generated_at = 'not-a-date';
      },
    },
  });
  await fixture.install(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '2025 Year in Review' })).toBeVisible();
  await expect(page.locator('.pulse-hero')).toContainText('Zook claimed the championship');
  await expect(page.locator('.data-freshness summary')).toContainText('Snapshot partially available');
});

test('champion, matchup, curse, and record links encode exact destination query state', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '2025 Year in Review' })).toBeVisible();
  const hrefs = await page.evaluate(() => ({
    champion: document.querySelector('.pulse-hero .primary')?.getAttribute('href'),
    matchup: document.querySelector('.pulse-featured a')?.getAttribute('href'),
    curse: document.querySelector('.pulse-curse a')?.getAttribute('href'),
    record: document.querySelector('.pulse-record a')?.getAttribute('href'),
  }));
  const params = value => new URL(value, page.url()).searchParams;
  expect(Object.fromEntries(params(hrefs.champion))).toEqual({ tab: 'trophy', trophyOwner: 'Zook' });
  expect(params(hrefs.matchup).get('tab')).toBe('rivalry');
  expect(params(hrefs.matchup).get('rivalryTeamA')).toBeTruthy();
  expect(params(hrefs.matchup).get('rivalryTeamB')).toBeTruthy();
  expect(Object.fromEntries(params(hrefs.curse))).toEqual({ tab: 'history', focus: 'curses' });
  expect(params(hrefs.record).get('tab')).toBe('history');
  expect(params(hrefs.record).get('team')).toBeTruthy();
  expect(params(hrefs.record).get('seasons')).toBeTruthy();
  expect(params(hrefs.record).get('gameSort')).toBeTruthy();
  expect(params(hrefs.record).get('gameLimit')).toBe('1');
  expect(params(hrefs.record).get('focus')).toBe('games');
});

for (const alias of ['league pulse', 'home', 'dashboard']) {
  test(`Search alias "${alias}" opens the canonical Pulse route`, async ({ page }) => {
    await page.goto('/?tab=history');
    await page.locator('.search-trigger').click();
    await page.getByRole('combobox', { name: /Search owners, seasons/ }).fill(alias);
    await page.getByRole('option', { name: /League Pulse/ }).first().click();
    await expect(page.getByRole('tab', { name: 'League Pulse' })).toHaveAttribute('aria-selected', 'true');
    await expect(page).not.toHaveURL(/\?/);
  });
}

test('rapid Pulse-to-feature navigation cannot publish stale Pulse state', async ({ page }) => {
  await page.goto('/?tab=history');
  await page.evaluate(() => {
    document.querySelector('#tabPulseBtn').click();
    document.querySelector('#tabDynastyBtn').click();
  });
  await expect(page.getByRole('tabpanel', { name: 'Dynasty Rankings' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => ({
    tab: new URL(location.href).searchParams.get('tab'),
    selected: document.querySelector('[role="tab"][aria-selected="true"]')?.id,
  }))).toEqual({
    tab: 'dynasty',
    selected: 'tabDynastyBtn',
  });
  await expect.poll(() => page.title()).toContain('Dynasty Rankings');
  const finalState = await page.evaluate(() => ({
    header: document.querySelector('header h2')?.textContent,
    title: document.title,
    accent: document.documentElement.dataset.accentTheme,
  }));
  expect(finalState.header).toContain('Dynasty Rankings');
  expect(finalState.title).toContain('Dynasty Rankings');
  expect(finalState.header).not.toContain('League Pulse');
  expect(finalState.accent).toMatch(/^(league|owner)$/);
});
