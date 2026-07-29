import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from './coverage-fixture.js';
import { createSnapshotFixture } from './snapshot-fixture.js';

const asset = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'assets/TransactionHistory.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'assets/asset-manifest.json'), 'utf8'));
const season = asset.seasons[0];
const trade = season.insights.trades[0];
const journey = season.player_journeys.find(row => row.stints.length > 1) || season.player_journeys[0];
const waiver = season.transactions.find(row => row.type === 'waiver');
const commissioner = season.transactions.find(row => row.type === 'commissioner');

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
  await page.locator('.transaction-controls').getByLabel('View').selectOption('overview');
  await expect(page).not.toHaveURL(/txView=trades/);
  await expect(page).not.toHaveURL(/txId=/);
  await expect(page.locator('#transactions-overview')).toHaveAttribute('open', '');

  await page.goto(`/?tab=transactions&txPlayer=${encodeURIComponent(journey.player_id)}`);
  await expect(page.locator('#transactions-players')).toHaveAttribute('open', '');
  await expect(page.locator(`#transaction-player-${journey.player_id}`)).toBeFocused();
  await expect(page.locator('.transaction-journey ol li').first()).toContainText(/Week/);
  await page.locator('.transaction-controls').getByLabel('View').selectOption('owners');
  await expect(page).toHaveURL(/txView=owners/);
  await expect(page).not.toHaveURL(/txPlayer=/);
  await expect(page.locator('#transactions-owners')).toHaveAttribute('open', '');
  const expectedAddsLeader = season.insights.owner_activity
    .slice()
    .sort((a, b) => b.adds - a.adds || a.owner.localeCompare(b.owner))[0].owner;
  await page.locator('#transactions-owners').getByRole('button', { name: 'Adds' }).click();
  await expect(page.locator('#transactions-owners thead th').nth(2)).toHaveAttribute('aria-sort', 'descending');
  await expect(page.locator('#transactions-owners tbody th').first()).toHaveText(expectedAddsLeader);

  const owner = season.teams[0].owner;
  await page.goto(`/?tab=transactions&txView=owners&txOwner=${encodeURIComponent(owner)}`);
  await expect(page.locator('#transactions-owners')).toHaveAttribute('open', '');
  await expect(page.locator('#transactions-owners tbody tr')).toHaveCount(1);
  await page.locator('.transaction-controls').getByLabel('View').selectOption('players');
  const ownerJourneyCount = season.player_journeys
    .filter(row => row.stints.some(stint => stint.owner === owner))
    .length;
  await expect(page.locator('.transaction-player-control option')).toHaveCount(ownerJourneyCount + 1);
  const playerQuery = season.player_journeys
    .find(row => row.stints.some(stint => stint.owner === owner))
    .player_id;
  const matchingPlayerCount = season.player_journeys
    .filter(row => row.stints.some(stint => stint.owner === owner))
    .filter(row => {
      const player = asset.players.find(candidate => candidate.id === row.player_id);
      return row.player_id.toLocaleLowerCase().includes(playerQuery.toLocaleLowerCase())
        || (player?.name || '').toLocaleLowerCase().includes(playerQuery.toLocaleLowerCase());
    })
    .length;
  await page.getByLabel('Search players').fill(playerQuery);
  await expect(page.locator('.transaction-player-control option')).toHaveCount(matchingPlayerCount + 1);

  await page.goto('/?tab=transactions&txView=draft');
  await expect(page.locator('#transactions-draft')).toContainText('No keeper picks were recorded for 2025');
});

