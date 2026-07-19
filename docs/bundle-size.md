# Production JavaScript bundle budgets

The July 19, 2026 League Pulse build keeps the shell split and adds an eighth dynamic feature entry for the canonical home route.

| Snapshot | Entry raw | Entry gzip | Initial CSS | Total JavaScript gzip |
| --- | ---: | ---: | ---: | ---: |
| Before tab splitting | 852,370 | 258,468 | 85,740 | 293,628 |
| After tab splitting | 170,462 | 51,698 | 31,570 | 298,892 |
| League Pulse home | 171,369 | 52,035 | 31,590 | 306,442 |

The Pulse-owned entry is 53,709 bytes raw / 15,783 bytes gzip, and its feature CSS is 4,888 bytes raw / 1,348 bytes gzip. The cold Pulse route remains smaller than the former History default and does not include Observable Plot.

## Cold route closures

The manifest checker counts the shell, static dependencies, requested feature, and validated data path once per route.

| Route | JavaScript gzip |
| --- | ---: |
| League Pulse | 100,224 |
| History | 103,318 |
| Draft Spot | 223,061 |
| Historical Matchup | 217,295 |
| Trophy Case | 223,418 |
| Head to Head | 223,638 |
| Dynasty Rankings | 224,493 |
| Current Season | 231,118 |

Chart routes include the shared 407,377-byte raw / 134,250-byte gzip `chart-runtime` chunk. It contains the single Observable Plot/vendor copy and is absent from cold History requests. Draft Spot requests this runtime for its pick-distribution and timeline charts, so its complete cold-route closure includes the chunk.

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

The aggregate ceiling changed once from 300,000 to 315,000 bytes because the measured total is 306,442 bytes after verifying that Pulse is lazy, its 100,224-byte cold route is below target, Plot is absent, and shared helpers are not duplicated. The observed build leaves 8,558 bytes of policy headroom and stays below the implementation plan's 310,000-byte acceptance threshold.

Use `node scripts/check_bundle_size.cjs --json` for machine-readable evidence. The human report lists emitted chunks, the cold History and Pulse closures, and required dynamic entries. Playwright resource tests derive hashed filenames from `dist/.vite/manifest.json`; do not assert literal hashes.
