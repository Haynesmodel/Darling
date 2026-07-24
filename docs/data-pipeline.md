# Data pipeline

The Darling deploys one coherent, content-addressed data snapshot. The four source JSON files remain human-reviewable inputs; schemas, generated contracts, Draft Spot observations, derived statistics, and the manifest make the snapshot safe to consume and reproduce.

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
- `assets/DraftSpot.json`
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

1. Generate `DraftSpot.json` deterministically from `SeasonSummary.json`.
2. Generate TypeScript types.
3. Generate standalone runtime validators.
4. Generate `DerivedStats.json` from H2H, SeasonSummary, and Rivalries.
5. Generate `asset-manifest.json` last.

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

## Draft Spot dependency contract

`DraftSpot.json` contains one row per owner-season only when that season has complete draft-pick data. It records the canonical `SeasonSummary.json` SHA-256 in `source_sha256`; structural validation and generated drift checks reject stale output.

The manifest includes Draft Spot with `required: false` so the main historical app remains usable after a runtime fetch failure. Generation, schema validation, source-hash validation, manifest inclusion, built-output presence, and byte-for-byte drift are mandatory in CI.

## Manifest and data version

`asset-manifest.json` records schema versions, source and derived hashes, byte sizes, row counts, season coverage, dependencies, and hero metadata. `data_version` hashes canonical JSON inputs, schema versions, the derived generator version, the derived hash, and runtime media hashes.

The manifest does not hash itself, contain wall-clock generation timestamps, or record ignored local iCloud placeholder state. Unchanged tracked inputs therefore produce byte-identical output in local development and CI. The browser exposes diagnostics at `window.darlingDataDiagnostics` and the full version at `window.__darlingDataVersion`.

## Runtime cache and integrity contract

The browser requests `asset-manifest.json` with `cache: no-store`. Every JSON asset URL then includes its full manifest SHA-256 as a `v` query parameter. The first content-versioned request may use the HTTP cache; the browser reads the response once, checks its raw byte count, parses strict UTF-8 JSON, recreates the repository's canonical JSON representation, and verifies the canonical SHA-256 with Web Crypto.

A size, UTF-8, parse, or digest mismatch gets one deterministic retry with `cache: reload`. Required H2H and SeasonSummary failures stop application readiness. Rivalries, CurrentSeason, and DerivedStats retain typed optional fallbacks, and lazy Draft Spot applies the same verification before schema and SeasonSummary dependency checks. Web Crypto unavailability fails closed for required data.

This detects mixed, stale, truncated, or accidentally replaced deployment assets. It is not an authenticity signature: the manifest and assets share one origin, so a party able to replace both remains outside the trust boundary. Expected and actual values are available in typed diagnostics without exposing response bodies.

The global data disclosure classifies valid data by league lifecycle. Weekly active snapshots age after six days and warn after eight, live-labelled scores warn after 30 minutes, and a complete finalized season remains final during the offseason regardless of age. On August 15, a missing current-year snapshot becomes a season-gap warning. The disclosure reassesses locally every 15 minutes and on tab visibility without polling or mutating the boot snapshot.

## Media rules and iCloud recovery

The twelve files under `assets/hero/` are runtime-required. Validation checks their magic bytes, decoder format, exact width, aspect ratio, size budget, SHA-256, and manifest metadata.

`assets/LeaguePic.jpeg` is regeneration-optional. If it is offloaded as `assets/.LeaguePic.jpeg.icloud`, validation warns but succeeds while `assets/hero/league-1920.jpg` remains a valid fallback. To replace or re-crop the photo, download the original first. If neither source nor fallback exists, `npm run build:hero` fails with recovery instructions.

## Sleeper automation

The weekly workflow runs only from the trusted `main` definition, with the default token limited to Contents read and Issues write. It writes candidate H2H and CurrentSeason files, promotes them only inside the runner, regenerates the review draft, derived data, and manifest, and validates the coherent snapshot before requesting publication credentials.

