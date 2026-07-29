# League asset field inventory

This inventory records the source shape used to create the strict schemas. JSON Schema files remain authoritative when this summary and executable contracts differ.

## H2H.json

Top level: array, 898 rows at implementation time.

| Field | Type | Presence | Notes |
| --- | --- | --- | --- |
| `season` | integer | required | 2014–2025 in the initial snapshot |
| `date` | `YYYY-MM-DD` string | required | Matchup date |
| `teamA`, `teamB` | nonblank string | required | Must differ and resolve to SeasonSummary |
| `scoreA`, `scoreB` | non-negative number | required | Final historical scores |
| `week` | positive integer | required | 1–17 in the initial snapshot |
| `type` | enum | required | `Regular`, `Playoff`, or `Saunders` |
| `round` | string or null | required | Empty/null for regular season; named postseason round otherwise |
| `bracket` | null | optional legacy field | Closed explicitly so a future value requires migration |

## SeasonSummary.json

Top level: array, one row per owner-season; 120 rows at implementation time.

Required numeric fields are `season`, `wins`, `losses`, `ties`, `finish`, `points_for`, `points_against`, `playoff_wins`, `playoff_losses`, `saunders_wins`, and `saunders_losses`. `bagels_earned` is required but nullable. `draft_pick` is an optional positive integer because 2014–2016 do not contain draft history.

Required booleans are `bye`, `champion`, `saunders`, `saunders_bye`, and `wild_card`. `owner` is a required nonblank string.

## Rivalries.json

Top level: array, 22 definitions at implementation time.

`slug`, `name`, `type`, and `members` are required. `slug` is kebab-case, `type` is `pair` or `group`, and `members` contains at least two unique known owners. `note` is optional display text.

## CurrentSeason.json

Top level: object.

Required metadata fields are `source`, `league_id`, `season`, `generated_at`, `current_week`, `regular_season_max_week`, `max_week`, `weeks_fetched`, `playoff_rules`, `update_context`, `teams`, and `games`.

Each team requires `roster_id`, `owner`, `display_name`, and `sleeper_team_name`. Each game requires historical game fields plus `status`, `matchup_id`, `rosterA`, and `rosterB`. Current scores may be null for scheduled/live games; final games require both scores. Allowed statuses are `scheduled`, `live`, and `final`.

## TransactionHistory.json

Top level: a versioned object containing a shared `players` catalog and up to 12 sorted seasons. Generation always retains the requested target season plus the 11 newest non-target seasons. The initial 2025 season contains 489 raw transactions, 417 complete transactions, 72 failed transactions, 8 completed trades, and one selected 192-pick draft.

Each season records its configured league, lifecycle status, bounded coverage, canonical roster-owner mapping, selected draft, normalized transactions, player ownership stints, and materialized insights. Transactions retain status, type, week, timestamp, participants, player adds/drops, draft-pick transfers, FAAB bid, and waiver-budget transfers. Only complete moves contribute to journeys and insights.

Player stints record acquisition and optional release provenance, matchup-confirmed rostered weeks, starts, total points, starter points, and final retention. A weekly matchup row can belong to only one stint for an owner/player pair; same-week overlaps resolve to the latest acquisition timestamp. Insights contain trade-side outcomes, waiver/free-agent finds, movement counts, owner activity, draft retention, and keeper return. Outcome status distinguishes `too_early`, `incomplete`, `provisional`, and `final`; future draft-pick consideration is incomplete.

The strict contract is `schemas/transaction-history.schema.json`. `schema_version`, `generator_version`, and `methodology_version` make structural or interpretation changes explicit.

See [data-pipeline.md](data-pipeline.md) for generation, validation, migrations, and recovery.
