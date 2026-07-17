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
- `npm run test:assets` validates source and generated JSON, cross-file league semantics, manifest freshness, and responsive media.
- `npm run generate:data` intentionally refreshes generated types, standalone validators, derived statistics, and the manifest.
- `npm run check:data-generated` performs a read-only byte-for-byte drift check.
- `npm run check:bundle` verifies the production entry, lazy data-runtime chunk, and total gzip budgets.
- `npm run lint:css` validates application and component styles with Stylelint.
- `npm run check:css` enforces stylesheet ownership, line, color, duplicate-selector, focus, and import guardrails.
- `npm run test:charts` runs the chart data/spec smoke tests.
- `npm run test:tables` runs the interactive table engine, row-adapter, quick-filter, and saved-view schema tests.
- `npm run test:unit` regenerates the chart bundle, then runs typecheck, hygiene, asset validation, chart tests, Node unit tests, and Python tests.
- `npm run test:scripts` runs the script helper tests, including the Python update helpers.
- `npm run test:ui` runs the Playwright browser tests against the Vite dev server.
- `npm run test:a11y` runs axe WCAG A/AA scans across pages and interaction states.
- `npm run test:keyboard` runs tab, disclosure, dialog, skip-link, motion, and responsive keyboard checks.
- `npm run test:ui:preview` runs the Playwright browser tests against a previously built `dist/` bundle under `/Darling/`.
- `npm run test:ui:preview:serial` is the explicit one-worker diagnostic form; preview runs use one worker by default for local/CI parity.
- `npm run test:coverage` runs the Node tests, browser tests, and coverage check.
- `npm run test:ci` runs the local unit, GitHub Pages production build, and built-output UI checks that mirror CI. In GitHub Actions, `unit` builds once; `ui` downloads and tests that SHA-scoped artifact, and a successful push to `main` packages those same bytes for Pages.
- GitHub branch protection should require the `CI / unit`, `CI / ui`, and `CI / coverage` checks.

Primary web-served data:
- `assets/H2H.json`
- `assets/CurrentSeason.json` (optional Sleeper-generated live/current season source)
- `assets/SeasonSummary.json`
- `assets/DraftSpot.json` (generated, runtime-optional Draft Spot observations)
- `assets/Rivalries.json`
- `assets/DerivedStats.json` (generated canonical aggregates)
- `assets/asset-manifest.json` (generated content-addressed inventory)

Data pipeline:
- JSON Schema Draft 2020-12 files under `schemas/` are the authoritative contracts.
- Runtime payloads are treated as unknown until generated standalone validators accept them.
- The app exposes the active snapshot through `window.darlingDataDiagnostics` for support and debugging.
- See [`docs/data-pipeline.md`](./docs/data-pipeline.md) for updates, schema migrations, rule IDs, known exceptions, drift recovery, and iCloud hero handling.

Theme and hero assets:
- The app uses semantic CSS tokens plus root attributes for `data-color-scheme`, `data-accent-theme`, owner/rivalry context, and season mode.
- Users can choose Auto, Light, or Dark mode. The preference is stored in `localStorage["darling.colorScheme"]`.
- Owner accents are defined in `src/theme/owner-themes.ts`; add a new owner there when the league changes.
- The default hero remains the league identity photo, served from optimized responsive files under `assets/hero/`.
- Run `npm run build:hero` after replacing the league photo. By default the script uses `assets/LeaguePic.jpeg`, `assets/hero/league-1920.jpg`, or the previous git blob as a fallback source.

Global search and command palette:
- Open Search from the sticky navigation, with `Command+K` / `Control+K`, or with `/` while focus is outside an editable field.
- Structured phrases include owner seasons (`Joe 2021`), rivalries (`Zubs vs Joel`), Draft Spot destinations (`pick 10`, `late draft picks`, `Joe draft history`), season types (`2024 playoffs`), thresholds (`150 point games`), records (`biggest loss`), feature destinations, and color-scheme commands.
- Search is local-only. It hydrates from the existing league JSON assets, stores only up to eight executed result IDs in `localStorage["darling.search.recent"]`, and navigates through canonical URL state.
- History record URLs support `gameResult`, `gameMinScore`, `gameMaxScore`, `gameSort`, `gameLimit`, and `focus`. Invalid values are ignored and limits are capped at 100.
- See [`docs/SEARCH_COMMAND_PALETTE.md`](./docs/SEARCH_COMMAND_PALETTE.md) before adding aliases, intent families, or commands.

Interactive tables:
- Primary History, Head to Head, Current Season, Trophy, and Draft Spot tables share sortable headers, typed filters, quick filters, sticky identity columns, row details, pagination, visibility/pinning controls, and local saved views.
- History game filters and supported sorting continue to use canonical Global Search URL fields; presentation preferences remain local.
- Saved views are local-only in `localStorage["darling.tableViews.v1"]` and are schema-validated when restored.
- See [`docs/INTERACTIVE_TABLES.md`](./docs/INTERACTIVE_TABLES.md) before adding a table ID, column, adapter, quick filter, or saved-state field.

