# Trophy Case Implementation Plan

Add a new **Trophy Case** view that turns each owner's accomplishments into a visual resume: championships, Saunders, regular-season titles, byes, playoff stats, weekly crowns, weekly low scores, best seasons, and notable scars.

## 1. Product Shape

Add this as a third top-level tab:

```txt
Trophy Case
```

The Trophy Case is more of a league-wide museum than a filtered history table, so a top-level tab is cleaner than burying it inside the existing League History page.

Primary controls:

- Owner selector
- Optional future view toggle:
  - Owner Case
  - League Shelf

First version should ship with just owner selection.

## 2. Page Structure

Add to `index.html`:

```html
<button class="tab" id="tabTrophyBtn">Trophy Case</button>
```

Add page section:

```html
<section id="page-trophy" class="page" hidden>
  <div class="card">
    <div class="controls filters trophy-controls">
      <label>Owner:
        <select id="trophyOwnerSelect"></select>
      </label>
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
      <table id="trophySeasonTable"></table>
    </div>
  </div>
</section>
```

## 3. Data To Show

Hardware:

- Darlings
- Saunders
- Regular-season titles
- Top-2 byes
- Wild cards
- Saunders byes / anti-byes
- Playoff wins
- Saunders bracket wins

Regular-season resume:

- All-time regular-season record
- Win percentage
- Total points for
- Average points per game
- Average points against
- Best finish
- Average finish
- Best PPG season
- Best point differential season

Weekly awards:

- Top-week crowns
- Bottom-week turds
- 150+ point games
- Sub-70 games
- Highest single-game score
- Lowest single-game score
- Biggest blowout win
- Biggest blowout loss

Signature seasons table:

- Season
- Record
- Finish
- Outcome
- Points for
- Points against
- Point differential
- Notes

Notes can include:

- Champion
- Saunders
- Top-2 Seed
- Regular-Season Title
- Best PPG
- Worst PPG
- Most points against

## 4. Visual Direction

Make the top section feel like a real trophy case without becoming a gimmick.

Use visual tiles like:

```txt
Trophy: Darling
2018, 2022

Saunders
2016

Regular-Season Titles
2020, 2023
```

Since the site already uses emoji badges and crown/turd awards, emoji icons are acceptable for this view.

Suggested card types:

- Gold-accent hardware cards for Darlings
- Muted/danger-accent cards for Saunders
- Neutral stat cards for records
- Small year chips for accomplishments

Avoid overly decorative shelves in the first version. Use clean cards with strong labels and year chips.

## 5. App State

In `js/app.js`:

```js
let selectedTrophyOwner = DEFAULT_TEAM;
```

Add tab behavior:

```js
const trophyTab = document.getElementById('tabTrophyBtn');

trophyTab.addEventListener('click', () => {
  showPage('trophy');
  buildTrophyControlsOnce();
  renderTrophyCase();
});
```

Owner selector should reuse existing `teamOptions(...)`, excluding `ALL_TEAMS`.

## 6. New Renderer Module

Add:

```txt
js/trophy-renderers.js
```

Exports:

```js
export {
  buildTrophyCaseViewModel,
  renderTrophyHero,
  renderTrophyHardware,
  renderTrophyRegularSeason,
  renderTrophyPostseason,
  renderTrophyWeeklyAwards,
  renderTrophySeasonTable,
};
```

Main view model:

```js
function buildTrophyCaseViewModel(owner, opts = {}) {
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

Inputs:

```js
{
  leagueGames,
  seasonSummaries,
  seasonAggregates,
  weeklyAwards,
}
```

## 7. Stats Helpers

Reuse existing helpers where possible:

- `computeSeasonAggregatesAllTeams`
- `computeWeeklyAwards`
- `computeSubThresholdGamesPerTeam`
- `computeLongestTeamStreaks`
- `bestStreakForTeam`
- `computeExpectedWinForGame`
- `computeLuckSummary`

Add small trophy-specific helpers only when needed:

```js
function computeOwnerHardware(owner, seasonSummaries)
function computeOwnerRegularResume(owner, seasonAggregates)
function computeOwnerPostseasonResume(owner, seasonSummaries)
function computeOwnerWeeklyResume(owner, leagueGames)
function computeOwnerSignatureSeasons(owner, seasonSummaries, seasonAggregates)
```

## 8. Hero Section

Render into `#trophyHero`.

Example:

```txt
Joe Trophy Case
2 Darlings | 1 Regular-Season Title | 3 Top-2 Seeds
All-time regular season: 82-61 | .573
Best finish: 1st | Average finish: 4.2
```

If owner has a Saunders:

```txt
The shelf includes 1 Saunders.
```

## 9. Hardware Grid

Render into `#trophyHardwareGrid`.

Cards:

- Darlings
- Saunders
- Regular-Season Titles
- Top-2 Seeds
- Wild Cards
- Anti-Byes
- Playoff Wins
- Saunders Wins

