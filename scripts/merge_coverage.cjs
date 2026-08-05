const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { fileURLToPath } = require('node:url');
const { transformSync } = require('esbuild');
const { createCoverageMap } = require('istanbul-lib-coverage');
const { createInstrumenter } = require('istanbul-lib-instrument');
const libReport = require('istanbul-lib-report');
const reports = require('istanbul-reports');

const RAW_COVERAGE_MAX_BYTES = 25_000_000;
const SOURCE_ROOTS = ['js', 'scripts', 'src'];
const SOURCE_EXTENSIONS = new Set(['.js', '.cjs', '.ts', '.tsx']);
const EXCLUDED_PREFIXES = [
  'src/data/generated/', // Generated from JSON Schema and covered by generator/schema tests.
  'js/charting/vendor/', // Generated third-party Observable Plot bundle.
  'test/',
  'dist/',
  'public/',
  'coverage/',
  'playwright-report/',
  'test-results/',
  'node_modules/',
];
const EXCLUDED_FILES = new Set([
  'scripts/build_chart_vendor.cjs', // Generator for the committed vendor bundle.
]);

function toPosix(value) {
  return value.split(path.sep).join('/');
}

function isTypeOnlySourceFile(filePath) {
  const extension = path.extname(filePath);
  if (extension !== '.ts' && extension !== '.tsx') return false;
  if (!fs.existsSync(filePath)) return false;
  try {
    const output = transformSync(fs.readFileSync(filePath, 'utf8'), {
      loader: extension === '.tsx' ? 'tsx' : 'ts',
      format: 'esm',
      target: 'es2022',
      sourcefile: filePath,
    }).code;
    return output.replace(/export\s*\{\s*\};?/g, '').trim() === '';
  } catch {
    return false;
  }
}

function isCoverageSource(root, filePath) {
  const resolvedRoot = path.resolve(root);
  const resolvedPath = path.resolve(filePath);
  const absoluteRoot = fs.existsSync(resolvedRoot) ? fs.realpathSync.native(resolvedRoot) : resolvedRoot;
  const absolutePath = fs.existsSync(resolvedPath) ? fs.realpathSync.native(resolvedPath) : resolvedPath;
  const relativePath = toPosix(path.relative(absoluteRoot, absolutePath));
  if (!relativePath || relativePath.startsWith('../') || path.isAbsolute(relativePath)) return false;
  if (!SOURCE_ROOTS.includes(relativePath.split('/')[0])) return false;
  if (!SOURCE_EXTENSIONS.has(path.extname(relativePath)) || relativePath.endsWith('.d.ts')) return false;
  if (EXCLUDED_FILES.has(relativePath) || EXCLUDED_PREFIXES.some(prefix => relativePath.startsWith(prefix))) return false;
  return !isTypeOnlySourceFile(absolutePath);
}

function recursiveSourceScan(root) {
  const files = [];
  for (const sourceRoot of SOURCE_ROOTS) {
    const directory = path.join(root, sourceRoot);
    if (!fs.existsSync(directory)) continue;
    const pending = [directory];
    while (pending.length) {
      const current = pending.pop();
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const entryPath = path.join(current, entry.name);
        if (entry.isDirectory()) pending.push(entryPath);
        else if (isCoverageSource(root, entryPath)) files.push(path.resolve(entryPath));
      }
    }
  }
  return files.sort();
}

function collectSourceFiles(root = process.cwd()) {
  const result = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '--', ...SOURCE_ROOTS], {
    cwd: root,
    encoding: 'utf8',
  });
  if (result.status !== 0) return recursiveSourceScan(root);
  return result.stdout.split('\n')
    .filter(Boolean)
    .map(file => path.resolve(root, file))
    .filter(file => fs.existsSync(file) && isCoverageSource(root, file))
    .sort();
}

function findJsonFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  const files = [];
  const pending = [directory];
  while (pending.length) {
    const current = pending.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) pending.push(entryPath);
      else if (entry.name.endsWith('.json')) files.push(entryPath);
    }
  }
  return files.sort();
}

function discoverCoverageMaps(root = process.cwd()) {
  return [
    ...findJsonFiles(path.join(root, 'coverage', 'raw', 'node')),
    ...findJsonFiles(path.join(root, 'coverage', 'raw', 'browser')),
  ].sort();
}

function directoryBytes(directory) {
  if (!fs.existsSync(directory)) return 0;
  let total = 0;
  const pending = [directory];
  while (pending.length) {
    const current = pending.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) pending.push(entryPath);
      else total += fs.statSync(entryPath).size;
    }
  }
  return total;
}

function assertRawCoverageSize(root = process.cwd(), maximumBytes = RAW_COVERAGE_MAX_BYTES) {
  const actualBytes = directoryBytes(path.join(root, 'coverage', 'raw'));
  if (actualBytes > maximumBytes) {
    throw new Error(`Raw coverage size ${actualBytes} bytes exceeds allowed ${maximumBytes} bytes.`);
  }
  return actualBytes;
}

