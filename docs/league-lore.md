# League Lore

`assets/LeagueLore.json` is the editable source for narrative facts and easter-egg metadata. It is an optional, integrity-checked asset: if it is missing or invalid, the statistical pages continue to load.

## Authoring rules

- Numbers remain sourced from `H2H.json`, `SeasonSummary.json`, `DraftSpot.json`, `CurrentSeason.json`, and `TransactionHistory.json`. Lore anchors identify those records; prose does not replace them.
- Keep `season` (fantasy season), `occurred_year`, `completed_year`, and `almanac_edition` distinct. The 2026 Almanac stories use `season: 2025`.
- Use the closed anchor, activation, presentation, and sensitivity enums in `schemas/league-lore.schema.json`. Do not add selectors, HTML, scripts, or CSS classes to JSON.
- Strings are rendered as text, and disabled entries/triggers remain valid but are suppressed from production search and reveals.

Run `npm run test:assets` after editing. The asset manifest, generated TypeScript contracts, browser validator, and public snapshot are regenerated with `npm run generate:data`.

The presentation module is loaded only after an explicit lore reveal. Every reveal has readable dialog text, a native close control, focus restoration, and a reduced-motion static path. Set `enabled` to `false` for an immediate global disable, or disable an individual entry/trigger for a surgical copy or sensitivity rollback.
