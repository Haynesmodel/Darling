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
8. Run the local checks before pushing:
   - `npm run test:hygiene`
   - `npm run test:data`
   - `npm run test:scripts`
   - `npm run test:ui`
   - `npm run test:ci`

## Working Notes

- Keep generated draft data reviewable. Do not replace `assets/SeasonSummary.json` automatically.
- The Sleeper workflow needs the `SLEEPER_LEAGUE_ID` repository secret.
- `docs/plans/README.md` is the index for the implementation plans.
