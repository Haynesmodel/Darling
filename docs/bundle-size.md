# Production JavaScript bundle budgets

The July 23, 2026 chart-runtime optimization keeps Observable Plot and one shared `chart-runtime`, but the committed vendor now exports only the nine Plot functions Darling uses. The same-revision comparison starts at merged `main` commit `2f61d1a` with Node 24.14.0, npm 11.18.0, Observable Plot 0.6.17, esbuild 0.28.1, and Vite 8.1.4.

| Metric | Before | After | Delta | Enforced ceiling |
| --- | ---: | ---: | ---: | ---: |
| Vendor raw | 393,861 | 279,613 | -114,248 | Informational |
| Vendor gzip | 134,214 | 94,956 | -39,258 | Informational |
| Chart-runtime raw | 407,377 | 294,294 | -113,083 | 305,000 |
| Chart-runtime gzip | 134,793 | 97,674 | -37,119 | 100,000 |
| Entry raw | 177,873 | 177,873 | 0 | 190,000 |
| Entry gzip | 54,267 | 54,266 | -1 | 56,000 |
| Aggregate JavaScript gzip | 312,170 | 275,209 | -36,961 | 280,000 |

The aggregate build regained 36,961 gzip bytes and now retains 4,791 bytes below the ratcheted ceiling. The chart runtime regained 37,119 gzip bytes while preserving its existing legal-comment policy.

## Route closures

Static closures count the production entry, selected feature, verified data loader, validators, and recursive static imports exactly once. Settled closures additionally count only dynamic work started by that selected feature during normal activation: Current Season odds and Draft Spot charts. The checker deliberately does not follow every dynamic feature import from `index.html`.

| Route | Before static | Before settled | After static | After settled | Settled ceiling |
| --- | ---: | ---: | ---: | ---: | ---: |
| League Pulse | 105,184 | 105,184 | 105,182 | 105,182 | 115,000 |
| History | 107,883 | 107,883 | 107,879 | 107,879 | 115,000 |
| Current Season | 235,850 | 239,187 | 198,725 | 202,061 | 205,000 |
| Head to Head | 228,480 | 228,480 | 191,355 | 191,355 | 205,000 |
| Trophy Case | 228,348 | 228,348 | 191,223 | 191,223 | 205,000 |
| Dynasty Rankings | 229,481 | 229,481 | 192,358 | 192,358 | 205,000 |
| Draft Spot | 93,701 | 228,494 | 93,869 | 191,543 | 205,000 |
| Historical Matchup | 222,285 | 222,285 | 185,161 | 185,161 | 205,000 |

The manifest contains exactly one named `chart-runtime`. Current Season, Head to Head, Trophy Case, Dynasty Rankings, Draft Spot, and Historical Matchup settle on that same hashed file. Pulse, History, and the entry closure exclude it. Draft Spot’s static closure remains Plot-free and adds the runtime only through its guarded chart import.

## Enforced contracts

`scripts/data/bundle-budget.json` and `npm run check:bundle` enforce:

- aggregate JavaScript at or below 280,000 gzip;
- entry at or below 190,000 raw and 56,000 gzip;
- chart-runtime at or below 305,000 raw and 100,000 gzip;
- every non-validator chunk at or below 320,000 raw;
- League Pulse and History settled closures at or below 115,000 gzip;
- every settled chart route at or below 205,000 gzip;
- exactly one named chart-runtime and one Plot/vendor copy;
- Plot exclusion from the entry, League Pulse, and History;
- a dynamic, not static, Plot dependency for Draft Spot;
- one shared runtime in every chart route;
- dynamic manifest entries for all eight tabs and `load-league-assets`.

`node scripts/check_bundle_size.cjs --json` emits stable static and settled fields for every route. The human report prints the same route table plus chunk and runtime measurements. Synthetic graph tests cover cycles, shared-chunk deduplication, selected dynamics, missing/duplicate/leaked runtimes, separator normalization, and budget diagnostics.

## Generated vendor workflow

The committed vendor is a deterministic build boundary for a static Pages deployment:

1. Update `PLOT_VENDOR_EXPORTS` in `scripts/build_chart_vendor.cjs` only when product code needs another Plot API.
2. Run `npm run build:charts`.
3. Run `npm run check:charts-generated`; it regenerates in memory, compares exact bytes, and never writes.
4. Update the exact-export test and run `npm run test:charts`.
5. Build with `VITE_BASE_PATH=/Darling/ npm run build`, record the size delta, and obtain review for any budget impact.

Normal unit and production builds run the non-mutating check. A stale or missing committed vendor fails with the regeneration command instead of silently rewriting the worktree. Authored browser modules are also scanned and may not import `@observablehq/plot` directly.

## Decision record

A separate Draft bundle was rejected: even a `plot` plus `barY` prebundle retained most of Plot’s core, while the non-Draft bundle remained nearly as large. Shipping both would duplicate aggregate JavaScript. Custom SVG and a plotting-library migration remain separate projects because the exact named-export boundary meets the headroom objective without redesigning nine chart surfaces.
