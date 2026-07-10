# Interactive Tables

The Darling's primary History, Head to Head, Current Season, and Trophy tables use one Preact table runtime backed by TanStack Table v9. The adapter is currently published under the `@beta` tag, so dependency upgrades should be reviewed against the Preact migration notes before updating the lockfile.

## Table IDs

The supported IDs live in `src/tables/table-types.ts`:

| Table ID | Feature |
| --- | --- |
| `history-opponents` | History opponent/team breakdown |
| `history-seasons` | History season recap |
| `history-weeks` | History week-by-week log |
| `history-games` | History all-games log |
| `rivalry-seasons` | Head to Head season breakdown |
| `rivalry-games` | Head to Head game log |
| `current-standings` | Current standings |
| `current-projected` | Projected standings |
| `trophy-seasons` | Trophy season ledger |

Tier 4 mini tables, Dynasty detail tables, and the Gauntlet comparison remain legacy by design.

## Architecture

- `src/tables/table-runtime.tsx` exposes the `window.darlingTables` bridge used by the legacy feature controller.
- `src/tables/table-registry.ts` owns columns, default sorting, pinned identity columns, quick filters, page sizes, and empty-state language.
- `src/tables/rows/` adapts existing feature view models into stable table rows. Domain calculations remain in the existing History, Rivalry, Current Season, and Trophy helpers.
- `src/components/tables/InteractiveTable.tsx` owns TanStack state and native table markup.
- The toolbar components own typed filters, visibility/pinning controls, local views, reset, and result counts.

The feature controller should pass already-calculated rows and context through `window.darlingTables.render(tableId, payload)`. Do not duplicate league calculations in a table component.

## URL and Local State Ownership

History's canonical game-query fields remain URL-owned:

- `gameResult`
- `gameMinScore`
- `gameMaxScore`
- `gameSort`
- `gameLimit`

The History game table initializes from those fields and sends supported sort/filter changes back through `state-helpers.js`. Browser back/forward therefore restores Global Search deep links.

Presentation state stays local to the table unless saved in a view:

- column visibility
- column pinning
- page size
- quick filters that do not map to canonical URL fields

## Saved Views

User views are stored in `localStorage["darling.tableViews.v1"]`, capped at 25 total entries, and never synced off-device. A saved view contains:

- table ID and display name
- sorting and typed column filters
- quick filters
- column visibility and pinning
- page size
- relevant owner/rivalry context

Expanded rows and current page index are intentionally transient. Restore validates the schema and drops stale column or quick-filter IDs. Invalid JSON, unknown table IDs, version mismatches, and storage write failures fail safely.

## Adding or Changing a Table

1. Add the ID to `TABLE_IDS` in `src/tables/table-types.ts`.
2. Add a registry entry with typed columns, useful default sort, one pinned identity column, quick filters, page size, and empty text.
3. Add or extend a row adapter in `src/tables/rows/`. Every row needs a stable, perspective-aware ID.
4. Add the mount element to static markup or the appropriate feature renderer.
5. Call the runtime from `js/history-controller.js` after the mount exists.
6. Cover filter/sort values, null handling, details, saved-state sanitization, and the feature's Playwright flow.

Quick filters are predicates over adapted rows. Give incompatible filters the same `group` so selecting one replaces the other; filters without a shared group compose.

## Validation

Run:

```bash
npm run typecheck
npm run test:tables
npm run build
npm run test:ui
npm run test:ci
```

The browser suite covers sorting, typed filtering, quick filters, expansion, saved-view persistence, Global Search deep links, migrated table families, selected-owner state, dark-mode pinned surfaces, and the mobile sticky-column layout.
