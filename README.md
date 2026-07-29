# Darling

Live site: https://haynesmodel.github.io/Darling/

The live site is a Vite-built static page backed by JSON assets in `assets/`.
Requires Node 24.x and npm 11.x. Run `nvm use 24` (using [`.nvmrc`](./.nvmrc)) before installing dependencies; strict engine checks reject unsupported runtimes.

Run locally:
- `npm run dev`
- or `npm run serve` for port 8000
- open the URL printed by Vite

Test locally:
- `npm run build:charts` regenerates the committed Observable Plot vendor bundle used by the static site.
- `npm run check:charts-generated` verifies that bundle byte-for-byte without writing.
- `npm run build:hero` regenerates responsive league hero images in `assets/hero/`.
- `npm run typecheck` runs the permissive TypeScript migration gate for browser source and Vite config.
- `npm run build` syncs JSON assets into `public/assets/` and writes the production bundle to `dist/`.
- `VITE_BASE_PATH=/Darling/ npm run build` matches the GitHub Pages project-path build.
- `npm test` runs the data and helper tests.
- `npm run test:assets` validates source and generated JSON, cross-file league semantics, manifest freshness, and responsive media.
- `npm run generate:data` intentionally refreshes generated types, standalone validators, derived statistics, and the manifest.
- `npm run generate:transaction-history` refreshes the bounded Sleeper transaction, draft, player-journey, and outcome snapshot for a configured league season.
- `npm run test:transaction-history` runs the deterministic fixture and reconciliation tests for that generator.
- `npm run check:data-generated` performs a read-only byte-for-byte drift check.
- `npm run check:bundle` verifies the production entry, lazy data-runtime chunk, and total gzip budgets.
- `npm run check:feature-boundaries` rejects eager/cross-feature imports, feature CSS in the shell, oversized controllers, and a restored legacy monolith.
- `npm run lint:css` validates application and component styles with Stylelint.
- `npm run check:css` enforces stylesheet ownership, line, color, duplicate-selector, focus, and import guardrails.
- `npm run test:charts` runs chart data/spec, exact vendor export, generator drift, import-boundary, and bundle-graph tests.
- `npm run test:tables` runs the interactive table engine, row-adapter, quick-filter, and saved-view schema tests.
- `npm run test:unit` verifies the chart bundle without rewriting it, then runs typecheck, hygiene, asset validation, chart tests, Node unit tests, and Python tests.
- `npm run test:scripts` runs the script helper tests, including the Python update helpers.
- `npm run test:ui` runs the named Chromium suite and focused WebKit smoke project against the Vite dev server.
- `npm run test:ui:chromium` runs only the full Chromium project.
- `npm run test:ui:webkit` runs only the focused WebKit compatibility smoke contracts.
- `npm run test:a11y` runs axe WCAG A/AA scans across pages and interaction states.
- `npm run test:keyboard` runs tab, disclosure, dialog, skip-link, motion, and responsive keyboard checks.
- `npm run test:ui:preview:chromium` runs the Chromium project against a previously built `dist/` bundle under `/Darling/`.
- `npm run test:ui:preview:webkit` runs the WebKit smoke project against that same bundle. Preview, CI, and coverage modes use one worker.
- `npm run test:coverage` merges c8 Node coverage with source-mapped, instrumented Chromium coverage and enforces global, per-file, and changed-file policy.
- `npm run test:ci` sets `CI=1` for every child, runs quality checks, builds once, and exercises that production bundle with Chromium plus WebKit when Playwright supports the local platform. Hosted CI always requires WebKit.
- GitHub branch protection should require only the stable `ci / gate` check after that context has appeared successfully on the default branch.
- See [`docs/ci-and-testing.md`](./docs/ci-and-testing.md) for the job graph, artifact contract, coverage policy, and failure triage.

