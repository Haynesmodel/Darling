# CI and testing

## Supported runtime

Darling supports Node 24 LTS and npm 11. Select the checked-in runtime before installing:

```bash
nvm use 24
node --version
npm --version
npm ci
```

The repository uses `engine-strict=true`; an unsupported Node or npm major fails during installation. Run `nvm use 24` if that happens. The browser compilation target remains ES2022.
The package-manager contract is npm 11.18.0; CI installs that declared version before `npm ci` so the lockfile toolchain does not drift with Node patch releases.

## Local browser commands

- `npm run test:ui:chromium` runs the full Chromium suite against the Vite development server.
- `npm run test:ui:webkit` runs the focused six-case WebKit smoke suite.
- `npm run test:ui:preview:chromium` and `npm run test:ui:preview:webkit` use an existing `/Darling/` production build.
- `npm run test:ci` sets `CI=1`, runs quality checks, builds once, runs the Chromium production-preview project, and runs WebKit when the pinned Playwright release publishes a build for the local platform. When WebKit is unavailable, the command logs the detected platform and skips only that local lane; hosted CI always requires WebKit.

Install only the browsers needed for local work:

```bash
npx playwright install chromium webkit
```

CI, preview, and coverage modes use one worker. CI rejects committed focused tests and fails when a test passes only on retry.

## Coverage

`npm run test:coverage` is the only coverage entry point. It:

1. validates source assets;
2. captures Node coverage under c8;
3. starts Vite with `COLLECT_COVERAGE=1` and runs the Chromium project;
4. merges Node and browser Istanbul maps;
5. adds never-loaded authored source at 0%;
6. writes text, JSON, LCOV, and HTML reports; and
7. enforces `coverage.config.cjs`.

Normal development, production builds, Chromium previews, and WebKit never enable instrumentation or create raw coverage maps. Exact `COLLECT_COVERAGE=1` is required.
The instrumented pass omits the dedicated axe-only specs because they exercise the scanner rather than additional application paths; those checks remain required in the full production Chromium lane.

Coverage includes runtime JavaScript, TypeScript, and TSX in `js/`, `scripts/`, and `src/`. Generated schema validators, type-only declarations, tests, build output, and the generated chart vendor bundle are excluded for explicit generator/vendor reasons. Policy covers lines, statements, functions, and branches globally, per file, and for PR-authored files compared with the exact pull-request base SHA. An exception must identify its owner, reason, baseline thresholds, and expiry.

Generated reports are ignored under `coverage/`. CI retains compact reports for seven days and uploads raw maps only after failures.
After c8 converts Node's temporary V8 output to Istanbul JSON, the intermediate `node-v8` directory is removed. The merge step fails when retained raw Istanbul coverage exceeds 25,000,000 bytes and records both `rawBytes` and `rawByteLimit` in `coverage-meta.json`. Coverage overrides are grouped by behavior area and must be reduced to 15 or fewer before their October 22, 2026 expiry.

## CI artifact graph

`quality + build` owns dependency audit, quality/unit/data checks, and the workflow's only production build. It audits `dist/` before uploading `darling-dist-<commit SHA>` for one day, including `dist/.vite/manifest.json`.

After that job, three independent lanes run in parallel:

- full Chromium against the downloaded production artifact;
- instrumented Chromium coverage against a Vite coverage server; and
- focused WebKit smoke against the same downloaded production artifact.

`ci / gate` uses `if: always()` and requires every lane to conclude successfully. Branch protection requires only this stable context.

On pushes to `main`, two post-gate jobs continue the same artifact's provenance chain:

- `package_pages` needs both `quality_build` and `ci / gate`, downloads `darling-dist-<commit SHA>` with digest-mismatch enforcement, rejects an empty `index.html`, asset manifest, or hidden Vite manifest, and passes the unchanged `dist/` directory—including hidden files—to `actions/upload-pages-artifact`.
- `deploy_pages` needs only `package_pages`, checks through the GitHub API immediately before the deploy action that the workflow SHA is still the current `main` tip, and deploys the Pages transport artifact to the `github-pages` environment.

