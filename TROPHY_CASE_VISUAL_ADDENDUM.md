# Trophy Case Visual Addendum

This addendum updates the Trophy Case direction from a stats-heavy page into a visual owner profile. The base implementation plan still covers modules, URL state, tests, and integration order. This document changes the product bar: Trophy Case should feel meaningfully different from League History.

## Product Thesis

League History answers:

```txt
What happened?
```

Trophy Case answers:

```txt
Who is this owner historically?
```

The page should not repeat the League History filters, tables, and raw stat grids. It should interpret the same data into a curated visual resume: hardware, league rank, identity, signature seasons, best moments, and worst scars.

## Design Principle

Trophy Case should be:

- Visual before tabular.
- Curated before exhaustive.
- Comparative before isolated.
- Narrative before raw.
- Owner-profile driven, not filter driven.

The detailed table can still exist, but it should be supporting evidence near the bottom of the page. The first viewport should make the owner feel distinct.

## Revised Page Structure

Replace the original section order with this visual-first order:

```txt
Owner Selector
Owner Hero
Hardware Shelf
League Rank Strip
Career Shape
Signature Seasons
Hardware vs Scars
Best And Worst Moments
Season Ledger
```

Recommended markup targets:

```html
<section id="page-trophy" class="page">
  <div class="trophy-toolbar">
    <select id="trophyOwnerSelect" aria-label="Trophy case owner"></select>
  </div>

  <section id="trophyHero" class="trophy-hero"></section>

  <section class="card">
    <h3>Hardware Shelf</h3>
    <div id="trophyHardwareShelf" class="trophy-shelf"></div>
  </section>

  <section class="card">
    <h3>League Rank</h3>
    <div id="trophyRankStrip" class="trophy-rank-strip"></div>
  </section>

  <section class="card">
    <h3>Career Shape</h3>
    <div id="trophyCareerShape" class="trophy-career-shape"></div>
  </section>

  <section class="card">
    <h3>Signature Seasons</h3>
    <div id="trophySignatureSeasons" class="trophy-season-cards"></div>
  </section>

  <section class="trophy-split">
    <div class="card">
      <h3>Hardware</h3>
      <div id="trophyAchievementList"></div>
    </div>
    <div class="card">
      <h3>Scars</h3>
      <div id="trophyScarList"></div>
    </div>
  </section>

  <section class="card">
    <h3>Best And Worst Moments</h3>
    <div id="trophyMomentGrid" class="trophy-moment-grid"></div>
  </section>

  <section class="card">
    <h3>Season Ledger</h3>
    <div class="table-wrap">
      <table id="trophySeasonTable"></table>
    </div>
  </section>
</section>
```

## Owner Hero

The hero should feel like a profile card, not a stat block.

Content:

- Owner name.
- Data-backed identity label.
- One-line legacy summary.
- Three to five resume chips.
- Current all-time regular-season record.
- Best achievement and worst scar.

Example:

```txt
Joe
Contender Profile
2 Darlings, 3 regular-season titles, and a top-tier career win rate.

2 Darlings | #1 Win % | 4 Top-2 Seeds | 18 Weekly Crowns
Best: 2022 Darling
Scar: 2015 Saunders
```

Suggested identity labels:

- Dynasty Threat
- Contender Profile
- Regular Season Merchant
- Playoff Riser
- Snakebitten
- Boom/Bust
- Chaos Team
- Rebuild Resume
- Saunders Survivor

Identity labels must be computed from simple transparent rules. Do not hard-code owner-specific labels in the first version.

Example rule direction:

```js
if (championshipRank <= 2 && winPctRank <= 3) label = 'Dynasty Threat';
else if (regularTitleRank <= 2 && championshipCount === 0) label = 'Regular Season Merchant';
else if (luckRankWorst <= 2 || closeLossCountRank <= 2) label = 'Snakebitten';
else if (finishStdDevRank <= 2) label = 'Boom/Bust';
else if (playoffWinPctRank <= 3) label = 'Playoff Riser';
else label = 'Contender Profile';
```

## Hardware Shelf

The shelf should be the most visually distinct section.

Each tile should include:

- Hardware name.
- Count.
- Years.
- League rank.
- Short context line.

Example:

```txt
Darlings
2
2018, 2022
Tied #1 all-time
```

Recommended hardware tiles:

- Darlings.
- Regular-season titles.
- Top-2 seeds.
- Wild cards.
- Playoff wins.
- Saunders titles.
- Saunders byes.
- Bagels.

Use stronger visual treatment than the normal `.stat` tiles. This is where the page should pop.

## League Rank Strip

This is what prevents Trophy Case from just restating owner stats. Every important number should have context.

Show compact rank pills:

```txt
Championships #1
Win % #3
Average Finish #2
Playoff Wins #4
Weekly Crowns #2
Saunders Pain #8
```

Recommended rank metrics:

- Championships.
- Regular-season win percentage.
- Average finish.
- Regular-season titles.
- Playoff wins.
- Weekly high-score crowns.
- Sub-70 games, inverted so fewer is better.
- Saunders titles, where lower rank is better and label should read as pain.

Implementation helper:

```js
function rankOwners(ownerRows, metric, { direction = 'desc', label })
```

Tie handling should use competition ranking:

```txt
1, 1, 3
```

## Career Shape Graphic

Add one simple visual chart so the page is not only cards.

Version 1 should use inline HTML/CSS or a small SVG generated by the renderer. Do not add a charting dependency.

Recommended first chart:

- Season-by-season finish chart.
- Lower finish is better.
- Champion and Saunders seasons get visual markers.
- Hover/title text can show record and outcome.

Fallback if chart work becomes too large:

