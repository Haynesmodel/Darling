# Era / Dynasty Rankings Implementation Plan

Add a top-level **Dynasty Rankings** page that answers:

```txt
Who had the best run, and when?
```

This feature compares owners across selected eras and rolling multi-season windows. It should surface dominant runs, dynasty peaks, sustained contenders, short-lived meteors, and dark-age slumps. It should also include a period-based Dynasty Score Calculator so any owner can be scored for any selected range.

## Product Shape

Make this its own top-level tab.

Recommended top-level nav:

```txt
League History | Head to Head | Trophy Case | Dynasty Rankings
```

Reasoning:

- League History is the raw database.
- Head to Head is matchup-driven.
- Trophy Case is owner-profile driven.
- Dynasty Rankings is era/range driven and deserves its own workflow.

The page should feel more analytical than Trophy Case, but more visual than League History. It should use leaderboards, plaques, score breakdowns, and heatmaps rather than mostly raw tables.

## First Version Scope

Ship first:

- Top-level Dynasty Rankings tab.
- Period-based Dynasty Score Calculator.
- Rolling 3-year dynasty rankings.
- Rolling 5-year dynasty rankings.
- Selected-range leaderboard.
- All-time leaderboard.
- Best dynasty window per owner.
- Best overall windows across the league.
- Slump/dark-age leaderboard.
- Season-by-season owner heatmap.
- Transparent score breakdown.

Leave for later:

- User-editable scoring weights.
- Shareable dynasty cards.
- Custom era naming.
- Playoff bracket path difficulty.
- Draft/keeper data integrations.

## Core User Stories

1. As a user, I can open Dynasty Rankings as its own tab.
2. As a user, I can select an owner and a period, such as `Joe 2021-2023`, and get a Dynasty Score.
3. As a user, I can compare that owner/period against everyone else during the same period.
4. As a user, I can see why the score is high or low through component breakdowns.
5. As a user, I can browse the best 3-year and 5-year runs in league history.
6. As a user, I can see slumps as well as dynasties.
7. As a user, I can load a direct URL for a specific owner and period.

## Dynasty Score Calculator

The calculator is the heart of this feature.

It should answer:

```txt
How strong was this owner during this exact period?
```

Example behavior:

```txt
Owner: Joe
Range: 2021-2023

If Joe won 2 Darlings and had a regular-season title in the other season, the score should be very high because championships and regular-season titles carry large hardware weight.
```

If a requested range extends outside available asset data, such as `2001-2023` when the assets only contain `2014-2025`, the calculator should still work but show a coverage note:

```txt
Requested range: 2001-2023
Scored range: 2014-2023
10 of 23 requested seasons available
```

Do not silently pretend missing seasons were scored.

## Calculator Controls

Create controls for:

- Mode:
  - Calculator
  - Rolling 3-Year
  - Rolling 5-Year
  - Selected Range Leaderboard
  - All-Time Leaderboard
- Owner:
  - Owner select for Calculator mode.
  - Optional `All Owners` for comparison modes.
- Start season.
- End season.
- Minimum seasons played.
- Include Saunders penalties.
- Show score formula.

Default state:

```txt
Mode: Calculator
Owner: Joe, if available
Start: latest season - 2
End: latest season
Minimum seasons: 2
Include Saunders penalties: yes
```

Suggested URL:

```txt
?tab=dynasty&dynastyMode=calculator&dynastyOwner=Joe&dynastyStart=2021&dynastyEnd=2023
```

## Score Philosophy

The score should reward both dominance and sustained achievement.

A good dynasty score should heavily reward:

- Championships.
- Regular-season titles.
- Playoff wins.
- Top-2 seeds.
- Strong win percentage.
- Point differential.
- Scoring rank.
- Consistency across the selected period.

It should penalize:

- Saunders titles.
- Bottom finishes.
- Negative point differential.
- Missing too much of the selected window.

The formula must be transparent. Users should be able to see component points.

## Recommended Weights

Use hard-coded weights for version 1.

