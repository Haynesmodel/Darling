# Rivalry Feature Implementation Plan

Status: complete.

Add a second top-level tab called **Rivalry** that lets users select two teams and view a full "tale of the tape" head-to-head breakdown. Keep it static, data-driven, and consistent with the current League History page.

## 1. Add The Rivalry Tab

Update `index.html` to add:

```html
<button class="tab" id="tabRivalryBtn">Rivalry</button>
```

Then add a new page section:

```html
<section id="page-rivalry" class="page" hidden>
  ...
</section>
```

The Rivalry page should include:

- Saved rivalry selector
- Team A selector
- Team B selector
- Headline matchup summary
- Tale of the Tape card grid
- Season-by-season breakdown
- Game log table

Suggested structure:

```html
<section id="page-rivalry" class="page" hidden>
  <div class="card">
    <div class="controls filters rivalry-controls">
      <label>Saved Rivalry:
        <select id="rivalrySelect"></select>
      </label>

      <label>Team A:
        <select id="rivalryTeamA"></select>
      </label>

      <label>Team B:
        <select id="rivalryTeamB"></select>
      </label>
    </div>
  </div>

  <div class="card" id="rivalryHeadline"></div>

  <div class="card">
    <h3>Tale of the Tape</h3>
    <div id="rivalryTapeGrid" class="stats-grid"></div>
  </div>

  <div class="card">
    <h3>Season Breakdown</h3>
    <div class="table-wrap">
      <table id="rivalrySeasonTable">...</table>
    </div>
  </div>

  <div class="card">
    <h3>Game Log</h3>
    <div class="table-wrap">
      <table id="rivalryGameTable">...</table>
    </div>
  </div>
</section>
```

## 2. Add A Rivalry Controller

Create `js/rivalry-controller.js` for rivalry-specific state, render orchestration, and tab lifecycle, with `js/app.js` staying as the bootstrap/import surface only:

```js
let selectedRivalrySlug = '';
let rivalryTeamA = DEFAULT_TEAM;
let rivalryTeamB = null;
```

Add tab handling alongside the existing history tab inside the controller:

```js
// handled by js/rivalry-controller.js
```

The existing `showPage()` helper likely already supports toggling pages by id. If it assumes only `history`, extend the shared page helper to support `rivalry` without moving page state into `js/app.js`.

## 3. Add Rivalry Control Builder

Create `js/rivalry-controls.js` for the control builder and DOM read/write helpers:

```js
function buildRivalryControls() {
  const teams = teamOptions(seasonSummaries, leagueGames, ALL_TEAMS)
    .filter(t => t.value !== ALL_TEAMS);

  // Populate Team A / Team B selects
  // Populate saved rivalries from assets/Rivalries.json
}
```

Behavior:

- Team A defaults to `Joe` if present.
- Team B defaults to the first different team.
- Saved rivalry dropdown includes `Custom Matchup` plus pair rivalries from `assets/Rivalries.json`.
- When a saved pair rivalry is selected, set Team A and Team B.
- When either team select changes manually, reset saved rivalry to `Custom Matchup`.
- Prevent duplicate matchups where Team A equals Team B by auto-switching the other selector.

For `Rivalries.json`:

- Use only entries with `type: "pair"` and exactly two members for the initial version.
- Group rivalries can be added later as a matrix-style view.

## 4. Create A Rivalry Renderer Module

Add a new file:

```txt
js/rivalry-renderers.js
```

This should mirror the current pattern in `history-renderers.js` and `league-renderers.js`: pure view-model helpers plus DOM render functions.

Exports:

```js
export {
  buildRivalryViewModel,
  renderRivalryHeadline,
  renderRivalryTape,
  renderRivalrySeasonTable,
  renderRivalryGameTable,
};
```

Main view model:

```js
function buildRivalryViewModel(teamA, teamB, leagueGames, opts = {}) {
  const games = rivalryGames(teamA, teamB, leagueGames);

  return {
    teamA,
    teamB,
    games,
    summary,
    tape,
    seasons,
    gameRows,
  };
}
```

## 5. Add Rivalry Stats Helpers

Add focused helpers to `js/stats-helpers.js`, or keep them inside `rivalry-renderers.js` if they are only used there.

Recommended helper functions:

```js
function rivalryGames(teamA, teamB, games)
function summarizeRivalry(teamA, teamB, games)
function rivalrySeasonBreakdown(teamA, teamB, games)
function longestRivalryStreak(teamA, teamB, games)
function currentRivalryStreak(teamA, teamB, games)
function biggestRivalryBlowout(teamA, teamB, games)
function closestRivalryGame(teamA, teamB, games)
function highestRivalryScore(teamA, teamB, games)
function lastRivalryMeeting(teamA, teamB, games)
```

Core metrics:

- All-time record from Team A perspective
- Team A wins
- Team B wins
- Ties
- Total games
- Team A points
- Team B points
- Average Team A score
- Average Team B score
- Total point differential
- Regular-season record
- Playoff record
- Saunders record
- Current streak
- Longest Team A streak
- Longest Team B streak
- Biggest blowout
- Closest game
- Highest score by either team
- Lowest score by either team
- Last meeting

Important: all records should be computed from the perspective of `teamA`, then displayed clearly.

