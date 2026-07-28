import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from './coverage-fixture.js';

const asset = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'assets/TransactionHistory.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'assets/asset-manifest.json'), 'utf8'));
const season = asset.seasons[0];
const trade = season.insights.trades[0];
const journey = season.player_journeys.find(row => row.stints.length > 1) || season.player_journeys[0];

test('Transactions lazily loads one verified asset and renders all six views', async ({ page }) => {
  const requests = [];
  page.on('request', request => requests.push(request.url()));
  await page.goto('/?tab=history');
  await expect(page.locator('#page-history')).toHaveAttribute('data-feature-state', 'ready');
  expect(requests.some(url => url.includes('TransactionHistory.json'))).toBe(false);
  expect(requests.some(url => url.includes('/features/transactions/'))).toBe(false);

  await page.goto('/?tab=transactions');
  await expect(page.locator('#page-transactions')).toHaveAttribute('data-feature-state', 'ready');
  await expect(page.locator('.transactions-hero')).toContainText('489 recorded moves');
  await expect(page.locator('.transaction-section')).toHaveCount(6);
  await expect(page.locator('#transactions-overview')).toHaveAttribute('open', '');
  const assetRequests = requests.filter(url => url.includes('TransactionHistory.json'));
  expect(assetRequests).toHaveLength(1);
  expect(new URL(assetRequests[0]).searchParams.get('v')).toBe(
    manifest.assets.TransactionHistory.sha256.replace(/^sha256:/, ''),
  );
  expect(requests.some(url => /chart-runtime|charting-vendor/.test(url))).toBe(false);
});

test('trade, player, owner, and keeper links are canonical and focus their content', async ({ page }) => {
  await page.goto(`/?tab=transactions&txId=${encodeURIComponent(trade.transaction_id)}`);
  await expect(page.locator('#transactions-trades')).toHaveAttribute('open', '');
  await expect(page.locator(`#transaction-${trade.transaction_id}`)).toBeFocused();
  await expect(page.locator(`#transaction-${trade.transaction_id}`)).toContainText('On-field edge');
  await expect(page.locator(`#transaction-${trade.transaction_id}`)).toContainText('Method: starter fantasy points');

  await page.goto(`/?tab=transactions&txPlayer=${encodeURIComponent(journey.player_id)}`);
  await expect(page.locator('#transactions-players')).toHaveAttribute('open', '');
  await expect(page.locator(`#transaction-player-${journey.player_id}`)).toBeFocused();
  await expect(page.locator('.transaction-journey ol li').first()).toContainText(/Week/);

  const owner = season.teams[0].owner;
  await page.goto(`/?tab=transactions&txView=owners&txOwner=${encodeURIComponent(owner)}`);
  await expect(page.locator('#transactions-owners')).toHaveAttribute('open', '');
  await expect(page.locator('#transactions-owners tbody tr')).toHaveCount(1);

  await page.goto('/?tab=transactions&txView=draft');
  await expect(page.locator('#transactions-draft')).toContainText('No keeper picks were recorded for 2025');
});
