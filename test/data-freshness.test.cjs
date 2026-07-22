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

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function currentAt(generatedAt, status = 'scheduled') {
  const current = clone(canonicalCurrent);
  current.generated_at = generatedAt;
  current.games[0].status = status;
  return current;
}

test.before(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'darling-freshness-'));
  const outfile = path.join(tempDir, 'freshness.mjs');
  await esbuild.build({ entryPoints: [path.join(root, 'src/data/data-freshness.ts')], outfile, bundle: true, platform: 'node', format: 'esm', target: 'node20', logLevel: 'silent' });
  freshness = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
});

test.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));

test('active weekly freshness changes at the six- and eight-day boundaries', () => {
  const input = { currentSeason: currentAt('2026-07-01T00:00:00.000Z'), seasonSummaries: summaries };
  assert.equal(freshness.assessDataFreshness({ ...input, now: new Date('2026-07-07T00:00:00.000Z') }).status, 'current');
  assert.equal(freshness.assessDataFreshness({ ...input, now: new Date('2026-07-07T00:00:00.001Z') }).status, 'aging');
  assert.equal(freshness.assessDataFreshness({ ...input, now: new Date('2026-07-09T00:00:00.000Z') }).status, 'aging');
  assert.equal(freshness.assessDataFreshness({ ...input, now: new Date('2026-07-09T00:00:00.001Z') }).status, 'stale');
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
