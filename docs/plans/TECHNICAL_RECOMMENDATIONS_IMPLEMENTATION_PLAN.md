**Status:** Planned

# Technical Recommendations Implementation Plan

This plan covers the Claude technical review items that are worth implementing after checking the current repo state. Stale, already-complete, or low-value items are intentionally excluded from the implementation scope.

## Scope

Implement these recommendations:

- Task 1: Add weekly Sleeper update workflow, adjusted for current-season setup.
- Task 3: Split CI into separate unit/data and UI jobs.
- Task 4: Move root implementation plans into `docs/plans/`.
- Task 5: Add targeted missing unit coverage for core stats helpers.
- Task 6: Extend asset integrity tests for Trophy Case, Dynasty Rankings, and Playoff Archive dependencies.
- Task 7: Add targeted tab state isolation Playwright coverage.
- Task 11: Add failure alerting to the weekly update workflow.
- Task 14: Add a `SeasonSummary` draft generator.
- Task 17: Add annual setup documentation in `CONTRIBUTING.md`.
- Task 18: Add easter egg consistency tests.

Do not implement these as part of this plan:

- Task 2: Already fixed or stale.
- Task 8: Constants already exist; revisit only if extracting shared constants later.
- Task 9: Table header `scope` attributes already exist.
- Task 10: Size-cap comments are low-value noise.
- Task 12: Cache-busting is deferred until stale JSON is observed.
- Task 13: Service worker is not worth the stale-cache risk right now.
- Task 15: Robots/sitemap is conditional on privacy/discoverability policy.
- Task 16: CSV export already has Playwright coverage.

## Implementation Order

### Phase 1: Documentation and Plan Organization

1. Move root implementation plan files into `docs/plans/` using `git mv`.
2. Add a status header to each moved plan.
3. Create `docs/plans/README.md` with a table of plan names and statuses.
4. Add `CONTRIBUTING.md` with the annual season setup checklist:
   - Add the Week 1 anchor date.
   - Generate the Sleeper team mapping.
   - Update the workflow season default.
   - Run a manual dry run.
   - Verify regular season and postseason updates.
   - Complete `SeasonSummary` after playoffs.
   - Run local CI before pushing.

Acceptance criteria:

- Project root no longer contains old `*_IMPLEMENTATION_PLAN.md` files.
- `docs/plans/README.md` links to every moved plan.
- `CONTRIBUTING.md` gives enough detail for another operator to run the annual setup.

### Phase 2: Data and Stats Test Coverage

1. Extend existing Node tests instead of creating unnecessary duplicate test files.
2. Add missing edge-case coverage for stats helpers in `test/data-helpers.test.js`:
   - `computeExpectedWinForGame` returns `1.0` for the top score in a week.
   - It returns `0.0` for the low score in a week.
   - It returns `0.5`-weighted credit for tied scores.
   - It ignores other weeks.
   - `deriveWeeksInPlace` resets week numbers between seasons.
   - `dedupeGames` preserves distinct same-date games.
   - `computeLuckSummary` covers positive and negative luck cases.
3. Extend `test/asset-validation.test.js` or `test/data-helpers.test.js` with asset integrity checks:
   - `points_for` is numeric and positive for every `SeasonSummary` row.
   - H2H playoff round values are from the known set.
   - Each completed season has exactly one Championship game.
   - `finish` is within the team count for each season.
   - Finish positions are unique per season.

Acceptance criteria:

- Tests are focused on behavior not already covered.
- No new test file is added unless the existing files become hard to navigate.
- `npm run test:scripts` and `npm run test:data` pass.

### Phase 3: UI State Regression Coverage

1. Add targeted Playwright tests to `test/ui/app.spec.js`.
2. Cover only gaps not already tested:
   - Browser back restores the previous tab/filter state.
   - History filters do not leak into Trophy or Dynasty state.
   - Direct tab URLs load the correct tab and state.
3. Match assertions to the app's intended behavior. Current behavior preserves some per-tab state, so tests should document the actual desired contract rather than assume all filters reset.

Acceptance criteria:

- `npm run test:ui` passes locally.
- New tests avoid brittle text assertions when stable selectors exist.
- The tests fail if URL state from one tab corrupts another tab's controls.

### Phase 4: SeasonSummary Draft Generator

1. Add `scripts/generate_season_summary_draft.py`.
2. Inputs:
   - `--h2h assets/H2H.json`
   - `--existing assets/SeasonSummary.json`
   - `--out assets/SeasonSummary.draft.json`
   - `--season YEAR`
3. Generate one row per owner for the target season.
4. Derive from H2H:
   - Regular season wins, losses, ties.
   - `points_for`, `points_against`.
   - `playoff_wins`, `playoff_losses`.
   - `saunders_wins`, `saunders_losses`.
