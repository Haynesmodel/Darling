const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

function occurrences(text, pattern) {
  return [...text.matchAll(pattern)].length;
}

function jobBlock(workflow, jobId) {
  const start = workflow.indexOf('\n  ' + jobId + ':');
  if (start < 0) return '';
  const remainder = workflow.slice(start + 1);
  const next = remainder.slice(1).search(/\n  [a-zA-Z0-9_-]+:\n/);
  return next < 0 ? remainder : remainder.slice(0, next + 1);
}

function validateWorkflowContracts({ ci, updater, legacyDeployExists = false }) {
  const errors = [];
  const ui = jobBlock(ci, 'ui');
  const packagePages = jobBlock(ci, 'package-pages');
  const deployPages = jobBlock(ci, 'deploy-pages');

  if (legacyDeployExists) errors.push('legacy deploy-pages workflow still exists');
  if (occurrences(ci, /uses:\s*actions\/deploy-pages@/g) !== 1) errors.push('CI must use actions/deploy-pages exactly once');
  if (!/needs:\s*\[unit, ui, coverage\]/.test(packagePages)) errors.push('package-pages must need unit, ui, and coverage');
  if (!/needs:\s*package-pages/.test(deployPages)) errors.push('deploy-pages must need package-pages');
  for (const [name, block] of [['package-pages', packagePages], ['deploy-pages', deployPages]]) {
    if (!/if:\s*github\.event_name == 'push' && github\.ref == 'refs\/heads\/main'/.test(block)) {
      errors.push(name + ' must be restricted to a push on refs/heads/main');
    }
    if (/always\s*\(/.test(block)) errors.push(name + ' may not bypass dependencies with always()');
    if (/npm run build/.test(block)) errors.push(name + ' may not rebuild the production site');
  }
  if (!/uses:\s*actions\/download-artifact@v4[\s\S]*name:\s*darling-dist-\$\{\{ github\.sha \}\}/.test(ui)) {
    errors.push('ui must download the SHA-scoped dist artifact');
  }
  if (/npm run build/.test(ui)) errors.push('ui may not rebuild the production site');
  if (occurrences(ci, /uses:\s*actions\/upload-artifact@v4[\s\S]{0,220}name:\s*darling-dist-\$\{\{ github\.sha \}\}/g) !== 1) {
    errors.push('unit must be the sole generic dist artifact producer');
  }
  if (occurrences(ci, /name:\s*darling-dist-\$\{\{ github\.sha \}\}/g) !== 3) {
    errors.push('the SHA-scoped artifact must have one producer and two consumers');
  }
  if (!/if-no-files-found:\s*error/.test(ci)) errors.push('dist artifact upload must fail when files are missing');
  if (!/permissions:[\s\S]*pages:\s*write[\s\S]*id-token:\s*write/.test(deployPages)) {
    errors.push('Pages write and OIDC permissions must be deploy-job scoped');
  }

  if (/pull_request_target\s*:/.test(updater)) errors.push('updater may not use pull_request_target');
  if (/git push[^\n]*(?:\bmain\b|\$\{\{\s*github\.ref_name\s*\}\})/.test(updater)) {
    errors.push('updater may not push to main or github.ref_name');
  }
  if (!/BRANCH="automation\/sleeper-\$\{SEASON\}"/.test(updater)) errors.push('updater must use the deterministic season branch');
  if (!/actions\/create-github-app-token@v2/.test(updater)) errors.push('updater must mint a GitHub App token');
  if (!/DARLING_AUTOMATION_APP_ID/.test(updater) || !/DARLING_AUTOMATION_PRIVATE_KEY/.test(updater)) {
    errors.push('updater must use the documented App credentials');
  }
  if (!/gh pr create --draft/.test(updater)) errors.push('updater must create draft PRs');
  if (!/steps\.changes\.outputs\.changed == 'true'/.test(updater)) errors.push('updater must explicitly gate publication on changes');
  if (!/--force-with-lease="\$\{LEASE\}"/.test(updater) || /git push\s+--force(?:\s|$)/.test(updater)) {
    errors.push('updater must publish with an explicit force-with-lease');
  }
  if (!/Upload candidate data on failure/.test(updater)) errors.push('updater must retain failure artifacts');
  if (!/Notify on failure/.test(updater) || !/Weekly Sleeper update failed/.test(updater)) {
    errors.push('updater must retain deduplicated failure notification');
  }
  return errors;
}

const ci = fs.readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8');
const updater = fs.readFileSync(path.join(root, '.github/workflows/update-sleeper.yml'), 'utf8');

test('release and updater workflows preserve the security contract', () => {
  assert.deepEqual(validateWorkflowContracts({
    ci,
    updater,
    legacyDeployExists: fs.existsSync(path.join(root, '.github/workflows/deploy-pages.yml')),
  }), []);
});

test('workflow contract rejects a direct updater push to main', () => {
  const errors = validateWorkflowContracts({ ci, updater: updater + '\n      - run: git push origin HEAD:main\n' });
  assert.ok(errors.some(error => error.includes('may not push')));
});

test('workflow contract rejects pull_request_target', () => {
  const errors = validateWorkflowContracts({ ci, updater: updater.replace('  schedule:', '  pull_request_target:\n  schedule:') });
  assert.ok(errors.some(error => error.includes('pull_request_target')));
});

test('workflow contract rejects a missing coverage dependency', () => {
  const errors = validateWorkflowContracts({ ci: ci.replace('needs: [unit, ui, coverage]', 'needs: [unit, ui]'), updater });
  assert.ok(errors.some(error => error.includes('need unit, ui, and coverage')));
});

test('workflow contract rejects a second Pages deploy action', () => {
  const errors = validateWorkflowContracts({ ci: ci + '\n# uses: actions/deploy-pages@v4\n', updater });
  assert.ok(errors.some(error => error.includes('exactly once')));
});

test('workflow contract rejects an always dependency bypass', () => {
  const changed = ci.replace("if: github.event_name == 'push' && github.ref == 'refs/heads/main'", 'if: always()');
  const errors = validateWorkflowContracts({ ci: changed, updater });
  assert.ok(errors.some(error => error.includes('always()')));
});

module.exports = { validateWorkflowContracts };
