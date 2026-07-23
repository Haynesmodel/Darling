const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const esbuild = require('esbuild');

const root = path.join(__dirname, '..');
const canonicalCurrent = JSON.parse(fs.readFileSync(path.join(root, 'assets/CurrentSeason.json'), 'utf8'));
const summaries = JSON.parse(fs.readFileSync(path.join(root, 'assets/SeasonSummary.json'), 'utf8'));
let tempDir;
let freshness;
let freshnessRuntime;

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function currentAt(generatedAt, status = 'scheduled') {
  const current = clone(canonicalCurrent);
  current.generated_at = generatedAt;
  current.games[0].status = status;
  return current;
}

function finalizingAt(generatedAt) {
  const current = clone(canonicalCurrent);
  current.season = 2026;
  current.generated_at = generatedAt;
  current.games = current.games.map(game => ({
    ...game,
    season: 2026,
    status: 'final',
  }));
  return current;
}

test.before(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'darling-freshness-'));
  const freshnessOutput = path.join(tempDir, 'freshness.mjs');
  const runtimeOutput = path.join(tempDir, 'freshness-runtime.mjs');
  await Promise.all([
    esbuild.build({ entryPoints: [path.join(root, 'src/data/data-freshness.ts')], outfile: freshnessOutput, bundle: true, platform: 'node', format: 'esm', target: 'node20', logLevel: 'silent' }),
    esbuild.build({ entryPoints: [path.join(root, 'src/components/data-freshness/DataFreshnessBadge.tsx')], outfile: runtimeOutput, bundle: true, platform: 'node', format: 'esm', target: 'node20', logLevel: 'silent' }),
  ]);
  freshness = await import(`${pathToFileURL(freshnessOutput).href}?${Date.now()}`);
  freshnessRuntime = await import(`${pathToFileURL(runtimeOutput).href}?${Date.now()}`);
});

test.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));

test('active weekly freshness changes at the six- and eight-day boundaries', () => {
  const input = { currentSeason: currentAt('2026-07-01T00:00:00.000Z'), seasonSummaries: summaries };
  assert.equal(freshness.assessDataFreshness({ ...input, now: new Date('2026-07-07T00:00:00.000Z') }).status, 'current');
  assert.equal(freshness.assessDataFreshness({ ...input, now: new Date('2026-07-07T00:00:00.001Z') }).status, 'aging');
  assert.equal(freshness.assessDataFreshness({ ...input, now: new Date('2026-07-09T00:00:00.000Z') }).status, 'aging');
  assert.equal(freshness.assessDataFreshness({ ...input, now: new Date('2026-07-09T00:00:00.001Z') }).status, 'stale');
});

test('critical stale detail changes immediately after the 15-day boundary', () => {
  const currentSeason = finalizingAt('2026-07-01T00:00:00.000Z');
  const exact = freshness.assessDataFreshness({
    currentSeason,
    seasonSummaries: summaries,
    now: new Date('2026-07-16T00:00:00.000Z'),
  });
  const over = freshness.assessDataFreshness({
    currentSeason,
    seasonSummaries: summaries,
    now: new Date('2026-07-16T00:00:00.001Z'),
  });
  assert.equal(exact.status, 'stale');
  assert.match(exact.detail, /beyond its expected weekly refresh/);
  assert.doesNotMatch(exact.detail, /well beyond/);
  assert.equal(over.status, 'stale');
  assert.match(over.detail, /well beyond its expected weekly refresh/);
});

test('all-final incomplete summaries retain finalizing copy while aging and stale', () => {
  const currentSeason = finalizingAt('2026-07-01T00:00:00.000Z');
  const aging = freshness.assessDataFreshness({
    currentSeason,
    seasonSummaries: summaries,
    now: new Date('2026-07-08T00:00:00.000Z'),
  });
  const stale = freshness.assessDataFreshness({
    currentSeason,
    seasonSummaries: summaries,
    now: new Date('2026-07-10T00:00:00.000Z'),
  });
  assert.equal(aging.status, 'aging');
  assert.equal(stale.status, 'stale');
  assert.match(aging.detail, /awaiting final summary data/);
  assert.match(stale.detail, /awaiting final summary data/);
});

