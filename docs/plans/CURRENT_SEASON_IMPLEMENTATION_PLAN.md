# Current Season Implementation Plan

Status: complete.

Add a first-class **Current Season** split that makes the live year easy to browse and automatically links current matchups to historical Head to Head context. The primary current-season source is Sleeper via optional `assets/CurrentSeason.json`; `assets/H2H.json` remains the completed-game historical archive and fallback.

## Product Goal

The app should answer:

- What is happening this season?
- Who plays who this week?
- What is the historical context for each matchup?
- How does a team's current season compare with its own history?

The recommended first user-facing surface is a new top-level tab:

```txt
Current Season
```

This tab should default to the Sleeper-generated current season when `assets/CurrentSeason.json` exists, show the current Sleeper week and active matchup set when present, and provide historical context for every matchup. If the Sleeper asset is absent, the page falls back to the latest season available in `assets/H2H.json`.

## Definitions

Use explicit helper definitions so every module agrees on the same split:

- `latestSeason`: `CurrentSeason.season` when present, otherwise maximum numeric `game.season` from `leagueGames`.
- `currentSeasonGames`: games from `CurrentSeason.games` when present for the selected season, otherwise games where `game.season === latestSeason`.
- `regularCurrentSeasonGames`: current-season games where `isRegularGame(game)`.
- `latestCompletedWeek`: maximum `_weekByTeam[team]` or `game.week` seen in current-season regular games.
- `currentWeek`: `latestCompletedWeek` for a completed-only asset bundle; later, when scheduled games exist, this can become the lowest unplayed week.
- `currentMatchups`: current-season games for `currentWeek`, ordered by date/team name.
- `historicGames`: all games before `latestSeason`.
- `allTimeGames`: all games across every season.

Do not hard-code a year. The data update scripts already support a target season, and the UI should follow the loaded data.

## Phase 1: Shared Current Season Data Model

Add a focused helper module:

```txt
js/current-season-data.js
```

Exports:

```js
function latestLeagueSeason(leagueGames = [], seasonSummaries = [])
function currentSeasonGames(leagueGames = [], season)
function currentSeasonWeeks(games = [], season)
function latestCompletedWeek(games = [], season)
function gamesForSeasonWeek(games = [], season, week)
function buildCurrentSeasonStandings({ leagueGames, seasonSummaries, season })
function buildCurrentMatchupRows({ leagueGames, seasonSummaries, season, week })
function buildTeamCurrentSeasonSnapshot({ owner, leagueGames, seasonSummaries, season })
```

The matchup rows should be view-model ready:

```js
{
  season,
  week,
  date,
  teamA,
  teamB,
  scoreA,
  scoreB,
  resultA,
  resultB,
  allTimeContext,
  historicContext,
  currentSeasonContext,
  lastMeeting,
  playoffMeetings,
  currentFormA,
  currentFormB
}
```

Context should reuse existing primitives where possible:

- Use `headToHeadContext()` from `js/gauntlet-data.js` for simple all-time and selected-season summaries.
- Use `buildRivalryViewModel()` from `js/rivalry-renderers.js` when the UI needs richer H2H data like current streak, biggest blowout, closest game, lead trend, and season breakdown.

Avoid duplicating H2H calculations in the current-season feature.

## Phase 2: Current Season Tab And Controls

Update `index.html`:

```html
<button class="tab" id="tabCurrentBtn">Current Season</button>
```

Add:

```html
<section id="page-current" class="page">
  <div class="current-toolbar">
    <select id="currentSeasonSelect" aria-label="Current season"></select>
    <select id="currentWeekSelect" aria-label="Current week"></select>
  </div>

  <section id="currentHero" class="current-hero"></section>
  <section id="currentMatchups" class="current-matchups"></section>
  <section id="currentStandings" class="card"></section>
  <section id="currentTeamSnapshots" class="current-team-snapshots"></section>
</section>
```

Create:

```txt
js/current-season-controls.js
```

Responsibilities:

- Populate season options from loaded games.
- Default to `latestSeason`.
- Populate week options from the selected season.
- Default to `latestCompletedWeek`.
- Fire `onChange({ selectedSeason, selectedWeek })`.
- Keep controls URL-shareable.

Add URL params in `js/state-helpers.js`:

```txt
tab=current
currentSeason=2025
currentWeek=6
```

Controller state in `js/history-controller.js`:

```js
let selectedCurrentSeasonState = null;
```

Add controller functions mirroring the existing page pattern:

```js
function ensureCurrentSeasonControls(initialState = {})
function handleCurrentSeasonChange(next)
function renderCurrentSeason()
function updateHeaderForCurrentSeason(view)
```

Update `showPage()` routing and tab listeners for `current`.

## Phase 3: Current Season Renderers

Create:

```txt
js/current-season-renderers.js
```

Exports:

```js
function buildCurrentSeasonViewModel({ leagueGames, seasonSummaries, season, week })
function renderCurrentSeasonHero(view, opts)
function renderCurrentMatchups(view, opts)
function renderCurrentStandings(view, opts)
function renderCurrentTeamSnapshots(view, opts)
```

Recommended first screen layout:

1. **Season Hero**
   - Season year.
   - Current/latest week.
   - Number of teams active.
   - Highest score so far.
   - Closest game so far.
   - Biggest upset/luck note if easy from existing expected-win helpers.

