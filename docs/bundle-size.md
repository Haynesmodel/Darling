# Production JavaScript bundle budgets

The July 17, 2026 tab-splitting build replaces the synchronous all-feature entry with a shell plus seven dynamic feature entries.

| Snapshot | Entry raw | Entry gzip | Initial CSS | Total JavaScript gzip |
| --- | ---: | ---: | ---: | ---: |
| Before tab splitting | 852,370 | 258,468 | 85,740 | 293,628 |
| After tab splitting | 170,462 | 51,698 | 31,570 | 298,892 |

The entry is 80% smaller raw and gzip. Total JavaScript remains under the unchanged 300,000-byte gzip ceiling; the small increase is dynamic-entry/lifecycle overhead rather than code on the default route.

## Cold route closures

The manifest checker counts the shell, static dependencies, requested feature, and validated data path once per route.

| Route | JavaScript gzip |
| --- | ---: |
| History | 102,332 |
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
- every feature-owned entry at or below 50,000 gzip;
- total JavaScript at or below 300,000 gzip;
- every non-validator application chunk below 500,000 raw;
- dynamic manifest entries for all seven tabs and `load-league-assets`;
- no feature controller or Plot module in the entry's static closure;
- no duplicate Plot/vendor output.

Use `node scripts/check_bundle_size.cjs --json` for machine-readable evidence. The human report lists emitted chunks, the cold History closure, and required dynamic entries. Playwright resource tests derive hashed filenames from `dist/.vite/manifest.json`; do not assert literal hashes.
