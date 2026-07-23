/* Select the JavaScript tests executed by c8's Node coverage child. */
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
function selectTestFiles(root = process.cwd()) {
  const testDir = path.join(root, 'test');
  return fs.readdirSync(testDir)
    .filter(file => /\.test\.(js|cjs)$/.test(file))
    .filter(file => file !== 'data.test.js')
    .map(file => path.join('test', file))
    .sort();
}

function propagateResult(result, processApi = process) {
  if (result.signal) {
    processApi.kill(processApi.pid, result.signal);
    return 1;
  }
  return result.status ?? 1;
}

function run(root = process.cwd()) {
  const result = spawnSync(process.execPath, ['--test', ...selectTestFiles(root)], {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
  });
  return propagateResult(result);
}

if (require.main === module) process.exit(run());

module.exports = { propagateResult, run, selectTestFiles };