2. **This Week's Matchups**
   - One compact matchup row/card per game.
   - Teams, score/result if completed.
   - Current-season record for both teams.
   - All-time H2H record.
   - Last meeting.
   - Current H2H streak.
   - Button/link target to Head to Head:

```txt
?tab=rivalry&rivalryTeamA=Joe&rivalryTeamB=Shap
```

3. **Current Standings**
   - Owner.
   - Record.
   - Win percentage.
   - Points for.
   - Points against.
   - Differential.
   - Streak.
   - Rank movement can wait until a later pass.

4. **Team Snapshots**
   - Current scoring rank.
   - Current opponent scoring rank.
   - Best win.
   - Worst loss.
   - Most common historical note, such as "best start since 2021" if the helper is straightforward.

Keep the UI dense and consistent with the existing app. This should feel like an operational league dashboard, not a marketing page.

## Phase 4: Head To Head Integration

Upgrade the existing Head to Head page to understand the current split without changing its core behavior.

Add optional controls to `#page-rivalry`:

```txt
Scope: All-Time | Current Season | Historical Before Current Season
```

Implementation approach:

- Extend `buildRivalryViewModel(teamA, teamB, games, opts = {})`.
- Add `opts.scope` and `opts.currentSeason`.
- Filter input games before summary calculation:
  - `allTime`: no filter.
  - `currentSeason`: `game.season === currentSeason`.
  - `historic`: `game.season < currentSeason`.
- Default remains `allTime` so existing Head to Head URLs do not change.

Current Season matchup cards should display both:

- All-time H2H summary.
- Current-season H2H summary, when the teams have already played this season.

This creates the product behavior we want: a current matchup automatically pulls historic Head to Head context, while the full H2H page can pivot into the current-season split.

## Phase 5: Team History Cross-Links

Add small current-season links into existing surfaces:

- League History team header: if selected team has current-season games, show a "Current Season" link/filter shortcut.
- Opponent Breakdown: when the selected season filter is the current season, link opponent rows to Head to Head with `scope=currentSeason`.
- Trophy Case: add a subtle current-season status chip only if the selected owner has active current-season data.
- Historical Matchup/Gauntlet: leave unchanged in the first implementation unless the current matchup cards benefit from linking to it.

These should be additive links, not new global behavior.

## Phase 6: Sleeper Current-Season Asset

Current Season should not infer "current" solely from the historical archive. Extend the Sleeper update pipeline to generate a separate asset:

- Keep `assets/H2H.json` completed games only.
- Generate `assets/CurrentSeason.json` from Sleeper.
- Allow nullable scores in `CurrentSeason.games` for scheduled matchups.
- Add `status: "scheduled" | "final"` to current-season game rows.
- Have `scripts/update_sleeper_h2h.sh` produce `assets/CurrentSeason.updated.json`.
- Have `.github/workflows/update-sleeper.yml` promote `assets/CurrentSeason.json` when changed.
- Make the UI prefer `CurrentSeason.json` for Current Season matchups, standings, and team snapshots.
- Use historical `H2H.json` for archive context and as a fallback only.

## Testing Plan

Add focused tests before broad UI coverage:

```txt
test/current-season-data.test.js
test/current-season-renderers.test.js
```

Coverage should include:

- Latest season detection from games and summaries.
- Latest week detection when `_weekByTeam` exists.
- Fallback week detection from `game.week`.
- Standings from current-season games.
- Current matchup rows include all-time and current-season H2H context.
- Empty-state behavior for no games.
- URL parsing/building for `tab=current`, `currentSeason`, and `currentWeek`.

Extend existing tests:

- `test/state-helpers.test.js`: current URL params.
- `test/app-state-controller.test.js`: render keys/cache invalidation for current page, if new keys are added.
- `test/ui/app.spec.js`: tab loads, controls render, matchup link opens Head to Head with the expected teams.

Run:

```txt
npm run test:unit
npm run test:ui
```

## Implementation Order

1. Add `js/current-season-data.js` with unit tests.
2. Add URL state support for `tab=current`, `currentSeason`, and `currentWeek`.
3. Add `js/current-season-controls.js` with focused tests if needed.
4. Add `js/current-season-renderers.js` and renderer tests.
5. Add the Current Season tab markup and controller integration.
6. Wire matchup cards to existing Head to Head URLs.
7. Add optional Head to Head scope controls.
8. Add CSS polish in `css/style.css`.
9. Add Playwright coverage for the new page and cross-links.
10. Run unit and UI tests, then update this plan status.

## Acceptance Criteria

- A top-level Current Season tab exists.
- It defaults to the Sleeper current-season asset when present, without hard-coded years.
- It shows latest/current week matchups from the current season.
- Each matchup includes all-time H2H context and links to the Head to Head page.
- Head to Head can show all-time and current-season split context.
- URLs are shareable for the Current Season tab and selected week.
- Existing History, Head to Head, Trophy Case, Dynasty Rankings, and Historical Matchup pages still load.
- Unit and UI tests cover the new data helpers and primary page flow.

## Later Enhancements

- Upcoming schedule via optional `assets/CurrentSchedule.json`.
- Playoff odds and clinching scenarios.
- Strength of schedule and luck standings.
- "Best start since..." and "worst start since..." historical comparison cards.
- Rivalry badges on matchup cards.
- Weekly recap copy generated from current matchup rows.
- Awards race for highest scorer, most unlucky, best waiver/draft outcome if transaction data becomes available.
