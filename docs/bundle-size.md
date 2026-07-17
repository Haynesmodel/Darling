# Production JavaScript bundle budgets

The July 17, 2026 tab-splitting build replaces the synchronous all-feature entry with a shell plus seven dynamic feature entries.

| Snapshot | Entry raw | Entry gzip | Initial CSS | Total JavaScript gzip |
| --- | ---: | ---: | ---: | ---: |
| Before tab splitting | 852,370 | 258,468 | 85,740 | 293,628 |
| After tab splitting | 170,878 | 51,870 | 31,570 | 299,978 |

The entry is 80% smaller raw and gzip. Total JavaScript remains under the unchanged 300,000-byte gzip ceiling; the small increase is dynamic-entry/lifecycle overhead rather than code on the default route.

## Cold route closures

The manifest checker counts the shell, static dependencies, requested feature, and validated data path once per route.

| Route | JavaScript gzip |
| --- | ---: |
| History | 102,779 |
| Draft Spot | 89,240 |
| Historical Matchup | 217,300 |
| Trophy Case | 223,423 |
| Head to Head | 223,643 |
| Dynasty Rankings | 224,498 |
| Current Season | 231,123 |

Chart routes include the shared 407,447-byte raw / 134,308-byte gzip `chart-runtime` chunk. It contains the single Observable Plot/vendor copy and is absent from cold History and Draft Spot requests.

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
