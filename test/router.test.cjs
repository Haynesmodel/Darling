const test = require('node:test');
const assert = require('node:assert/strict');
const esbuild = require('esbuild');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

let temp;
let router;

test.before(async () => {
  temp = fs.mkdtempSync(path.join(os.tmpdir(), 'darling-router-'));
  await esbuild.build({ entryPoints: [path.join(__dirname, '../src/app/router.ts')], outfile: path.join(temp, 'router.js'), bundle: true, platform: 'node', format: 'esm', target: 'node20', logLevel: 'silent' });
  router = await import(`${pathToFileURL(path.join(temp, 'router.js')).href}?${Date.now()}`);
});

test.after(() => fs.rmSync(temp, { recursive: true, force: true }));

test('route inference preserves implicit legacy URLs and defaults only bare state to Pulse', () => {
  const cases = [
    ['', 'pulse'], ['?tab=pulse', 'pulse'], ['?tab=history', 'history'], ['?team=Joe', 'history'], ['?seasons=2024', 'history'],
    ['?gameSort=scoreDesc&gameLimit=1', 'history'], ['?currentWeek=8', 'current'], ['?focus=standings', 'current'],
    ['?rivalryTeamA=Joe&rivalryTeamB=Shap', 'rivalry'], ['?trophyOwner=Zook', 'trophy'], ['?dynastyOwner=Joe', 'dynasty'],
    ['?draftOwner=Joe', 'draft'], ['?ga=Joe%3A2024', 'gauntlet'], ['?focus=curses', 'history'], ['?tab=unknown&team=Joe', 'pulse'],
  ];
  for (const [search, expected] of cases) {
    const service = router.createNavigationService({ location: { pathname: '/Darling/', search }, history: { replaceState() {} } });
    assert.equal(service.parse(search).tab, expected, search || 'bare');
  }
});
