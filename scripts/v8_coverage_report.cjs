/* Generate a basic line coverage summary from V8 coverage output. */
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { fileURLToPath } = require('node:url');

const defaultRoot = process.cwd();
const sourceDirs = new Set(['js', 'scripts', 'src']);
const sourceExts = new Set(['.js', '.cjs', '.ts', '.tsx']);
const ignoredSourceSegments = [
  path.join('js', 'charting', 'vendor'),
];
const ignoredSourceFiles = new Set([
  path.join('scripts', 'build_chart_vendor.cjs'),
]);

function getLineStarts(src){
  const starts = [0];
  for (let i=0;i<src.length;i++){
    if (src[i] === '\n') starts.push(i+1);
  }
  return starts;
}

function offsetToLine(starts, offset){
  let lo=0, hi=starts.length-1;
  while (lo<=hi){
    const mid = (lo+hi)>>1;
    if (starts[mid] <= offset) lo = mid + 1;
    else hi = mid - 1;
  }
  return Math.max(0, lo-1); // 0-based
}

function collectSourceFiles(root = defaultRoot) {
  const gitFiles = spawnSync('git', ['ls-files', ...sourceDirs], {
    cwd: root,
    encoding: 'utf8',
  });
  if (gitFiles.status === 0) {
    return gitFiles.stdout
      .split('\n')
      .filter(Boolean)
      .map(relPath => path.join(root, relPath))
      .filter(filePath => fs.existsSync(filePath) && isSourceFile(root, filePath))
      .sort();
  }

  const files = [];
  const ignoredDirs = new Set(['test', 'node_modules', '__pycache__', 'venv', '.venv', 'env', 'ENV']);
  for (const dir of sourceDirs) {
    const dirPath = path.join(root, dir);
    if (!fs.existsSync(dirPath)) continue;
    const stack = [dirPath];
    while (stack.length) {
      const current = stack.pop();
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const absPath = path.join(current, entry.name);
        const relPath = path.relative(root, absPath);
        if (ignoredSourceSegments.some(segment => relPath === segment || relPath.startsWith(segment + path.sep))) {
          continue;
        }
        if (!entry.isDirectory() && ignoredSourceFiles.has(relPath)) continue;
        if (entry.isDirectory()) {
          if (ignoredDirs.has(entry.name)) continue;
          stack.push(absPath);
          continue;
        }
        if (!entry.name.endsWith('.d.ts') && sourceExts.has(path.extname(entry.name))) {
          files.push(absPath);
        }
      }
    }
  }
  return files.sort();
}

function isSourceFile(root, filePath) {
  const relPath = path.relative(root, filePath);
  if (relPath.startsWith('..' + path.sep) || path.isAbsolute(relPath)) return false;
  if (ignoredSourceSegments.some(segment => relPath === segment || relPath.startsWith(segment + path.sep))) return false;
  if (ignoredSourceFiles.has(relPath)) return false;
  if (relPath.split(path.sep).includes('test')) return false;
  if (!sourceDirs.has(relPath.split(path.sep)[0])) return false;
  if (filePath.endsWith('.d.ts')) return false;
  return sourceExts.has(path.extname(filePath));
}

function resolveCoverageUrl(root, url) {
  if (!url) return null;
  if (url.startsWith('file://')) {
    return fileURLToPath(url);
  }

  try {
    const parsed = new URL(url);
    if (
      (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
      (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost' || parsed.hostname === '::1')
    ) {
      const filePath = path.normalize(path.join(root, decodeURIComponent(parsed.pathname.replace(/^\/+/, ''))));
      if (isSourceFile(root, filePath)) return filePath;
    }
  } catch {
    return null;
  }

  return null;
}

function buildCoverageSummary(root = defaultRoot) {
  const v8Dir = path.join(root, 'coverage', '.v8');
  if (!fs.existsSync(v8Dir)) {
    throw new Error(`V8 coverage directory missing: ${v8Dir}`);
  }

  const fileData = new Map();
  const files = fs.readdirSync(v8Dir).filter(f=>f.endsWith('.json'));
  for (const f of files){
    const data = JSON.parse(fs.readFileSync(path.join(v8Dir, f), 'utf8'));
    const results = data.result || [];
    for (const r of results){
      const filePath = resolveCoverageUrl(root, r.url);
      if (!filePath) continue;
      if (!isSourceFile(root, filePath)) continue;

      const entry = fileData.get(filePath) || { ranges: [] };
      for (const fn of r.functions || []){
        for (const range of fn.ranges || []){
          if (range.count > 0) entry.ranges.push(range);
        }
      }
      fileData.set(filePath, entry);
    }
  }

  const sourceFiles = collectSourceFiles(root);
  const missingFiles = sourceFiles.filter(filePath => !fileData.has(filePath));
  if (missingFiles.length) {
    throw new Error(`Missing coverage for source files: ${missingFiles.map(filePath => path.relative(root, filePath)).join(', ')}`);
  }

  let totalLines = 0;
  let coveredLines = 0;
  const perFile = [];

  for (const filePath of sourceFiles){
    const info = fileData.get(filePath);
    const src = fs.readFileSync(filePath, 'utf8');
    const starts = getLineStarts(src);
    const lines = src.split('\n');

    const codeLines = new Set();
    lines.forEach((line, idx)=>{ if (line.trim().length > 0) codeLines.add(idx); });

    const covered = new Set();
    for (const range of info.ranges){
      const startLine = offsetToLine(starts, range.startOffset);
      const endLine = offsetToLine(starts, Math.max(range.endOffset-1, range.startOffset));
      for (let i=startLine;i<=endLine;i++) covered.add(i);
    }

    let fileCovered = 0;
    for (const ln of codeLines){ if (covered.has(ln)) fileCovered++; }

    const fileTotal = codeLines.size;
    const pct = fileTotal ? (fileCovered / fileTotal) * 100 : 100;

    totalLines += fileTotal;
    coveredLines += fileCovered;
    perFile.push({ file: path.relative(root, filePath), total: fileTotal, covered: fileCovered, pct });
  }

  const totalPct = totalLines ? (coveredLines / totalLines) * 100 : 100;
  return {
    total: {
      lines: {
        total: totalLines,
        covered: coveredLines,
        skipped: 0,
        pct: Number(totalPct.toFixed(2))
      }
    },
    files: perFile
  };
}

function writeCoverageReport(root = defaultRoot) {
  const outDir = path.join(root, 'coverage');
  const summary = buildCoverageSummary(root);
  const lines = summary.total.lines;
  const text = [
    `Lines: ${lines.covered}/${lines.total} (${lines.pct.toFixed(2)}%)`,
    ...summary.files.map(f=>`${f.file}: ${f.covered}/${f.total} (${f.pct.toFixed(2)}%)`)
  ].join('\n');

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'coverage-summary.json'), JSON.stringify(summary, null, 2) + '\n');
  fs.writeFileSync(path.join(outDir, 'coverage.txt'), text + '\n');
  return summary;
}

function runCli(root = defaultRoot) {
  try {
    writeCoverageReport(root);
    return 0;
  } catch (err) {
    console.error(err.message);
    return 1;
  }
}

if (require.main === module) {
  process.exit(runCli());
}

module.exports = {
  buildCoverageSummary,
  collectSourceFiles,
  isSourceFile,
  runCli,
  resolveCoverageUrl,
  writeCoverageReport,
};
