# Feature architecture

Darling's shell loads league data once and activates each feature destination through a literal dynamic import. The shell is intentionally feature-neutral: navigation state, feature renderers, table row adapters, charts, and feature CSS belong behind the corresponding feature entry.

## Lifecycle

`src/app/feature-contract.ts` defines the ten `FeatureId` values and the controller lifecycle:

- `mount(context)` runs once for a cached controller. Bind long-lived listeners and register owned tables here.
- `activate(input)` may run repeatedly. Apply the complete route idempotently and render only while `input.signal` remains active.
- `deactivate(nextFeature)` closes transient UI and prevents inactive asynchronous work from changing the page while preserving normal selections.
- `dispose()` removes roots/listeners for tests, hot reload, or a fatal reset.

Feature modules export `createFeatureController()`. They must not mutate the DOM at import time, fetch the core league bundle, import another feature directory, or call another controller.

## App context and ownership

`src/app/app-controller.ts` starts the data-loader and requested feature import in parallel. After validation it creates one `AppContext` containing:

- one read-only league-data snapshot;
- cached neutral selectors;
- navigation, header, theme, and feature-status services;
- the browser-local, validated owner-preference service;
- the shared registration-based table runtime;
- read-only activation diagnostics;
- explicit `Document` and `Window` dependencies.

The context and search hydration are created once per application boot. Feature controllers own their selections, render caches, listeners, and feature-only async caches. Shared services never import a feature implementation.

## Registry, loading, and races

`src/app/feature-registry.ts` is the only feature loader map. Every value is a literal `import()` so the Vite manifest records ten dynamic entries. The registry caches import promises and controller instances, mounts once, validates controller IDs, records load/error diagnostics, and permits a controlled retry.

The app controller increments an activation ID and aborts the previous signal for every bootstrap, tab, search, retry, or `popstate` activation. A superseded import may finish and remain cached, but it is checked before mount, activation, readiness, focus, and shell-visible state updates.

The requested section remains visible while loading with `aria-busy="true"`, `data-feature-state="loading"`, and the shared polite status region. A failed import creates a feature-scoped alert and Retry button without disabling loaded destinations.

Support/test diagnostics are read-only at `window.darlingFeatureDiagnostics`; validated data diagnostics remain at `window.darlingDataDiagnostics`.

## Routing and state

All activation paths use `src/app/router.ts` and the existing byte-compatible URL parser/builder. League Pulse owns the canonical bare path; explicit and implicit legacy state is inferred before the Pulse fallback. An eligible navigation-link click creates one provisional history entry immediately; successful activation replaces it with the feature's canonical state. Bootstrap and browser navigation apply routes without pushing recursively. Focus targets run only after the requested feature is ready.

Owner Hub uses `?tab=owner&owner=<canonical owner>`. Owner resolution is explicit URL, retained in-memory feature state, validated My Team preference, then the feature's neutral fallback. `src/app/services/owner-preference-service.ts` derives its exact canonical union from validated historical and current assets, stores only `darling.favoriteOwner.v1`, reacts to cross-tab storage changes, and falls back to memory when browser storage is unavailable. Shared explicit URLs never mutate that preference.

Transactions uses `?tab=transactions` with optional `txSeason`, `txView`, `txOwner`, `txPlayer`, and `txId`. Those fields are validated against the loaded transaction snapshot and serialize independently from History facets. Direct transaction, player, and owner links open the owning native disclosure before focus moves. The controller performs the first `TransactionHistory.json` request only after activation, verifies its manifest byte count and SHA-256, validates it with the lazy-only generated schema module, caches only successful versioned requests, and ignores stale activations.

`src/app/feature-navigation.ts` is the typed source for feature labels, groups, destination element IDs, and hero modes. The shell publishes `data-active-feature` and `data-hero-mode` before awaiting a lazy entry. Pulse uses the full photographic hero; every analytical destination uses compact chrome. `src/accessibility/primary-navigation.ts` owns native grouped-menu behavior, current-link synchronization, and section visibility without importing feature code.