Primary web-served data:
- `assets/H2H.json`
- `assets/CurrentSeason.json` (optional Sleeper-generated live/current season source)
- `assets/TransactionHistory.json` (optional Sleeper-generated transaction, draft, journey, and outcome source)
- `assets/SeasonSummary.json`
- `assets/DraftSpot.json` (generated, runtime-optional Draft Spot observations)
- `assets/Rivalries.json`
- `assets/DerivedStats.json` (generated canonical aggregates)
- `assets/asset-manifest.json` (generated content-addressed inventory)

Data pipeline:
- JSON Schema Draft 2020-12 files under `schemas/` are the authoritative contracts.
- Runtime payloads are treated as unknown until generated standalone validators accept them.
- The app fetches a revalidated manifest, verifies each content-versioned JSON response against its byte count and canonical SHA-256, and exposes the frozen result through `window.darlingDataDiagnostics` for support and debugging.
- The hero data-status disclosure distinguishes active freshness, live-score delay, finalized offseason data, missing new-season data, and optional partial availability.
- See [`docs/data-pipeline.md`](./docs/data-pipeline.md) for updates, schema migrations, rule IDs, known exceptions, drift recovery, and iCloud hero handling.

Theme and hero assets:
- The app uses semantic CSS tokens plus root attributes for `data-color-scheme`, `data-accent-theme`, owner/rivalry context, and season mode.
- Users can choose Auto, Light, or Dark mode. The preference is stored in `localStorage["darling.colorScheme"]`.
- Owner accents are defined in `src/theme/owner-themes.ts`; add a new owner there when the league changes.
- The default hero remains the league identity photo, served from optimized responsive files under `assets/hero/`.
- Run `npm run build:hero` after replacing the league photo. By default the script uses `assets/LeaguePic.jpeg`, `assets/hero/league-1920.jpg`, or the previous git blob as a fallback source.

Global search and command palette:
- Open Search from the sticky navigation, with `Command+K` / `Control+K`, or with `/` while focus is outside an editable field.
- Exact owner names and current-team aliases open that owner's Hub first. Other structured phrases include owner seasons (`Joe 2021`), rivalries (`Zubs vs Joel`), transaction destinations (`transactions`, `trade desk`, `waiver wire`, `Joe moves`), Draft Spot destinations (`pick 10`, `late draft picks`, `Joe draft history`), season types (`2024 playoffs`), thresholds (`150 point games`), records (`biggest loss`), feature destinations, and color-scheme commands.
- Search is local-only. It hydrates from the existing league JSON assets, stores only up to eight executed result IDs in `localStorage["darling.search.recent"]`, and navigates through canonical URL state.
- History record URLs support `gameResult`, `gameMinScore`, `gameMaxScore`, `gameSort`, `gameLimit`, and `focus`. Invalid values are ignored and limits are capped at 100.
- See [`docs/SEARCH_COMMAND_PALETTE.md`](./docs/SEARCH_COMMAND_PALETTE.md) before adding aliases, intent families, or commands.

Interactive tables:
- Primary History, Head to Head, Current Season, Trophy, and Draft Spot tables share sortable headers, typed filters, quick filters, sticky identity columns, row details, pagination, visibility/pinning controls, and local saved views.
- History game filters and supported sorting continue to use canonical Global Search URL fields; presentation preferences remain local.
- Saved views are local-only in `localStorage["darling.tableViews.v1"]` and are schema-validated when restored.
- See [`docs/INTERACTIVE_TABLES.md`](./docs/INTERACTIVE_TABLES.md) before adding a table ID, column, adapter, quick filter, or saved-state field.

Feature architecture:
- The shell loads one validated core data snapshot and lazy-loads Owner Hub, Transactions, League History, Current Season, Head to Head, Trophy Case, Dynasty Rankings, Draft Spot, and Historical Matchup through cached lifecycle controllers. Transactions fetches and validates its optional asset only when activated.
- Feature-owned renderers, table adapters, charts, and CSS stay behind each dynamic entry; Observable Plot is absent from the default History route.
- See [`docs/feature-architecture.md`](./docs/feature-architecture.md) before adding a feature destination or changing routing, activation, loading/error behavior, feature diagnostics, or import ownership.