test('live score freshness changes just after 30 minutes', () => {
  const input = { currentSeason: currentAt('2026-07-01T00:00:00.000Z', 'live'), seasonSummaries: summaries };
  assert.equal(freshness.assessDataFreshness({ ...input, now: new Date('2026-07-01T00:30:00.000Z') }).status, 'current');
  assert.equal(freshness.assessDataFreshness({ ...input, now: new Date('2026-07-01T00:30:00.001Z') }).status, 'live-stale');
});

test('the canonical finalized snapshot is final in July and a season gap on August 15', () => {
  const july = freshness.assessDataFreshness({ currentSeason: canonicalCurrent, seasonSummaries: summaries, now: new Date('2026-07-22T12:00:00Z') });
  assert.equal(july.status, 'final');
  assert.equal(july.label, '2025 season final');
  const august = freshness.assessDataFreshness({ currentSeason: canonicalCurrent, seasonSummaries: summaries, now: new Date('2026-08-15T00:00:00Z') });
  assert.equal(august.status, 'season-gap');
  assert.equal(august.label, '2026 data not available');
});

test('missing CurrentSeason changes from final to season-gap exactly at August 15 UTC', () => {
  const before = freshness.assessDataFreshness({
    currentSeason: null,
    seasonSummaries: summaries,
    now: new Date('2026-08-14T23:59:59.999Z'),
  });
  const boundary = freshness.assessDataFreshness({
    currentSeason: null,
    seasonSummaries: summaries,
    now: new Date('2026-08-15T00:00:00.000Z'),
  });
  assert.equal(before.status, 'final');
  assert.equal(before.nextTransitionAt, '2026-08-15T00:00:00.000Z');
  assert.equal(boundary.status, 'season-gap');
});

test('invalid and future timestamps never claim current data', () => {
  assert.equal(freshness.assessDataFreshness({ currentSeason: currentAt('invalid'), seasonSummaries: summaries, now: new Date('2026-07-01T00:00:00Z') }).status, 'unknown');
  assert.equal(freshness.assessDataFreshness({ currentSeason: currentAt('2026-07-01T00:05:00.001Z'), seasonSummaries: summaries, now: new Date('2026-07-01T00:00:00Z') }).status, 'unknown');
});

test('optional failures overlay partial state without hiding a stale warning', () => {
  const assessment = freshness.assessDataFreshness({
    currentSeason: currentAt('2026-07-01T00:00:00Z'), seasonSummaries: summaries,
    optionalFailures: [{ asset: 'Rivalries', reason: 'integrity', code: 'INTEGRITY_MISMATCH' }],
    now: new Date('2026-07-20T00:00:00Z'),
  });
  assert.equal(assessment.status, 'stale');
  assert.equal(assessment.label, 'Data may be stale');
  assert.equal(assessment.partial, true);
  assert.deepEqual(assessment.partialAssets, ['Rivalries']);
});

test('freshness runtime replays published state to a late subscriber', () => {
  const runtime = freshnessRuntime.createDataFreshnessRuntime();
  const snapshot = {
    currentSeason: canonicalCurrent,
    seasonSummaries: summaries,
    optionalFailures: [],
    dataVersion: 'sha256:fixture',
    coreVerified: true,
  };
  runtime.publish(snapshot);

  let notifications = 0;
  const unsubscribe = runtime.subscribe(() => {
    notifications += 1;
  });
  assert.equal(notifications, 1);
  assert.equal(runtime.current(), snapshot);

  runtime.publish({ ...snapshot, dataVersion: 'sha256:updated' });
  assert.equal(notifications, 2);
  unsubscribe();
  runtime.publish({ ...snapshot, dataVersion: 'sha256:ignored' });
  assert.equal(notifications, 2);
});