Example:

```txt
Joe leads 8-5
Joe +72.42 all-time point differential
Current streak: Joel W2
```

## 6. Headline Matchup

Render into `#rivalryHeadline`.

Suggested display:

```txt
Joe vs Joel
Joe leads 8-5 all time
898.22 - 825.80 total points
Last meeting: Joe won 124.50 - 117.80 on 2024-10-13
```

If tied:

```txt
Series tied 6-6
```

If no games:

```txt
No recorded games between Joe and Joel.
```

## 7. Tale Of The Tape Cards

Render into `#rivalryTapeGrid` using the existing `.stats-grid` / stat tile styling.

Cards:

- Series Record
- Total Games
- Point Differential
- Average Score
- Regular Season
- Playoffs
- Saunders
- Current Streak
- Longest Streak
- Biggest Blowout
- Closest Game
- Highest Score
- Last Meeting

Example card data:

```js
[
  {
    label: 'Series Record',
    value: '8-5',
    sub: 'Joe leads',
  },
  {
    label: 'Point Differential',
    value: '+72.42',
    sub: 'Joe all time',
  },
]
```

## 8. Season Breakdown Table

Table columns:

- Season
- Record
- Team A PF
- Team B PF
- Point Diff
- Biggest Game
- Notes

Example:

```txt
2022 | Joe 2-0 | 254.20 | 221.80 | +32.40 | Joe 142.10 - 118.40 | Regular season sweep
```

Notes can be simple at first:

- Sweep
- Split
- Playoff meeting
- Saunders meeting
- No games

Only include seasons where the two teams played each other.

## 9. Game Log Table

Table columns:

- Date
- Season
- Week
- Type
- Round
- Winner
- Score
- Margin

Rows sorted newest-first, matching existing history tables.

Example row:

```txt
2024-10-13 | 2024 | 6 | Regular | - | Joe | 124.50 - 117.80 | 6.70
```

Use result classes similar to current tables:

- Team A win: `result-win`
- Team A loss: `result-loss`
- Tie: `result-tie`
- Postseason: `postseason`

This keeps the visual language consistent with League History.

## 10. Saved Rivalries Behavior

Initial version:

- `Custom Matchup`
- Pair rivalries from `assets/Rivalries.json`

If selected rivalry has:

```json
{
  "slug": "joel-singer",
  "name": "Joel & Singer",
  "type": "pair",
  "members": ["Joel", "Singer"]
}
```

Then:

```js
rivalryTeamA = "Joel";
rivalryTeamB = "Singer";
renderRivalry();
```

Future enhancement for group rivalries:

- Show group matrix
- Let users click a pair inside the group
- Trigger existing group easter egg/backdrop if desired

Do not build group-rivalry matrix in the first pass unless you want a larger scope.

## 11. URL State

Optional but worth doing after the base feature works.

Add query params:

```txt
?tab=rivalry&a=Joe&b=Joel
```

or:

```txt
?rivalry=joel-singer
```

Minimum useful version:

- Update URL when Team A or Team B changes.
- On load, parse `tab=rivalry`, `a`, and `b`.
- If valid, open Rivalry tab automatically.

This makes rivalry pages shareable.

## 12. Styling

Update `css/style.css`.

Likely additions:

```css
.rivalry-controls {
  align-items: end;
}

.rivalry-headline {
  display: grid;
  gap: 8px;
}

.rivalry-title {
  font-size: 1.6rem;
  font-weight: 800;
}

.rivalry-subtitle {
  color: var(--muted);
}

.rivalry-scoreline {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
}
```

Keep the UI aligned with existing cards and tables. No new visual system needed.

## 13. Tests

Add unit tests in existing test files or create:

```txt
test/rivalry-renderers.test.js
```

Test cases:

- Filters only games between selected teams.
- Computes record from Team A perspective.
- Handles Team A as `teamA` or `teamB` in the source game row.
- Computes ties correctly.
- Computes point differential correctly.
- Computes biggest blowout.
- Computes closest game.
- Computes current streak.
- Computes season breakdown.
- Handles no games gracefully.

Add UI coverage in `test/ui/app.spec.js`:

- Rivalry tab appears.
- Clicking Rivalry opens the page.
- Team selectors populate.
- Selecting two teams renders headline/tape/game log.
- Saved pair rivalry pre-fills teams.
- Game log updates after changing teams.

## 14. Implementation Order

1. Add Rivalry tab and empty Rivalry page markup.
2. Extend shared page/tab behavior if needed.
3. Add control builder for Team A, Team B, saved rivalries.
4. Add `rivalry-renderers.js` with pure view model functions.
5. Render headline, tape cards, season table, game log.
6. Add styling.
7. Add unit tests for rivalry calculations.
8. Add Playwright test for tab and selectors.
9. Optionally add URL state once the base feature is stable.

## Recommended First Version Scope

For the first implementation, ship:

- New Rivalry tab
- Team A / Team B selectors
- Saved pair rivalry selector
- Headline summary
- Tale of the Tape cards
- Season breakdown table
- Game log table
- Unit tests and one UI test

Leave these for version two:

- Group rivalry matrix
- Timeline visualization
- Shareable stat cards
- URL state
- Easter egg integration for rivalry selections