Validation-only runs use the shell script's temporary directory and never copy canonical assets, stage files, mint an App token, update a branch or pull request, or close the failure issue. Full no-change runs likewise stop before App authentication and remote mutation.

For a changed candidate, publication is restricted to:

- `assets/H2H.json`
- `assets/CurrentSeason.json`
- `assets/SeasonSummary.draft.json`
- `assets/DerivedStats.json`
- `assets/asset-manifest.json`

The summary helper rejects removed or changed historical H2H games, additions outside the target season, and a CurrentSeason season or league mismatch. It produces a deterministic, Markdown-escaped review summary with game/status deltas, manifest hashes, source SHAs, completed checks, and the human review checklist.

Only after those checks pass does the workflow mint a short-lived Darling GitHub App token scoped to the current repository with Contents and Pull requests write permissions. App preflight verifies that the installation token can see exactly Darling and that `main` remains the default branch. The token is supplied through `GH_TOKEN`; checkout credentials are not persisted and the token is not placed in Git configuration or a remote URL.

Changed data is committed to `automation/sleeper-<season>` and pushed only with an exact observed-SHA force-with-lease after confirming bot ownership. The workflow creates or refreshes exactly one App-owned draft pull request targeting `main`, restores its title and labels, and returns it to draft after every refresh. It has no path to ready, approve, auto-merge, merge, or push directly to `main`.

Human reviewers must inspect the generated checklist and full data diff, wait for the latest exact `ci / gate`, mark the latest candidate ready, record a human approval, and merge it manually. `assets/SeasonSummary.draft.json` is explicitly noncanonical and must never be copied automatically to `assets/SeasonSummary.json`.

Failures identify the workflow phase, retain safe allowlisted candidate/review evidence for seven days, and create or update the exact `Weekly Sleeper update failed` issue. A later successful full publish or full no-change run adds a recovery link and closes that issue. Validation-only success does not close it because publication credentials and branch behavior were not exercised.

Local validation-only example:

```sh
UPDATE_LIVE=1 VALIDATE_ONLY=1 SEASON=2025 CURRENT_WEEK=1 scripts/update_sleeper_h2h.sh
```

### Activating a new Sleeper season

2026 remains intentionally unconfigured. Activate a new season in this order:

1. Create the Sleeper league.
2. Add `scripts/<season>_team_mapping.json` and the matching Week 1 anchor in `scripts/sleeper_week1_anchors.json` through a human pull request.
3. Merge that configuration only after normal CI and mapping review.
4. Update the `SLEEPER_LEAGUE_ID` repository secret to the activated league.
5. Dispatch a validation-only run from `main` for the new season.
6. Dispatch a full run and review the resulting bot draft pull request.

The automation does not infer future leagues, follow `previous_league_id`, or accept a reported Sleeper league season that differs from the configured target.

## Deployment audit

`npm run build` performs generated drift, data, semantic, manifest, and media checks before Vite builds. It then audits every declared JSON file in `dist/`—including runtime-optional files—for path containment, presence, raw byte count, valid JSON, and canonical SHA-256 parity. Pages runs the same checks before uploading the artifact.

Useful recovery commands:

```sh
npm run generate:derived    # source hash or stale derived output
npm run generate:draft-spot # stale SeasonSummary dependency
npm run generate:manifest
npm run generate:data-types # schema/type drift
npm run generate:data-validators
npm run test:assets         # inspect the complete snapshot
npm run audit:dist          # confirm built output inventory, bytes, and hashes
```

## Current measurements

On the implementation machine (Node 23; CI targets Node 20):

- Derived generation: under 100 ms for 898 games.
- Full generated drift check: under 2 seconds.
- `DerivedStats.json`: about 180 KB uncompressed.
- Browser startup uses generated aggregates when available; client calculations remain only as recovery fallbacks.

These values are guardrails, not contractual benchmarks. Re-measure when generator meaning, data volume, or feature consumption changes.

Production JavaScript baseline and chunk budgets are documented in [bundle-size.md](bundle-size.md).