function normalizeCoveragePath(root, filePath) {
  let candidate = filePath;
  if (candidate.startsWith('file://')) candidate = fileURLToPath(candidate);
  const resolvedRoot = fs.realpathSync.native(path.resolve(root));
  const resolvedPath = path.resolve(root, candidate);
  const absolutePath = fs.existsSync(resolvedPath) ? fs.realpathSync.native(resolvedPath) : resolvedPath;
  const relativePath = path.relative(resolvedRoot, absolutePath);
  if (!relativePath || relativePath.startsWith(`..${path.sep}`) || path.isAbsolute(relativePath)) {
    throw new Error(`Coverage map path resolves outside repository: ${filePath}`);
  }
  return absolutePath;
}

function isUnexecutedRemap(coverage) {
  const functionCounters = Object.values(coverage.data.f);
  const branchCounters = Object.values(coverage.data.b).flat();
  return functionCounters.length > 0
    && functionCounters.every(value => value === 0)
    && branchCounters.every(value => value === 0);
}

function coverageLocationCounts(coverage) {
  return {
    functions: Object.keys(coverage.data.f).length,
    branches: Object.values(coverage.data.b).flat().length,
  };
}

function locationSignature(location) {
  if (!location) return '';
  return [
    Number(location.start?.line) || 0,
    Number(location.start?.column) || 0,
    Number(location.end?.line) || 0,
    Number(location.end?.column) || 0,
  ].join(':');
}

function coverageLocationSets(coverage) {
  return {
    statements: new Set(Object.values(coverage.data.statementMap).map(locationSignature)),
    functions: new Set(Object.values(coverage.data.fnMap).map(entry => JSON.stringify({
      name: entry.name || '',
      decl: locationSignature(entry.decl),
      loc: locationSignature(entry.loc),
    }))),
    branches: new Set(Object.values(coverage.data.branchMap).map(entry => JSON.stringify({
      type: entry.type || '',
      loc: locationSignature(entry.loc),
      locations: (entry.locations || []).map(locationSignature),
    }))),
  };
}

function isLineCoverageRemap(coverage) {
  const statements = Object.values(coverage.data.statementMap);
  return statements.length > 0 && statements.every(location => (
    location.start?.column === 0
    && location.start?.line === location.end?.line
  ));
}

function lineCoverageFunctionIsAuthored(coverage, entry) {
  const sourcePath = coverage.data.path;
  if (!sourcePath || !fs.existsSync(sourcePath)) return true;
  const startLine = Number(entry.decl?.start?.line) || Number(entry.loc?.start?.line) || 0;
  const sourceLine = fs.readFileSync(sourcePath, 'utf8').split(/\r?\n/)[startLine - 1]?.trim() || '';
  return !/^(?:import\b|export\s+type\b|type\b|interface\b)/.test(sourceLine);
}

function coverageSpanSets(coverage) {
  return {
    functions: new Set(Object.values(coverage.data.fnMap)
      .filter(entry => lineCoverageFunctionIsAuthored(coverage, entry))
      .map(entry => JSON.stringify({
        startLine: Number(entry.decl?.start?.line) || Number(entry.loc?.start?.line) || 0,
        endLine: Number(entry.loc?.end?.line) || 0,
      }))),
    branches: new Set(Object.values(coverage.data.branchMap).map(entry => JSON.stringify({
      type: entry.type || '',
      startLine: Number(entry.loc?.start?.line) || 0,
      endLine: Number(entry.loc?.end?.line) || 0,
      locations: (entry.locations || []).map(location => [
        Number(location.start?.line) || 0,
        Number(location.end?.line) || 0,
      ]),
    }))),
  };
}

function coverageLocationsSubset(candidate, other) {
  if (isLineCoverageRemap(candidate)) {
    // V8 remaps synthesize one "statement" for every source line, including
    // imports and type-only lines. Function and branch spans are the authored
    // locations that can be compared to an Istanbul statement map safely.
    const candidateSpans = coverageSpanSets(candidate);
    const otherSpans = coverageSpanSets(other);
    return Object.keys(candidateSpans).every(kind => (
      [...candidateSpans[kind]].every(location => otherSpans[kind].has(location))
    ));
  }
  const candidateLocations = coverageLocationSets(candidate);
  const otherLocations = coverageLocationSets(other);
  return Object.keys(candidateLocations).every(kind => (
    [...candidateLocations[kind]].every(location => otherLocations[kind].has(location))
  ));
}

