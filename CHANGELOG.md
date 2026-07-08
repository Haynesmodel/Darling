# Changelog

## Unreleased

- Added a Draft Spot Explorer tab backed by generated `assets/DraftSpot.json`, shareable Draft URLs, and UI/test coverage for pick, zone, and owner views.
- Fixed Draft Spot review feedback by making mode and percentile controls visibly affect the explorer, keeping championship zone metrics in count units, and preserving native pick-card button semantics.
- Kept `assets/LeaguePic.jpeg` as the header background and added static-asset hydration so iCloud-offloaded local placeholders are restored before serving or validating assets.
- Added a visible loading state and a user-facing error banner for JSON fetch failures.
- Added upfront season-anchor validation to `scripts/sleeper_to_h2h.py`.
- Externalized Sleeper week-1 anchors into `scripts/sleeper_week1_anchors.json` and renamed the season update script.
- Tightened asset validation for required numeric fields and fixed coverage reporting for browser and script sources.
- Added update-script validation-only mode and offline tests for the Sleeper update helpers.
- Documented easter-egg maintenance order and moved the `H2H.xlsx` reference file out of web-served assets.
- Stopped tracking generated coverage, cache, local metadata, and update scratch files.
- Updated `scripts/transactions.py` report headings to follow the configured `SEASON`.
- Added browser regressions for URL state restoration and CSV export output.
- Removed the obsolete `scripts/ci_smoke.js` after replacing its coverage with `test:data`.
- Refreshed `README.md` and the current architecture notes to match the implemented cleanup work.
- Added a simple project changelog.

## 2025 season

- Added the 2025 season history data and summaries.
- Added Snare and Shemer as new teams.
- Added the `birds-clinch` easter egg.
