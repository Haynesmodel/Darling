const path = require('node:path');
const { runCommand } = require('./process_runner.cjs');

const PROJECTS = new Map([
  ['chromium', 'chromium'],
  ['webkit', 'webkit-smoke'],
]);

function playwrightBinary(root, platform = process.platform) {
  return path.join(root, 'node_modules', '.bin', platform === 'win32' ? 'playwright.cmd' : 'playwright');
}

async function runPreview({ root, project, run = runCommand, environment = process.env }) {
  if (project && !PROJECTS.has(project)) {
    throw new Error(`Unknown preview project: ${project}`);
  }
  const args = ['test'];
  if (project) args.push(`--project=${PROJECTS.get(project)}`);
  await run('Playwright production preview', playwrightBinary(root), args, {
    cwd: root,
    env: {
      CI: environment.CI || '',
      PLAYWRIGHT_SERVER: 'preview',
    },
  });
}

if (require.main === module) {
  runPreview({
    root: process.cwd(),
    project: process.argv[2],
  }).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { playwrightBinary, runPreview };
