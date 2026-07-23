#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');

const repoRoot = path.resolve(__dirname, '..');
const DEFAULT_OUTFILE = path.join(repoRoot, 'js/charting/vendor/charting-vendor.js');
const PLOT_VENDOR_EXPORTS = Object.freeze([
  'areaY',
  'barX',
  'barY',
  'dot',
  'lineY',
  'plot',
  'ruleX',
  'ruleY',
  'text',
]);

function vendorEntrySource(exports = PLOT_VENDOR_EXPORTS) {
  return `export {\n${exports.map(name => `  ${name},`).join('\n')}\n} from '@observablehq/plot';\n`;
}

function createBuildOptions({
  root = repoRoot,
  outfile = DEFAULT_OUTFILE,
  exports = PLOT_VENDOR_EXPORTS,
} = {}) {
  return {
    stdin: {
      contents: vendorEntrySource(exports),
      resolveDir: root,
      sourcefile: 'charting-vendor-entry.js',
      loader: 'js',
    },
    outfile,
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: ['es2020'],
    minify: true,
    legalComments: 'linked',
    logLevel: 'silent',
    write: false,
  };
}

async function generateVendor(options = {}) {
  const buildOptions = createBuildOptions(options);
  const result = await (options.esbuildImpl || esbuild).build(buildOptions);
  const output = result.outputFiles?.find(file => path.resolve(file.path) === path.resolve(buildOptions.outfile))
    || result.outputFiles?.find(file => file.path.endsWith('.js'));
  if (!output) throw new Error('esbuild did not produce the chart vendor JavaScript output');
  return Buffer.from(output.contents);
}

function directPlotImports({
  root = repoRoot,
  sourceRoots = ['js', 'src'],
  fsImpl = fs,
} = {}) {
  const matches = [];
  const visit = target => {
    if (!fsImpl.existsSync(target)) return;
    const stat = fsImpl.statSync(target);
    if (stat.isDirectory()) {
      fsImpl.readdirSync(target, { withFileTypes: true })
        .forEach(entry => visit(path.join(target, entry.name)));
      return;
    }
    if (!/\.(?:[cm]?js|tsx?)$/.test(target)) return;
    const contents = fsImpl.readFileSync(target, 'utf8');
    if (/['"`]@observablehq\/plot(?:[/?#][^'"`]*)?['"`]/.test(contents)) {
      matches.push(path.relative(root, target));
    }
  };
  sourceRoots.forEach(sourceRoot => visit(path.join(root, sourceRoot)));
  return matches.sort();
}

function assertImportBoundary(options = {}) {
  const matches = directPlotImports(options);
  if (matches.length) {
    throw new Error(`Authored browser modules must import the committed chart vendor, not @observablehq/plot directly:\n${matches.map(file => `- ${file}`).join('\n')}`);
  }
}

function compareVendor(generated, {
  outfile = DEFAULT_OUTFILE,
  fsImpl = fs,
} = {}) {
  if (!fsImpl.existsSync(outfile)) {
    return {
      ok: false,
      message: `Generated chart vendor is missing at ${outfile}. Run npm run build:charts.`,
      expectedBytes: generated.length,
      actualBytes: 0,
    };
  }
  const actual = fsImpl.readFileSync(outfile);
  return {
    ok: actual.equals(generated),
    message: actual.equals(generated)
      ? `Generated chart vendor is current (${actual.length} bytes).`
      : `Generated chart vendor is stale: expected ${generated.length} bytes, found ${actual.length}. Run npm run build:charts.`,
    expectedBytes: generated.length,
    actualBytes: actual.length,
  };
}

async function checkVendor(options = {}) {
  assertImportBoundary(options);
  const generated = await generateVendor(options);
  const comparison = compareVendor(generated, options);
  if (!comparison.ok) throw new Error(comparison.message);
  return comparison;
}

async function writeVendor(options = {}) {
  assertImportBoundary(options);
  const outfile = options.outfile || DEFAULT_OUTFILE;
  const generated = await generateVendor({ ...options, outfile });
  (options.fsImpl || fs).mkdirSync(path.dirname(outfile), { recursive: true });
  (options.fsImpl || fs).writeFileSync(outfile, generated);
  return { outfile, bytes: generated.length };
}

async function runCli(argv = process.argv.slice(2)) {
  if (argv.some(argument => !['--check'].includes(argument))) {
    throw new Error(`Unknown argument. Usage: node scripts/build_chart_vendor.cjs [--check]`);
  }
  if (argv.includes('--check')) {
    const result = await checkVendor();
    console.log(result.message);
    return;
  }
  const result = await writeVendor();
  console.log(`Generated ${path.relative(repoRoot, result.outfile)} (${result.bytes} bytes).`);
}

if (require.main === module) {
  runCli().catch(error => {
    console.error(`ERROR [CHART_VENDOR] ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  DEFAULT_OUTFILE,
  PLOT_VENDOR_EXPORTS,
  assertImportBoundary,
  checkVendor,
  compareVendor,
  createBuildOptions,
  directPlotImports,
  generateVendor,
  runCli,
  vendorEntrySource,
  writeVendor,
};
