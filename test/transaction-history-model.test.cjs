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