My Team and Owner Hub:
- `?tab=owner&owner=Joe` is a shareable owner profile. An explicit owner in a shared URL always overrides browser preference.
- My Team is optional and browser-local in `localStorage["darling.favoriteOwner.v1"]`; a denied write falls back to the active session and is announced in the Hub.
- Fresh owner-aware pages use My Team when no owner is explicit. League-wide History and all-time Dynasty remain neutral when no preference exists.

Accessibility and CSS:
- Primary navigation uses five semantic link/disclosure groups with canonical destination URLs and `aria-current`; filter disclosures retain native checkbox semantics, and application dialogs manage inertness, focus containment, scroll lock, and focus restoration.
- The eight deep analytical destinations use native `details`/`summary` plus a feature-labelled “Jump to section” control; Owner Hub instead uses a compact chart-free card grid. Mode, owner, range, and matchup signatures choose compact primary defaults; user choices are remembered per signature in memory only. Existing History and Transactions focus links reveal their target, and disclosure state never changes the product URL.
- The application stylesheet entry is `src/styles/app.css`; shared and feature styles are assigned to explicit cascade layers.
- See [`docs/accessibility.md`](./docs/accessibility.md) and [`docs/css-architecture.md`](./docs/css-architecture.md) before adding a feature destination, disclosure, modal, animation, shared style, or feature stylesheet.

Current Season lifecycle assumptions:
- The shared season presentation resolver distinguishes preseason, regular season, postseason, finalizing, offseason, and historical fallback. With no explicit `currentView`, regular season/postseason select `command`; every other phase selects `recap`.
- Finalized 2025 opens the validated year-in-review with Zook as champion, Singer as runner-up, Connor as Saunders winner, and the final standings. Incomplete summaries withhold both trophy claims.
- Explicit `currentView=command|recap|matchups|standings|owners` links remain reload-stable. Secondary Current sections are native disclosures and can be opened from the section jump control or existing focus links.
- Validated `assets/CurrentSeason.json` assets must include the complete `playoff_rules` object required by `schemas/current-season.schema.json`. Historical views instead infer regular-season length, playoff teams, byes, and Saunders slots from the selected season's stored schedule and brackets.
- Mathematical clinched/eliminated status and deterministic projected standings remain authoritative.
- During eligible regular-season command/standings views, a lazily loaded, seeded 10,000-run team-score Monte Carlo model adds playoff, bye, seed, and Saunders probabilities, prior-week movement, and selected-owner win/loss scenarios. Preseason, postseason, finalizing, offseason, recap, matchups-only, owners-only, and historical fallback do not request it.
- Estimates blend completed current-season scoring with recency-weighted owner history and a league prior. They are team-score simulations, not Sleeper player projections. See [`docs/current-season-odds.md`](./docs/current-season-odds.md).

Draft Spot Explorer:
- `?tab=draft` opens a lazily loaded Preact page for league, owner, pick, and zone exploration.
- URL fields are `draftMode`, `draftOwner`, `draftStart`, `draftEnd`, `draftMetric`, `draftMinSample`, `draftNormalize`, `draftPick`, and `draftZone`.
- League, owner, pick, and zone modes open the relevant board, profile, or selection detail by default. Supporting charts and the data ledger remain available through the section jump without adding disclosure fields to the URL.
- Recommendations use only the selected season range, use observed historical language, and display sample confidence. Normalized mode maps each draft percentile to the nearest slot on a 12-team scale, so pick summaries, zones, rankings, charts, and selections compare equivalent positions across 10- and 12-team seasons.

Shareable Dynasty URLs:
- Open `http://127.0.0.1:8000/?tab=dynasty&dynastyMode=calculator&dynastyOwner=Joe&dynastyStart=2021&dynastyEnd=2023&dynastyMinSeasons=2&dynastySaunders=1` to land directly on Joe's 2021-2023 Dynasty Score.
- The same URL shape works on the deployed site, so users can share a specific owner and range without additional setup.