Feature controllers serialize only their own fields. Table saved-view callbacks return to the owning controller; the table runtime never switches features or interprets feature URL state.

## Neutral season presentation and disclosures

`src/data/season-presentation.ts` resolves the six season phases from validated CurrentSeason, SeasonSummary, and H2H fields. `src/data/season-recap.ts` is the single completeness and honor-selection contract: a recap is authoritative only with exactly one champion and one Saunders winner. League Pulse delegates through its compatibility resolver, while Current Season also supplies an explicitly selected historical season.

`src/app/section-disclosure.ts` owns native-details registration, per-signature in-memory toggle state, empty reconciliation, focus-safe close, section jump navigation, and visible-render callbacks. Feature controllers provide stable local IDs, labels, availability, defaults, and a state signature. History uses its facet signature; Transactions uses season/view/owner/player/transaction state; Head to Head uses teams and scope; Trophy uses owner; Dynasty uses mode, owner, range, qualification, and penalty state; Draft Spot uses its mode/owner/range/selection signature; Historical Matchup uses its two seasons and simulation settings. Disclosure state is never serialized. `applyFocusTarget()` opens a containing `details` before focusing and scrolling an existing deep-link target.

## Tables, charts, and CSS

`src/tables/table-runtime.tsx` contains generic rendering, saved views, and registration. Each table feature registers its stable definition and row adapter during `mount`. Duplicate registration fails, and rendering an unregistered table produces an actionable error. Table IDs and the saved-view schema remain unchanged.

Chart features share exactly one lazy `chart-runtime` output containing Observable Plot and the chart adapters. The committed vendor exposes only `areaY`, `barX`, `barY`, `dot`, `lineY`, `plot`, `ruleX`, `ruleY`, and `text`; authored browser code imports those functions by name and never imports the Plot package directly. Pulse, History, and the initial shell do not request the runtime. Closed analytical sections establish their semantic/text contract but defer chart mounting until visible; reopening redraws into the same host and never duplicates SVG. Draft Spot still becomes interactive before its guarded dynamic chart imports settle, and an import failure renders feature-local chart fallbacks only after the affected chart section is revealed. Tables remain mounted across close/reopen so saved views, filters, pagination, pinning, details, and URL callbacks retain their existing state. Feature entry CSS files import their owned styles in the existing cascade layers; `src/styles/app.css` contains shell/shared styles only.

Owner Hub is deliberately chart-free and cannot import sibling feature entries. Its pure typed model composes only the validated boot snapshot and neutral shared data helpers; every deeper action is a canonical URL into the owning feature.

Transactions is also chart-free and table-runtime-free. Its overview, trade desk, waiver wire, player journeys, owner activity, and draft/keeper views use semantic native tables and ordered lists owned entirely by `src/features/transactions/`.

Adding a Plot API is an architecture change: update the generator allowlist, regenerate the committed vendor, update the exact-export contract, run the nine-surface chart matrix, rebuild with the Pages base path, and record the bundle delta. `npm run check:charts-generated` must pass without changing the worktree.

## Adding a feature destination

1. Add the ID to `FEATURE_IDS`, typed navigation metadata, a canonical link, an independently labelled page section, and the route parser/builder.
2. Add one literal loader to `feature-registry.ts` and one controller implementing the lifecycle.
3. Keep feature state, listeners, renderers, table registration, chart adapters, and `.entry.css` inside that feature directory.
4. Add unit tests for metadata/repeated activation and cleanup, plus Playwright direct-link, modifier-link, back-forward, loading/failure/race, navigation-fit, and manifest resource assertions. The route matrix currently contains ten destinations.
5. Add the source key to `scripts/data/bundle-budget.json` and run `npm run check:feature-boundaries`.
6. Run the Pages-path production build and verify the route closure and total budgets with `npm run check:bundle`.

Cross-feature imports are not an acceptable shortcut. Move only genuinely neutral calculations into `js/shared/` or an app service, and keep the boundary test updated when a new shared category is intentional.
