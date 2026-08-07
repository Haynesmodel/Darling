# Production JavaScript bundle budgets

## Deferred charts and strict Preact migration — PR A

The first migration slice was measured from clean base `de9f11d42cc79e31f9cc3d5a8a80dfc3a33b451c` with Node 24.18.0, npm 11.18.0, Vite 8.1.4, gzip level 9, and `VITE_BASE_PATH=/Darling/`. The implementation SHA and exact CI run are recorded in the pull request because documentation-only commits do not change the production graph.

| Metric | Base | PR A | Delta | Target / maximum |
| --- | ---: | ---: | ---: | ---: |
| Entry gzip | 48,009 | 48,025 | +16 | 48,250 / 56,000 |
| Aggregate JavaScript gzip | 297,868 | 299,628 | +1,760 | final 297,868 / 300,000 |
| Chart-runtime gzip | 95,561 | 96,200 | +639 | 97,000 / 100,000 |
| Head to Head feature gzip | 7,100 | 8,210 | +1,110 | 50,000 maximum |
| Head to Head static route gzip | 191,922 | 88,530 | -103,392 | 115,000 maximum |
| Head to Head settled route gzip | 191,922 | 184,730 | -7,192 | 205,000 maximum |

PR A deliberately enforces only the initiative's hard aggregate maximum; the 297,868 final target applies after the remaining paired legacy deletions. Authored chart data, theme, specification, runtime, and rendering helpers now live in the strict `src/charting/` island; only the generated vendor remains under `js/charting/`. The Head to Head static closure no longer contains Plot. Its settled closure discovers `chart-runtime` through the feature's recursive static closure and the shared loader, with cycle-safe traversal and shared-chunk deduplication.

The network contract is: a cold Head to Head route has zero `chart-runtime` responses; opening a far-away Lead Trend disclosure still has zero; entering the 600-pixel expanded viewport or activating `Load Lead Trend chart` produces exactly one successful response. Later charts use the cached module promise. A failed import clears the application promise for Retry, while reload remains the recovery path if the browser module map retains a failed fetch.

## Shareable cards and automated recaps

The final share-card and League Newspaper implementation was remeasured on August 5, 2026 from clean base `697eb411447abb4066f2b944168e5f0b6fd4c26d` to implementation commit `83f0741d2b38946294b02bc54750dd1ba9addbec` in [PR #53](https://github.com/Haynesmodel/Darling/pull/53). Both artifacts used Node 24.18.0, npm 11.18.0, Vite 8.1.4, and `VITE_BASE_PATH=/Darling/`.

| Metric | Base | Implementation | Delta | Enforced ceiling |
| --- | ---: | ---: | ---: | ---: |
| Entry gzip | 55,962 | 48,009 | -7,953 | 56,000 |
| Aggregate JavaScript gzip | 295,829 | 297,868 | +2,039 | 300,000 |
| Chart-runtime gzip | 95,567 | 95,561 | -6 | 100,000 |
| Share-card runtime gzip | — | 1,670 | — | Click-loaded only |
| League Pulse feature gzip | 6,799 | 9,409 | +2,610 | Route-enforced |
| Current Season feature gzip | 10,137 | 10,235 | +98 | Route-enforced |

| Settled route | Base | Implementation | Delta | Ceiling |
| --- | ---: | ---: | ---: | ---: |
| League Pulse | 104,823 | 105,965 | +1,142 | 115,000 |
| Current Season | 203,254 | 198,362 | -4,892 | 205,000 |
| Head to Head | 189,300 | 191,922 | +2,622 | 205,000 |
| Trophy Case | 188,899 | 184,881 | -4,018 | 205,000 |
| Dynasty Rankings | 190,033 | 188,563 | -1,470 | 205,000 |
| Draft Spot | 189,852 | 186,688 | -3,164 | 205,000 |

No budget value or production dependency increased. The command palette and share preview are separately lazy-loaded; the bundle checker requires the share runtime to be a dynamic entry absent from every initial and settled route closure. Compact generated validator errors offset the feature fan-out without weakening browser schema validation or Node-side diagnostics.

The committed default card is a 10,620-byte 1200×630 PNG with SHA-256 `c751180ae59a400c401c59f8f9051f6a5ebb9d6ec26ac5a4d1416a87cab51cc5`. Its static raster path converts the shared SVG text into integer-coordinate vector glyphs before Sharp encodes it, avoiding operating-system font substitution while retaining exact byte-for-byte regeneration.

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

Static closures count the production entry, selected feature, verified data loader, validators, and recursive static imports exactly once. Settled closures additionally count configured eligible dynamics: Current Season odds for an active regular-season command/standings view, the deferred Head to Head runtime, and Draft Spot charts. Dynamic lookup traverses the feature's complete static closure, not only the feature entry's direct imports. The checker deliberately does not follow every dynamic feature import from `index.html`.

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

- aggregate JavaScript targeting 297,868 gzip after the final migration slice and at or below the 300,000 hard ceiling throughout;
- entry targeting 48,250 gzip and at or below 190,000 raw and 56,000 gzip;
- chart-runtime targeting 97,000 gzip and at or below 305,000 raw and 100,000 gzip;
- every non-validator chunk at or below 320,000 raw;
- League Pulse, Owner Hub, and History settled closures at or below 115,000 gzip;
- Transactions settled closure at or below 120,000 gzip and its feature entry at or below 18,000 gzip;
- every settled chart route at or below 205,000 gzip;
- exactly one named chart-runtime and one Plot/vendor copy;
- Plot exclusion from the entry, League Pulse, Owner Hub, Transactions, and History;
- a dynamic, not static, Plot dependency for Head to Head and Draft Spot;
- one shared runtime in every chart route;
- dynamic manifest entries for all ten feature destinations and `load-league-assets`.

`node scripts/check_bundle_size.cjs --json` emits stable static and settled fields for every route. The human report prints the same route table plus chunk and runtime measurements. Synthetic graph tests cover cycles, nested dynamic lookup, shared-chunk deduplication, selected dynamics, missing/duplicate/leaked runtimes, separator normalization, and static/settled/aggregate budget diagnostics.

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
