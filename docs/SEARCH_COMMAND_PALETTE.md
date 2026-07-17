# Search and Command Palette

The palette is a typed, in-browser navigator over the app's existing URL state. It does not send queries to a service and should remain deterministic: structured intents rank first, indexed destinations rank next, and low-confidence matches stay visible for the user to choose instead of auto-executing.

## Supported grammar

- Owner and season: `Joe 2021`, `2021 Joe`, `Shap 2024 playoffs`
- Rivalry: `Zubs vs Joel`, `Joe versus Shap`, `Nuss against Rishi`
- Season and game type: `2024 playoffs`, `2024 Saunders`, `2019 regular season`
- Score threshold: `150 point games`, `games over 140`, `Joe 100 or less`
- Records and filters: `biggest loss`, `Joe biggest loss`, `highest score`, `Joe losses`
- Features: `current season`, `playoff picture`, `Joe trophy case`, `Joe dynasty`, `historical matchup`
- Draft Spot: `draft spot`, `pick 10`, `late draft picks`, `Joe draft history`
- Commands: `dark mode`, `light mode`, `system theme`, `export history`

Canonical owner names come from league assets. Sleeper display and team names in `CurrentSeason.json` are added as aliases when present, but generated URLs always use the canonical owner.

## Extension path

1. Add or refine normalization in `src/search/search-normalize.ts`.
2. Add the high-confidence phrase rule and typed intent in `src/search/search-intents.ts` and `src/search/search-types.ts`.
3. Resolve the intent to URL state or a local command in `src/search/search-actions.ts`.
4. Add persistent destinations to `src/search/search-index.ts` so recents survive reloads.
5. Cover the phrase and resulting URL in `test/ui/app.spec.js`. Add URL validation to `test/state-helpers.test.js` when new state is introduced.

Do not put raw query text in URLs or local storage. Do not add an external search dependency unless real query fixtures demonstrate a ranking problem the current token and subsequence scorer cannot solve.
