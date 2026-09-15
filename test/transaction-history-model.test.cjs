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
  const latestSeason = Math.max(...asset.seasons.map(row => row.season));
  const season = asset.seasons.find(row => row.season === latestSeason);
  const transactionSeason = asset.seasons.find(row => row.transactions.some(item => item.type === 'trade'));
  const trade = transactionSeason.transactions.find(row => row.type === 'trade' && row.status === 'complete');
  const player = season.player_journeys[0].player_id;
  assert.deepEqual(model.resolveTransactionState(asset, {}), {
    season: latestSeason, view: 'overview', owner: null, player: null, transactionId: null,
  });
  assert.equal(model.resolveTransactionState(asset, { transactionPlayer: player }).view, 'players');
  assert.equal(model.resolveTransactionState(asset, {
    transactionSeason: transactionSeason.season,
    transactionId: trade.id,
  }).view, 'trades');
  assert.equal(model.resolveTransactionState(asset, { transactionOwner: season.teams[0].owner }).owner, season.teams[0].owner);
  assert.equal(model.resolveTransactionState(asset, { transactionSeason: 1900, transactionView: 'bogus' }).season, latestSeason);

  const waiver = transactionSeason.transactions.find(row => row.type === 'waiver');
  const freeAgent = transactionSeason.transactions.find(row => row.type === 'free_agent');
  const commissioner = transactionSeason.transactions.find(row => row.type === 'commissioner');
  assert.equal(model.resolveTransactionState(asset, {
    transactionSeason: transactionSeason.season,
    transactionId: waiver.id,
    transactionView: 'owners',
  }).view, 'waivers');
  assert.equal(model.resolveTransactionState(asset, {
    transactionSeason: transactionSeason.season,
    transactionId: freeAgent.id,
    transactionView: 'draft',
  }).view, 'waivers');
  assert.equal(model.resolveTransactionState(asset, {
    transactionSeason: transactionSeason.season,
    transactionId: commissioner.id,
    transactionView: 'owners',
  }).view, 'owners');
  assert.deepEqual(model.resolveTransactionState(asset, {
    transactionId: 'missing',
    transactionPlayer: 'missing',
    transactionOwner: 'missing',
  }), {
    season: latestSeason, view: 'overview', owner: null, player: null, transactionId: null,
  });
});

test('builds descending season models, favorite owners, and player fallbacks', () => {
  const fixture = JSON.parse(JSON.stringify(asset));
  const syntheticSeason = Math.max(...fixture.seasons.map(row => row.season)) + 1;
  const latest = fixture.seasons.find(row => row.season === Math.max(...fixture.seasons.map(item => item.season)));
  fixture.seasons.push({
    ...JSON.parse(JSON.stringify(latest)),
    season: syntheticSeason,
  });
  const unnamed = fixture.players.find(row => row.name === null) || fixture.players[0];
  unnamed.name = null;
  const favorite = fixture.seasons.find(row => row.season === syntheticSeason).teams[0].owner;
  const built = model.buildTransactionModel(fixture, { transactionSeason: syntheticSeason }, {
    pathname: '/Darling/',
    favoriteOwner: favorite,
  });
  assert.deepEqual(built.seasons, [syntheticSeason, ...asset.seasons.map(row => row.season).sort((a, b) => b - a)]);
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