```js
const DYNASTY_WEIGHTS = {
  regularSeasonWin: 1,
  regularSeasonTie: 0.5,
  playoffWin: 6,
  playoffLoss: 0,
  saundersWin: 0.5,
  championship: 30,
  regularSeasonTitle: 15,
  topTwoBye: 8,
  wildCard: 4,
  pointsForRank1: 8,
  pointsForRank2: 5,
  pointsForRank3: 3,
  pointDiffRank1: 8,
  pointDiffRank2: 5,
  pointDiffRank3: 3,
  topHalfFinish: 3,
  bottomFinishPenalty: -5,
  saundersTitlePenalty: -18,
  saundersByePenalty: -6,
  negativeDiffPenalty: -3,
  multiTitleBonus: 8,
  cleanWindowBonus: 5,
};
```

Why these weights:

- A Darling should matter more than any single regular-season stat.
- Two titles in a selected period should make a score obviously elite.
- A regular-season title in a non-championship season should still matter a lot.
- Playoff wins should matter more than regular-season wins.
- Scoring dominance should break ties between similar records.
- Saunders outcomes should hurt the score but not erase real accomplishments.

## Score Components

The calculator should return grouped components.

Suggested shape:

```js
{
  owner: 'Joe',
  requestedStartSeason: 2021,
  requestedEndSeason: 2023,
  scoredStartSeason: 2021,
  scoredEndSeason: 2023,
  requestedSeasonCount: 3,
  scoredSeasonCount: 3,
  coverageRatio: 1,
  score: 127.5,
  rankInPeriod: 1,
  percentileInPeriod: 1,
  label: 'Dynasty Run',
  components: {
    regularSeason: 28.5,
    postseason: 18,
    hardware: 83,
    scoringDominance: 14,
    consistency: 8,
    penalties: -2,
  },
  seasons: [...],
  explanation: [
    '2 Darlings',
    '1 regular-season title',
    '3 top-half finishes',
    'Ranked #1 in the selected period'
  ],
}
```

The component values should sum to `score`.

## Season-Level Scoring

Build one normalized row per owner-season.

Suggested profile:

```js
{
  owner,
  season,
  wins,
  losses,
  ties,
  games,
  winPct,
  finish,
  pointsFor,
  pointsAgainst,
  pointDiff,
  playoffWins,
  playoffLosses,
  saundersWins,
  saundersLosses,
  champion,
  saunders,
  bye,
  wildCard,
  saundersBye,
  regularSeasonTitle,
  pointsForRank,
  pointDiffRank,
  score,
  components,
}
```

Season score function:

```js
function scoreOwnerSeason(profile, weights = DYNASTY_WEIGHTS, opts = {}) {
  const includeSaundersPenalty = opts.includeSaundersPenalty !== false;
  const components = {
    regularSeason: 0,
    postseason: 0,
    hardware: 0,
    scoringDominance: 0,
    consistency: 0,
    penalties: 0,
  };

  components.regularSeason += profile.wins * weights.regularSeasonWin;
  components.regularSeason += profile.ties * weights.regularSeasonTie;

  components.postseason += profile.playoffWins * weights.playoffWin;
  components.postseason += profile.saundersWins * weights.saundersWin;

  if (profile.champion) components.hardware += weights.championship;
  if (profile.regularSeasonTitle) components.hardware += weights.regularSeasonTitle;
  if (profile.bye) components.hardware += weights.topTwoBye;
  if (profile.wildCard) components.hardware += weights.wildCard;

  if (profile.pointsForRank === 1) components.scoringDominance += weights.pointsForRank1;
  else if (profile.pointsForRank === 2) components.scoringDominance += weights.pointsForRank2;
  else if (profile.pointsForRank === 3) components.scoringDominance += weights.pointsForRank3;

  if (profile.pointDiffRank === 1) components.scoringDominance += weights.pointDiffRank1;
  else if (profile.pointDiffRank === 2) components.scoringDominance += weights.pointDiffRank2;
  else if (profile.pointDiffRank === 3) components.scoringDominance += weights.pointDiffRank3;

  if (profile.finish && profile.finish <= Math.ceil(profile.leagueSize / 2)) {
    components.consistency += weights.topHalfFinish;
  }

  if (profile.finish && profile.finish >= Math.max(9, profile.leagueSize - 1)) {
    components.penalties += weights.bottomFinishPenalty;
  }
  if (profile.pointDiff < 0) {
    components.penalties += weights.negativeDiffPenalty;
  }
  if (includeSaundersPenalty && profile.saunders) {
    components.penalties += weights.saundersTitlePenalty;
  }
  if (includeSaundersPenalty && profile.saundersBye) {
    components.penalties += weights.saundersByePenalty;
  }

  return {
    score: sumScoreComponents(components),
    components,
  };
}
```

