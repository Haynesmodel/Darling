/* Generate a basic line coverage summary from V8 coverage output. */
const fs = require('node:fs');
const path = require('node:path');
const { fileURLToPath } = require('node:url');

const root = process.cwd();
const v8Dir = path.join(root, 'coverage', '.v8');
const outDir = path.join(root, 'coverage');

if (!fs.existsSync(v8Dir)) {
  console.error('V8 coverage directory missing:', v8Dir);
  process.exit(1);
}

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

const fileData = new Map();
const files = fs.readdirSync(v8Dir).filter(f=>f.endsWith('.json'));
for (const f of files){
  const data = JSON.parse(fs.readFileSync(path.join(v8Dir, f), 'utf8'));
  const results = data.result || [];
  for (const r of results){
    if (!r.url || !r.url.startsWith('file://')) continue;
    const filePath = fileURLToPath(r.url);
    if (!filePath.includes(path.sep + 'test' + path.sep)) continue;
    if (!filePath.endsWith('.js')) continue;

    const entry = fileData.get(filePath) || { ranges: [] };
    for (const fn of r.functions || []){
      for (const range of fn.ranges || []){
        if (range.count > 0) entry.ranges.push(range);
      }
    }
    fileData.set(filePath, entry);
  }
}

let totalLines = 0;
let coveredLines = 0;
const perFile = [];

for (const [filePath, info] of fileData.entries()){
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
const summary = {
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

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'coverage-summary.json'), JSON.stringify(summary, null, 2) + '\n');

const text = [
  `Lines: ${coveredLines}/${totalLines} (${totalPct.toFixed(2)}%)`,
  ...perFile.map(f=>`${f.file}: ${f.covered}/${f.total} (${f.pct.toFixed(2)}%)`)
].join('\n');
fs.writeFileSync(path.join(outDir, 'coverage.txt'), text + '\n');
