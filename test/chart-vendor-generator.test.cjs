const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  DEFAULT_OUTFILE,
  PLOT_VENDOR_EXPORTS,
  assertImportBoundary,
  checkVendor,
  compareVendor,
  createBuildOptions,
  directPlotImports,
  generateVendor,
  vendorEntrySource,
  writeVendor,
} = require('../scripts/build_chart_vendor.cjs');

const EXPECTED_EXPORTS = [
  'areaY',
  'barX',
  'barY',
  'dot',
  'lineY',
  'plot',
  'ruleX',
  'ruleY',
  'text',
];

function withTempDir(callback) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'darling-chart-vendor-'));
  return Promise.resolve(callback(root)).finally(() => fs.rmSync(root, { recursive: true, force: true }));
}

test('generator uses the immutable exact export allowlist and preserved build policy', () => {
  assert.deepEqual([...PLOT_VENDOR_EXPORTS], EXPECTED_EXPORTS);
  assert.equal(Object.isFrozen(PLOT_VENDOR_EXPORTS), true);
  assert.match(vendorEntrySource(), /^export \{\n/);
  assert.doesNotMatch(vendorEntrySource(), /export \*|Plot/);
  const options = createBuildOptions();
  assert.equal(options.format, 'esm');
  assert.equal(options.target[0], 'es2020');
  assert.equal(options.minify, true);
  assert.equal(options.legalComments, 'linked');
  assert.equal(options.write, false);
});

test('two in-memory generations are byte-identical', async () => {
  const first = await generateVendor();
  const second = await generateVendor();
  assert.ok(first.length > 0);
  assert.deepEqual(first, second);
});

test('canonical check passes without changing hash or mtime', async () => {
  const before = fs.statSync(DEFAULT_OUTFILE);
  const beforeHash = crypto.createHash('sha256').update(fs.readFileSync(DEFAULT_OUTFILE)).digest('hex');
  const result = await checkVendor();
  const after = fs.statSync(DEFAULT_OUTFILE);
  const afterHash = crypto.createHash('sha256').update(fs.readFileSync(DEFAULT_OUTFILE)).digest('hex');
  assert.equal(result.ok, true);
  assert.equal(afterHash, beforeHash);
  assert.equal(after.mtimeMs, before.mtimeMs);
});

test('missing and stale comparisons fail with regeneration guidance', async () => {
  await withTempDir(async root => {
    const generated = await generateVendor();
    const missingPath = path.join(root, 'missing.js');
    const missing = compareVendor(generated, { outfile: missingPath });
    assert.equal(missing.ok, false);
    assert.match(missing.message, /missing.*npm run build:charts/i);

    const stalePath = path.join(root, 'stale.js');
    fs.writeFileSync(stalePath, Buffer.concat([generated, Buffer.from('\n')]));
    const stale = compareVendor(generated, { outfile: stalePath });
    assert.equal(stale.ok, false);
    assert.equal(stale.expectedBytes, generated.length);
    assert.equal(stale.actualBytes, generated.length + 1);
    assert.match(stale.message, /stale.*npm run build:charts/i);
    await assert.rejects(checkVendor({ outfile: stalePath }), /stale.*npm run build:charts/i);
  });
});

test('normal write emits the same bytes as in-memory generation', async () => {
  await withTempDir(async root => {
    const outfile = path.join(root, 'vendor', 'charting-vendor.js');
    const expected = await generateVendor({ outfile });
    const result = await writeVendor({ outfile });
    assert.equal(result.bytes, expected.length);
    assert.deepEqual(fs.readFileSync(outfile), expected);
  });
});

test('authored browser imports of the Plot package are rejected', async () => {
  await withTempDir(root => {
    const source = path.join(root, 'src', 'feature.ts');
    const nestedVendorSource = path.join(root, 'src', 'vendor', 'feature.ts');
    fs.mkdirSync(path.dirname(source), { recursive: true });
    fs.mkdirSync(path.dirname(nestedVendorSource), { recursive: true });
    fs.writeFileSync(source, "import { plot } from '@observablehq/plot';\n");
    fs.writeFileSync(nestedVendorSource, "import { barY } from '@observablehq/plot';\n");
    assert.deepEqual(directPlotImports({ root }), ['src/feature.ts', 'src/vendor/feature.ts']);
    assert.throws(() => assertImportBoundary({ root }), /src\/feature\.ts/);
    fs.writeFileSync(source, "import { plot } from '../js/charting/vendor/charting-vendor.js';\n");
    fs.writeFileSync(nestedVendorSource, "import { barY } from '../../js/charting/vendor/charting-vendor.js';\n");
    assert.deepEqual(directPlotImports({ root }), []);
  });
});