## Period-Level Scoring

The period score should aggregate season-level scores and add window-level bonuses.

```js
function calculateDynastyScore({
  owner,
  startSeason,
  endSeason,
  seasonProfiles,
  weights = DYNASTY_WEIGHTS,
  minSeasons = 1,
  includeSaundersPenalty = true,
} = {}) {
  const requestedSeasons = rangeInclusive(startSeason, endSeason);
  const seasons = seasonProfiles
    .filter(row => row.owner === owner && row.season >= startSeason && row.season <= endSeason)
    .sort((a, b) => a.season - b.season);

  const base = aggregateSeasonScores(seasons, { includeSaundersPenalty, weights });
  const windowComponents = computeWindowBonuses(seasons, requestedSeasons, weights);
  const components = addScoreComponents(base.components, windowComponents);

  return {
    owner,
    requestedStartSeason: startSeason,
    requestedEndSeason: endSeason,
    scoredStartSeason: seasons[0]?.season ?? null,
    scoredEndSeason: seasons[seasons.length - 1]?.season ?? null,
    requestedSeasonCount: requestedSeasons.length,
    scoredSeasonCount: seasons.length,
    coverageRatio: requestedSeasons.length ? seasons.length / requestedSeasons.length : 0,
    score: sumScoreComponents(components),
    components,
    seasons,
  };
}
```

Window-level bonuses:

- `multiTitleBonus`: add once for the second championship in a period, and again for each additional championship.
- `cleanWindowBonus`: add when no scored season has Saunders, Saunders bye, or bottom finish.
- Optional sustained contender bonus: add when every scored season is top-half.

Recommended helper:

```js
function computeWindowBonuses(seasons, requestedSeasons, weights) {
  const components = emptyScoreComponents();
  const championships = seasons.filter(s => s.champion).length;
  if (championships >= 2) {
    components.hardware += (championships - 1) * weights.multiTitleBonus;
  }
  if (seasons.length && seasons.every(s => !s.saunders && !s.saundersBye && !(s.finish >= Math.max(9, s.leagueSize - 1)))) {
    components.consistency += weights.cleanWindowBonus;
  }
  return components;
}
```

## Period Comparison

The calculator should also compare the selected owner/period to all other owners over the same period.

For a selected range:

1. Calculate the selected owner score.
2. Calculate every other owner score for the same requested start/end.
3. Rank all owners by score.
4. Show selected owner rank and percentile.

Suggested tie-breakers:

1. Score descending.
2. Championships descending.
3. Regular-season titles descending.
4. Playoff wins descending.
5. Win percentage descending.
6. Point differential descending.
7. Average finish ascending.

This makes the `Joe 2021-2023` example easy to validate: if that range includes two championships and another regular-season title, Joe should rank at or near the top unless another owner has an even stronger period.

## Data Inputs

Use existing assets only:

- `assets/SeasonSummary.json`
- `assets/H2H.json`

Useful `SeasonSummary.json` fields:

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

Useful derived data:

- `computeSeasonAggregatesAllTeams(leagueGames, seasonSummaries)`
- Regular-season point differential.
- Regular-season title by season.
- Points-for rank by season.
- Point-differential rank by season.
- League size by season.
- Expected wins/luck where useful later.

## Page Layout

Update `index.html`.

Add top-level tab:

```html
<button class="tab" id="tabDynastyBtn">Dynasty Rankings</button>
```

Add page:

