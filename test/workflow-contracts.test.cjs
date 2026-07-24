const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const workflowDirectory = path.join(root, '.github', 'workflows');
const legacyDeployPath = path.join(workflowDirectory, 'deploy-pages.yml');

const REQUIRED_ARTIFACT_NAME = 'darling-dist-${{ github.sha }}';
const MAIN_PUSH_CONDITION = "github.event_name == 'push' && github.ref == 'refs/heads/main'";
const ACTION_LINE = /^\s*uses:\s+([^\s#]+)(?:\s+#\s*(.+))?$/gm;
const SLEEPER_ALLOWLIST = [
  'assets/CurrentSeason.json',
  'assets/DerivedStats.json',
  'assets/H2H.json',
  'assets/SeasonSummary.draft.json',
  'assets/asset-manifest.json',
];

function extractJob(workflow, jobName) {
  const startPattern = new RegExp(`^  ${jobName}:\\s*$`, 'm');
  const match = startPattern.exec(workflow);
  if (!match) return '';

  const start = match.index;
  const rest = workflow.slice(start + match[0].length);
  const nextJob = /^  [a-zA-Z0-9_-]+:\s*$/m.exec(rest);
  return workflow.slice(start, nextJob ? start + match[0].length + nextJob.index : workflow.length);
}

function extractNamedStep(job, stepName) {
  const escapedName = stepName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const startPattern = new RegExp(`^      - name: ${escapedName}\\s*$`, 'm');
  const match = startPattern.exec(job);
  if (!match) return '';

  const start = match.index;
  const rest = job.slice(start + match[0].length);
  const nextStep = /^      - (?:name:|uses:|run:)/m.exec(rest);
  return job.slice(start, nextStep ? start + match[0].length + nextStep.index : job.length);
}

function countMatches(source, pattern) {
  return [...source.matchAll(pattern)].length;
}

function actionRef(job, action) {
  const match = job.match(new RegExp(`uses:\\s*${action.replace('/', '\\/')}@([0-9a-f]{40})`));
  return match ? match[1] : '';
}

function jobPermissions(job) {
  const match = job.match(/^    permissions:[ \t]*\n((?:^      [a-z-]+:[ \t]*[a-z]+[ \t]*\n?)+)/m);
  if (!match) return [];
  return match[1]
    .trim()
    .split('\n')
    .map(line => line.trim())
    .sort();
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

function validateSleeperWorkflow(source, errors) {
  const header = source.split(/^jobs:\s*$/m)[0] || '';
  const update = extractJob(source, 'update');
  const checkout = extractNamedStep(update, 'Check out trusted main branch');
  const sourceStep = extractNamedStep(update, 'Record trusted main source');
  const resolveSeason = extractNamedStep(update, 'Resolve target season');
  const generateCandidate = extractNamedStep(update, 'Generate candidate data');
  const summarizeCandidate = extractNamedStep(update, 'Summarize and safety-check candidate');
  const appToken = extractNamedStep(update, 'Mint repository-scoped automation token');
  const appScope = extractNamedStep(update, 'Verify App repository scope');
  const publish = extractNamedStep(update, 'Publish bot-owned season branch');
  const pullRequest = extractNamedStep(update, 'Create or refresh draft pull request');
  const recovery = extractNamedStep(update, 'Close recovered failure issue');
  const artifact = extractNamedStep(update, 'Upload candidate data on failure');

  if (!/workflow_dispatch:[\s\S]*season:[\s\S]*validate_only:/.test(header)
    || !/cron:\s*'0 13 \* \* 1'/.test(header)) {
    errors.push('SLEEPER-FUNC-001: Sleeper dispatch inputs and Monday schedule must remain stable');
  }
  if (!/^permissions:\s*\n\s{2}contents:\s*read\s*\n\s{2}issues:\s*write\s*$/m.test(header)
    || /^\s+contents:\s*write\s*$/m.test(source)) {
    errors.push('SLEEPER-SEC-001: default permissions must be exactly contents read and issues write');
  }
  if (!/group:\s*update-sleeper-main/.test(header) || !/cancel-in-progress:\s*false/.test(header)) {
    errors.push('SLEEPER-REL-001: Sleeper runs must use the static non-cancelling concurrency group');
  }
  if (!update || !/if:\s*github\.ref == 'refs\/heads\/main'/.test(update)) {
    errors.push('SLEEPER-FUNC-002: update job must run only for refs/heads/main');
  }
  if (!checkout
    || !/uses:\s*actions\/checkout@[0-9a-f]{40}\s+#\s*v\d+\.\d+\.\d+/.test(checkout)
    || !/ref:\s*main/.test(checkout)
    || !/fetch-depth:\s*0/.test(checkout)
    || !/persist-credentials:\s*false/.test(checkout)) {
    errors.push('SLEEPER-SEC-002: checkout must pin trusted main with full history and no persisted credentials');
  }
  if (!sourceStep.includes('sha=$(git rev-parse HEAD)')
    || !update.includes('--base-sha "${{ steps.source.outputs.sha }}"')
    || !update.includes('--candidate-sha "${{ steps.source.outputs.sha }}"')) {
    errors.push('SLEEPER-OBS-001: summaries must use the exact checked-out main SHA');
  }
  const leagueSecret = 'LEAGUE_ID: ${{ secrets.SLEEPER_LEAGUE_ID }}';
  const jobHeader = update.split(/^\s{4}steps:\s*$/m)[0] || '';
  if (jobHeader.includes(leagueSecret)
    || !resolveSeason.includes(leagueSecret)
    || !generateCandidate.includes(leagueSecret)
    || !summarizeCandidate.includes(leagueSecret)
    || countMatches(update, /LEAGUE_ID:\s*\$\{\{\s*secrets\.SLEEPER_LEAGUE_ID\s*\}\}/g) !== 3) {
    errors.push('SLEEPER-SEC-008: league ID secret must be scoped only to resolution, generation, and safety validation');
  }

  for (const stepName of [
    'Mint repository-scoped automation token',
    'Verify App repository scope',
    'Publish bot-owned season branch',
    'Create or refresh draft pull request',
  ]) {
    const step = extractNamedStep(update, stepName);
    if (!step.includes("steps.resolve.outputs.validate_only_flag == '0'")
      || !step.includes("steps.changes.outputs.changed == 'true'")) {
      errors.push(`SLEEPER-FUNC-003: ${stepName} must be unreachable for validation-only and no-change runs`);
    }
  }

  const expectedAppAction = 'actions/create-github-app-token@bcd2ba49218906704ab6c1aa796996da409d3eb1 # v3.2.0';
  if (!appToken.includes(expectedAppAction)
    || !appToken.includes('client-id: ${{ vars.DARLING_AUTOMATION_CLIENT_ID }}')
    || !appToken.includes('private-key: ${{ secrets.DARLING_AUTOMATION_PRIVATE_KEY }}')
    || !/permission-contents:\s*write/.test(appToken)
    || !/permission-pull-requests:\s*write/.test(appToken)) {
    errors.push('SLEEPER-SEC-004: App token must use the pinned action, Client ID/private key, and narrow write permissions');
  }
  if (/\bapp-id:|\bowner:|\brepositories:|permission-(?:issues|actions|workflows|administration):|skip-token-revoke:/.test(appToken)) {
    errors.push('SLEEPER-SEC-005: App token inputs must not widen scope or disable revocation');
  }
  if (update.indexOf('node scripts/summarize_sleeper_update.cjs') === -1
    || update.indexOf('node scripts/summarize_sleeper_update.cjs') > update.indexOf('actions/create-github-app-token@')) {
    errors.push('SLEEPER-SEC-003: validation and summary safety must finish before App authentication');
  }
  if (!appScope.includes('gh api installation/repositories')
    || !appScope.includes('names.length !== 1')
    || !appScope.includes('names[0] !== process.env.EXPECTED_REPOSITORY')
    || !appScope.includes('DEFAULT_BRANCH')
    || !appScope.includes('APP_SLUG')) {
    errors.push('SLEEPER-SEC-006: App preflight must verify exact repository scope, main, and a nonempty App slug');
  }
  if (/gh auth setup-git|https:\/\/[^/\s]+@github\.com/.test(update)) {
    errors.push('SLEEPER-SEC-007: App credentials must not be persisted in Git configuration or remote URLs');
  }

  const allowlistMatch = update.match(/const allowed = new Set\(\[([\s\S]*?)\]\);/);
  const observedAllowlist = allowlistMatch
    ? [...allowlistMatch[1].matchAll(/'([^']+)'/g)].map(match => match[1]).sort()
    : [];
  if (JSON.stringify(observedAllowlist) !== JSON.stringify(SLEEPER_ALLOWLIST)) {
    errors.push('SLEEPER-DATA-001: publication allowlist must contain exactly the five reviewed data files');
  }
  if (!update.includes("if (status[1] !== ' ')")
    || !update.includes('Refusing an allowed path that is not fully staged')) {
    errors.push('SLEEPER-DATA-001: every allowed changed path must be fully staged before publication');
  }
  for (const command of [
    'npm run generate:derived',
    'npm run generate:manifest',
    'npm run check:data-generated',
    'npm run test:assets',
  ]) {
    if (!update.includes(command)) {
      errors.push(`SLEEPER-DATA-002: workflow must run ${command}`);
    }
  }
  if (!update.includes('--base-sha "${{ steps.source.outputs.sha }}"')
    || !update.includes('--candidate-sha "${{ steps.source.outputs.sha }}"')
    || !update.includes('--changed-files-file')) {
    errors.push('SLEEPER-OBS-002: candidate summary must include source SHAs and the sorted changed-file input');
  }

  if (!publish.includes('BRANCH="automation/sleeper-${SEASON}"')
    || !publish.includes('prs.length > 1')
    || !publish.includes("pr.baseRefName !== 'main'")
    || !publish.includes('pr.author?.login !== process.env.EXPECTED_AUTHOR')) {
    errors.push('SLEEPER-REL-002: branch publication must refuse ambiguous, wrong-base, or foreign PR state');
  }
  if (!publish.includes('REMOTE_AUTHOR')
    || !publish.includes('REMOTE_AUTHOR}" != "${BOT_LOGIN}')
    || !publish.includes('LEASE="${REMOTE_REF}:${REMOTE_SHA}"')
    || !publish.includes('LEASE="${REMOTE_REF}:"')
    || !publish.includes('git push --force-with-lease="${LEASE}" origin "HEAD:${REMOTE_REF}"')
    || /git push\s+--force(?:\s|$)/.test(publish)) {
    errors.push('SLEEPER-REL-004: branch publication must verify bot ownership and use an exact force-with-lease');
  }
  if (!publish.includes('Update Sleeper data for season ${SEASON}')
    || !publish.includes('users/${BOT_LOGIN}')
    || !publish.includes('git config --local user.name')) {
    errors.push('SLEEPER-REL-006: bot commit identity and message must be derived from the App');
  }
  if (/git push[^\n]*(?:github\.ref_name|refs\/heads\/main|HEAD:main)/.test(update)) {
    errors.push('SLEEPER-ARCH-001: Sleeper workflow must never push to main or the triggering ref');
  }

  if (!pullRequest.includes('--draft')
    || !pullRequest.includes('--base main')
    || !pullRequest.includes('--label data-pipeline')
    || !pullRequest.includes('--label automated')
    || !pullRequest.includes('gh pr ready "${PR_NUMBER}" --repo "${GITHUB_REPOSITORY}" --undo')
    || !pullRequest.includes('TITLE="[automation] Update Sleeper data for season ${SEASON}"')) {
    errors.push('SLEEPER-FUNC-006: automation PRs must use the exact draft title, base, labels, and draft reset');
  }
  if (/gh pr merge|--auto-merge|gh pr review|gh pr ready(?![^\n]*--undo)/.test(update)) {
    errors.push('SLEEPER-FUNC-008: workflow must not merge, approve, enable auto-merge, or mark a PR ready');
  }

  const phases = [
    'setup',
    'season resolution',
    'Sleeper generation',
    'local promotion/regeneration',
    'validation',
    'change safety',
    'summary',
    'App authentication',
    'branch publication',
    'PR create/update',
  ];
  if (phases.some(phase => !update.includes(phase))) {
    errors.push('SLEEPER-REL-009: failure reporting must retain every required workflow phase');
  }
  if (!artifact.includes("steps.resolve.outputs.season || 'unknown'")
    || !artifact.includes('${{ github.run_id }}-${{ github.run_attempt }}')
    || !artifact.includes('retention-days: 7')
    || artifact.includes('assets/CurrentSeason.updated.json')) {
    errors.push('SLEEPER-REL-010: failure artifact must be unique, seven-day, and omit the credential-valued CurrentSeason candidate');
  }
  if (!recovery.includes("steps.resolve.outputs.validate_only_flag == '0'")
    || !recovery.includes("title = 'Weekly Sleeper update failed'")
    || !recovery.includes("state_reason: 'completed'")
    || !recovery.includes('matches.length > 1')) {
    errors.push('SLEEPER-REL-012: only successful full runs may close the exact unambiguous failure issue');
  }
}

function validateWorkflowContracts({ workflows, legacyDeployExists }) {
  const errors = [];
  const ci = workflows['ci.yml'] || '';
  const sleeper = workflows['update-sleeper.yml'] || '';
  const allWorkflowSource = Object.values(workflows).join('\n');
  const workflowHeader = ci.split(/^jobs:\s*$/m)[0] || '';
  const qualityBuild = extractJob(ci, 'quality_build');
  const chromium = extractJob(ci, 'chromium');
  const webkit = extractJob(ci, 'webkit_smoke');
  const gate = extractJob(ci, 'gate');
  const packagePages = extractJob(ci, 'package_pages');
  const deployPages = extractJob(ci, 'deploy_pages');
  const uploadPagesStep = extractNamedStep(packagePages, 'Upload Pages artifact');

  if (legacyDeployExists) {
    errors.push('CI-003: legacy deploy-pages.yml must be removed');
  }
  if (!sleeper) {
    errors.push('SLEEPER-ARCH-001: update-sleeper.yml is missing');
  } else {
    validateSleeperWorkflow(sleeper, errors);
  }

  const buildCommands = countMatches(allWorkflowSource, /\bnpm run build(?=\s|$)/g);
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

  const downloadActionRefs = [
    actionRef(chromium, 'actions/download-artifact'),
    actionRef(webkit, 'actions/download-artifact'),
    actionRef(packagePages, 'actions/download-artifact'),
  ];
  if (downloadActionRefs.some(ref => !ref) || new Set(downloadActionRefs).size !== 1) {
    errors.push('ARCH-002: Chromium, WebKit, and package_pages must use the same pinned download-artifact revision');
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
    if (JSON.stringify(jobPermissions(packagePages)) !== JSON.stringify(['contents: read'])) {
      errors.push('SEC-001: package_pages permissions must be exactly contents: read');
    }
    if (!uploadPagesStep.includes('uses: actions/upload-pages-artifact@')) {
      errors.push('ARCH-002: package_pages must upload dist with upload-pages-artifact');
    }
    if (!/uses:\s*actions\/upload-pages-artifact@[0-9a-f]{40}\s+#\s*v?\d+\.\d+\.\d+/.test(uploadPagesStep)) {
      errors.push('CI-005: package_pages must pin upload-pages-artifact with a readable version');
    }
    if (!/path:\s*dist\//.test(uploadPagesStep)) {
      errors.push('ARCH-002: package_pages must upload dist/');
    }
    if (!/include-hidden-files:\s*true/.test(uploadPagesStep)) {
      errors.push('ARCH-002: package_pages must preserve hidden files in the Pages artifact');
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
    if (JSON.stringify(jobPermissions(deployPages)) !== JSON.stringify([
      'contents: read',
      'id-token: write',
      'pages: write',
    ])) {
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
    if (!/if\s*\(\s*currentMainSha\s*!==\s*context\.sha\s*\)/.test(deployPages)
      || !/`[^`]*\$\{currentMainSha\}[^`]*\$\{context\.sha\}[^`]*`/s.test(deployPages)) {
      errors.push('SEC-003: stale-run check must compare and report both the current main SHA and run SHA');
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
  if (!/run:\s*node scripts\/check_ci_results\.cjs/.test(gate)) {
    errors.push('ARCH-003: gate must retain the aggregate CI evaluator');
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

function mutateSleeper(fixture, mutate) {
  return {
    legacyDeployExists: fixture.legacyDeployExists,
    workflows: {
      ...fixture.workflows,
      'update-sleeper.yml': mutate(fixture.workflows['update-sleeper.yml']),
    },
  };
}

test('repository workflows preserve the exact tested-artifact deployment contract', () => {
  const fixture = readRepositoryFixture();
  const packagePages = extractJob(fixture.workflows['ci.yml'], 'package_pages');
  const uploadPagesStep = extractNamedStep(packagePages, 'Upload Pages artifact');

  assert.match(uploadPagesStep, /include-hidden-files:\s*true/);
  assertContracts(fixture);
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

test('contract rejects excluding the hidden Vite manifest from the Pages artifact', () => {
  const fixture = readRepositoryFixture();
  const mutated = mutateJob(fixture, 'package_pages', block => (
    block.replace('          include-hidden-files: true\n', '')
  ));
  assert.match(validateWorkflowContracts(mutated).join('\n'), /package_pages must preserve hidden files/);
});

test('contract rejects a different download action revision for Pages packaging', () => {
  const fixture = readRepositoryFixture();
  const mutated = mutateJob(fixture, 'package_pages', block => (
    block.replace(
      /actions\/download-artifact@[0-9a-f]{40}/,
      'actions/download-artifact@aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    )
  ));
  assert.match(validateWorkflowContracts(mutated).join('\n'), /must use the same pinned download-artifact revision/);
});

test('contract rejects broad workflow-level Pages permissions', () => {
  const fixture = readRepositoryFixture();
  const mutated = mutateCi(fixture, ci => ci.replace(
    'permissions:\n  contents: read',
    'permissions:\n  contents: read\n  pages: write\n  id-token: write',
  ));
  assert.match(validateWorkflowContracts(mutated).join('\n'), /must not be workflow-scoped/);
});

test('contract rejects job-level permission escalation during Pages packaging', () => {
  const fixture = readRepositoryFixture();
  const mutated = mutateJob(fixture, 'package_pages', block => block.replace(
    '    permissions:\n      contents: read',
    '    permissions:\n      contents: write',
  ));
  assert.match(validateWorkflowContracts(mutated).join('\n'), /package_pages permissions must be exactly contents: read/);
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

test('contract rejects removal of the aggregate gate evaluator', () => {
  const fixture = readRepositoryFixture();
  const mutated = mutateJob(fixture, 'gate', block => block.replace(
    'run: node scripts/check_ci_results.cjs',
    'run: echo gate passed',
  ));
  assert.match(validateWorkflowContracts(mutated).join('\n'), /gate must retain the aggregate CI evaluator/);
});

test('contract rejects an inverted stale-main comparison', () => {
  const fixture = readRepositoryFixture();
  const mutated = mutateJob(fixture, 'deploy_pages', block => block.replace(
    'if (currentMainSha !== context.sha)',
    'if (currentMainSha === context.sha)',
  ));
  assert.match(validateWorkflowContracts(mutated).join('\n'), /stale-run check must compare and report both/);
});

test('Sleeper contract rejects default-token writes, untrusted refs, and unsafe concurrency', () => {
  const fixture = readRepositoryFixture();
  const cases = [
    [
      source => source.replace('permissions:\n  contents: read\n  issues: write', 'permissions:\n  contents: write\n  issues: write'),
      /default permissions must be exactly contents read and issues write/,
    ],
    [
      source => source.replace("    if: github.ref == 'refs/heads/main'\n", ''),
      /update job must run only for refs\/heads\/main/,
    ],
    [
      source => source.replace('          persist-credentials: false\n', ''),
      /checkout must pin trusted main/,
    ],
    [
      source => source.replace('sha=$(git rev-parse HEAD)', 'sha=${GITHUB_SHA}'),
      /exact checked-out main SHA/,
    ],
    [
      source => source.replace(
        "      REQUESTED_SEASON: ${{ github.event.inputs.season }}",
        "      LEAGUE_ID: ${{ secrets.SLEEPER_LEAGUE_ID }}\n      REQUESTED_SEASON: ${{ github.event.inputs.season }}",
      ),
      /league ID secret must be scoped only/,
    ],
    [
      source => source.replace('group: update-sleeper-main', 'group: update-sleeper-${{ github.ref }}'),
      /static non-cancelling concurrency group/,
    ],
  ];
  for (const [mutate, expected] of cases) {
    const mutated = mutateSleeper(fixture, mutate);
    assert.match(validateWorkflowContracts(mutated).join('\n'), expected);
  }
});

test('Sleeper contract rejects App token regressions and widened scope', () => {
  const fixture = readRepositoryFixture();
  const cases = [
    [
      source => source.replace(
        'actions/create-github-app-token@bcd2ba49218906704ab6c1aa796996da409d3eb1 # v3.2.0',
        'actions/create-github-app-token@aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa # v3.2.0',
      ),
      /App token must use the pinned action/,
    ],
    [
      source => source.replace('client-id: ${{ vars.DARLING_AUTOMATION_CLIENT_ID }}', 'app-id: ${{ vars.DARLING_AUTOMATION_APP_ID }}'),
      /App token inputs must not widen scope|App token must use the pinned action/,
    ],
    [
      source => source.replace('          permission-contents: write\n', '          owner: ${{ github.repository_owner }}\n          permission-contents: write\n'),
      /App token inputs must not widen scope/,
    ],
    [
      source => source.replace('          permission-pull-requests: write\n', '          permission-pull-requests: write\n          skip-token-revoke: true\n'),
      /disable revocation/,
    ],
  ];
  for (const [mutate, expected] of cases) {
    const mutated = mutateSleeper(fixture, mutate);
    assert.match(validateWorkflowContracts(mutated).join('\n'), expected);
  }
});

test('Sleeper contract rejects token access from validation-only or no-change paths', () => {
  const fixture = readRepositoryFixture();
  const mutated = mutateSleeper(fixture, source => source.replace(
    "      - name: Mint repository-scoped automation token\n        if: steps.resolve.outputs.validate_only_flag == '0' && steps.changes.outputs.changed == 'true'",
    "      - name: Mint repository-scoped automation token\n        if: always()",
  ));
  assert.match(
    validateWorkflowContracts(mutated).join('\n'),
    /must be unreachable for validation-only and no-change runs/,
  );
});

test('Sleeper contract rejects token creation before summary safety', () => {
  const fixture = readRepositoryFixture();
  const mutated = mutateSleeper(fixture, source => source.replace(
    '          node scripts/summarize_sleeper_update.cjs \\\n',
    '          node scripts/unsafe_summary.cjs \\\n',
  ));
  assert.match(
    validateWorkflowContracts(mutated).join('\n'),
    /validation and summary safety must finish before App authentication/,
  );
});

test('Sleeper contract rejects publication allowlist expansion', () => {
  const fixture = readRepositoryFixture();
  const mutated = mutateSleeper(fixture, source => source.replace(
    "          const allowed = new Set([\n            'assets/H2H.json',",
    "          const allowed = new Set([\n            'assets/SeasonSummary.json',\n            'assets/H2H.json',",
  ));
  assert.match(
    validateWorkflowContracts(mutated).join('\n'),
    /publication allowlist must contain exactly the five reviewed data files/,
  );
});

test('Sleeper contract rejects removal of the fully-staged bundle guard', () => {
  const fixture = readRepositoryFixture();
  const mutated = mutateSleeper(fixture, source => source.replace(
    "            if (status[1] !== ' ') {",
    '            if (false) {',
  ));
  assert.match(
    validateWorkflowContracts(mutated).join('\n'),
    /every allowed changed path must be fully staged/,
  );
});

test('Sleeper contract rejects direct pushes, plain force, and branch-name drift', () => {
  const fixture = readRepositoryFixture();
  const cases = [
    [
      source => source.replace(
        'git push --force-with-lease="${LEASE}" origin "HEAD:${REMOTE_REF}"',
        'git push origin HEAD:main',
      ),
      /never push to main|exact force-with-lease/,
    ],
    [
      source => source.replace(
        'git push --force-with-lease="${LEASE}" origin "HEAD:${REMOTE_REF}"',
        'git push --force origin "HEAD:${REMOTE_REF}"',
      ),
      /exact force-with-lease/,
    ],
    [
      source => source.replace('BRANCH="automation/sleeper-${SEASON}"', 'BRANCH="updates/sleeper-${SEASON}"'),
      /branch publication must refuse ambiguous|bot ownership and use an exact force-with-lease/,
    ],
  ];
  for (const [mutate, expected] of cases) {
    const mutated = mutateSleeper(fixture, mutate);
    assert.match(validateWorkflowContracts(mutated).join('\n'), expected);
  }
});

test('Sleeper contract rejects removal of PR ambiguity and ownership checks', () => {
  const fixture = readRepositoryFixture();
  const cases = [
    [
      source => source.replace('if (prs.length > 1) throw new Error', 'if (false) throw new Error'),
      /refuse ambiguous, wrong-base, or foreign PR state/,
    ],
    [
      source => source.replace('pr.author?.login !== process.env.EXPECTED_AUTHOR', 'false'),
      /refuse ambiguous, wrong-base, or foreign PR state/,
    ],
  ];
  for (const [mutate, expected] of cases) {
    const mutated = mutateSleeper(fixture, mutate);
    assert.match(validateWorkflowContracts(mutated).join('\n'), expected);
  }
});

test('Sleeper contract rejects non-draft, merge, approval, auto-merge, and ready paths', () => {
  const fixture = readRepositoryFixture();
  const cases = [
    [
      source => source.replace('              --draft \\\n', ''),
      /automation PRs must use the exact draft title/,
    ],
    [
      source => source.replace('gh pr ready "${PR_NUMBER}" --repo "${GITHUB_REPOSITORY}" --undo', 'gh pr ready "${PR_NUMBER}"'),
      /must not merge, approve, enable auto-merge, or mark a PR ready/,
    ],
    [
      source => source.replace('          echo "Draft automation pull request', '          gh pr merge --auto-merge "${PR_NUMBER}"\n          echo "Draft automation pull request'),
      /must not merge, approve, enable auto-merge, or mark a PR ready/,
    ],
  ];
  for (const [mutate, expected] of cases) {
    const mutated = mutateSleeper(fixture, mutate);
    assert.match(validateWorkflowContracts(mutated).join('\n'), expected);
  }
});

test('Sleeper contract rejects failure-artifact and recovery regressions', () => {
  const fixture = readRepositoryFixture();
  const cases = [
    [
      source => source.replace('-${{ github.run_id }}-${{ github.run_attempt }}', ''),
      /failure artifact must be unique/,
    ],
    [
      source => source.replace(
        "if: success() && steps.resolve.outputs.validate_only_flag == '0'",
        'if: success()',
      ),
      /only successful full runs may close/,
    ],
    [
      source => source.replace(
        '            assets/H2H.updated.json\n',
        '            assets/H2H.updated.json\n            assets/CurrentSeason.updated.json\n',
      ),
      /omit the credential-valued CurrentSeason candidate/,
    ],
  ];
  for (const [mutate, expected] of cases) {
    const mutated = mutateSleeper(fixture, mutate);
    assert.match(validateWorkflowContracts(mutated).join('\n'), expected);
  }
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
  extractNamedStep,
  validateWorkflowContracts,
};
