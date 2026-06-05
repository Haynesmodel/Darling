const { test, expect } = require('@playwright/test');

async function downloadText(download) {
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

test('page loads and renders the history tables', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  await expect(page.locator('#appStatus')).toBeHidden();
  await expect(page.locator('header h2')).toHaveText('Joe');

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
