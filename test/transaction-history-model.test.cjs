const test = require('node:test');
const assert = require('node:assert/strict');
const esbuild = require('esbuild');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.join(__dirname, '..');
const asset = JSON.parse(fs.readFileSync(path.join(root, 'assets/TransactionHistory.json'), 'utf8'));
let temp;
let model;

test.before(async () => {
  temp = fs.mkdtempSync(path.join(os.tmpdir(), 'darling-transaction-model-'));
  const outfile = path.join(temp, 'model.mjs');
  await esbuild.build({
    entryPoints: [path.join(root, 'src/features/transactions/transactions-model.ts')],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    logLevel: 'silent',
  });
  model = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
});

test.after(() => fs.rmSync(temp, { recursive: true, force: true }));

test('resolves newest, deep-linked player, owner, and transaction state', () => {
  const season = asset.seasons[0];
  const trade = season.transactions.find(row => row.type === 'trade' && row.status === 'complete');
  const player = season.player_journeys[0].player_id;
  assert.deepEqual(model.resolveTransactionState(asset, {}), {
    season: 2025, view: 'overview', owner: null, player: null, transactionId: null,
  });
  assert.equal(model.resolveTransactionState(asset, { transactionPlayer: player }).view, 'players');
  assert.equal(model.resolveTransactionState(asset, { transactionId: trade.id }).view, 'trades');
  assert.equal(model.resolveTransactionState(asset, { transactionOwner: season.teams[0].owner }).owner, season.teams[0].owner);
  assert.equal(model.resolveTransactionState(asset, { transactionSeason: 1900, transactionView: 'bogus' }).season, 2025);

  const waiver = season.transactions.find(row => row.type === 'waiver');
  const freeAgent = season.transactions.find(row => row.type === 'free_agent');
  const commissioner = season.transactions.find(row => row.type === 'commissioner');
  assert.equal(model.resolveTransactionState(asset, {
    transactionId: waiver.id,
    transactionView: 'owners',
  }).view, 'waivers');
  assert.equal(model.resolveTransactionState(asset, {
    transactionId: freeAgent.id,
    transactionView: 'draft',
  }).view, 'waivers');
  assert.equal(model.resolveTransactionState(asset, {
    transactionId: commissioner.id,
    transactionView: 'owners',
  }).view, 'owners');
  assert.deepEqual(model.resolveTransactionState(asset, {
    transactionId: 'missing',
    transactionPlayer: 'missing',
    transactionOwner: 'missing',
  }), {
    season: 2025, view: 'overview', owner: null, player: null, transactionId: null,
  });
});

test('builds descending season models, favorite owners, and player fallbacks', () => {
  const fixture = JSON.parse(JSON.stringify(asset));
  fixture.seasons.push({
    ...JSON.parse(JSON.stringify(fixture.seasons[0])),
    season: 2026,
  });
  const unnamed = fixture.players.find(row => row.name === null) || fixture.players[0];
  unnamed.name = null;
  const favorite = fixture.seasons[1].teams[0].owner;
  const built = model.buildTransactionModel(fixture, { transactionSeason: 2026 }, {
    pathname: '/Darling/',
    favoriteOwner: favorite,
  });
  assert.deepEqual(built.seasons, [2026, 2025]);
  assert.equal(built.favoriteOwner, favorite);
  assert.equal(built.playerNames.get(unnamed.id), `Player ${unnamed.id}`);
  assert.equal(model.buildTransactionModel(fixture, {}, {
    pathname: '/',
    favoriteOwner: 'missing',
  }).favoriteOwner, null);
});

test('builds canonical transaction URLs with encoded punctuation', () => {
  assert.equal(model.transactionHref('/Darling/', {
    season: 2025,
    view: 'owners',
    owner: 'A&B + C/Δ',
    player: null,
    transactionId: null,
  }), '/Darling/?tab=transactions&txSeason=2025&txView=owners&txOwner=A%26B+%2B+C%2F%CE%94');
});
