# Trophy Case Implementation Plan

Status: complete.

Add a top-level **Trophy Case** page that turns each owner's league history into a visual resume: championships, regular-season titles, playoff results, Saunders outcomes, weekly awards, signature seasons, and notable scars.

Rivalries are now implemented as a top-level page beside League History. Trophy Case should follow that same product shape: a focused workflow with its own tab, page markup, controls module, renderer module, tests, and URL state.

## Phase 1: Define The Product Surface

Goal: add the Trophy Case as the third top-level page without changing existing League History or Head to Head behavior.

Navigation:

```txt
League History | Head to Head | Trophy Case
```

First version scope:

- Owner selector.
- Owner hero/resume summary.
- Hardware shelf.
- Regular-season resume.
- Postseason resume.
- Weekly awards.
- Signature seasons table.

Out of scope for the first version:

- League-wide shelf mode.
- Share/export cards.
- Trophy-specific animations.
- Pain Index or dynasty ranking sections.

## Phase 2: Add Markup And Page Structure

Update `index.html`.

Add the tab:

```html
<button class="tab" id="tabTrophyBtn">Trophy Case</button>
```

Add the page after `#page-rivalry`:

```html
<section id="page-trophy" class="page">
  <div class="card">
    <div class="controls filters trophy-controls">
      <select id="trophyOwnerSelect" aria-label="Trophy case owner"></select>
    </div>
  </div>

  <div class="card" id="trophyHero"></div>

  <div class="card">
    <h3>Hardware</h3>
    <div id="trophyHardwareGrid" class="trophy-grid"></div>
  </div>

  <div class="card">
    <h3>Regular Season Resume</h3>
    <div id="trophyRegularGrid" class="stats-grid"></div>
  </div>

  <div class="card">
    <h3>Postseason Resume</h3>
    <div id="trophyPostseasonGrid" class="stats-grid"></div>
  </div>

  <div class="card">
    <h3>Weekly Awards</h3>
    <div id="trophyWeeklyGrid" class="stats-grid"></div>
  </div>

  <div class="card">
    <h3>Signature Seasons</h3>
    <div class="table-wrap">
      <table id="trophySeasonTable">
        <thead>
          <tr>
            <th scope="col">Season</th>
            <th scope="col">Record</th>
            <th scope="col">Finish</th>
            <th scope="col">Outcome</th>
            <th scope="col">PF</th>
            <th scope="col">PA</th>
            <th scope="col">Diff</th>
            <th scope="col">Notes</th>
          </tr>
        </thead>
        <tbody></tbody>
      </table>
    </div>
  </div>
</section>
```

Keep the page unhidden by default and rely on the existing `.page` / `.visible` behavior used by League History and Head to Head.

## Phase 3: Add Trophy Controls

Create `js/trophy-controls.js`.

Responsibilities:

- Populate `#trophyOwnerSelect`.
- Use `teamOptions(seasonSummaries, leagueGames, ALL_TEAMS)` and exclude `ALL_TEAMS`.
- Default to `Joe` when available, otherwise first owner.
- Accept an initial owner from URL state.
- Emit a simple `onChange({ selectedOwner })` callback.
- Guard event binding with `dataset.bound`, matching `js/rivalry-controls.js`.

Suggested exports:

```js
export {
  buildTrophyControls,
  resolveInitialOwner,
};
```

Suggested function shape:

```js
function buildTrophyControls({
  doc,
  leagueGames,
  seasonSummaries,
  selectedOwner,
  onChange,
  allTeams = '__ALL__',
}) {
  // populate #trophyOwnerSelect and emit selectedOwner
}
```

Add focused tests in `test/trophy-controls.test.js` for:

- Default owner resolution.
- URL-provided owner resolution.
- Excluding the all-teams option.
- Change callback behavior.

## Phase 4: Build Trophy View Models And Renderers

Create `js/trophy-renderers.js`.

Keep this module similar to `js/rivalry-renderers.js`: pure view-model builders and HTML helpers first, DOM render functions last.

Suggested exports:

```js
export {
  buildTrophyCaseViewModel,
  trophyHeroHtml,
  trophyHardwareHtml,
  trophyRegularSeasonHtml,
  trophyPostseasonHtml,
  trophyWeeklyAwardsHtml,
  trophySeasonTableHtml,
  renderTrophyHero,
  renderTrophyHardware,
  renderTrophyRegularSeason,
  renderTrophyPostseason,
  renderTrophyWeeklyAwards,
  renderTrophySeasonTable,
};
```

