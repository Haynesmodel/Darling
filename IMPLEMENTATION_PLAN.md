# Implementation Plan

Status: complete.

This plan records the technical improvement pass completed for this repo.
Each phase was verified before moving to the next one.

## 1. Add browser coverage first

Status: complete.

Purpose: create an automated guardrail for the current UI before moving code around.

Implementation:
- add `@playwright/test` as a dev dependency
- add `playwright.config.js`
- use Playwright's `webServer` option to start the static site during UI tests
- add `test/ui/app.spec.js`
- add package scripts:
  - `test:data` for the existing Node data tests
  - `test:coverage` for the existing V8 coverage flow
  - `test:ui` for Playwright
  - `test:ci` for coverage and browser tests
- keep `npm test` as the short alias for `npm run test:data`
- update `.github/workflows/ci.yml` to install Playwright browsers before `npm run test:ci`
- add `.gitignore` entries for generated output such as `coverage/`, `test-results/`, and `playwright-report/`
- remove already-tracked generated coverage files from the index so future test runs do not create normal working-tree churn

Initial UI tests:
- page load: `index.html` loads from a local static server
- success state: `#appStatus` becomes hidden after JSON fetches complete
- render state: season recap, week-by-week, and all-games tables render expected row counts
- filter state: changing team or season filters updates visible rows
- failure state: a mocked JSON failure displays the error banner instead of a blank page

Acceptance criteria:
- CI runs the browser tests automatically
- a broken render path fails the build
- manual smoke checks are optional confirmation, not the only UI coverage
- `git status --short` stays clean after a local `npm run test:ci`

Verification:
- `npm run test:data`
- `npm run test:ui`
- `npm run test:ci`

## 2. Prepare `js/app.js` for extraction

Status: complete for the first extraction pass; keep using this phase's rules for later moves.

Purpose: reduce risk before splitting the large file.

Implementation:
- identify the current globals used across files:
  - helpers exposed by `js/core-helpers.js`
  - helpers exposed by `js/data-helpers.js`
  - helpers exposed by `js/stats-helpers.js`
  - helpers exposed by `js/render-helpers.js`
  - helpers exposed by `js/facet-helpers.js`
  - helpers exposed by `js/state-helpers.js`
  - `window.triggerGroupEgg`
  - `window.setGroupBackdrop`
- document the intended module boundary for each cluster before moving code
- move only pure functions first, leaving DOM behavior unchanged
- avoid changing `index.html` to `type="module"` until the extraction path is clear

Recommended first extraction targets:
- URL state parsing and serialization: done in `js/state-helpers.js`
- normalization helpers such as game type and round handling: done in `js/core-helpers.js`
- filter predicate helpers: started in `js/state-helpers.js`
- aggregate/stat helpers that do not touch the DOM: started in `js/core-helpers.js`
- facet option generation: done in `js/facet-helpers.js`

Acceptance criteria:
- no user-facing behavior changes
- browser tests from phase 1 still pass
- extracted modules can be tested directly from Node

Verification:
- `npm run test:data`
- `npm run test:ui`

## 3. Split `js/app.js` by concern

Status: complete for the current non-bundled split.

Purpose: make the browser code navigable without adding a bundler.

Target structure:
- `js/data-helpers.js` for fetch/load/normalize behavior
- `js/state-helpers.js` for URL state parsing, URL serialization, selected filter application, and DOM checkbox restoration
- `js/facet-helpers.js` for option generation
- `js/stats-helpers.js` for derived aggregates and scoring helpers
- `js/render-helpers.js` for low-risk rendering utilities, status/header helpers, and generic facet control rendering
- `js/history-renderers.js` for extracted History page table renderers
- `js/league-renderers.js` for extracted league-wide summary/fun table renderers
- `js/render.js` for any remaining larger DOM rendering functions after their dependencies are explicit
- `js/app.js` as the thin bootstrapping layer

Constraints:
- keep the static-site deployment model
- decide at the start of this phase whether scripts stay ordered globals or move to native modules
- use native browser modules only if the whole page still works on GitHub Pages
- preserve the existing DOM ids and CSS hooks
- keep `js/easter-eggs.js` compatible until it is intentionally migrated

Acceptance criteria:
- `js/app.js` is materially smaller and mostly orchestration
- module boundaries match real responsibilities
- browser tests and data tests pass without fixture rewrites

