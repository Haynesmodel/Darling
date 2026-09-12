const test = require('node:test');
const assert = require('node:assert/strict');
const esbuild = require('esbuild');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

let temp;
let controller;

test.before(async () => {
  temp = fs.mkdtempSync(path.join(os.tmpdir(), 'darling-app-controller-shell-'));
  await esbuild.build({
    entryPoints: [path.join(__dirname, '../src/app/app-controller.ts')],
    outfile: path.join(temp, 'app-controller.js'),
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    logLevel: 'silent',
  });
  controller = await import(`${pathToFileURL(path.join(temp, 'app-controller.js')).href}?${Date.now()}`);
});

test.after(() => fs.rmSync(temp, { recursive: true, force: true }));

test('fallback freshness runtime preserves assessment and supports the complete no-op contract', () => {
  const assessment = { state: 'final', detail: 'Season complete' };
  const runtime = controller.createFallbackFreshness(assessment);
  runtime.publish({ ignored: true });
  assert.equal(runtime.current(), null);
  assert.equal(runtime.currentAssessment(), assessment);
  const unsubscribe = runtime.subscribe(() => {});
  assert.equal(typeof unsubscribe, 'function');
  assert.equal(unsubscribe(), undefined);
});

test('canonical owner union includes historical and current-only owners once in locale order', () => {
  const owners = controller.canonicalOwners({
    seasonSummaries: [{ owner: ' Zubs ' }, { owner: 'Joel' }],
    leagueGames: [{ teamA: 'Joe', teamB: 'Joel' }, { teamA: '', teamB: 'Joe' }],
    currentSeason: { teams: [{ owner: 'Expansion' }, { owner: 'Joel' }] },
  });
  assert.deepEqual(owners, ['Expansion', 'Joe', 'Joel', 'Zubs']);
});
