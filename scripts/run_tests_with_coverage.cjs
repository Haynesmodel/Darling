/* Run tests with V8 coverage output for c8 to consume. */
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const coverageDir = path.join(process.cwd(), 'coverage', '.v8');
fs.rmSync(coverageDir, { recursive: true, force: true });
fs.mkdirSync(coverageDir, { recursive: true });

const env = { ...process.env, NODE_V8_COVERAGE: coverageDir };
const testDir = path.join(process.cwd(), 'test');
const testFiles = fs.readdirSync(testDir)
  .filter(file => /\.test\.(js|cjs)$/.test(file))
  .map(file => path.join('test', file))
  .sort();
const res = spawnSync(process.execPath, ['--test', ...testFiles], { stdio: 'inherit', env });
process.exit(res.status ?? 1);