function mergeCoverageMaps(root = process.cwd(), mapFiles = discoverCoverageMaps(root)) {
  if (mapFiles.length === 0) throw new Error('No Node or browser Istanbul coverage maps were found.');
  const candidates = new Map();
  for (const mapFile of mapFiles) {
    let input;
    try {
      input = JSON.parse(fs.readFileSync(mapFile, 'utf8'));
    } catch (error) {
      throw new Error(`Malformed coverage map ${mapFile}: ${error.message}`);
    }
    let coverageMap;
    try {
      coverageMap = createCoverageMap(input);
    } catch (error) {
      throw new Error(`Invalid coverage map ${mapFile}: ${error.message}`);
    }
    for (const file of coverageMap.files().sort()) {
      const absolutePath = normalizeCoveragePath(root, file);
      if (!isCoverageSource(root, absolutePath)) continue;
      const coverage = coverageMap.fileCoverageFor(file).toJSON();
      coverage.path = absolutePath;
      const values = candidates.get(absolutePath) || [];
      values.push(coverage);
      candidates.set(absolutePath, values);
    }
  }
  const merged = createCoverageMap({});
  for (const values of candidates.values()) {
    const selected = values.filter(coverage => {
      const candidate = { data: coverage };
      if (!isUnexecutedRemap(candidate)) return true;
      return !values.some(other => {
        const otherCoverage = { data: other };
        if (isUnexecutedRemap(otherCoverage)) return false;
        return coverageLocationsSubset(candidate, otherCoverage);
      });
    });
    selected.forEach(coverage => merged.addFileCoverage(coverage));
  }
  return merged;
}

function createEmptyFileCoverage(filePath) {
  const extension = path.extname(filePath);
  const instrumenter = createInstrumenter({
    compact: false,
    esModules: true,
    produceSourceMap: true,
    parserPlugins: extension === '.tsx' ? ['typescript', 'jsx'] : ['typescript'],
  });
  try {
    instrumenter.instrumentSync(fs.readFileSync(filePath, 'utf8'), filePath);
  } catch (error) {
    throw new Error(`Could not instrument never-loaded source ${filePath}: ${error.message}`);
  }
  return instrumenter.lastFileCoverage();
}

function addUncoveredSourceFiles(root, coverageMap, sourceFiles = collectSourceFiles(root)) {
  const covered = new Set(coverageMap.files().map(file => path.resolve(file)));
  for (const filePath of sourceFiles) {
    const absolutePath = normalizeCoveragePath(root, filePath);
    if (!covered.has(absolutePath)) coverageMap.addFileCoverage(createEmptyFileCoverage(absolutePath));
  }
  return coverageMap;
}

function sortCoverageMap(coverageMap) {
  const sorted = createCoverageMap({});
  for (const file of coverageMap.files().sort()) sorted.addFileCoverage(coverageMap.fileCoverageFor(file));
  return sorted;
}

function writeCoverageReports(root, coverageMap) {
  const coverageDirectory = path.join(root, 'coverage');
  fs.mkdirSync(coverageDirectory, { recursive: true });
  fs.rmSync(path.join(coverageDirectory, 'html'), { recursive: true, force: true });
  const context = libReport.createContext({ dir: coverageDirectory, coverageMap });
  reports.create('text-summary', { file: 'text-summary.txt' }).execute(context);
  reports.create('json-summary', { file: 'coverage-summary.json' }).execute(context);
  reports.create('json', { file: 'coverage-final.json' }).execute(context);
  reports.create('lcovonly', { file: 'lcov.info' }).execute(context);
  reports.create('html', { subdir: 'html' }).execute(context);
}

function countTrackedCandidates(root) {
  const result = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '--', ...SOURCE_ROOTS], { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) return collectSourceFiles(root).length;
  return result.stdout.split('\n').filter(file => file && SOURCE_EXTENSIONS.has(path.extname(file))).length;
}

function runCli(root = process.cwd()) {
  const started = Date.now();
  try {
    const mapFiles = discoverCoverageMaps(root);
    const rawBytes = assertRawCoverageSize(root);
    const sourceFiles = collectSourceFiles(root);
    const merged = addUncoveredSourceFiles(root, mergeCoverageMaps(root, mapFiles), sourceFiles);
    const sorted = sortCoverageMap(merged);
    if (sorted.files().length === 0) throw new Error('Coverage merge produced zero authored source files.');
    writeCoverageReports(root, sorted);
    const metadata = {
      sourceFiles: sourceFiles.length,
      excludedFiles: Math.max(0, countTrackedCandidates(root) - sourceFiles.length),
      rawMaps: mapFiles.length,
      rawBytes,
      rawByteLimit: RAW_COVERAGE_MAX_BYTES,
      reportMilliseconds: Date.now() - started,
    };
    fs.writeFileSync(path.join(root, 'coverage', 'coverage-meta.json'), `${JSON.stringify(metadata, null, 2)}\n`);
    console.log(`Merged ${mapFiles.length} maps across ${sourceFiles.length} authored files in ${metadata.reportMilliseconds}ms.`);
    return 0;
  } catch (error) {
    console.error(error.message);
    return 1;
  }
}

if (require.main === module) process.exit(runCli());

module.exports = {
  addUncoveredSourceFiles,
  assertRawCoverageSize,
  collectSourceFiles,
  coverageLocationsSubset,
  directoryBytes,
  coverageLocationCounts,
  isUnexecutedRemap,
  discoverCoverageMaps,
  isCoverageSource,
  isTypeOnlySourceFile,
  mergeCoverageMaps,
  normalizeCoveragePath,
  RAW_COVERAGE_MAX_BYTES,
  runCli,
  sortCoverageMap,
  writeCoverageReports,
};