Pull requests run the complete quality gate but skip both Pages jobs. The workflow defaults to `contents: read`; only `deploy_pages` receives job-scoped `pages: write` and `id-token: write`. Workflow-level cancellation stops superseded CI runs, a production concurrency group serializes deploy calls, and the immediately preceding current-main check provides a second stale-run defense.

The stale-run defense is best effort, not an atomic compare-and-deploy guarantee. A newer `main` commit can land after the API check and before GitHub accepts the deployment request. Cancellation and production serialization narrow that race, and a run that is already stale at the check fails before calling `deploy-pages`, but GitHub's Pages action does not expose an expected-main-SHA precondition.

The SHA-named generic CI artifact and the GitHub Pages artifact have different roles. The generic artifact is the one-day, digest-verified build consumed by browser tests and packaging. `actions/upload-pages-artifact` only converts that downloaded directory into GitHub Pages' transport format; no post-test checkout, install, build, minification, or file rewrite is allowed.

The exact-artifact delivery path was integrated in [pull request #42](https://github.com/Haynesmodel/Darling/pull/42). Its contract is enforced by [`test/workflow-contracts.test.cjs`](../test/workflow-contracts.test.cjs), including mutation tests for gate dependencies, build duplication, digest enforcement, hidden-file preservation, permissions, main-only conditions, deploy-action cardinality, the stable gate name, and restoration of the legacy workflow.

## Pages failure triage and rollback

The prior successful Pages deployment remains live when a new run fails before replacement. Do not copy files into Pages manually or weaken `ci / gate`.

- If a quality or browser lane fails, fix the failing behavior and push a new commit. Packaging and deployment must remain blocked.
- If the generic artifact is missing or its digest fails, inspect the `quality_build` upload and artifact name. Rerun the workflow only when the same SHA is still the current `main` tip.
- If payload validation names a missing or empty file, fix the build or upload contents and produce a new tested artifact.
- If the current-main check reports different SHAs, leave the stale run failed and allow the newer `main` run to finish.
- If Pages packaging or deployment fails because of a transient GitHub incident, rerun only the current tip while its one-day generic artifact is retained.
- If the application or pipeline must roll back, revert the offending source or pipeline pull request through the normal protected-branch workflow. The revert creates a new current-main SHA, rebuilds and retests it, and deploys that newly verified artifact.

An old non-tip workflow detected by the pre-deploy check is not eligible for deployment, even if its artifact still exists. Because that check and the Pages deployment request are separate API operations, a newer `main` commit can still land in the narrow interval between them. Historical manual promotion is outside this pipeline's contract.

Before merging a Pages workflow change, verify that repository Pages publishing uses GitHub Actions, the `github-pages` environment exists and permits `main`, and no legacy workflow run is still in flight. After merge, verify the environment record, source SHA, artifact digest, deployed URL, production `/Darling/` route, representative interaction, asset requests, and console.

## Failure triage

Browser failures upload lane-, run-, and attempt-specific Playwright reports and test results. Coverage always uploads compact summaries and uploads HTML/raw maps on failure. Browser job summaries include the engine revision, result counts, duration, production artifact digest, and failure artifact names. Coverage summaries include all four metrics and threshold sets, source/exclusion/override and changed-file counts, raw bytes, and report-conversion duration.

For a browser failure, first inspect the Playwright trace and the static-server lifecycle log. Do not increase timeouts to hide a refused connection. For a coverage failure, read the scope/file/metric line in the gate output; add behavior-focused tests or review a narrow expiring override. For an artifact failure, confirm `index.html`, `assets/asset-manifest.json`, and `.vite/manifest.json` were present in the producer before rerunning.

Sleeper update triggers, permissions, inputs, and mutation behavior remain independent of the Pages delivery path.

## Stabilization and release evidence

- [July 23 accessibility release verification](accessibility-release-verification-2026-07-23.md) records automated coverage and the remaining device/assistive-technology gates.
- [Final-topology stabilization window](ci-stabilization-2026-07-23.md) defines the ten-run post-merge window and records which runs are eligible.
- [Post-implementation audit remediation](audit-remediation-2026-07-23.md) maps the audit workstreams to delivered evidence and explicit follow-ups.
