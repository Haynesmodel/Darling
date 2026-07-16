# Roadmap remediation

Status: implemented on the roadmap-remediation branch.

This delivery closes the confirmed code gaps from the July 16 review:

- Restores Draft Spot on the current schema, manifest, TypeScript, Preact, chart, search, theme, table, URL, keyboard, mobile, and axe architecture.
- Adds deterministic Current Season playoff, bye, seed, and Saunders probabilities with movement and owner win/loss scenarios.
- Wraps horizontal tab arrow navigation at both edges and covers the seventh tab.
- Makes preview browser runs use one documented worker and emits server lifecycle diagnostics.
- Adds a dated accessibility verification record with honest ownership/removal conditions for checks that require Safari, VoiceOver, OS preferences, or physical hardware.

The source review document remains the behavioral reference; current implementation tests preserve the 2017–2025 Draft Spot coverage, pick 11/12 low-sample treatment, URL normalization, recommendation evidence, configured tiebreakers, and simulation invariants.
