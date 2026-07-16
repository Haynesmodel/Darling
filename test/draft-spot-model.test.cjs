const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const esbuild = require('esbuild');

const root = path.join(__dirname, '..');
const asset = JSON.parse(fs.readFileSync(path.join(root, 'assets/DraftSpot.json'), 'utf8'));
let temp;
let model;
let state;

test.before(async () => {
  temp = fs.mkdtempSync(path.join(os.tmpdir(), 'darling-draft-spot-model-'));
  await esbuild.build({
    entryPoints: {
      model: path.join(root, 'src/features/draft-spot/draft-spot-model.ts'),
      state: path.join(root, 'src/features/draft-spot/draft-spot-state.ts'),
    },
    outdir: temp,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    logLevel: 'silent',
  });
  model = await import(`${pathToFileURL(path.join(temp, 'model.js')).href}?${Date.now()}`);
  state = await import(`${pathToFileURL(path.join(temp, 'state.js')).href}?${Date.now()}`);
});

test.after(() => fs.rmSync(temp, { recursive: true, force: true }));

test('typed Draft Spot model preserves pick, zone, owner, and low-sample behavior', () => {
  const pick = model.buildDraftSpotModel(asset, {
    mode: 'pick',
    selectedPick: 10,
    metric: 'playoffRate',
    minSample: 2,
  });
  assert.equal(pick.state.selectedPick, 10);
  assert.equal(pick.rows.every(row => row.draft_pick === 10), true);
  assert.equal(pick.detailRows.length, 9);
  assert.equal(pick.rankedPicks[0].n >= 2, true);

  const zone = model.buildDraftSpotModel(asset, { mode: 'zone', selectedZone: 'late' });
  assert.equal(zone.rows.length, 29);
  assert.equal(zone.rows.every(row => row.zone_key === 'late'), true);

  const owner = model.buildDraftSpotModel(asset, { owner: 'Joe', mode: 'owner' });
  assert.equal(owner.ownerProfile.owner, 'Joe');
  assert.equal(owner.ownerProfile.rows.length, 9);
  assert.match(owner.ownerProfile.recommendation.recommendation, /observed|sample|Target/i);
});

test('invalid URL values normalize to the supported data universe', () => {
  const resolved = state.resolveDraftSpotState(asset, {
    draftOwner: 'NotReal',
    draftMode: 'invalid',
    draftStart: 2014,
    draftEnd: 2025,
    draftMetric: 'invalid',
    draftMinSample: 99,
    draftPick: 200,
    draftZone: 'middle',
    draftNormalize: 'percentile',
  });
  assert.equal(resolved.owner, '__ALL__');
  assert.equal(resolved.mode, 'zone');
  assert.equal(resolved.startSeason, 2017);
  assert.equal(resolved.endSeason, 2025);
  assert.equal(resolved.metric, 'avgFinish');
  assert.equal(resolved.minSample, 1);
  assert.equal(resolved.selectedPick, null);
  assert.equal(resolved.selectedZone, 'middle');
  assert.equal(resolved.normalize, 'percentile');
});

test('owner recommendations use only the selected season range', () => {
  const joe2025 = model.buildDraftSpotModel(asset, {
    owner: 'Joe',
    mode: 'owner',
    startSeason: 2025,
    endSeason: 2025,
  });
  const recommendation = joe2025.ownerProfile.recommendation;
  assert.equal(joe2025.ownerProfile.rows.length, 1);
  assert.equal(recommendation.history.length, 1);
  assert.equal(recommendation.best_pick.draft_pick, 10);
  assert.match(recommendation.recommendation, /Pick 10 in 2025/i);
  assert.doesNotMatch(recommendation.recommendation, /Target Pick 6/i);
});

test('percentile mode groups and selects equivalent positions on a 12-team scale', () => {
  const raw = model.buildDraftSpotModel(asset, {
    mode: 'pick',
    selectedPick: 12,
    normalize: 'raw',
  });
  const normalized = model.buildDraftSpotModel(asset, {
    mode: 'pick',
    selectedPick: 12,
    normalize: 'percentile',
  });
  assert.equal(raw.detailRows.length, 1);
  assert.ok(normalized.detailRows.length > raw.detailRows.length);
  assert.ok(normalized.detailRows.some(row => row.team_count === 10 && row.draft_pick === 10));
  assert.ok(normalized.detailRows.some(row => row.team_count === 12 && row.draft_pick === 12));
  assert.ok(normalized.detailRows.every(row => model.draftPickBucket(row, 'percentile') === 12));
  assert.equal(normalized.selectedPickSummary.n, normalized.detailRows.length);
});
