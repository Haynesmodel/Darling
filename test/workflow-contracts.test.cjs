const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const workflowDirectory = path.join(root, '.github', 'workflows');
const ciPath = path.join(workflowDirectory, 'ci.yml');
const legacyDeployPath = path.join(workflowDirectory, 'deploy-pages.yml');

const REQUIRED_ARTIFACT_NAME = 'darling-dist-${{ github.sha }}';
const MAIN_PUSH_CONDITION = "github.event_name == 'push' && github.ref == 'refs/heads/main'";
const ACTION_LINE = /^\s*uses:\s+([^\s#]+)(?:\s+#\s*(.+))?$/gm;

function extractJob(workflow, jobName) {
  const startPattern = new RegExp(`^  ${jobName}:\\s*$`, 'm');
  const match = startPattern.exec(workflow);
  if (!match) return '';

  const start = match.index;
  const rest = workflow.slice(start + match[0].length);
  const nextJob = /^  [a-zA-Z0-9_-]+:\s*$/m.exec(rest);
  return workflow.slice(start, nextJob ? start + match[0].length + nextJob.index : workflow.length);
}

function countMatches(source, pattern) {
  return [...source.matchAll(pattern)].length;
}

function validatePinnedActions(workflows, errors) {
  for (const [filename, source] of Object.entries(workflows)) {
    for (const match of source.matchAll(ACTION_LINE)) {
      const target = match[1];
      if (target.startsWith('./') || target.startsWith('docker://')) continue;

      const separator = target.lastIndexOf('@');
      const ref = separator === -1 ? '' : target.slice(separator + 1);
      const versionComment = match[2] || '';
      if (!/^[0-9a-f]{40}$/.test(ref)) {
        errors.push(`${filename}: third-party action must use a full immutable commit SHA: ${target}`);
      }
      if (!/\bv?\d+\.\d+\.\d+\b/.test(versionComment)) {
        errors.push(`${filename}: pinned action must include a readable version comment: ${target}`);
      }
    }
  }
}

function validateWorkflowContracts({ workflows, legacyDeployExists }) {
  const errors = [];
  const ci = workflows['ci.yml'] || '';
  const allWorkflowSource = Object.values(workflows).join('\n');
  const workflowHeader = ci.split(/^jobs:\s*$/m)[0] || '';
  const qualityBuild = extractJob(ci, 'quality_build');
  const chromium = extractJob(ci, 'chromium');
  const webkit = extractJob(ci, 'webkit_smoke');
  const gate = extractJob(ci, 'gate');
  const packagePages = extractJob(ci, 'package_pages');
  const deployPages = extractJob(ci, 'deploy_pages');

  if (legacyDeployExists) {
    errors.push('CI-003: legacy deploy-pages.yml must be removed');
  }

  const buildCommands = countMatches(allWorkflowSource, /^\s*run:\s+npm run build\s*$/gm);
  if (buildCommands !== 1 || !/^\s*run:\s+npm run build\s*$/m.test(qualityBuild)) {
    errors.push('ARCH-001: quality_build must contain the only workflow-level npm run build');
  }

  if (!qualityBuild) {
    errors.push('ARCH-001: quality_build job is missing');
  } else {
    if (!qualityBuild.includes('uses: actions/upload-artifact@')) {
      errors.push('ARCH-001: quality_build must upload the production artifact');
    }
    if (!qualityBuild.includes(`name: ${REQUIRED_ARTIFACT_NAME}`)) {
      errors.push('ARCH-002: quality_build must use the SHA-named artifact');
    }
    if (!/path:\s*dist\//.test(qualityBuild)) {
      errors.push('ARCH-001: quality_build must upload dist/');
    }
    if (!/include-hidden-files:\s*true/.test(qualityBuild)) {
      errors.push('ARCH-002: quality_build must include hidden files');
    }
    if (!/if-no-files-found:\s*error/.test(qualityBuild)) {
      errors.push('REL-001: quality_build must reject a missing dist payload');
    }
  }

  for (const [jobName, block] of [
    ['chromium', chromium],
    ['webkit_smoke', webkit],
    ['package_pages', packagePages],
  ]) {
    if (!block) {
      errors.push(`ARCH-002: ${jobName} job is missing`);
      continue;
    }
    if (!block.includes('uses: actions/download-artifact@')) {
      errors.push(`ARCH-002: ${jobName} must download the production artifact`);
    }
    if (!block.includes(`name: ${REQUIRED_ARTIFACT_NAME}`)) {
      errors.push(`ARCH-002: ${jobName} must use the SHA-named artifact`);
    }
    if (!/path:\s*dist\//.test(block)) {
      errors.push(`ARCH-002: ${jobName} must download to dist/`);
    }
    if (!/digest-mismatch:\s*error/.test(block)) {
      errors.push(`CI-002: ${jobName} must fail on digest mismatch`);
    }
  }

  if (packagePages) {
    if (!/needs:\s*\[quality_build,\s*gate\]/.test(packagePages)) {
      errors.push('CI-001: package_pages must need quality_build and gate');
    }
    if (!packagePages.includes(`if: ${MAIN_PUSH_CONDITION}`)) {
      errors.push('CI-001: package_pages must use the explicit main-push condition');
    }
    if (/\balways\(\)/.test(packagePages)) {
      errors.push('REL-001: package_pages must not use always()');
    }
    if (!packagePages.includes('uses: actions/upload-pages-artifact@')) {
      errors.push('ARCH-002: package_pages must upload dist with upload-pages-artifact');
    }
    if (!/uses:\s*actions\/upload-pages-artifact@[0-9a-f]{40}\s+#\s*v?\d+\.\d+\.\d+/.test(packagePages)) {
      errors.push('CI-005: package_pages must pin upload-pages-artifact with a readable version');
    }
    if (!/path:\s*dist\//.test(packagePages)) {
      errors.push('ARCH-002: package_pages must upload dist/');
    }
    if (!packagePages.includes('dist/index.html')
      || !packagePages.includes('dist/assets/asset-manifest.json')
      || !packagePages.includes('dist/.vite/manifest.json')
      || !/\[\[\s*! -s "\$file"\s*\]\]/.test(packagePages)) {
      errors.push('REL-003: package_pages must reject missing or empty required files');
    }
    const forbiddenPackageCommand = /actions\/(?:checkout|setup-node|cache)@|\bnpm (?:ci|install|run build)\b|^\s*(?:cp|mv|rm|rsync|sed|perl|python\d*|node|tar|gzip|zip|touch|chmod)\b/gm;
    if (forbiddenPackageCommand.test(packagePages)) {
      errors.push('ARCH-002: package_pages must not check out, install, build, or mutate dist');
    }
  }

  if (!deployPages) {
    errors.push('REL-001: deploy_pages job is missing');
  } else {
    if (!/^\s*needs:\s*package_pages\s*$/m.test(deployPages)) {
      errors.push('REL-001: deploy_pages must need only package_pages');
    }
    if (!deployPages.includes(`if: ${MAIN_PUSH_CONDITION}`)) {
      errors.push('CI-004: deploy_pages must use the explicit main-push condition');
    }
    if (!/environment:\s*\n\s+name:\s*github-pages\s*\n\s+url:\s*\$\{\{\s*steps\.deployment\.outputs\.page_url\s*\}\}/.test(deployPages)) {
      errors.push('OBS-002: deploy_pages must declare the github-pages environment URL');
    }
    if (!/group:\s*darling-pages-production/.test(deployPages)
      || !/cancel-in-progress:\s*true/.test(deployPages)) {
      errors.push('REL-002: deploy_pages must serialize production deployments');
    }
    if (!/contents:\s*read/.test(deployPages)
      || !/pages:\s*write/.test(deployPages)
      || !/id-token:\s*write/.test(deployPages)) {
      errors.push('SEC-002: deploy_pages must own least-privilege Pages permissions');
    }

    const staleCheckIndex = deployPages.indexOf('github.rest.repos.getBranch');
    const contextShaIndex = deployPages.indexOf('context.sha');
    const staleFailureIndex = deployPages.indexOf('core.setFailed');
    const deployActionIndex = deployPages.indexOf('uses: actions/deploy-pages@');
    if (staleCheckIndex === -1
      || contextShaIndex < staleCheckIndex
      || staleFailureIndex < contextShaIndex
      || deployActionIndex < staleFailureIndex) {
      errors.push('SEC-003: current-main SHA check must fail closed immediately before deploy-pages');
    }
    if (!/branch:\s*'main'/.test(deployPages)) {
      errors.push('SEC-003: stale-run check must query main');
    }
    if (countMatches(deployPages, /uses:\s*actions\/deploy-pages@/g) !== 1) {
      errors.push('REL-001: deploy_pages must invoke deploy-pages exactly once');
    }
    if (/\balways\(\)|continue-on-error:\s*true/.test(deployPages)) {
      errors.push('REL-001: deploy_pages critical path must fail closed');
    }
  }

  if (!/^permissions:\s*\n\s{2}contents:\s*read\s*$/m.test(workflowHeader)) {
    errors.push('SEC-001: CI must default to contents: read');
  }
  if (/pages:\s*write|id-token:\s*write/.test(workflowHeader)) {
    errors.push('SEC-002: Pages write and OIDC permissions must not be workflow-scoped');
  }
  if (countMatches(allWorkflowSource, /^\s*pages:\s*write\s*$/gm) !== 1
    || countMatches(allWorkflowSource, /^\s*id-token:\s*write\s*$/gm) !== 1) {
    errors.push('SEC-002: Pages write and OIDC permissions must occur only once');
  }

  if (!/name:\s*ci \/ gate/.test(gate)) {
    errors.push('ARCH-003: gate name must remain exactly ci / gate');
  }
  if (!/if:\s*always\(\)/.test(gate)) {
    errors.push('ARCH-003: gate must retain if: always()');
  }
  if (!/needs:\s*\[quality_build,\s*chromium,\s*coverage,\s*webkit_smoke\]/.test(gate)) {
    errors.push('ARCH-003: gate must retain its quality dependency list');
  }

  if (/\bwrite-all\b/.test(allWorkflowSource)) {
    errors.push('CI-005: workflows must not grant write-all');
  }
  if (countMatches(allWorkflowSource, /uses:\s*actions\/upload-pages-artifact@/g) !== 1) {
    errors.push('CI-003: upload-pages-artifact must appear exactly once');
  }
  if (countMatches(allWorkflowSource, /uses:\s*actions\/deploy-pages@/g) !== 1) {
    errors.push('CI-003: deploy-pages must appear exactly once');
  }

  validatePinnedActions(workflows, errors);
  return errors;
}

function readRepositoryFixture() {
  const workflows = {};
  for (const filename of fs.readdirSync(workflowDirectory)) {
    if (filename.endsWith('.yml') || filename.endsWith('.yaml')) {
      workflows[filename] = fs.readFileSync(path.join(workflowDirectory, filename), 'utf8');
    }
  }
  return {
    workflows,
    legacyDeployExists: fs.existsSync(legacyDeployPath),
  };
}

function assertContracts(fixture) {
  const errors = validateWorkflowContracts(fixture);
  assert.deepEqual(errors, [], errors.join('\n'));
}

function mutateCi(fixture, mutate) {
  return {
    legacyDeployExists: fixture.legacyDeployExists,
    workflows: {
      ...fixture.workflows,
      'ci.yml': mutate(fixture.workflows['ci.yml']),
    },
  };
}

function mutateJob(fixture, jobName, mutate) {
  return mutateCi(fixture, (ci) => {
    const block = extractJob(ci, jobName);
    assert.notEqual(block, '', `missing ${jobName} fixture`);
    return ci.replace(block, mutate(block));
  });
}

test('repository workflows preserve the exact tested-artifact deployment contract', () => {
  assertContracts(readRepositoryFixture());
});

test('contract rejects a removed package gate dependency', () => {
  const fixture = readRepositoryFixture();
  const mutated = mutateJob(fixture, 'package_pages', block => (
    block.replace('needs: [quality_build, gate]', 'needs: [quality_build]')
  ));
  assert.match(validateWorkflowContracts(mutated).join('\n'), /package_pages must need quality_build and gate/);
});

test('contract rejects a production build inserted into package_pages', () => {
  const fixture = readRepositoryFixture();
  const mutated = mutateJob(fixture, 'package_pages', block => (
    block.replace('    steps:\n', '    steps:\n      - run: npm run build\n')
  ));
  assert.match(validateWorkflowContracts(mutated).join('\n'), /package_pages must not check out, install, build, or mutate dist/);
});

test('contract rejects missing package digest enforcement', () => {
  const fixture = readRepositoryFixture();
  const mutated = mutateJob(fixture, 'package_pages', block => (
    block.replace('          digest-mismatch: error\n', '')
  ));
  assert.match(validateWorkflowContracts(mutated).join('\n'), /package_pages must fail on digest mismatch/);
});

test('contract rejects broad workflow-level Pages permissions', () => {
  const fixture = readRepositoryFixture();
  const mutated = mutateCi(fixture, ci => ci.replace(
    'permissions:\n  contents: read',
    'permissions:\n  contents: read\n  pages: write\n  id-token: write',
  ));
  assert.match(validateWorkflowContracts(mutated).join('\n'), /must not be workflow-scoped/);
});

test('contract rejects a duplicated deploy action', () => {
  const fixture = readRepositoryFixture();
  const mutated = mutateJob(fixture, 'deploy_pages', block => block.replace(
    /(\s+uses: actions\/deploy-pages@[^\n]+\n)/,
    '$1      - name: Duplicate deploy\n$1',
  ));
  assert.match(validateWorkflowContracts(mutated).join('\n'), /deploy_pages must invoke deploy-pages exactly once/);
});

test('contract rejects a missing main-only package condition', () => {
  const fixture = readRepositoryFixture();
  const mutated = mutateJob(fixture, 'package_pages', block => block.replace(
    `    if: ${MAIN_PUSH_CONDITION}\n`,
    '',
  ));
  assert.match(validateWorkflowContracts(mutated).join('\n'), /package_pages must use the explicit main-push condition/);
});

test('contract rejects a renamed stable gate', () => {
  const fixture = readRepositoryFixture();
  const mutated = mutateJob(fixture, 'gate', block => block.replace('name: ci / gate', 'name: CI gate'));
  assert.match(validateWorkflowContracts(mutated).join('\n'), /gate name must remain exactly ci \/ gate/);
});

test('contract rejects restoration of the legacy Pages workflow', () => {
  const fixture = readRepositoryFixture();
  const mutated = {
    ...fixture,
    legacyDeployExists: true,
  };
  assert.match(validateWorkflowContracts(mutated).join('\n'), /legacy deploy-pages\.yml must be removed/);
});

module.exports = {
  extractJob,
  validateWorkflowContracts,
};
