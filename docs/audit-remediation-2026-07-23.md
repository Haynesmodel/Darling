# Post-implementation audit remediation — July 23, 2026

## Delivered in this change

- Repository ruleset [Haynes](https://github.com/Haynesmodel/Darling/rules/12189735) targets the default branch, requires pull requests, requires the exact `ci / gate` context with strict up-to-date behavior, preserves deletion/non-fast-forward protection, and has no role bypass.
- Integrity-valid synthetic browser snapshots regenerate canonical bytes, SHA-256 descriptors, derived source hashes, and the coherent data version while enforcing base paths and full asset versions.
- League Pulse browser coverage now exercises preseason, live regular season, completed-week standings, live postseason groups, finalizing behavior, historical fallback, exact deep links, Search aliases, rapid navigation, active-state Axe checks, and narrow layouts.
- Freshness/integrity coverage now exercises the 15-day boundary, finalizing ages, August 15 boundary, UTF-8/JSON retry behavior, equal-length hash mismatch, sorted optional diagnostics, maximum response sizes, all rendered freshness states, reload revalidation, all-tab persistence, forced colors, and quiet reassessment.
- The Pulse controller mount is directly idempotent and has lifecycle/abort/dispose coverage.
- Coverage overrides decreased from 31 to 21 without lowering global, per-file, or changed-file thresholds. `src/theme/theme-context.ts` no longer has a zero-percent override.
- Raw coverage output is capped at 25,000,000 bytes and retained in `coverage-meta.json` with its limit.
- Bundle evidence is refreshed in `docs/bundle-size.md`; Pages and Sleeper workflows are unchanged.

## Measured local evidence

- Node/unit coverage tests: 268 passed.
- Instrumented Chromium: 113 passed, one intentional production-build-only assertion skipped.
- Coverage: 91.48% lines, 89.00% statements, 88.34% functions, 78.89% branches.
- Raw coverage: 5,367,712 / 25,000,000 bytes after removing converted V8 intermediates.
- Production build: 177,873-byte entry, 54,159-byte entry gzip, 104,832-byte cold Pulse, 107,419-byte cold History, 311,058-byte total JavaScript gzip.

## Explicitly open operational gates

- Manual Safari, VoiceOver, zoom, contrast, and physical-device verification remains open in `accessibility-release-verification-2026-07-23.md`.
- Local WebKit execution is unavailable on this macOS 13 ARM64 host; the required hosted `ci / gate` run is the branch-validation evidence.
- The ten-run clean stabilization window begins after merge and remains open in `ci-stabilization-2026-07-23.md`.
- The next ratchet must reduce overrides to 15 or fewer before October 22, 2026.
- Recommendations #1 and #2 remain deferred; deployment and Sleeper workflow redesign was not resumed.