Main view-model shape:

```js
function buildTrophyCaseViewModel(owner, {
  leagueGames,
  seasonSummaries,
  seasonAggregates,
  weeklyAwards,
  sub70,
  highScoreThreshold = 150,
  subScoreThreshold = 70,
} = {}) {
  return {
    owner,
    hero,
    hardware,
    regularSeason,
    postseason,
    weeklyAwards,
    signatureSeasons,
  };
}
```

Use `escapeHtml`, `nfmt`, and existing core helpers instead of ad hoc formatting.

## Phase 5: Compute Hardware And Resume Metrics

Start with metrics that are already supported by `assets/SeasonSummary.json` and `assets/H2H.json`.

Season summary fields available:

- `season`
- `owner`
- `wins`
- `losses`
- `ties`
- `finish`
- `points_for`
- `points_against`
- `playoff_wins`
- `playoff_losses`
- `saunders_wins`
- `saunders_losses`
- `champion`
- `saunders`
- `bye`
- `wild_card`
- `saunders_bye`
- `bagels_earned`

Game fields available:

- `season`
- `date`
- `teamA`
- `teamB`
- `scoreA`
- `scoreB`
- `week`
- `round`
- `type`

Hardware:

- Darling championships: `champion === true`.
- Saunders titles: `saunders === true`.
- Regular-season titles: derive from best `finish` or existing `computeRegularSeasonChampYears`.
- Top-2 byes: `bye === true`.
- Wild cards: `wild_card === true`.
- Saunders byes: `saunders_bye === true`.
- Bagels: `bagels_earned`.

Regular-season resume:

- Career regular-season record from `wins`, `losses`, `ties`.
- Career win percentage.
- Total points for and against.
- Average points for and against per season.
- Average finish.
- Best finish.
- Best scoring season.
- Best point differential season.
- Most unlucky season if using `seasonAggregates.luck`.

Postseason resume:

- Playoff record from `playoff_wins` and `playoff_losses`.
- Saunders bracket record from `saunders_wins` and `saunders_losses`.
- Championship appearances, if inferable from playoff final games.
- Best postseason result label.
- Saunders scars count.

Weekly awards:

- Weekly high-score crowns from `computeWeeklyAwards(...).top`.
- Weekly low-score marks from `computeWeeklyAwards(...).low`.
- 150+ games from `computeWeeklyAwards(...).high150`.
- Sub-70 regular-season games from `computeSubThresholdGamesPerTeam`.
- Highest single-game score from `H2H.json`.
- Lowest single-game score from `H2H.json`.
- Biggest blowout win and biggest blowout loss from `H2H.json`.

Add small trophy-specific helpers inside `trophy-renderers.js` first. Move them to `stats-helpers.js` only if another page needs them later.

Suggested helper names:

```js
function ownerSeasonRows(owner, seasonSummaries)
function computeOwnerHardware(owner, seasonSummaries)
function computeOwnerRegularResume(owner, seasonRows, seasonAggregates)
function computeOwnerPostseasonResume(owner, seasonRows, leagueGames)
function computeOwnerWeeklyResume(owner, leagueGames, weeklyAwards, sub70)
function computeOwnerSignatureSeasons(owner, seasonRows, seasonAggregates)
```

## Phase 6: Render The Page Sections

Hero:

```txt
Joe Trophy Case
2 Darlings | 3 Regular-Season Titles | 4 Top-2 Seeds
Career regular season: 82-61 (.573)
Best finish: 1st | Average finish: 4.2
```

Hardware:

- One tile per hardware type.
- Show count as the main value.
- Show season chips underneath when seasons exist.
- Show an empty-state line for missing hardware instead of hiding the tile.

Regular-season grid:

- Record.
- Win percentage.
- Points for.
- Points against.
- Average finish.
- Best finish.
- Best scoring season.
- Best differential season.

Postseason grid:

- Playoff record.
- Playoff win percentage.
- Championships.
- Championship seasons.
- Saunders record.
- Saunders titles.
- Bye and wild-card counts.

Weekly awards grid:

- Weekly crowns.
- Weekly lows.
- 150+ games.
- Sub-70 games.
- Highest score.
- Lowest score.
- Biggest win.
- Biggest loss.