- Horizontal season strip.
- Each season is a colored block by finish tier:
  - Champion.
  - Playoff contender.
  - Mid-table.
  - Saunders.

Suggested helper:

```js
function trophyCareerShapeHtml(view)
```

## Signature Seasons

Replace the table-first approach with season cards.

Show 3 to 6 curated seasons:

- Championship seasons.
- Regular-season title seasons.
- Best points-for season.
- Best point-differential season.
- Most unlucky season.
- Saunders season.
- Biggest collapse or worst finish.

Each card:

- Season year.
- Main badge.
- Record.
- Finish.
- PF/PA/diff.
- One short reason it matters.

Example:

```txt
2022
Darling
10-4, 1st
Best owner season by point differential.
```

The detailed ledger can still show every season later on the page.

## Hardware vs Scars

This section gives the page personality.

Achievements examples:

- Won Darling in 2022.
- Regular-season title in 2020.
- Highest weekly score: 181.4.
- Best point differential season: +214.8.

Scars examples:

- Saunders title in 2015.
- Worst weekly score: 52.6.
- Biggest blowout loss: -74.2.
- Most unlucky season by expected wins.

Keep labels data-backed and concise. Avoid long prose.

## Best And Worst Moments

Use moment tiles instead of another generic weekly grid.

Recommended tiles:

- Highest score.
- Lowest score.
- Biggest win.
- Biggest loss.
- Best luck game or most unfortunate loss, if expected wins support it.
- Best playoff win.
- Worst playoff loss.

Each tile should include:

- Label.
- Main value.
- Date/season.
- Opponent.
- Scoreline.

## Season Ledger

Keep the detailed season table, but make it the final section.

Purpose:

- Auditability.
- Full history.
- Source of truth behind the visual sections.

The table should not be the emotional center of the page.

## View Model Changes

Update the proposed `buildTrophyCaseViewModel` shape:

```js
function buildTrophyCaseViewModel(owner, opts = {}) {
  return {
    owner,
    identity,
    hero,
    hardwareShelf,
    leagueRanks,
    careerShape,
    signatureSeasons,
    achievements,
    scars,
    moments,
    seasonLedger,
  };
}
```

Recommended helper groups:

```js
function buildOwnerCareerProfile(owner, allOwnerProfiles)
function computeOwnerIdentity(ownerProfile, leagueRanks)
function computeLeagueRanks(allOwnerProfiles)
function computeHardwareShelf(ownerProfile, leagueRanks)
function computeCareerShape(owner, seasonRows)
function computeSignatureSeasons(ownerProfile)
function computeAchievementAndScarLists(ownerProfile)
function computeOwnerMoments(owner, leagueGames)
function computeSeasonLedger(owner, seasonRows)
```

Build `allOwnerProfiles` once per Trophy Case render input so league ranks do not recompute separately for every metric.

## Renderer Exports

Add these exports instead of only stat-grid renderers:

```js
export {
  buildTrophyCaseViewModel,
  trophyHeroHtml,
  trophyHardwareShelfHtml,
  trophyRankStripHtml,
  trophyCareerShapeHtml,
  trophySignatureSeasonsHtml,
  trophyAchievementListHtml,
  trophyScarListHtml,
  trophyMomentGridHtml,
  trophySeasonLedgerHtml,
  renderTrophyHero,
  renderTrophyHardwareShelf,
  renderTrophyRankStrip,
  renderTrophyCareerShape,
  renderTrophySignatureSeasons,
  renderTrophyAchievementList,
  renderTrophyScarList,
  renderTrophyMomentGrid,
  renderTrophySeasonLedger,
};
```

## Styling Direction

The page should have its own visual vocabulary while still fitting the site.

Add classes:

- `.trophy-toolbar`
- `.trophy-hero`
- `.trophy-hero-title`
- `.trophy-identity`
- `.trophy-chip-row`
- `.trophy-chip`
- `.trophy-shelf`
- `.trophy-hardware-card`
- `.trophy-hardware-card.gold`
- `.trophy-hardware-card.scar`
- `.trophy-year-chip`
- `.trophy-rank-strip`
- `.trophy-rank-pill`
- `.trophy-career-shape`
- `.trophy-season-cards`
- `.trophy-season-card`
- `.trophy-split`
- `.trophy-moment-grid`
- `.trophy-moment-card`
- `.trophy-ledger`

Visual requirements:

- First viewport must clearly look different from League History.
- Hardware shelf should be visually richer than normal stat cards.
- Career shape graphic should be visible without horizontal scrolling on mobile.
- Season cards should use badges/chips, not table styling.
- Ledger table is allowed to look like existing tables because it is supporting detail.

## Testing Additions

Add tests beyond the base plan:

- Identity label rules choose expected labels for controlled owner profiles.
- League ranking handles ties with competition ranking.
- Hardware shelf includes rank context.
- Signature seasons are curated and capped.
- Career shape renders one item per owner season.
- Moment tiles include opponent/date/score context.
- Season ledger can still render every season.
- Visual section renderers escape owner names and notes.

Playwright should verify:

- Trophy Case first viewport contains hero, shelf, and rank strip.
- Season ledger is below the visual sections.
- Owner change updates identity, hardware, ranks, and URL.
- Mobile viewport shows no overlapping hero/shelf/rank text.

## Revised Acceptance Criteria

The Trophy Case feature is not complete if it only renders a set of stats already visible in League History.

It is complete when:

- The first viewport feels like an owner profile.
- Hardware and league ranks are visible before detailed tables.
- The owner has a data-backed identity label.
- Signature seasons are curated into cards.
- Best and worst moments are surfaced visually.
- The full season table is present only as supporting detail.
- Existing League History remains the raw stats workflow.