Each card:

```js
{
  label: 'Darlings',
  icon: 'Trophy',
  value: 2,
  years: [2022, 2018],
  tone: 'gold',
}
```

HTML pattern:

```html
<div class="trophy-card trophy-gold">
  <div class="trophy-icon">🏆</div>
  <div>
    <div class="trophy-label">Darlings</div>
    <div class="trophy-value">2</div>
    <div class="trophy-years">2022, 2018</div>
  </div>
</div>
```

## 10. Regular Season Resume

Cards:

- Record
- Win %
- Points For
- PPG
- Points Against
- OPPG
- Best Finish
- Average Finish
- Best PPG Season
- Best Point Diff
- Luck, if useful

This should use regular-season games only, excluding playoff and Saunders games where appropriate.

## 11. Postseason Resume

Cards:

- Playoff record
- Playoff wins
- Championship appearances, if derivable
- Darlings
- Top-2 seeds
- Wild cards
- Saunders bracket record
- Saunders titles

Some values may come only from `SeasonSummary.json`.

## 12. Weekly Awards

Cards:

- Crowns
- Turds
- 150+ games
- Sub-70 games
- Highest score
- Lowest score
- Biggest blowout win
- Worst blowout loss
- Longest win streak
- Longest losing streak

This overlaps with existing Fun Facts, but Trophy Case reframes it as career accolades.

## 13. Signature Seasons Table

Columns:

- Season
- Record
- Finish
- Outcome
- PF
- PA
- Diff
- Notes

Sort newest-first by default, but consider putting most accomplished seasons first later.

Notes logic:

```js
if (row.champion) notes.push('Darling');
if (row.saunders) notes.push('Saunders');
if (row.bye) notes.push('Top-2 Seed');
if (regularSeasonTitleYears.includes(row.season)) notes.push('Regular-Season Title');
if (row.wild_card) notes.push('Wild Card');
if (row.saunders_bye) notes.push('Anti-Bye');
```

## 14. League Shelf Later

Version two could add a league-wide visual shelf:

- All owners as columns
- Trophy counts by category
- Sort by Darlings, playoff wins, dynasty score, or average finish
- Most decorated leaderboard
- Most cursed leaderboard

This is useful, but do not include it in the first implementation unless the scope intentionally expands.

## 15. URL State

Optional after the base view works:

```txt
?tab=trophy&owner=Joe
```

On load:

- Parse `tab=trophy`
- Validate owner
- Open Trophy Case tab
- Select owner
- Render trophy case

## 16. Styling

Add to `css/style.css`:

```css
.trophy-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
}

.trophy-card {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 14px;
  background: var(--surface);
  display: flex;
  gap: 12px;
  align-items: flex-start;
}

.trophy-icon {
  font-size: 1.8rem;
  line-height: 1;
}

.trophy-label {
  color: var(--muted);
  font-size: 0.85rem;
}

.trophy-value {
  font-size: 1.6rem;
  font-weight: 800;
}

.trophy-years {
  margin-top: 4px;
  font-size: 0.85rem;
  color: var(--muted);
}

.trophy-gold {
  border-color: rgba(218, 165, 32, 0.45);
}

.trophy-danger {
  border-color: rgba(180, 60, 60, 0.45);
}
```

Adjust variable names to match the actual stylesheet.

## 17. Tests

Add unit tests for `trophy-renderers.js`:

- Counts Darlings correctly.
- Counts Saunders correctly.
- Counts byes, wild cards, and anti-byes correctly.
- Computes regular-season record from season summaries or aggregates.
- Computes weekly crowns/turds correctly.
- Handles owners with no championships.
- Handles missing/null `bagels_earned` or optional fields safely.
- Renders empty years as `-`.

Add UI tests:

- Trophy Case tab appears.
- Clicking tab displays owner selector.
- Owner selector populates.
- Changing owner updates hero text.
- Hardware grid renders expected labels.
- Signature seasons table renders rows.

## 18. Implementation Order

1. Add Trophy Case tab and page markup.
2. Extend `showPage()` behavior if needed.
3. Add trophy owner state and control builder.
4. Create `js/trophy-renderers.js`.
5. Build and render hero section.
6. Build and render hardware grid.
7. Add regular-season, postseason, and weekly award grids.
8. Add signature seasons table.
9. Add styling.
10. Add unit tests.
11. Add Playwright coverage.
12. Optionally add URL state.

## Recommended First Version Scope

Ship first:

- Trophy Case tab
- Owner selector
- Hero summary
- Hardware grid
- Regular-season resume
- Weekly awards
- Signature seasons table
- Tests

Leave for version two:

- League-wide shelf
- Dynasty score
- Sortable owner leaderboard
- Trophy animations
- Shareable trophy cards
- URL state
- Deeper playoff bracket/accomplishment context
