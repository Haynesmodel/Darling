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
let page;
let state;

test.before(async () => {
  temp = fs.mkdtempSync(path.join(os.tmpdir(), 'darling-draft-spot-model-'));
  await esbuild.build({
    entryPoints: {
      model: path.join(root, 'src/features/draft-spot/draft-spot-model.ts'),
      page: path.join(root, 'src/features/draft-spot/DraftSpotPage.tsx'),
      state: path.join(root, 'src/features/draft-spot/draft-spot-state.ts'),
    },
    outdir: temp,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    define: { 'import.meta.env.BASE_URL': "'/Darling/'" },
    logLevel: 'silent',
  });
  model = await import(`${pathToFileURL(path.join(temp, 'model.js')).href}?${Date.now()}`);
  page = await import(`${pathToFileURL(path.join(temp, 'page.js')).href}?${Date.now()}`);
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

test('Draft share cards describe the active league, owner, pick, and zone analysis', () => {
  const win = { location: { pathname: '/Darling/', origin: 'https://example.com', href: 'https://example.com/Darling/' } };
  const cases = [
    {
      mode: 'league',
      view: model.buildDraftSpotModel(asset),
      labels: ['Owner-seasons', 'Best avg finish', 'Best playoff path', 'Metric leader'],
    },
    {
      mode: 'owner',
      view: model.buildDraftSpotModel(asset, { owner: 'Joe', mode: 'owner' }),
      labels: ['Owner sample', 'Best pick', 'Best zone', 'Confidence'],
    },
    {
      mode: 'pick',
      view: model.buildDraftSpotModel(asset, { mode: 'pick', selectedPick: 10 }),
      labels: ['Selected pick', 'Avg finish', 'Playoff rate', 'Avg Finish'],
    },
    {
      mode: 'zone',
      view: model.buildDraftSpotModel(asset, { mode: 'zone', selectedZone: 'late' }),
      labels: ['Selected zone', 'Average pick', 'Avg finish', 'Avg Finish'],
    },
  ];
  for (const { mode: expectedMode, view, labels } of cases) {
    const result = page.buildDraftShareResult(view, 'fixture', win);
    assert.equal(result.ok, true, expectedMode);
    assert.deepEqual(result.spec.metrics.map(metric => metric.label), labels, expectedMode);
    assert.match(result.spec.id, new RegExp(`^draft:${expectedMode}\\|`), expectedMode);
    if (expectedMode === 'league') {
      assert.doesNotMatch(result.spec.canonicalUrl, /draftMode=/);
      assert.equal(view.baseRows.length, 92);
      assert.equal(new Set(view.baseRows.map(row => row.season)).size, 9);
      assert.deepEqual(result.spec.metrics[0], {
        label: 'Owner-seasons',
        value: '92',
        detail: '2017–2025',
      });
    }
    else assert.match(result.spec.canonicalUrl, new RegExp(`draftMode=${expectedMode}`), expectedMode);
  }
  const fallback = page.buildDraftShareResult(model.buildDraftSpotModel(asset, {
    owner: 'Joe',
    mode: 'owner',
    startSeason: 2025,
    endSeason: 2025,
  }), 'fixture', win);
  assert.equal(fallback.ok, true);
  assert.deepEqual(fallback.spec.metrics.find(metric => metric.label === 'Confidence'), {
    label: 'Confidence',
    value: 'Fallback',
    detail: 'League-wide history',
  });
});

test('Draft share cards fail closed for empty data or a missing active selection', () => {
  const win = { location: { pathname: '/Darling/', origin: 'https://example.com', href: 'https://example.com/Darling/' } };
  const emptyAsset = {
    ...asset,
    rows: [],
    pick_summary: [],
    zone_summary: [],
    owner_recommendations: [],
    team_seasons: 0,
  };
  const empty = page.buildDraftShareResult(model.buildDraftSpotModel(emptyAsset), 'fixture', win);
  assert.equal(empty.ok, false);
  assert.equal(empty.code, 'INCOMPLETE_DATA');

  const league = model.buildDraftSpotModel(asset);
  for (const modeName of ['pick', 'zone']) {
    const invalid = page.buildDraftShareResult({
      ...league,
      state: {
        ...league.state,
        mode: modeName,
        selectedPick: null,
        selectedZone: null,
      },
      selectedPickSummary: null,
      selectedZoneSummary: null,
    }, 'fixture', win);
    assert.equal(invalid.ok, false, modeName);
    assert.equal(invalid.code, 'INCOMPLETE_DATA', modeName);
  }
  assert.equal(page.buildDraftShareResult(league, 'fixture', null), null);
});