5. Preserve existing manual fields when an existing row is present:
   - `finish`
   - `champion`
   - `saunders`
   - `bye`
   - `saunders_bye`
   - `bagels_earned`
   - `wild_card`
6. Use `null` placeholders for missing manual fields.
7. Add Python unit coverage in `test/test_generate_season_summary_draft.py`.

Acceptance criteria:

- Script output is deterministic and pretty-printed.
- Existing manual data is preserved.
- Generated calculated fields match H2H-derived records.
- Python tests pass through `npm run test:scripts`.

### Phase 5: Weekly Sleeper Update Workflow

1. Add `.github/workflows/update-sleeper.yml`.
2. Use the existing scripts:
   - `scripts/update_sleeper_h2h.sh`
   - `scripts/validate_assets.cjs`
   - `scripts/{SEASON}_team_mapping.json`
3. Keep the workflow manual and scheduled.
4. Add pre-flight checks for:
   - `SLEEPER_LEAGUE_ID` secret.
   - Season mapping file.
   - Week 1 anchor for the chosen season.
5. Default the season only after the corresponding mapping and anchor exist.
6. Support dry runs with `VALIDATE_ONLY=1`.
7. Commit only when `assets/H2H.updated.json` differs from `assets/H2H.json`.
8. Generate `assets/SeasonSummary.draft.json` after H2H changes if the draft generator exists.
9. Avoid force-pushing from the workflow unless there is a strong need. Prefer a single commit that includes all generated files.

Acceptance criteria:

- Workflow validates before trying live data updates.
- Dry run never modifies tracked assets.
- Normal run commits changed H2H data only when there are real changes.
- Workflow can be triggered manually for a target season.

Manual prerequisite:

- Add repository secret `SLEEPER_LEAGUE_ID`.

### Phase 6: Workflow Failure Alerting

1. Add `issues: write` permission to the update workflow.
2. Add a final `if: failure()` notification step using `actions/github-script`.
3. Before creating an issue, search open issues for the same failure label/title pattern to avoid duplicate weekly alerts.
4. Label generated issues with `data-pipeline` and `automated`.
5. Include the failed run URL and likely causes in the issue body.

Acceptance criteria:

- A failed workflow creates or updates a visible GitHub issue.
- Repeated failures do not open unlimited duplicate issues.
- The issue links directly to the failed Actions run.

### Phase 7: CI Restructure

1. Update `.github/workflows/ci.yml`.
2. Split the current single job into:
   - `unit`: hygiene, asset validation, Node unit tests, Python tests.
   - `ui`: Playwright browser tests, dependent on `unit`.
3. Preserve:
   - `CI: true`
   - artifact uploads for Playwright report and test results.
   - existing install and setup steps.
4. Prefer Playwright retries over `continue-on-error`.
5. Update package scripts only if needed to make the job split clean.

Acceptance criteria:

- Unit/data failures are clearly separate from UI failures.
- UI tests still protect merges unless the repo owner explicitly chooses otherwise.
- `npm run test:ci` remains a valid local command.

### Phase 8: Easter Egg Consistency Test

1. Add a Node test that reads:
   - `assets/Rivalries.json`
   - `js/easter-eggs.js`
   - `css/easter-eggs.css`
   - `assets/H2H.json`
2. Assert:
   - Every rivalry group slug has a `GROUP_EGGS` entry.
   - Every `GROUP_EGGS` slug exists in `Rivalries.json`.
   - Every `GROUP_EGGS` visual class exists in CSS.
   - Every group backdrop class exists in CSS.
   - Every rivalry member exists as a team name in H2H.
3. Add the test to the Node test entrypoint if needed.

Acceptance criteria:

- Adding or renaming an easter egg group fails tests unless all required files stay in sync.
- The test parses stable source patterns without importing browser-only runtime code.

## Final Verification

Run these commands before considering the work complete:

```bash
npm run test:hygiene
npm run test:data
npm run test:scripts
npm run test:ui
npm run test:ci
```

If workflow files changed, also verify the YAML manually for:

- Correct indentation.
- Required permissions.
- Correct `if:` conditions.
- Correct secret and season variable usage.

## Risks and Notes

- The update workflow should not default to a season until that season has both a team mapping file and a Week 1 anchor date.
- Playwright state tests should describe the intended app contract. Do not encode assumptions from the review brief if the current UX intentionally preserves state.
- Avoid adding a service worker or cache-busting workflow in this pass; both can introduce stale-data behavior that is harder to debug than the current simple fetch model.
- Keep generated draft data reviewable. Do not automatically replace `SeasonSummary.json` because several fields require human judgment.
