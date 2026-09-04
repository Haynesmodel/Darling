const test = require('node:test');
const assert = require('node:assert/strict');
const esbuild = require('esbuild');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

let temp;
let windowGate;

test.before(async () => {
  temp = fs.mkdtempSync(path.join(os.tmpdir(), 'darling-draft-weekend-'));
  const outfile = path.join(temp, 'draft-weekend-window.mjs');
  await esbuild.build({
    entryPoints: [path.join(__dirname, '../src/draft-weekend/draft-weekend-window.ts')],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    logLevel: 'silent',
  });
  windowGate = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
});

test.after(() => fs.rmSync(temp, { recursive: true, force: true }));

test('uses the New York calendar date and includes the full Friday through Monday window', () => {
  assert.equal(windowGate.isDraftWeekendActive(new Date('2026-09-04T03:59:59Z')), false, 'before Friday in New York');
  assert.equal(windowGate.isDraftWeekendActive(new Date('2026-09-04T04:00:00Z')), true, 'Friday start');
  assert.equal(windowGate.isDraftWeekendActive(new Date('2026-09-08T03:59:59Z')), true, 'Monday end');
  assert.equal(windowGate.isDraftWeekendActive(new Date('2026-09-08T04:00:00Z')), false, 'after Monday in New York');
});

test('exposes stable New York date keys for diagnostics and tests', () => {
  assert.equal(windowGate.newYorkDateKey(new Date('2026-09-05T12:00:00Z')), '2026-09-05');
});