Accessibility and CSS:
- Primary navigation follows the manual-activation ARIA tab pattern, filter disclosures retain native checkbox semantics, and application dialogs manage inertness, focus containment, scroll lock, and focus restoration.
- The application stylesheet entry is `src/styles/app.css`; shared and feature styles are assigned to explicit cascade layers.
- See [`docs/accessibility.md`](./docs/accessibility.md) and [`docs/css-architecture.md`](./docs/css-architecture.md) before adding a tab, disclosure, modal, animation, shared style, or feature stylesheet.

Current Season command-center assumptions:
- Validated `assets/CurrentSeason.json` assets must include the complete `playoff_rules` object required by `schemas/current-season.schema.json`. Historical views instead infer regular-season length, playoff teams, byes, and Saunders slots from the selected season's stored schedule and brackets.
- Mathematical clinched/eliminated status and deterministic projected standings remain authoritative.
- A lazily loaded, seeded 10,000-run team-score Monte Carlo model adds playoff, bye, seed, and Saunders probabilities, prior-week movement, and selected-owner win/loss scenarios.
- Estimates blend completed current-season scoring with recency-weighted owner history and a league prior. They are team-score simulations, not Sleeper player projections. See [`docs/current-season-odds.md`](./docs/current-season-odds.md).

Draft Spot Explorer:
- `?tab=draft` opens a lazily loaded Preact page for league, owner, pick, and zone exploration.
- URL fields are `draftMode`, `draftOwner`, `draftStart`, `draftEnd`, `draftMetric`, `draftMinSample`, `draftNormalize`, `draftPick`, and `draftZone`.
- Recommendations use only the selected season range, use observed historical language, and display sample confidence. Normalized mode maps each draft percentile to the nearest slot on a 12-team scale, so pick summaries, zones, rankings, charts, and selections compare equivalent positions across 10- and 12-team seasons.

Shareable Dynasty URLs:
- Open `http://127.0.0.1:8000/?tab=dynasty&dynastyMode=calculator&dynastyOwner=Joe&dynastyStart=2021&dynastyEnd=2023&dynastyMinSeasons=2&dynastySaunders=1` to land directly on Joe's 2021-2023 Dynasty Score.
- The same URL shape works on the deployed site, so users can share a specific owner and range without additional setup.

Reference data:
- `data/reference/H2H.xlsx` is the historical source spreadsheet kept for reference. The site and update scripts read the JSON assets instead.

Generated or local-only files:
- `js/charting/vendor/charting-vendor.js` is generated by `npm run build:charts` and committed so the static site can run without a deployment build phase.
- `src/data/generated/asset-types.ts`, `src/data/generated/asset-validators.ts`, `assets/DraftSpot.json`, `assets/DerivedStats.json`, and `assets/asset-manifest.json` are generated by `npm run generate:data` and committed as one coherent snapshot.
- `assets/hero/league-*` is generated by `npm run build:hero` and committed so the static site can serve optimized hero images without the original full-size JPEG.
- `public/assets/` is generated by `scripts/sync_public_assets.cjs` before Vite dev/build so JSON fetch assets and hero media remain compatible without copying unrelated source media.
- `dist/` is generated by `npm run build`.
- `assets/H2H.updated.json` and `assets/CurrentSeason.updated.json` are ephemeral candidates generated by `scripts/update_sleeper_h2h.sh`. Automation never publishes them; only allowlisted canonical/generated files enter its draft PR.
- `assets/H2H_backup.json`, `coverage/`, `test-results/`, `playwright-report/`, `.nyc_output/`, `scripts/__pycache__/`, and `.DS_Store` files are local artifacts and should not be committed.

Season update flow:
- Set `SEASON` and `LEAGUE_ID` when needed, then confirm the Week 1 Sunday anchor exists in `scripts/sleeper_week1_anchors.json`.
- Dry run with `UPDATE_LIVE=1 VALIDATE_ONLY=1 scripts/update_sleeper_h2h.sh` to generate and validate a temporary bundle without touching `assets/`.
- Run `UPDATE_LIVE=1 scripts/update_sleeper_h2h.sh` to write `assets/H2H.updated.json` and `assets/CurrentSeason.updated.json` for review.
- Review both generated files, copy them into `assets/H2H.json` and `assets/CurrentSeason.json`, update/review `assets/SeasonSummary.json` when the season is finalized, run `npm run generate:data`, review Draft Spot sample shifts, then rerun `npm run test:assets` and `npm run test:scripts` before committing.
- The GitHub Actions workflow at [`.github/workflows/update-sleeper.yml`](./.github/workflows/update-sleeper.yml) runs only from trusted `main` workflow code. A normal changed run creates or refreshes the bot-owned `automation/sleeper-<season>` draft PR; validation-only and no-change runs make no remote changes. The draft PR must pass the normal checks and human review.

A Pages deployment is created only by the successful push-to-main CI run for that exact commit. Scheduled Sleeper updates never push to main; they create or refresh a draft data PR that must pass normal CI and human review.

Season notes and cleanup history live in [CHANGELOG.md](./CHANGELOG.md).
