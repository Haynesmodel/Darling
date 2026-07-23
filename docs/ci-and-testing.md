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

`ci / gate` uses `if: always()` and requires every lane to conclude successfully. Branch protection should transition to that single stable context only after it exists on the default branch. The standalone Pages workflow intentionally continues to build independently until the deferred deployment-gating project is resumed.

## Delivery and rollback shape

The runtime, dependency, coverage, CI-topology, and WebKit phases were delivered in one draft pull request instead of four sequential pull requests. These contracts share the same runtime and lockfile, and validating the corrected coverage baseline and one-build artifact graph requires the complete topology. Keeping them together provides one atomic acceptance run while the draft state preserves a review boundary before merge.

The commit history remains phase-oriented, so a regression can be isolated and reverted by concern during review. Before merge, the whole program can be rolled back by closing the draft branch; after merge, revert the merge commit for an atomic rollback or revert an individual follow-up commit when its change is independent. Pages artifact consumption remains deferred, so this delivery shape does not expand the deployment rollback surface.

## Failure triage

Browser failures upload lane-, run-, and attempt-specific Playwright reports and test results. Coverage always uploads compact summaries and uploads HTML/raw maps on failure. Browser job summaries include the engine revision, result counts, duration, production artifact digest, and failure artifact names. Coverage summaries include all four metrics and threshold sets, source/exclusion/override and changed-file counts, raw bytes, and report-conversion duration.

For a browser failure, first inspect the Playwright trace and the static-server lifecycle log. Do not increase timeouts to hide a refused connection. For a coverage failure, read the scope/file/metric line in the gate output; add behavior-focused tests or review a narrow expiring override. For an artifact failure, confirm `index.html`, `assets/asset-manifest.json`, and `.vite/manifest.json` were present in the producer before rerunning.

Pages deployment and Sleeper update triggers, permissions, inputs, and mutation behavior are deliberately unchanged by this CI program.

## Stabilization and release evidence

- [July 23 accessibility release verification](accessibility-release-verification-2026-07-23.md) records automated coverage and the remaining device/assistive-technology gates.
- [Final-topology stabilization window](ci-stabilization-2026-07-23.md) defines the ten-run post-merge window and records which runs are eligible.
- [Post-implementation audit remediation](audit-remediation-2026-07-23.md) maps the audit workstreams to delivered evidence and explicit follow-ups.
