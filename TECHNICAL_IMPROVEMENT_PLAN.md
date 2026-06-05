# Technical Improvement Plan

Status: complete.

This plan assumes PR #9 is merged after fixing the review findings:
- all-teams streak tiles render real dates instead of `[object Object]`
- coverage enforcement measures source files instead of test files

Work through the phases in order. Each phase should end with the listed verification passing before moving to the next phase.

## Phase 0. Confirm the merged baseline

Status: complete.

Purpose: make sure the follow-on work starts from a trustworthy baseline.

Implementation:
- pull the merged `main`
- run the full test suite from a clean checkout
- confirm the all-teams fun facts view does not render `[object Object]`
- confirm `coverage/coverage-summary.json` includes source files such as `js/*.js` and relevant `scripts/*.cjs`, not only files under `test/`
- confirm `node_modules/`, `coverage/`, `test-results/`, and local metadata stay untracked after test runs

Acceptance criteria:
- `npm run test:ci` passes
- `git status --short` is clean after tests
- coverage output reflects source coverage

Verification:
- `npm ci`
- `npm run test:ci`
- inspect `coverage/coverage-summary.json`

## Phase 1. Add GitHub Actions CI

Status: complete.

Purpose: make tests block merges independently of Vercel deploy success.

Implementation:
- add `.github/workflows/ci.yml`
- run on pull requests and pushes to `main`
- install dependencies with `npm ci`
- install Playwright browsers with `npx playwright install --with-deps`
- run `npm run test:ci`
- upload Playwright traces/reports only on failure
- document the expected required check name in `README.md`

Acceptance criteria:
- every PR gets a GitHub Actions test status
- a failing data, script, coverage, hygiene, or UI test fails CI
- Vercel remains a deploy/preview check, not the only signal

Verification:
- open a test PR and confirm the CI workflow runs
- intentionally fail a local branch test once, if practical, to verify the workflow reports failure

## Phase 2. Lock the runtime contract

Status: complete.

Purpose: make local, CI, and deployment environments converge on the same assumptions.

Implementation:
- add `engines.node` to `package.json`
- add a `.nvmrc` or `.node-version` if that matches local workflow
- update `README.md` with the supported Node version
- document local serving through the static server, not `file://`
- consider adding an npm script such as `serve` for `node scripts/serve_static.cjs 8000 127.0.0.1`
- ensure CI uses the same Node major version

Acceptance criteria:
- new contributors know which Node version to use
- local instructions match the ES module browser entrypoint
- CI and local commands use the same test and serve paths

Verification:
- `npm ci`
- `npm run test:ci`
- `npm run serve` if added

## Phase 3. Centralize asset schema validation

Status: complete.

Purpose: make asset shape changes explicit and catch bad generated data before it reaches the app.

Implementation:
- decide whether to keep hand-written validators or move to JSON Schema
- create one canonical validation entrypoint for `H2H.json`, `SeasonSummary.json`, and `Rivalries.json`
- add a script such as `npm run test:assets` or include it in `test:data`
- reuse the same validation from update/import scripts where practical
- validate generated `assets/H2H.updated.json` before it is copied into `assets/H2H.json`
- add focused tests for optional fields, null handling, and bad rivalry shapes

Acceptance criteria:
- the browser loader, tests, and update workflow agree on the data contract
- invalid generated assets fail fast with row-level error messages
- required and optional asset fields are documented

Verification:
- `npm run test:data`
- run the asset validation script directly
- run `bash -n scripts/update_2025.sh`
- run `python3 -m py_compile scripts/transactions.py scripts/sleeper_to_h2h.py`

## Phase 4. Broaden regression tests around refactor boundaries

Status: complete.

Purpose: protect behavior most likely to regress while continuing to split `app.js`.

Implementation:
- add direct tests for all-teams fun facts and summary text, including no `[object Object]`
- add tests for switching between all-teams and single-team modes with active filters
- add tests for URL restoration when opponent filters contain spaces or special characters
- add tests for empty-result filter states
- add tests for export behavior in all-teams mode
- add Playwright assertions for absence of browser console errors on representative navigation/filter flows

Acceptance criteria:
- tests assert actual rendered text for high-value summary tiles
- state transitions are covered without relying only on row counts
- edge cases fail with targeted test names

Verification:
- `npm run test:data`
- `npm run test:ui`
- `npm run test:ci`

## Phase 5. Extract app state and controller logic

Status: complete.

Purpose: reduce the size and responsibility of `js/app.js` without changing UI behavior.

Implementation:
- identify state currently held in `js/app.js`: selected team, selected facets, universes, caches, metrics, effects
- create a small state/controller module for facet state and cache invalidation
- keep DOM reads and writes in `app.js` or a thin DOM adapter
- expose pure functions for state transitions such as team change, facet change, reset, and URL restore
- move render signatures into named helpers so cache keys are easier to audit
- add unit tests for the controller/state module before replacing app wiring

Acceptance criteria:
- `js/app.js` becomes mostly bootstrapping, event wiring, and render orchestration
- state transitions can be tested without a browser
- no visible behavior changes

Verification:
- `npm run test:data`
- `npm run test:ui`
- manually smoke test team switch, URL restore, clear filters, CSV export, and all-teams mode

## Phase 6. Make rendering view models explicit

Status: complete.

Purpose: prevent template bugs caused by passing raw domain objects directly into HTML builders.

Implementation:
- for complex sections, add view-model builders that return display-ready strings/numbers
- keep HTML builders focused on escaping and markup
- normalize streaks, records, dates, and labels before interpolation
- add tests for each view model with representative real-data-like objects
- prefer one escape boundary per renderer to avoid missed fields or double escaping

Acceptance criteria:
- renderers do not stringify arbitrary objects
- display formatting logic is testable without DOM setup
- data-driven text remains escaped

Verification:
- `npm run test:data`
- targeted tests for league and history renderers

## Phase 7. Improve update workflow reliability

Status: complete.

Purpose: make season updates repeatable and reduce manual cleanup.

Implementation:
- add a documented update checklist to `README.md`
- add a dry-run mode or validation-only mode to update scripts if useful
- make generated output paths consistent and ignored by default
- validate generated rows before writing final assets
- add script tests for update helpers that can run without network access
- keep live Sleeper/API calls behind explicit commands and environment variables

Acceptance criteria:
- a season update has a clear command sequence
- generated files are either committed intentionally or ignored automatically
- update failures point to a concrete season/week/team mapping problem

Verification:
- `npm run test:scripts`
- `bash -n scripts/update_2025.sh`
- `python3 -m py_compile scripts/transactions.py scripts/sleeper_to_h2h.py`

## Phase 8. Cleanup and docs pass

Status: complete.

Purpose: keep the repo understandable after the technical work lands.

Implementation:
- update `README.md` for CI, Node version, local serving, testing, and update flow
- update `CHANGELOG.md` per completed phase
- remove stale notes from old plans if they no longer apply
- ensure generated artifacts remain ignored
- run whitespace and diff checks before merge

Acceptance criteria:
- docs describe the current repo
- there are no stale commands or obsolete test references
- local test runs do not create tracked changes

Verification:
- `npm run test:ci`
- `git diff --check`
- `git status --short`
