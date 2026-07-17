# CSS architecture

Application CSS is imported once through `src/styles/app.css`. That file declares the cascade and contains imports only:

1. `tokens`
2. `base`
3. `shell`
4. `primitives`
5. `components`
6. `features`
7. `utilities`

The import order is deterministic, and every imported file is assigned to a layer.

## Ownership

- `tokens.css`: light/dark semantic colors, theme aliases, focus, spacing, target-size, radius, shadow, and motion tokens.
- `base.css`: box sizing, document typography, native elements, links, and the canonical focus ring.
- `shell.css`: hero, theme toolbar, skip link, primary navigation, tab overflow, main, and page panels.
- `primitives.css`: cards, banners, shared tables, outcome rows, stats, callouts, and section headings.
- `controls.css`: form controls, buttons, filter disclosures, and the mobile filter sheet.
- `charts.css`: chart hosts, errors, empty states, notes, and textual fallback presentation.
- `motion.css`: crown, Saunders fog, Easter eggs, and reduced-motion overrides.
- `utilities.css`: visually hidden, muted, and scroll-lock utilities.
- `features/*.css`: styles and responsive rules owned by one page or feature.
- `features/draft-spot.css`: Draft Spot controls, charts, pick board, owner evidence, receipts, and responsive/forced-colors behavior.
- `src/components/search/search.css` and `src/components/tables/table.css`: component-owned styles imported into the components layer.

## Rules

- Add a semantic token before repeating a shared color, spacing, focus, or motion value.
- Put responsive rules beside their owner.
- Do not add a late audit, repair, or enhancement stylesheet.
- Avoid ID selectors for new styles, deep descendant selectors, and new `!important`.
- Keep shared stylesheets at or below 350 lines and feature stylesheets at or below 500 lines.
- Keep `app.css` import-only.
- A selector should have one canonical rule per context.

`npm run lint:css` validates CSS syntax and standards. `npm run check:css` enforces file budgets, current hard-coded-color ceilings, `!important` ceilings, duplicate selectors, focus-outline hygiene, and complete import coverage. Budgets live in `scripts/data/css-budget.json`; lower a ceiling when cleanup removes debt rather than raising it casually.

## Adding a feature

1. Create or choose a feature file under `src/styles/features/`.
2. Import it in `src/styles/app.css` in the features layer.
3. Reuse tokens and shared primitives.
4. Add the feature’s mobile rules in the same file.
5. Run `npm run lint:css`, `npm run check:css`, the relevant browser tests, and `npm run build`.

If a feature file approaches 500 lines, split it by a real sub-feature boundary, as Dynasty does for its dialog, charts, heatmap, and slump presentation.