test('preseason history renders honest empty states across all six views', async ({ page }) => {
  const fixture = createSnapshotFixture({
    mutations: {
      TransactionHistory(value) {
        value.source_updated_ms = 0;
        const current = value.seasons[0];
        current.league_status = 'preseason';
        current.coverage = {
          ...current.coverage,
          completed_week: 0,
          transaction_count: 0,
          complete_count: 0,
          failed_count: 0,
          pending_count: 0,
          type_counts: { commissioner: 0, free_agent: 0, trade: 0, waiver: 0 },
          missing_player_metadata: 0,
        };
        current.draft = { status: 'unavailable', draft_id: null, pick_count: 0, picks: [] };
        current.transactions = [];
        current.player_journeys = [];
        current.insights = {
          trades: [],
          wire_finds: [],
          movement_counts: [],
          owner_activity: [],
          draft_retention: [],
          keeper_return: [],
        };
      },
    },
  });
  await fixture.install(page);
  await page.goto('/?tab=transactions');
  await expect(page.locator('#transactions-overview')).toContainText('No moves yet');

  await page.locator('.transaction-controls').getByLabel('View').selectOption('trades');
  await expect(page.locator('#transactions-trades')).toContainText('No completed trades are available');
  await page.locator('.transaction-controls').getByLabel('View').selectOption('waivers');
  await expect(page.locator('#transactions-waivers')).toContainText('No completed waiver or free-agent adds yet');
  await page.locator('.transaction-controls').getByLabel('View').selectOption('players');
  await expect(page.locator('#transactions-players')).toContainText('Choose a player');
  await page.locator('.transaction-controls').getByLabel('View').selectOption('draft');
  await expect(page.locator('#transactions-draft')).toContainText('Draft data is not available yet');
  await expect(page.locator('#transactions-draft')).toContainText('No keeper picks were recorded');
});

test('outcome variants, metadata fallbacks, and unavailable turnover remain explicit', async ({ page }) => {
  const fallbackPlayerId = journey.player_id;
  const fixture = createSnapshotFixture({
    mutations: {
      TransactionHistory(value) {
        const current = value.seasons[0];
        const fallbackPlayer = value.players.find(player => player.id === fallbackPlayerId);
        fallbackPlayer.name = null;
        const baseTrade = current.insights.trades[0];
        current.insights.trades = [
          { ...baseTrade, transaction_id: 'fixture-too-early', status: 'too_early', even: false, edge_owner: null },
          { ...baseTrade, transaction_id: 'fixture-incomplete', status: 'incomplete', even: false, edge_owner: null },
          { ...baseTrade, transaction_id: 'fixture-provisional', status: 'provisional', even: true, edge_owner: null },
          baseTrade,
        ];
        current.insights.owner_activity[0].turnover = null;
        current.insights.draft_retention[0].retention = null;
        current.insights.draft_retention[0].turnover = null;
        current.insights.keeper_return.push({
          player_id: current.draft.picks[0].player_id,
          owner: current.draft.picks[0].owner,
          round: current.draft.picks[0].round,
          starts: 2,
          starter_points: 12.34,
        });
      },
    },
  });
  await fixture.install(page);
  await page.goto('/?tab=transactions&txView=trades');
  await expect(page.locator('#transactions-trades')).toContainText('Too early for an on-field comparison');
  await expect(page.locator('#transactions-trades')).toContainText('Incomplete: unresolved draft assets or coverage');
  await expect(page.locator('#transactions-trades')).toContainText('Even through Week');
  await expect(page.locator('#transactions-trades')).toContainText('On-field edge through Week');

  await page.goto(`/?tab=transactions&txPlayer=${encodeURIComponent(fallbackPlayerId)}`);
  await expect(page.locator(`#transaction-player-${fallbackPlayerId} h4`)).toHaveText(`Player ${fallbackPlayerId}`);
  await page.locator('.transaction-controls').getByLabel('View').selectOption('owners');
  await expect(page.locator('#transactions-owners')).toContainText('Unavailable');
  await page.locator('.transaction-controls').getByLabel('View').selectOption('draft');
  await expect(page.locator('#transactions-draft')).toContainText('12.34 pts');
  await expect(page.locator('#transactions-draft')).toContainText('Unavailable');
});

test('invalid transaction route values normalize to a canonical overview', async ({ page }) => {
  await page.goto('/?tab=transactions&txSeason=2025&txView=bogus&txOwner=missing&txPlayer=missing&txId=missing');
  await expect(page.locator('#transactions-overview')).toHaveAttribute('open', '');
  await expect(page.locator('.transaction-controls').getByLabel('Season')).toHaveValue('2025');
  await expect(page.locator('.transaction-controls').locator('select').nth(1)).toHaveValue('overview');
  await expect(page.locator('.transaction-controls').locator('select').nth(2)).toHaveValue('');
});

