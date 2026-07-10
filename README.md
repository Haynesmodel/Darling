# Darling

Live site: https://haynesmodel.github.io/Darling/

The live site is a Vite-built static page backed by JSON assets in `assets/`.
Requires Node 20.x. Use [`.nvmrc`](./.nvmrc) or `nvm use` to match the supported runtime.

Run locally:
- `npm run dev`
- or `npm run serve` for port 8000
- open the URL printed by Vite

Test locally:
- `npm run build:charts` regenerates the committed Observable Plot vendor bundle used by the static site.
- `npm run build:hero` regenerates responsive league hero images in `assets/hero/`.
- `npm run typecheck` runs the permissive TypeScript migration gate for browser source and Vite config.
- `npm run build` syncs JSON assets into `public/assets/` and writes the production bundle to `dist/`.
- `VITE_BASE_PATH=/Darling/ npm run build` matches the GitHub Pages project-path build.
- `npm test` runs the data and helper tests.
- `npm run test:assets` validates `assets/H2H.json`, `assets/SeasonSummary.json`, `assets/Rivalries.json`, and optional `assets/CurrentSeason.json`.
- `npm run test:charts` runs the chart data/spec smoke tests.
- `npm run test:tables` runs the interactive table engine, row-adapter, quick-filter, and saved-view schema tests.
- `npm run test:unit` regenerates the chart bundle, then runs typecheck, hygiene, asset validation, chart tests, Node unit tests, and Python tests.
- `npm run test:scripts` runs the script helper tests, including the Python update helpers.
- `npm run test:ui` runs the Playwright browser tests against the Vite dev server.
- `npm run test:ui:preview` runs the Playwright browser tests against a previously built `dist/` bundle under `/Darling/`.
- `npm run test:coverage` runs the Node tests, browser tests, and coverage check.
- `npm run test:ci` runs the local unit, GitHub Pages production build, and built-output UI checks that mirror CI.
- GitHub branch protection should require the `CI / unit`, `CI / ui`, and `CI / coverage` checks.

Primary web-served data:
- `assets/H2H.json`
- `assets/CurrentSeason.json` (optional Sleeper-generated live/current season source)
- `assets/SeasonSummary.json`
- `assets/Rivalries.json`

Theme and hero assets:
- The app uses semantic CSS tokens plus root attributes for `data-color-scheme`, `data-accent-theme`, owner/rivalry context, and season mode.
- Users can choose Auto, Light, or Dark mode. The preference is stored in `localStorage["darling.colorScheme"]`.
- Owner accents are defined in `src/theme/owner-themes.ts`; add a new owner there when the league changes.
- The default hero remains the league identity photo, served from optimized responsive files under `assets/hero/`.
- Run `npm run build:hero` after replacing the league photo. By default the script uses `assets/LeaguePic.jpeg`, `assets/hero/league-1920.jpg`, or the previous git blob as a fallback source.

Global search and command palette:
- Open Search from the sticky navigation, with `Command+K` / `Control+K`, or with `/` while focus is outside an editable field.
- Structured phrases include owner seasons (`Joe 2021`), rivalries (`Zubs vs Joel`), season types (`2024 playoffs`), thresholds (`150 point games`), records (`biggest loss`), feature destinations, and color-scheme commands.
- Search is local-only. It hydrates from the existing league JSON assets, stores only up to eight executed result IDs in `localStorage["darling.search.recent"]`, and navigates through canonical URL state.
- History record URLs support `gameResult`, `gameMinScore`, `gameMaxScore`, `gameSort`, `gameLimit`, and `focus`. Invalid values are ignored and limits are capped at 100.
- See [`docs/SEARCH_COMMAND_PALETTE.md`](./docs/SEARCH_COMMAND_PALETTE.md) before adding aliases, intent families, or commands.

Interactive tables:
- Primary History, Head to Head, Current Season, and Trophy tables share sortable headers, typed filters, quick filters, sticky identity columns, row details, pagination, visibility/pinning controls, and local saved views.
- History game filters and supported sorting continue to use canonical Global Search URL fields; presentation preferences remain local.
- Saved views are local-only in `localStorage["darling.tableViews.v1"]` and are schema-validated when restored.
- See [`docs/INTERACTIVE_TABLES.md`](./docs/INTERACTIVE_TABLES.md) before adding a table ID, column, adapter, quick filter, or saved-state field.

Current Season command-center assumptions:
- `assets/CurrentSeason.json` can include `playoff_rules`; if omitted, the app assumes 14 regular-season weeks, 6 playoff teams, 2 byes, 6 Saunders slots, and standings sorted by win rate, points for, points differential, then owner.
- The v1 command center uses a deterministic path model. It shows projected standings for completed games plus live leaders if scores hold; it does not display simulation odds or player-level projections.

Shareable Dynasty URLs:
- Open `http://127.0.0.1:8000/?tab=dynasty&dynastyMode=calculator&dynastyOwner=Joe&dynastyStart=2021&dynastyEnd=2023&dynastyMinSeasons=2&dynastySaunders=1` to land directly on Joe's 2021-2023 Dynasty Score.
- The same URL shape works on the deployed site, so users can share a specific owner and range without additional setup.

Reference data:
- `data/reference/H2H.xlsx` is the historical source spreadsheet kept for reference. The site and update scripts read the JSON assets instead.

Generated or local-only files:
- `js/charting/vendor/charting-vendor.js` is generated by `npm run build:charts` and committed so the static site can run without a deployment build phase.
- `assets/hero/league-*` is generated by `npm run build:hero` and committed so the static site can serve optimized hero images without the original full-size JPEG.
- `public/assets/` is generated by `scripts/sync_public_assets.cjs` before Vite dev/build so JSON fetch assets and hero media remain compatible without copying unrelated source media.
- `dist/` is generated by `npm run build`.
- `assets/H2H.updated.json` is generated by `scripts/update_sleeper_h2h.sh` and is safe to delete after copying reviewed changes into `assets/H2H.json`.
- `assets/CurrentSeason.updated.json` is generated by `scripts/update_sleeper_h2h.sh` and is safe to delete after copying reviewed changes into `assets/CurrentSeason.json`.
- `assets/H2H_backup.json`, `coverage/`, `test-results/`, `playwright-report/`, `.nyc_output/`, `scripts/__pycache__/`, and `.DS_Store` files are local artifacts and should not be committed.

Season update flow:
- Set `SEASON` and `LEAGUE_ID` when needed, then confirm the Week 1 Sunday anchor exists in `scripts/sleeper_week1_anchors.json`.
- Dry run with `UPDATE_LIVE=1 VALIDATE_ONLY=1 scripts/update_sleeper_h2h.sh` to generate and validate a temporary bundle without touching `assets/`.
- Run `UPDATE_LIVE=1 scripts/update_sleeper_h2h.sh` to write `assets/H2H.updated.json` and `assets/CurrentSeason.updated.json` for review.
- Review both generated files, copy them into `assets/H2H.json` and `assets/CurrentSeason.json`, and rerun `npm run test:assets` and `npm run test:scripts` before committing.
- The GitHub Actions workflow at [`.github/workflows/update-sleeper.yml`](./.github/workflows/update-sleeper.yml) automates the same flow, creates `assets/SeasonSummary.draft.json` when H2H changes, and files a failure alert if the run breaks.

Season notes and cleanup history live in [CHANGELOG.md](./CHANGELOG.md).
