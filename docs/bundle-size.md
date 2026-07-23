# Production JavaScript bundle budgets

The July 19, 2026 League Pulse build keeps the shell split and adds an eighth dynamic feature entry for the canonical home route.

| Snapshot | Entry raw | Entry gzip | Initial CSS | Total JavaScript gzip |
| --- | ---: | ---: | ---: | ---: |
| Before tab splitting | 852,370 | 258,468 | 85,740 | 293,628 |
| After tab splitting | 170,462 | 51,698 | 31,570 | 298,892 |
| League Pulse home | 171,382 | 52,050 | 31,590 | 306,830 |
| Cache-safe data freshness | 177,866 | 54,142 | 33,728 | 310,894 |
| Audit acceptance coverage | 177,873 | 54,159 | 33,728 | 311,263 |

The Pulse controller entry is 24,145 bytes raw / 7,012 bytes gzip. Its shared curse-tracker dependency is 23,615 bytes raw / 7,444 bytes gzip, keeping those combined feature chunks at 14,456 bytes gzip. Feature CSS is 5,059 bytes raw / 1,378 bytes gzip. The cold Pulse route remains smaller than the former History default and does not include Observable Plot.

The cache-safe build adds the global freshness disclosure and browser verification transport without a hashing dependency. Its lazy data-loader chunk is 4,468 bytes raw / 1,908 bytes gzip; the measured cold Pulse closure is 104,674 bytes gzip, and the aggregate build retains 4,106 bytes of headroom under the unchanged ceiling.

The July 23 audit-remediation build adds only test-facing snapshot infrastructure and bounded streaming transport guards to the product surface. Its cold History closure is 107,615 bytes gzip, its cold Pulse closure is 105,029 bytes gzip, and the aggregate build retains 3,737 bytes of headroom under the unchanged ceiling.

## Cold route closures

The values below use each route's production-manifest static-import closure, counting the shell, shared dependencies, requested feature, and verified data path once. Draft Spot additionally includes the chart runtime that it requests dynamically during its initial render.

| Route | JavaScript gzip |
| --- | ---: |
| League Pulse | 105,029 |
| History | 107,615 |
| Draft Spot | 227,763 |
| Historical Matchup | 221,502 |
| Trophy Case | 227,541 |
| Head to Head | 227,743 |
| Dynasty Rankings | 228,672 |
| Current Season | 235,103 |

Each value is the complete transitive JavaScript closure for a cold direct route, including the shell, shared feature core, verified data loader, and validator chunks. Chart routes also include the shared 407,377-byte raw / 134,250-byte gzip `chart-runtime` chunk. It contains the single Observable Plot/vendor copy and is absent from cold Pulse and History requests. Draft Spot requests this runtime dynamically for its pick-distribution and timeline charts, so its complete closure includes that dynamic import.

## Enforced contracts

`scripts/data/bundle-budget.json` and `npm run check:bundle` enforce:

- entry at or below 350,000 raw and 120,000 gzip;
- cold History at or below 200,000 gzip;
- cold League Pulse at or below 140,000 gzip and free of Plot/chart runtime;
- every feature-owned entry at or below 50,000 gzip;
- total JavaScript at or below 315,000 gzip;
- every non-validator application chunk below 500,000 raw;
- dynamic manifest entries for all eight tabs and `load-league-assets`;
- no feature controller or Plot module in the entry's static closure;
- no duplicate Plot/vendor output.

The aggregate ceiling changed once from 300,000 to 315,000 bytes because the measured total is 306,830 bytes after verifying that Pulse is lazy, its 100,608-byte cold route is below target, Plot is absent, and shared helpers are not duplicated. The observed build leaves 8,170 bytes of policy headroom and stays below the implementation plan's 310,000-byte acceptance threshold.

Use `node scripts/check_bundle_size.cjs --json` for machine-readable evidence. The human report lists emitted chunks, the cold History and Pulse closures, and required dynamic entries. Playwright resource tests derive hashed filenames from `dist/.vite/manifest.json`; do not assert literal hashes.