```html
<section id="page-dynasty" class="page">
  <div class="card">
    <div class="controls filters dynasty-controls">
      <label>Mode:
        <select id="dynastyModeSelect"></select>
      </label>
      <label>Owner:
        <select id="dynastyOwnerSelect"></select>
      </label>
      <label>Start:
        <select id="dynastyStartSeason"></select>
      </label>
      <label>End:
        <select id="dynastyEndSeason"></select>
      </label>
      <label>Minimum Seasons:
        <select id="dynastyMinSeasons"></select>
      </label>
      <label class="checkbox-label">
        <input type="checkbox" id="dynastySaundersToggle" checked>
        Include Saunders penalties
      </label>
    </div>
  </div>

  <div class="card" id="dynastyCalculatorHero"></div>

  <div class="card">
    <h3>Score Breakdown</h3>
    <div id="dynastyScoreBreakdown" class="dynasty-score-breakdown"></div>
  </div>

  <div class="card">
    <h3>Period Comparison</h3>
    <div id="dynastyPeriodLeaderboard"></div>
  </div>

  <div class="card">
    <h3>Best Dynasty Windows</h3>
    <div id="dynastyBestWindows" class="dynasty-window-grid"></div>
  </div>

  <div class="card">
    <h3>Era Heatmap</h3>
    <div id="dynastyHeatmap"></div>
  </div>

  <div class="card">
    <h3>Slumps</h3>
    <div id="dynastySlumps"></div>
  </div>

  <div class="card">
    <h3>Formula</h3>
    <div id="dynastyFormula"></div>
  </div>
</section>
```

The page should lead with the calculator result, not the league-wide leaderboard. If the user chooses Rolling 3-Year or Rolling 5-Year mode, the hero can switch to the best overall window for that mode.

## Controls Module

Create `js/dynasty-controls.js`.

Responsibilities:

- Populate mode, owner, start, end, and min-season controls.
- Default owner to `Joe` when available.
- Default range to latest three available seasons.
- Prevent `startSeason > endSeason`.
- Clamp selected values to available seasons but preserve requested values in URL parsing when possible.
- Emit `onChange(nextState)`.
- Guard bindings with `dataset.bound`.

Suggested exports:

```js
export {
  buildDynastyControls,
  resolveDynastyInitialState,
  availableDynastySeasons,
  normalizeDynastyRange,
};
```

Suggested state:

```js
{
  mode: 'calculator',
  owner: 'Joe',
  startSeason: 2021,
  endSeason: 2023,
  minSeasons: 2,
  includeSaundersPenalty: true,
}
```

## Renderer / Calculator Module

Create `js/dynasty-renderers.js`.

Keep this module pure where possible, matching `js/rivalry-renderers.js`.

Suggested exports:

```js
export {
  DYNASTY_WEIGHTS,
  buildDynastyViewModel,
  buildOwnerSeasonProfiles,
  calculateDynastyScore,
  calculateDynastyScoresForPeriod,
  computeRollingDynastyWindows,
  computeBestWindowsByOwner,
  computeSlumpWindows,
  rankDynastyScores,
  scoreOwnerSeason,
  dynastyCalculatorHeroHtml,
  dynastyScoreBreakdownHtml,
  dynastyPeriodLeaderboardHtml,
  dynastyBestWindowsHtml,
  dynastyHeatmapHtml,
  dynastySlumpsHtml,
  dynastyFormulaHtml,
  renderDynastyCalculatorHero,
  renderDynastyScoreBreakdown,
  renderDynastyPeriodLeaderboard,
  renderDynastyBestWindows,
  renderDynastyHeatmap,
  renderDynastySlumps,
  renderDynastyFormula,
};
```

Main view model:

```js
function buildDynastyViewModel({
  leagueGames,
  seasonSummaries,
  seasonAggregates,
  mode = 'calculator',
  owner = 'Joe',
  startSeason,
  endSeason,
  minSeasons = 2,
  includeSaundersPenalty = true,
} = {}) {
  return {
    controls,
    selectedScore,
    periodScores,
    rollingThreeWindows,
    rollingFiveWindows,
    bestWindows,
    slumps,
    heatmap,
    formula,
  };
}
```

## Visual Sections

Calculator hero:

```txt
Joe Dynasty Score
2021-2023
Score 127.5 | #1 of 10 in this period
2 Darlings | 1 regular-season title | .714 win %
```

