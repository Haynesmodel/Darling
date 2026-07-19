# Feature architecture

Darling's shell loads league data once and activates each major tab through a literal dynamic import. The shell is intentionally feature-neutral: tab state, feature renderers, table row adapters, charts, and feature CSS belong behind the corresponding feature entry.

## Lifecycle

`src/app/feature-contract.ts` defines the eight `FeatureId` values and the controller lifecycle:

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
- the shared registration-based table runtime;
- read-only activation diagnostics;
- explicit `Document` and `Window` dependencies.

The context and search hydration are created once per application boot. Feature controllers own their selections, render caches, listeners, and feature-only async caches. Shared services never import a feature implementation.

## Registry, loading, and races

`src/app/feature-registry.ts` is the only feature loader map. Every value is a literal `import()` so the Vite manifest records eight dynamic entries. The registry caches import promises and controller instances, mounts once, validates controller IDs, records load/error diagnostics, and permits a controlled retry.

The app controller increments an activation ID and aborts the previous signal for every bootstrap, tab, search, retry, or `popstate` activation. A superseded import may finish and remain cached, but it is checked before mount, activation, readiness, focus, and shell-visible state updates.

The selected panel remains visible while loading with `aria-busy="true"`, `data-feature-state="loading"`, and the shared polite status region. A failed import creates a feature-scoped alert and Retry button without disabling loaded tabs.

Support/test diagnostics are read-only at `window.darlingFeatureDiagnostics`; validated data diagnostics remain at `window.darlingDataDiagnostics`.

## Routing and state

All activation paths use `src/app/router.ts` and the existing byte-compatible URL parser/builder. League Pulse owns the canonical bare path; explicit and implicit legacy state is inferred before the Pulse fallback. A tab click creates one provisional history entry immediately; successful activation replaces it with the feature's canonical state. Bootstrap and browser navigation apply routes without pushing recursively. Focus targets run only after the requested feature is ready.

Feature controllers serialize only their own fields. Table saved-view callbacks return to the owning controller; the table runtime never switches features or interprets feature URL state.

## Tables, charts, and CSS

`src/tables/table-runtime.tsx` contains generic rendering, saved views, and registration. Each table feature registers its stable definition and row adapter during `mount`. Duplicate registration fails, and rendering an unregistered table produces an actionable error. Table IDs and the saved-view schema remain unchanged.

Chart features share one lazy `chart-runtime` output containing Observable Plot and the chart adapters. Pulse and History do not request it; Draft Spot loads it for its pick-distribution and timeline charts. Feature entry CSS files import their owned styles in the existing cascade layers; `src/styles/app.css` contains shell/shared styles only. Readiness is reported after the JavaScript and its CSS dependency resolve.

## Adding a tab

1. Add the ID to `FEATURE_IDS`, the tab/panel markup, accessibility tab mapping, labels, and route parser/builder.
2. Add one literal loader to `feature-registry.ts` and one controller implementing the lifecycle.
3. Keep feature state, listeners, renderers, table registration, chart adapters, and `.entry.css` inside that feature directory.
4. Add unit tests for repeated activation and cleanup, Playwright direct-link/back-forward/loading/failure/race coverage, and manifest resource assertions.
5. Add the source key to `scripts/data/bundle-budget.json` and run `npm run check:feature-boundaries`.
6. Run the Pages-path production build and verify the route closure and total budgets with `npm run check:bundle`.

Cross-feature imports are not an acceptable shortcut. Move only genuinely neutral calculations into `js/shared/` or an app service, and keep the boundary test updated when a new shared category is intentional.