Current next extraction targets:
- move fetch/load/normalize behavior into `js/data-helpers.js`: done
- move remaining pure stat builders into `js/stats-helpers.js`: done
- move low-risk rendering utilities into `js/render-helpers.js`: done
- move All Games table rendering into `js/history-renderers.js`: done
- move Week-by-Week table rendering into `js/history-renderers.js`: done
- move Season Recap table rendering into `js/history-renderers.js`: done
- move Top Highlights rendering into `js/history-renderers.js`: done
- move Season Callout view rendering into `js/history-renderers.js`: done
- move Opponent Breakdown table and rivalry callout rendering into `js/history-renderers.js`: done
- move All Teams league summary tables into `js/league-renderers.js`: done
- move All Teams Fun Facts tiles into `js/league-renderers.js`: done
- move All Teams Fun Lists tables into `js/league-renderers.js`: done
- move team-specific Fun Facts tiles and top/bottom game lists into `js/league-renderers.js`: done
- move CSV text generation into `js/state-helpers.js`: done
- continue moving render functions one at a time after their data dependencies are explicit: complete for the current pass
- keep ordered scripts for now; reassess native modules only after the split is stable

Verification:
- `npm run test:ci`
- one manual smoke check in a local browser after the split lands
- verify the deployed-script model still works from a static HTTP server, not only from Node tests

## 4. Reduce unnecessary rerender work

Status: complete for the first section-cache pass.

Purpose: make filter changes cheaper after the code is modular enough to change safely.

Implementation:
- compute the filtered game set once per state change: done
- cache the filtered game set by facet state so no-op renders do not refilter: done
- pass the filtered set into render functions instead of recomputing inside each section: done
- add section-level render guards for inputs that did not change: done
- avoid rebuilding all-teams Fun Facts for filters that do not affect that content: done
- keep aggregate caches explicit and invalidated only when source data changes

Acceptance criteria:
- filter changes do less work than the current full rebuild
- the DOM output remains equivalent for the same selected state
- browser tests continue to pass

Verification:
- `npm run test:ui`
- compare visible row counts before and after representative filter changes

## 5. Clean up the data pipeline and generated artifacts

Status: complete.

Purpose: make the update workflow clearer and reduce accidental repo churn.

Implementation:
- keep `scripts/sleeper_to_h2h.py` season-anchor validation explicit: done
- keep `scripts/update_2025.sh` and `scripts/transactions.py` driven by `SEASON` and `LEAGUE_ID`: done
- move `assets/H2H.xlsx` to a non-served reference location: done in `data/reference/H2H.xlsx`
- remove tracked generated artifacts that do not need to be source controlled: done
- document which generated files are safe to delete and regenerate: done in `README.md`

Acceptance criteria:
- update scripts fail fast with useful messages
- source data and generated output are easy to distinguish
- coverage, cache, and local metadata files do not appear as normal working-tree changes

Verification:
- `bash -n scripts/update_2025.sh`
- `python3 -m py_compile scripts/transactions.py scripts/sleeper_to_h2h.py`
- `git status --short` shows only intentional source changes

## 6. Expand regression coverage for edge cases

Status: complete.

Purpose: protect behavior that tends to break during refactors.

Implementation:
- test loading and error states at the browser level: done
- test URL state restoration for selected team and filters: done
- test CSV export shape without depending on browser download prompts: done
- add direct tests for newly extracted pure modules: done
- retire or wire up `scripts/ci_smoke.js` so there is no dormant test script: done by removing duplicate script

Acceptance criteria:
- failures point to specific broken behavior
- core rendering and state behavior are covered before further UI changes
- obsolete test scripts are removed or part of CI

Verification:
- `npm run test:ci`

## 7. Refresh docs and release notes

Status: complete.

Purpose: keep the written record aligned with the implemented code.

Implementation:
- update `CHANGELOG.md` after each completed phase: done
- keep `README.md` short and factual: done
- update any tech-debt notes only after the code state changes: done
- keep `IMPLEMENTATION_PLAN.md` current as phases complete: done

Acceptance criteria:
- docs describe the current repo, not a past snapshot
- future cleanup work is easy to resume from the written record

Verification:
- `npm run test:ci`
- `git diff --check`
