# League Lore

League Lore is an optional, verified narrative asset. `assets/LeagueLore.json` owns prose, aliases, search terms, collections, trigger metadata, and presentation labels. It never overrides the numerical assets: scores, records, points, finishes, titles, draft slots, transaction participants, and completed-through weeks are read from the canonical data files named by the entry anchor. Draft Journey tour moments are the teasers on each physical `draft-location-*` entry, so the map does not duplicate lore selection heuristics.

The source policy distinguishes the fantasy `season` from `occurred_year`, `completed_year`, and `almanac_edition`. The reviewed 2024 Almanac supplies narrative context through 2024; later corrections use their explicit season and completion fields. Singer's lawn story is draft-weekend lore, not a punishment, and the 2022 championship context is respectful/static.

`draft_locations` is an optional, validated location-history array. Each enabled row owns an inclusive season range, location type, coordinates (or `null` for the virtual era), precision (`municipality` or `venue`), and a normal lore-entry reference. Draft Journey renders these rows from the verified snapshot; missing, disabled, or invalid optional lore suppresses the journey without affecting Draft Spot statistics. Municipality coordinates are approximate reference points and do not imply an exact venue; the Vienna point is the 2024 U.S. Census Gazetteer internal point for the town.

The first time an open Draft Journey is entered, its short guided tour visits physical rows in chronological order. Tour champion labels are derived from `SeasonSummary.json`, while the history moment is taken from the matching lore entry or another dated draft-weekend entry. A season without a completed champion is shown as pending; skip and replay are always available, and direct map interaction ends the tour.

## Authoring and validation

Entries use stable lowercase kebab-case IDs, bounded paragraphs/search terms, canonical owners, and discriminated anchors. Triggers reference exactly one entry or collection and may reference a registered effect. Run `npm run generate:data`, `npm run check:data-generated`, and `npm run test:assets` after edits. The authored JSON must remain at or below 100 KiB; optional loader failures leave all statistical features available and publish diagnostics.

## Runtime behavior

Feature controls are native buttons and share one typed runtime. Explicit search/dialog actions are repeatable; ambient multi-activation effects use scoped counters and a four-second window. The click-loaded presentation owns one dialog/overlay, restores opener focus, handles Escape and focus containment, and removes timers/nodes on route changes and disposal. Reduced motion immediately removes animated decoration while retaining readable dialog content. Do not add DOM selectors, executable expressions, audio, or autoplay media to the JSON.

The presentation module and stylesheet are click-loaded. Keep bundle budgets unchanged and include exact-head build, accessibility, and browser evidence in the pull request.
