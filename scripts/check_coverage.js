/* Enforce minimum line coverage from summary. */
const fs = require('node:fs');
const path = require('node:path');

const summaryPath = path.join(process.cwd(), 'coverage', 'coverage-summary.json');
if (!fs.existsSync(summaryPath)) {
  console.error('Coverage summary not found at', summaryPath);
  process.exit(1);
}

const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
const total = summary.total || {};
const lines = total.lines || {};
const pct = Number(lines.pct);

const min = 80;
if (!Number.isFinite(pct)) {
  console.error('Invalid coverage pct');
  process.exit(1);
}
if (pct < min) {
  console.error(`Coverage ${pct}% is below minimum ${min}%`);
  process.exit(1);
}

console.log(`Coverage ${pct}% meets minimum ${min}%.`);