Reference data:
- `data/reference/H2H.xlsx` is the historical source spreadsheet kept for reference. The site and update scripts read the JSON assets instead.

Generated or local-only files:
- `js/charting/vendor/charting-vendor.js` is generated by `npm run build:charts` and committed so the static site can run without a deployment build phase. Its exact nine named exports are intentional; adding an API requires updating the allowlist and contract test, regenerating, running the chart matrix, and recording the bundle delta.
- `src/data/generated/asset-types.ts`, `src/data/generated/asset-validators.ts`, `src/data/generated/transaction-history-validator.ts`, `assets/DraftSpot.json`, `assets/DerivedStats.json`, and `assets/asset-manifest.json` are generated by `npm run generate:data` and committed as one coherent snapshot.
- `assets/hero/league-*` is generated by `npm run build:hero` and committed so the static site can serve optimized hero images without the original full-size JPEG.
- `public/assets/` is generated by `scripts/sync_public_assets.cjs` before Vite dev/build so JSON fetch assets and hero media remain compatible without copying unrelated source media.
- `dist/` is generated by `npm run build`.
- `assets/H2H.updated.json` is generated by `scripts/update_sleeper_h2h.sh` and is safe to delete after copying reviewed changes into `assets/H2H.json`.
- `assets/CurrentSeason.updated.json` is generated by `scripts/update_sleeper_h2h.sh` and is safe to delete after copying reviewed changes into `assets/CurrentSeason.json`.
- `assets/TransactionHistory.updated.json` is generated by `scripts/update_sleeper_h2h.sh` and is safe to delete after copying reviewed changes into `assets/TransactionHistory.json`.
- `assets/H2H_backup.json`, `coverage/`, `test-results/`, `playwright-report/`, `.nyc_output/`, `scripts/__pycache__/`, and `.DS_Store` files are local artifacts and should not be committed.

Season update flow:
- Set `SEASON` and `LEAGUE_ID` when needed, then confirm the Week 1 Sunday anchor exists in `scripts/sleeper_week1_anchors.json`.
- Dry run locally with `UPDATE_LIVE=1 VALIDATE_ONLY=1 scripts/update_sleeper_h2h.sh`, or dispatch the main-only workflow with `validate_only: true`, to generate and validate a temporary bundle without touching tracked assets or remote Git state.
- A full scheduled or manual workflow run validates the candidate, permits only the six reviewed data outputs, preserves the 11 newest non-target transaction seasons byte-for-byte at the JSON-value level, evicts older transaction slices under the documented 12-season retention contract, and enforces append-only H2H history before requesting a short-lived Darling GitHub App token.
- Changed data is proposed on the bot-owned `automation/sleeper-<season>` branch in exactly one draft pull request targeting `main`. Every refresh updates the same pull request and returns it to draft.
- Review the generated checklist and complete data diff, wait for the exact `ci / gate`, then have a human mark the latest candidate ready, approve it, and merge it. The bot cannot ready, approve, auto-merge, merge, or push directly to `main`.
- Full no-change runs create no token, branch update, or pull request update. Failures retain safe candidate evidence for seven days and update the exact `Weekly Sleeper update failed` issue; the next successful full run closes that issue with a recovery link.
- `assets/SeasonSummary.draft.json` remains a review aid. Complete its manual fields in a separate human-authored change before promoting anything to canonical `assets/SeasonSummary.json`.

The 2026 Sleeper league is configured by `scripts/2026_team_mapping.json` and the
September 13 Week 1 anchor. After this human-reviewed configuration merges,
update `SLEEPER_LEAGUE_ID` to the activated 2026 league, run a validation-only
main dispatch with season `2026`, and only then run a full reviewed update. The
automation does not infer a future league or follow Sleeper's
`previous_league_id` chain.

Season notes and cleanup history live in [CHANGELOG.md](./CHANGELOG.md).
