# Contributing

This repository is maintained as a static site backed by JSON assets. The annual season setup is the highest-risk maintenance task, so use the checklist below when rolling the league forward.

## Annual Season Setup

1. Add the Week 1 anchor date for the new season in `scripts/sleeper_week1_anchors.json`.
2. Generate the Sleeper team mapping for the new season and save it as `scripts/<SEASON>_team_mapping.json`.
3. Confirm the update workflow defaults to the new season only after both files exist.
4. Run a manual dry run before updating tracked assets:
   - `UPDATE_LIVE=1 VALIDATE_ONLY=1 SEASON=<SEASON> scripts/update_sleeper_h2h.sh`
5. Run the live update and review `assets/H2H.updated.json` before copying it into `assets/H2H.json`.
6. Verify the regular season and postseason rows look correct in the updated H2H output.
7. After playoffs, generate or review `assets/SeasonSummary.draft.json` and fill in the manual fields before replacing the canonical summary.
8. Run `npm run generate:data`, review the regenerated `assets/DraftSpot.json` pick/zone sample changes, and confirm its `source_sha256` matches the canonical Season Summary.
9. Run the local checks before pushing:
   - `npm run build:charts`
   - `npm run typecheck`
   - `npm run test:hygiene`
   - `npm run lint:css`
   - `npm run check:css`
   - `npm run test:charts`
   - `npm run test:data`
   - `npm run test:scripts`
   - `npm run build`
   - `npm run test:ui`
   - `npm run test:a11y`
   - `npm run test:keyboard`
   - `npm run test:ui:preview`
   - `npm run test:ci`

## Working Notes

- Keep generated draft data reviewable. Do not replace `assets/SeasonSummary.json` automatically.
- Draft Spot is derived only from canonical `SeasonSummary.json`; never hand-edit `assets/DraftSpot.json`.
- Keep `assets/` as the source of truth. Vite dev/build copies deployable JSON and `assets/hero` media into ignored `public/assets/`.
- Add or update owner palettes in `src/theme/owner-themes.ts` when the league membership changes.
- Follow `docs/INTERACTIVE_TABLES.md` when changing a migrated table, and run `npm run test:tables` plus the relevant Playwright scenarios.
- Follow `docs/accessibility.md` for tabs, disclosures, dialogs, focus, motion, charts, and manual release checks.
- Follow `docs/css-architecture.md` for cascade layers, feature ownership, tokens, responsive rules, and stylesheet budgets.
- Regenerate the responsive hero set with `npm run build:hero` after changing the league identity photo, then run `npm run test:assets`.
- The Sleeper workflow needs the `SLEEPER_LEAGUE_ID` repository secret.
- `docs/plans/README.md` is the index for the implementation plans.

## Reviewing Sleeper automation pull requests

The weekly or manually dispatched workflow uses `automation/sleeper-<season>` as a bot-owned branch and opens one draft PR titled `[automation] Update Sleeper data for season <season>`. Do not commit directly to that branch. Correct the source on a separate branch or coordinate with the maintainer before rerunning automation.

Before approving, verify the generated PR checklist: mappings and owner names; Sleeper dates and weeks; missing or duplicate regular-season games; playoff and Saunders classifications; excluded placement games; scores and winners; CurrentSeason status/completeness; and whether derived data and the manifest match their inputs. `assets/SeasonSummary.draft.json` is only a review aid and must never replace the canonical summary automatically.

The publisher requires repository variable `DARLING_AUTOMATION_APP_ID`, repository secret `DARLING_AUTOMATION_PRIVATE_KEY`, and existing secret `SLEEPER_LEAGUE_ID`. The installed App must be limited to this repository with Contents and Pull requests read/write. Dispatch with `validate_only=true` to prove generation without canonical, branch, PR, or issue mutation on success.

A failed branch lease means the remote bot branch changed after the run recorded it. Do not force past the lease. Inspect the `Weekly Sleeper update failed` issue and candidate artifact, verify branch/PR ownership, then rerun from current `main`. The 2026 mapping, Week 1 anchor, and league activation remain deferred until Sleeper officially activates that league.
