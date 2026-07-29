# Production JavaScript bundle budgets

## Shareable cards and automated recaps

The July 29, 2026 share-card and League Newspaper implementation was measured from clean base `697eb411447abb4066f2b944168e5f0b6fd4c26d` to implementation commit `30d62af8de9c4aa50e326fe9ef70b9b767ac3853` in [PR #53](https://github.com/Haynesmodel/Darling/pull/53). Both artifacts used Node 24.18.0, npm 11.18.0, Vite 8.1.4, and `VITE_BASE_PATH=/Darling/`.

| Metric | Base | Implementation | Delta | Enforced ceiling |
| --- | ---: | ---: | ---: | ---: |
| Entry gzip | 55,962 | 48,002 | -7,960 | 56,000 |
| Aggregate JavaScript gzip | 295,829 | 295,927 | +98 | 300,000 |
| Chart-runtime gzip | 95,567 | 95,561 | -6 | 100,000 |
| Share-card runtime gzip | — | 2,625 | — | Click-loaded only |
| League Pulse feature gzip | 6,799 | 9,500 | +2,701 | Route-enforced |
| Current Season feature gzip | 10,137 | 10,234 | +97 | Route-enforced |

| Settled route | Base | Implementation | Delta | Ceiling |
| --- | ---: | ---: | ---: | ---: |
| League Pulse | 104,823 | 103,666 | -1,157 | 115,000 |
| Current Season | 203,254 | 195,969 | -7,285 | 205,000 |
| Head to Head | 189,300 | 189,531 | +231 | 205,000 |
| Trophy Case | 188,899 | 182,489 | -6,410 | 205,000 |
| Dynasty Rankings | 190,033 | 186,133 | -3,900 | 205,000 |
| Draft Spot | 189,852 | 183,741 | -6,111 | 205,000 |

No budget value or production dependency increased. The command palette and share preview are separately lazy-loaded; the bundle checker requires the share runtime to be a dynamic entry absent from every initial and settled route closure. Compact generated validator errors offset the feature fan-out without weakening browser schema validation or Node-side diagnostics.

## Transactions route delta

The July 28, 2026 Transactions change was measured from clean base `2b8ead1b129262b8608e9ccd9613a474e9e1f76e` with Node 24.14.0, npm 11.18.0, Vite 8.1.4, and `VITE_BASE_PATH=/Darling/`.

| Metric | Base | Transactions | Delta | Enforced ceiling |
| --- | ---: | ---: | ---: | ---: |
| Entry gzip | 55,028 | 55,962 | +934 | 56,000 |
| Aggregate JavaScript gzip | 279,770 | 295,829 | +16,059 | 300,000 |
| Transactions feature chunk gzip | — | 14,374 | — | 18,000 |
| Transactions settled route gzip | — | 95,294 | — | 120,000 |
| Current Season settled gzip | ≤205,000 | 203,254 | — | 205,000 |
| Chart-runtime gzip | 96,430 | 95,567 | -863 | 100,000 |

The aggregate target is 298,000 gzip with a 300,000 hard ceiling. Transaction schema code is generated into `transaction-history-validator.ts` and reachable only from the Transactions entry; keeping it out of the shared core validator protects every existing route closure. Transactions has no chart or interactive-table runtime dependency, and cold non-transaction routes do not fetch its JSON asset.

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

## Navigation shell delta

The July 24, 2026 semantic-navigation and compact-chrome change was measured from clean base `ef580af` and its working-tree result with Node 24.14.0, local npm 10.9.2, Vite 8.1.4, and `VITE_BASE_PATH=/Darling/`. Hosted acceptance repeats the build with repository-declared npm 11.18.0.

| Metric | `ef580af` | Navigation shell | Delta | Enforced ceiling |
| --- | ---: | ---: | ---: | ---: |
| Entry raw | 177,873 | 178,018 | +145 | 190,000 |
| Entry gzip | 54,266 | 54,145 | -121 | 56,000 |
| Aggregate JavaScript gzip | 275,209 | 275,095 | -114 | 280,000 |
| Chart-runtime raw | 294,294 | 294,294 | 0 | 305,000 |
| Chart-runtime gzip | 97,674 | 97,674 | 0 | 100,000 |
| Current Season settled gzip | 202,061 | 201,943 | -118 | 205,000 |

The grouped navigation replaces the roving-tab and overflow-arrow implementation without adding a dependency or raising a ceiling. All eight dynamic feature entries remain present, Pulse and History remain Plot-free, and the entry retains 1,855 gzip bytes of headroom.

## Current lifecycle and disclosure delta

The July 24, 2026 phase-aware Current Season change was measured from merged semantic-navigation main `91f2ca5` with Node 24.14.0, Vite 8.1.4, and `VITE_BASE_PATH=/Darling/`.

| Metric | `91f2ca5` | Lifecycle/disclosure | Delta | Enforced ceiling |
| --- | ---: | ---: | ---: | ---: |
| Entry raw | 178,018 | 178,168 | +150 | 190,000 |
| Entry gzip | 54,145 | 54,184 | +39 | 56,000 |
| Aggregate JavaScript gzip | 275,095 | 276,969 | +1,874 | 280,000 |
| Chart-runtime raw | 294,294 | 294,294 | 0 | 305,000 |
| Chart-runtime gzip | 97,674 | 97,674 | 0 | 100,000 |
| Current Season static gzip | 198,607 | 201,013 | +2,406 | 205,000 |
| Current Season eligible settled gzip | 201,943 | 204,349 | +2,406 | 205,000 |

No ceiling or runtime dependency changed. The generated browser validator now embeds only the RFC 3339 `date` and `date-time` implementations referenced by Darling's schemas instead of transporting the rest of the unused `ajv-formats` catalog. Node-side schema tooling retains the full package, and parity tests compare the specialized browser functions with AJV's reference validators. The canonical finalized route is the smaller static closure at runtime because recap does not start odds work; the settled figure remains the enforced worst-case closure for an eligible live regular-season command view.

## Analytical disclosure completion delta

The July 25, 2026 final disclosure phase was measured from merged PR B main `cfcd6c3` with Node 24.14.0, npm 11, Vite 8.1.4, and `VITE_BASE_PATH=/Darling/`.

| Metric | `cfcd6c3` | Final disclosure | Delta | Enforced ceiling |
| --- | ---: | ---: | ---: | ---: |
| Entry raw | 178,168 | 178,202 | +34 | 190,000 |
| Entry gzip | 54,175 | 54,192 | +17 | 56,000 |
| Aggregate JavaScript gzip | 276,981 | 279,567 | +2,586 | 280,000 |
| Chart-runtime raw | 294,294 | 294,294 | 0 | 305,000 |
| Chart-runtime gzip | 97,674 | 97,674 | 0 | 100,000 |

| Route | `cfcd6c3` settled gzip | Final settled gzip | Delta | Settled ceiling |
| --- | ---: | ---: | ---: | ---: |
| League Pulse | 103,916 | 103,937 | +21 | 115,000 |
| History | 106,156 | 107,515 | +1,359 | 115,000 |
| Current Season | 204,352 | 204,563 | +211 | 205,000 |
| Head to Head | 189,634 | 191,015 | +1,381 | 205,000 |
| Trophy Case | 189,504 | 190,864 | +1,360 | 205,000 |
| Dynasty Rankings | 190,636 | 192,073 | +1,437 | 205,000 |
| Draft Spot | 189,823 | 191,526 | +1,703 | 205,000 |
| Historical Matchup | 183,439 | 184,918 | +1,479 | 205,000 |

The shared disclosure controller is emitted once as a 1,039-byte gzip chunk and reused by every analytical route. No ceiling, dependency, feature boundary, lazy entry, chart-runtime copy, or URL state field changed. Supporting charts defer DOM mounting while closed; that runtime behavior does not alter the static route closure calculation.

## Route closures

Static closures count the production entry, selected feature, verified data loader, validators, and recursive static imports exactly once. Settled closures additionally count eligible selected dynamics: Current Season odds for an active regular-season command/standings view and Draft Spot charts. The checker deliberately does not follow every dynamic feature import from `index.html`.

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

- aggregate JavaScript targeting 298,000 gzip and at or below the 300,000 hard ceiling;
- entry at or below 190,000 raw and 56,000 gzip;
- chart-runtime at or below 305,000 raw and 100,000 gzip;
- every non-validator chunk at or below 320,000 raw;
- League Pulse, Owner Hub, and History settled closures at or below 115,000 gzip;
- Transactions settled closure at or below 120,000 gzip and its feature entry at or below 18,000 gzip;
- every settled chart route at or below 205,000 gzip;
- exactly one named chart-runtime and one Plot/vendor copy;
- Plot exclusion from the entry, League Pulse, Owner Hub, Transactions, and History;
- a dynamic, not static, Plot dependency for Draft Spot;
- one shared runtime in every chart route;
- dynamic manifest entries for all ten feature destinations and `load-league-assets`.

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