Score breakdown:

- Horizontal component bars.
- Regular season.
- Postseason.
- Hardware.
- Scoring dominance.
- Consistency.
- Penalties.

Period leaderboard:

- Rank.
- Owner.
- Score.
- Period record.
- Championships.
- Regular-season titles.
- Playoff wins.
- Point differential.
- Component chips.

Best windows:

- Top 3 to 5 overall windows.
- Best window per owner.
- Each card should feel like an era plaque.

Heatmap:

- Owners on rows.
- Seasons on columns.
- Cell color by season score.
- Mark champions and Saunders seasons.
- No charting dependency in version 1. Use CSS grid or inline SVG.

Slumps:

- Lowest rolling 3-year scores.
- Worst average finish.
- Most Saunders pain.
- Biggest fall from previous window.

Formula:

- Show weight table.
- Show plain-language score explanation.
- This section is important because users will argue about dynasty scoring.

## Labels

Use labels as interpretation, not as score inputs.

Suggested labels:

- Dynasty Run: championship plus elite period score.
- Mini-Dynasty: two or more top-tier seasons without enough length for all-time dominance.
- Regular Season Machine: strong regular-season title/win profile without titles.
- Playoff Peak: postseason results drive most of the score.
- One-Year Meteor: one elite season carries the period.
- Snakebitten Era: high point differential or win percentage, few titles.
- Dark Age: low score and poor average finish.

Suggested label rules:

```js
if (score.championships >= 2) label = 'Dynasty Run';
else if (score.championships >= 1 && score.regularSeasonTitles >= 1) label = 'Mini-Dynasty';
else if (score.regularSeasonTitles >= 2 && score.championships === 0) label = 'Regular Season Machine';
else if (score.playoffWinsRank <= 2 && score.championships >= 1) label = 'Playoff Peak';
else if (score.pointDiffRank <= 2 && score.championships === 0) label = 'Snakebitten Era';
else if (score.rankInPeriod >= score.totalOwners - 1) label = 'Dark Age';
else label = 'Contender Stretch';
```

## Integration With Current App

Current architecture:

- `js/app.js` is a thin bootstrap.
- `js/history-controller.js` currently owns page orchestration for League History and Head to Head.
- `showPage(id)` already supports any page id with a matching `tabXBtn` and `page-x` id.

Implement Dynasty Rankings by extending the current controller flow:

- Import `buildDynastyControls`.
- Import dynasty view-model/render functions.
- Add selected dynasty state.
- Add `handleDynastyChange(next)`.
- Add `ensureDynastyControls(initialState = {})`.
- Add `renderDynasty()`.
- Bind `#tabDynastyBtn`.
- Bootstrap directly into Dynasty Rankings when `?tab=dynasty` is present.

Do not put dynasty scoring logic inside `history-controller.js`. Keep scoring in `js/dynasty-renderers.js` or a future `js/dynasty-helpers.js`.

## URL State

Extend `js/state-helpers.js`.

Parse:

- `dynastyMode`
- `dynastyOwner`
- `dynastyStart`
- `dynastyEnd`
- `dynastyMinSeasons`
- `dynastySaunders`

Build:

```txt
?tab=dynasty&dynastyMode=calculator&dynastyOwner=Joe&dynastyStart=2021&dynastyEnd=2023&dynastyMinSeasons=2&dynastySaunders=1
```

Rules:

- `tab=dynasty` opens Dynasty Rankings.
- Calculator mode includes owner/start/end.
- Rolling modes include window mode and optional start/end if controls are active.
- Preserve existing history and rivalry URL behavior.

## Styling

Update `css/style.css`.

Suggested classes:

- `.dynasty-controls`
- `.dynasty-calculator-hero`
- `.dynasty-score`
- `.dynasty-score-rank`
- `.dynasty-score-breakdown`
- `.dynasty-component-bar`
- `.dynasty-component-fill`
- `.dynasty-period-leaderboard`
- `.dynasty-row`
- `.dynasty-rank`
- `.dynasty-chip-row`
- `.dynasty-chip`
- `.dynasty-window-grid`
- `.dynasty-window-card`
- `.dynasty-heatmap`
- `.dynasty-heatmap-row`
- `.dynasty-heatmap-cell`
- `.dynasty-heatmap-cell.champion`
- `.dynasty-heatmap-cell.saunders`
- `.dynasty-slump-list`
- `.dynasty-formula`