test('waiver deep links preserve their type-specific destination', async ({ page }) => {
  await page.goto(`/?tab=transactions&txId=${encodeURIComponent(waiver.id)}`);
  await expect(page.locator('#transactions-waivers')).toHaveAttribute('open', '');
  await expect(page.locator(`#transaction-${waiver.id}`)).toBeFocused();
});

test('trade deep links preserve their type-specific destination', async ({ page }) => {
  await page.goto(`/?tab=transactions&txId=${encodeURIComponent(trade.transaction_id)}`);
  await expect(page.locator('#transactions-trades')).toHaveAttribute('open', '');
  await expect(page.locator(`#transaction-${trade.transaction_id}`)).toBeFocused();
});

test('commissioner deep links stay in the requested non-type-specific view', async ({ page }) => {
  await page.addInitScript(({ key, owner }) => localStorage.setItem(key, owner), {
    key: 'darling.favoriteOwner.v1',
    owner: season.teams[0].owner,
  });
  await page.goto(`/?tab=transactions&txView=owners&txId=${encodeURIComponent(commissioner.id)}`);
  await expect(page.locator('#transactions-owners')).toHaveAttribute('open', '');
  await expect(page.getByRole('link', { name: `My Team: ${season.teams[0].owner}` })).toBeVisible();
});

test('transaction controls update seasons, owners, players, searches, and owner sorts', async ({ page }) => {
  const favorite = season.teams[0].owner;
  const fixture = createSnapshotFixture({
    mutations: {
      TransactionHistory(value) {
        const current = value.seasons[0];
        const latest = current.transactions.slice().sort((a, b) => b.created_ms - a.created_ms);
        latest[0].participants = [];
        latest[0].adds = [];
        latest[0].drops = [];
        latest[1].adds = current.draft.picks.slice(0, 4).map(pick => ({
          owner: current.teams[0].owner,
          player_id: pick.player_id,
        }));
        const firstTrade = current.insights.trades[0];
        firstTrade.sides[0].players = [];
        firstTrade.sides[0].picks = [{
          season: current.season,
          round: 2,
          roster_id: current.teams[0].roster_id,
          original_owner: current.teams[0].owner,
          owner: current.teams[1].owner,
          previous_owner: null,
        }];
        firstTrade.sides[0].faab = 5;
        firstTrade.sides[1].faab = -5;
        current.insights.owner_activity[0].turnover = null;
        value.seasons.push({
          ...JSON.parse(JSON.stringify(current)),
          season: current.season + 1,
        });
      },
    },
  });
  await page.addInitScript(({ key, owner }) => localStorage.setItem(key, owner), {
    key: 'darling.favoriteOwner.v1',
    owner: favorite,
  });
  await fixture.install(page);
  await page.goto('/?tab=transactions');
  const controls = page.locator('.transaction-controls');
  const seasonSelect = controls.locator('select').nth(0);
  const viewSelect = controls.locator('select').nth(1);
  const ownerSelect = controls.locator('select').nth(2);
  await seasonSelect.selectOption('2025');
  await ownerSelect.selectOption(favorite);
  await ownerSelect.selectOption('');
  await viewSelect.selectOption('players');
  const player = season.player_journeys[0].player_id;
  await page.locator('.transaction-player-control select').selectOption(player);
  await page.getByLabel('Search players').fill(player);
  await expect(page.locator(`#transaction-player-${player}`)).toBeVisible();
  await viewSelect.selectOption('owners');
  await page.locator('#transactions-owners').getByRole('button', { name: 'Moves' }).click();
  await page.locator('#transactions-owners').getByRole('button', { name: 'Moves' }).click();
  await page.locator('#transactions-owners').getByRole('button', { name: 'Owner' }).click();
  await page.locator('#transactions-owners').getByRole('button', { name: 'Turnover' }).click();
  await expect(page.locator('#transactions-owners')).toContainText('Unavailable');
});
