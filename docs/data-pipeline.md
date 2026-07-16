# Data pipeline

The Darling deploys one coherent, content-addressed data snapshot. The four source JSON files remain human-reviewable inputs; schemas, generated contracts, derived statistics, and the manifest make the snapshot safe to consume and reproduce.

## Source and generated files

Source files:

- `assets/H2H.json`
- `assets/SeasonSummary.json`
- `assets/Rivalries.json`
- `assets/CurrentSeason.json`
- `schemas/*.schema.json`
- `scripts/data/known-data-exceptions.json`

Generated files (do not edit by hand):

- `src/data/generated/asset-types.ts`
- `src/data/generated/asset-validators.ts`
- `assets/DerivedStats.json`
- `assets/asset-manifest.json`

JSON Schema Draft 2020-12 is authoritative. TypeScript types and standalone browser validators are generated from the schemas. Ajv is used only while generating and validating; the browser bundle receives compiled validators, not the Ajv compiler.

The field-by-field source inventory is recorded in [data-field-inventory.md](data-field-inventory.md).

## Normal update workflow

After changing source data:

```sh
npm run generate:data
npm run check:data-generated
npm run test:assets
npm run test:unit
```

`generate:data` must be intentional because it changes tracked files. `build`, `test:assets`, and `check:data-generated` are read-only with respect to tracked data artifacts.

The generated order is significant:

1. Generate TypeScript types.
2. Generate standalone runtime validators.
3. Generate `DerivedStats.json` from H2H, SeasonSummary, and Rivalries.
4. Generate `asset-manifest.json` last.

Commit source and generated changes together. Editing source JSON without regenerating derived data and the manifest fails CI.

## Changing a schema

1. Update the relevant file in `schemas/`.
2. Keep `additionalProperties: false` unless a field is intentionally open-ended.
3. Update producers and committed source JSON in the same change when a field becomes required.
4. Increment schema-version constants when the deployed contract changes.
5. Run `npm run generate:data` and the full tests.

Compatible optional fields, required migrations, and interpretation changes should still be reviewed as explicit contract changes. Deployed assets and app code ship together, so unsupported versions fail rather than being silently coerced.

## Structural, semantic, and artifact errors

Failures use stable rule IDs:

```text
ERROR [H2H_DUPLICATE_GAME] assets/H2H.json row 418: duplicates canonical game ...
ERROR [SUMMARY_POINTS_MISMATCH] assets/SeasonSummary.json: ...
ERROR [MANIFEST_STALE] assets/asset-manifest.json: regenerate with npm run generate:manifest
WARN  [MEDIA_SOURCE_OFFLOADED] assets/LeaguePic.jpeg: ...
```

Structural errors identify the file, row, and field. Semantic errors identify the league rule. Manifest and media errors identify the repair command or missing artifact.

Historical inconsistencies must not weaken a rule globally. Add a narrow entry to `scripts/data/known-data-exceptions.json` with `rule_id`, `record_key`, `reason`, and an optional `retirement_condition`. Unused exceptions fail validation as stale.

## Derived statistics

`DerivedStats.json` contains versioned, filter-independent calculations:

- Season aggregates, expected wins, and schedule luck.
- Complete directional head-to-head summaries.
- Weekly high, low, and 150-point awards.
- Score extremes and sub-70 counts.
- Longest win and loss streaks.
- Owner career totals.
- Regular-season Gauntlet distributions.

Interactive filters, URL state, live projections, chart layout, and postseason-weighted Gauntlet selections remain dynamic. For the first release, the manifest marks DerivedStats optional and the browser falls back to the existing client calculations when it is missing, invalid, or stale. Once those fallbacks are removed, the manifest can make the artifact required. Parity tests compare generated metrics with the fallback implementations.

Increment `derived_generator_version` whenever calculation meaning changes, even if input schemas do not.

## Manifest and data version

`asset-manifest.json` records schema versions, source and derived hashes, byte sizes, row counts, season coverage, dependencies, and hero metadata. `data_version` hashes canonical JSON inputs, schema versions, the derived generator version, the derived hash, and runtime media hashes.

The manifest does not hash itself, contain wall-clock generation timestamps, or record ignored local iCloud placeholder state. Unchanged tracked inputs therefore produce byte-identical output in local development and CI. The browser exposes diagnostics at `window.darlingDataDiagnostics` and the full version at `window.__darlingDataVersion`.

## Media rules and iCloud recovery

The twelve files under `assets/hero/` are runtime-required. Validation checks their magic bytes, decoder format, exact width, aspect ratio, size budget, SHA-256, and manifest metadata.

`assets/LeaguePic.jpeg` is regeneration-optional. If it is offloaded as `assets/.LeaguePic.jpeg.icloud`, validation warns but succeeds while `assets/hero/league-1920.jpg` remains a valid fallback. To replace or re-crop the photo, download the original first. If neither source nor fallback exists, `npm run build:hero` fails with recovery instructions.

## Sleeper automation

The weekly workflow writes candidate H2H and CurrentSeason files, promotes changed sources, produces the SeasonSummary draft, regenerates derived data and the manifest, validates the whole snapshot, and stages all coherent outputs together. Failures upload candidate files for diagnosis and do not commit partial data.

Local validation-only example:

```sh
UPDATE_LIVE=1 VALIDATE_ONLY=1 SEASON=2025 CURRENT_WEEK=1 scripts/update_sleeper_h2h.sh
```

## Deployment audit

`npm run build` performs generated drift, data, semantic, manifest, and media checks before Vite builds. It then audits `dist/` against the manifest. Pages runs the same checks before uploading the artifact.

Useful recovery commands:

```sh
npm run generate:derived    # source hash or stale derived output
npm run generate:manifest
npm run generate:data-types # schema/type drift
npm run generate:data-validators
npm run test:assets         # inspect the complete snapshot
npm run audit:dist          # confirm built output inventory
```

## Current measurements

On the implementation machine (Node 23; CI targets Node 20):

- Derived generation: under 100 ms for 898 games.
- Full generated drift check: under 2 seconds.
- `DerivedStats.json`: about 180 KB uncompressed.
- Browser startup uses generated aggregates when available; client calculations remain only as recovery fallbacks.

These values are guardrails, not contractual benchmarks. Re-measure when generator meaning, data volume, or feature consumption changes.

Production JavaScript baseline and chunk budgets are documented in [bundle-size.md](bundle-size.md).