Signature seasons table:

- Sort newest first by default.
- Use compact notes for standout seasons:
  - Champion
  - Saunders
  - Regular-season title
  - Top-2 seed
  - Wild card
  - Best scoring season
  - Worst scoring season
  - Best differential season
  - Most unlucky season
  - Bagels earned

## Phase 7: Integrate With App State And URL State

Current merged architecture:

- `js/app.js` only calls `bootstrapHistoryApp`.
- `js/history-controller.js` currently owns League History and Head to Head page orchestration.
- `showPage(id)` already supports any page id with a matching `tabXBtn` and `page-x` id.

Implement Trophy Case by extending the current controller flow in `js/history-controller.js`, matching the Head to Head integration:

- Import `buildTrophyControls`.
- Import trophy view-model/render functions.
- Add `selectedTrophyOwner`.
- Add `handleTrophyChange(next)`.
- Add `ensureTrophyControls(initialState = {})`.
- Add `renderTrophy()`.
- Bind `#tabTrophyBtn`.
- Bootstrap directly into Trophy Case when `?tab=trophy` is present.

Extend `js/state-helpers.js`:

- Parse `trophyOwner`.
- Include `hasTrophy`.
- Add `trophyOwner` to URL output when `tab === 'trophy'`.
- Preserve existing history and rivalry URL behavior.

Suggested URL:

```txt
?tab=trophy&trophyOwner=Joe
```

When rendering Trophy Case:

- Update the header banners for the selected owner.
- Set `document.title` to `<owner> Trophy Case`.
- Update URL state after owner changes.

## Phase 8: Add Styling

Update `css/style.css`.

Use the current card/stat/table language. Add only the classes needed for Trophy Case:

- `.trophy-controls`
- `.trophy-hero`
- `.trophy-grid`
- `.trophy-card`
- `.trophy-card.primary`
- `.trophy-card.warning`
- `.trophy-year-list`
- `.trophy-year-chip`
- `.trophy-season-note`

Visual direction:

- Keep it clean and readable, not decorative.
- Hardware tiles can use slightly stronger borders/accent colors.
- Avoid a literal shelf illustration for version 1.
- Make year chips small and scannable.
- Make empty hardware states muted but still visible.
- Ensure the owner selector and grids work on mobile.

## Phase 9: Test Coverage

Add unit tests:

- `test/trophy-controls.test.js`
- `test/trophy-renderers.test.js`

Renderer tests should cover:

- Hardware counts and season chips.
- Regular-season career record and win percentage.
- Playoff and Saunders record aggregation.
- Weekly awards lookup.
- Highest/lowest game extraction.
- Signature-season notes.
- Empty owner/no data state.
- HTML escaping for owner names and note text.

State tests should cover:

- `parseUrlState('?tab=trophy&trophyOwner=Joe')`.
- `buildUrlFromState({ tab: 'trophy', selectedTrophyOwner: 'Joe' })`.
- Existing rivalry URL tests still pass.

UI tests in `test/ui/app.spec.js` should cover:

- Trophy tab activates and history/rivalry tabs still work.
- Owner selector renders options.
- Selecting an owner updates the hero and URL.
- Loading directly with `?tab=trophy&trophyOwner=Joe` opens Trophy Case.
- Trophy Case does not break CSV export on League History.

Run:

```sh
npm run test:ci
```

## Phase 10: Implementation Order

Work in this order:

1. Add URL state support for `tab=trophy` and `trophyOwner`.
2. Add Trophy tab and page markup in `index.html`.
3. Add `js/trophy-controls.js` and its tests.
4. Add `js/trophy-renderers.js` with pure view-model helpers first.
5. Add renderer tests until the core metrics are covered.
6. Wire Trophy Case into `js/history-controller.js`.
7. Add CSS polish.
8. Add Playwright coverage for navigation, direct URL load, and owner changes.
9. Run `npm run test:ci`.
10. Do a browser pass at desktop and mobile widths.

## Acceptance Criteria

- Trophy Case is available as a top-level tab.
- Direct URL load with `?tab=trophy&trophyOwner=<owner>` works.
- Owner changes update the page and URL.
- Existing League History and Head to Head pages still work.
- Trophy metrics are computed from the existing JSON assets, with no new data file required.
- Empty/missing metrics render gracefully.
- Unit and UI tests cover the new page.
- `npm run test:ci` passes.
