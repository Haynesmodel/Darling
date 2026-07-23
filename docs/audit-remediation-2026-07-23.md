# Post-implementation audit remediation — July 23, 2026

## Delivered in this change

- Repository ruleset [Haynes](https://github.com/Haynesmodel/Darling/rules/12189735) targets the default branch, requires pull requests, requires the exact `ci / gate` context with strict up-to-date behavior, preserves deletion/non-fast-forward protection, and has no role bypass.
- Enforcement was exercised on this PR: [run 30013038291](https://github.com/Haynesmodel/Darling/actions/runs/30013038291) failed `ci / gate` at `48cb3cc` and kept the PR blocked; after the fix, [run 30013620852](https://github.com/Haynesmodel/Darling/actions/runs/30013620852) passed at `a501633` and the same PR returned a clean merge state.
- Integrity-valid synthetic browser snapshots regenerate canonical bytes, SHA-256 descriptors, derived source hashes, and the coherent data version while enforcing base paths and full asset versions.
- League Pulse browser coverage now exercises preseason, live regular season, completed-week standings, live postseason groups, finalizing behavior, historical fallback, exact deep links, Search aliases, rapid navigation, active-state Axe checks, and narrow layouts.
- Freshness/integrity coverage now exercises the 15-day boundary, finalizing ages, August 15 boundary, UTF-8/JSON retry behavior, equal-length hash mismatch, sorted optional diagnostics, maximum response sizes, all rendered freshness states, reload revalidation, all-tab persistence, forced colors, and quiet reassessment.
- The Pulse controller mount is directly idempotent and has lifecycle/abort/dispose coverage.
- Coverage overrides decreased from 31 to 21 without lowering global, per-file, or changed-file thresholds. `src/theme/theme-context.ts` no longer has a zero-percent override.
- Raw coverage output is capped at 25,000,000 bytes and retained in `coverage-meta.json` with its limit.
- Bundle evidence is refreshed in `docs/bundle-size.md`; the Sleeper workflow is unchanged.
- Recommendation #1 is implemented by the integrated CI delivery path: Pages packages the SHA-named artifact already consumed by Chromium and WebKit, starts only after `ci / gate`, rejects stale `main` runs, and confines Pages/OIDC writes to the deploy job. Workflow contract tests protect those invariants.

## Measured local evidence

- Node/unit coverage tests: 269 passed.
- Instrumented Chromium: 113 passed, one intentional production-build-only assertion skipped.
- Coverage: 91.47% lines, 88.99% statements, 88.33% functions, 78.90% branches.
- Raw coverage: 5,371,607 / 25,000,000 bytes after removing converted V8 intermediates.
- Production build: 177,873-byte entry, 54,159-byte entry gzip, 105,029-byte cold Pulse, 107,615-byte cold History, 311,263-byte total JavaScript gzip.

## Explicitly open operational gates

- Manual Safari, VoiceOver, zoom, contrast, and physical-device verification remains open in `accessibility-release-verification-2026-07-23.md`.
- Local WebKit execution is unavailable on this macOS 13 ARM64 host; the required hosted `ci / gate` run is the branch-validation evidence.
- The ten-run clean stabilization window begins after merge and remains open in `ci-stabilization-2026-07-23.md`.
- The next ratchet must reduce overrides to 15 or fewer before October 22, 2026.
- Recommendation #1 still requires first-main-run rollout evidence after merge. Recommendation #2, the Sleeper workflow redesign, remains deferred.
