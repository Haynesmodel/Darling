# TypeScript strict islands and deferred charts

Darling is migrating analytical features as vertical slices. Root `tsconfig.json` intentionally remains transitional with `strict: false`, `allowJs: true`, and `checkJs: false` until the legacy feature tree is migrated. `tsconfig.strict.json` is the authoritative strict project for completed islands, and `scripts/data/strict-islands.json` grows monotonically as slices land.

The policy checker rejects explicit `any`, `@ts-ignore`, `@ts-nocheck`, raw HTML insertion APIs, target legacy renderer/control imports, runtime Observable Plot imports, and direct generated-vendor imports in those islands. `src/charting/chart-vendor.ts` is the single documented generated-vendor exception and derives its API types through type-only Plot imports. Run `npm run typecheck` and `npm run test:hygiene` after changing an island.

## Dependency direction

`src/app/feature-registry.ts` remains the shell-to-feature boundary and uses literal route imports. Feature controllers may depend on shared app, chart, table, and share services; shared modules must not import a feature implementation. Feature-specific calculations and URL normalization remain in that feature's typed model/state files.

For migrated pages, the controller owns activation, routing, header/theme side effects, table/share registration, and final root teardown. Preact owns semantic markup and controls. `DeferredChart` owns chart eligibility, status, retry, stale-generation guards, and DOM cleanup.

## Adding or changing a chart

1. Add the payload and discriminant to `ChartRequest` in `src/charting/chart-types.ts`; arbitrary renderer callbacks and import paths are not supported.
2. Add an exhaustive `renderChart` case in `src/charting/plot-charts.ts` and preserve the existing accessible SVG name, axes, marks, colors, and text/table alternative. Chart data, theme, specifications, DOM helpers, and rendering remain authored TypeScript in this strict island.
3. Build a stable signature from every input that changes visible marks. Pass `request: null` plus a specific empty message when no rows exist.
4. Keep the chart inside its native disclosure. Automatic loading requires an active, connected host in an open disclosure intersecting `rootMargin: "600px 0px"`; the named native Load button remains the no-IntersectionObserver fallback.
5. Add loader/component/model tests, production-preview cold/proximity/reuse coverage, accessibility and keyboard assertions, and bundle graph coverage.
6. Run `npm run check:charts-generated`, `npm run typecheck`, `npm run test:hygiene`, `npm run test:charts`, the relevant unit/browser suites, and a Pages-path production build.

The committed `js/charting/vendor/charting-vendor.js` remains generated and deterministic. Do not expand `PLOT_VENDOR_EXPORTS`, add a runtime dependency, weaken coverage, or raise a bundle ceiling without separately measured evidence and review.