Visual direction:

- Analytical, confident, and scannable.
- More visual than League History.
- Less museum-like than Trophy Case.
- Use bars, rankings, plaques, heatmaps, and score chips.
- Keep long tables secondary.

## Tests

Add unit tests:

- `test/dynasty-controls.test.js`
- `test/dynasty-renderers.test.js`

Calculator tests:

- `calculateDynastyScore` scores a selected owner/range.
- Two championships in one period produce a high hardware score.
- A regular-season title in a non-championship season adds meaningful weight.
- Component values sum to total score.
- Missing requested seasons produce correct coverage metadata.
- Saunders penalties can be toggled off.
- `calculateDynastyScoresForPeriod` ranks all owners for the same period.
- Tie-breakers are deterministic.

Season profile tests:

- Owner-season profiles compute records, point differential, hardware, and ranks.
- Points-for ranks and point-differential ranks handle ties.
- Regular-season titles are derived correctly.
- Season score applies all weight components.

Window tests:

- Rolling 3-year windows include correct spans.
- Rolling 5-year windows include correct spans.
- Missing owner seasons respect `minSeasons`.
- Best windows by owner are selected correctly.
- Slump windows sort correctly.

Renderer tests:

- Calculator hero includes owner, range, score, rank, and hardware summary.
- Score breakdown renders all components.
- Period leaderboard escapes owner names.
- Heatmap renders one row per owner and one cell per available season.
- Formula section renders weights.

State tests:

- Parses `tab=dynasty`.
- Parses `dynastyOwner`, `dynastyStart`, `dynastyEnd`, and `dynastyMode`.
- Builds Dynasty URL state.
- Existing League History URLs remain unchanged.
- Existing Head to Head URL state still passes.

UI tests:

- Dynasty Rankings top-level tab appears.
- Clicking Dynasty activates `#tabDynastyBtn` and `#page-dynasty`.
- Controls render owner and season options.
- Changing owner/start/end updates score, rank, breakdown, and URL.
- Direct URL opens the calculator for the requested owner/range.
- Rolling 3-Year and Rolling 5-Year modes update best windows.
- Mobile viewport does not overlap score breakdown, heatmap labels, or cards.

Run:

```sh
npm run test:ci
```

## Implementation Order

1. Update `ERA_DYNASTY_IMPLEMENTATION_PLAN.md`.
2. Add URL parsing/building support for Dynasty state.
3. Add Dynasty top-level tab and empty `#page-dynasty` markup.
4. Add `js/dynasty-controls.js` and unit tests.
5. Add `js/dynasty-renderers.js` with score component helpers.
6. Implement owner-season profile construction and tests.
7. Implement `calculateDynastyScore` and selected-period comparison tests.
8. Implement rolling 3-year and 5-year windows.
9. Render calculator hero and score breakdown.
10. Render period leaderboard.
11. Render best windows, heatmap, slumps, and formula.
12. Wire Dynasty tab in `js/history-controller.js`.
13. Add CSS polish.
14. Add Playwright coverage.
15. Run `npm run test:ci`.
16. Do a browser pass at desktop and mobile widths.

## Acceptance Criteria

- Dynasty Rankings exists as its own top-level tab.
- A user can calculate a Dynasty Score for a selected owner and selected period.
- A period with two championships and another regular-season title scores as an elite dynasty run.
- The score is broken down into transparent components.
- The selected owner is ranked against all owners in the same requested period.
- Requested ranges outside available data show coverage metadata instead of silently mis-scoring.
- Rolling 3-year and 5-year rankings work.
- Selected-range and all-time leaderboards work.
- The page surfaces best eras, best windows, and worst slumps.
- The heatmap makes owner strength by season visible.
- Direct URL state opens the Dynasty page with the selected calculator inputs.
- Existing League History, Head to Head, and Trophy Case behavior are preserved.
- `npm run test:ci` passes.
