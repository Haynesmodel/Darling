# Production JavaScript bundle baseline

The data-layer hardening merge (`449aaea`) produced one production JavaScript chunk:

| Snapshot | Entry bytes | Entry gzip | Data runtime | Total gzip |
| --- | ---: | ---: | ---: | ---: |
| `449aaea` baseline | about 1,020,260 | about 272,150 | bundled into entry | about 272,150 |
| Hotfix split | about 826,600 | about 251,100 | about 195,900 / 17,700 gzip | about 268,800 |
| Historical snapshot/rules remediation (`f4b65a4`) | about 852,400 | about 258,500 | about 3,400 / 1,600 gzip | about 293,700 |

The generated validator source is roughly 345 KB before Vite minification. It is now reached through a dynamic import with the typed data loader, so schema validation does not inflate the initial entry chunk or execute before league data is requested.

`scripts/data/bundle-budget.json` records the baseline and enforceable budgets:

- Entry JavaScript must remain below 855 KB.
- Total JavaScript gzip must remain below 300 KB.
- A dedicated dynamic `load-league-assets` chunk must exist.

`npm run check:bundle` measures the built files using `dist/.vite/manifest.json`. `npm run build` runs this check automatically after the output audit.

The remaining entry chunk is still large because it contains the established application, Observable Plot, table runtime, and feature renderers. Future reductions should prioritize feature-level dynamic imports rather than weakening the data validation boundary.

The July 2026 remediation raised the entry ceiling from 850 KB to 855 KB after adding shared historical week-snapshot and postseason-rule inference to the synchronous Current Season view. The measured entry increased by about 2.4 KB (roughly 0.3%), while the existing 300 KB total-gzip ceiling remains unchanged. The 5 KB adjustment records that required correctness cost while retaining less than 3 KB of entry headroom.
