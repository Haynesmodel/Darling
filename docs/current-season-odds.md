# Current Season probability model

Current-season scores are explicitly provisional until the shared weekly
completion boundary is verified. Odds and recap copy must not describe a live
or unresolved score as a completed historical result; delayed provider state is
withheld conservatively and can be reconciled through a report-only review.

The Current Season command center keeps deterministic standings, qualification, and configured tiebreakers authoritative. Probabilities are a separate estimate layer and are not part of the default finalized-season recap.

## Lifecycle gate

`src/data/season-presentation.ts` owns the six presentation phases and the single odds eligibility decision. The probability module is requested only for a regular-season `command` or `standings` view. Playoff Machine edits never request or rerun Monte Carlo.

| Phase/view | Probability work |
| --- | --- |
| Regular-season command or standings | Eligible; load on demand |
| Preseason recap | Not requested |
| Postseason command | Not requested; trophy paths use deterministic game state |
| Finalizing or offseason recap | Not requested |
| Historical fallback | Not requested |
| Matchups, owners, or recap view in any phase | Not requested |
| Playoff Machine | Not requested; scenario edits use deterministic standings |

An explicit command view for a finalized season exposes historical/final analysis, but its projection mode is completed-only and it does not calculate future odds.

## Model contract

- Model version: `team-score-monte-carlo-v2`.
- Default run count: 10,000.
- Seed: data version, season, selected week, model version, and the current game-score snapshot.
- Outputs: playoff, bye, every seed, and Saunders probabilities for each active owner.
- The shared qualification helper is applied to every simulation and completed-season snapshot. The confirmed 2026 rule gives seeds 1–5 to the top five by record (points for breaks ties), then seed 6 to the highest-total-points team among the remaining seven. Remaining placement seeds follow standings order.
- Additional snapshots: matching pre-week baseline, if-current-scores-hold, and selected-owner win/loss scenarios.
- Historical week selection truncates the analyzed snapshot after that week, so movement always compares post-week N with pre-week N.
- Historical records, seeds, statuses, gaps, and probabilities share that same post-week snapshot, while playoff/byes/Saunders slots are inferred from the selected season's stored bracket.
- Forced win/loss scenarios condition normally sampled matchup scores and preserve live scores as hard floors.

## Playoff Machine

The machine shows every unresolved regular-season matchup through the configured final week. Outcome picks update wins/losses/ties only; they never add synthetic points for. Exact numeric scores update both points-for totals and the result. A scenario is labeled provisional until every unresolved game has two valid scores from 0 to 999.99, with at most two decimal places. Incomplete or structurally invalid weekly schedules withhold exact seeds.

Scenario edits live in controller memory for the active visit. Switching views keeps them; changing season or data version clears them; reload starts empty. The machine does not call Monte Carlo. The 2026 qualification rule is confirmed; equal-total-points ties among wildcard candidates remain unresolved until an official rule is set. The machine and completed playoff picture do not choose a qualifier for a tie. Odds split a tied simulation draw evenly among tied candidates as an estimate only, without declaring an official seed 6. This rule is separate from `SeasonSummary.wild_card`, which means a postseason wild-card-round appearance.

## Team scoring distributions

Completed regular-season scores in the selected season receive increasing weight from 40% early in the year toward 85% late in the regular season. Recency-weighted historical owner seasons supply the next prior, and league scoring supplies the remaining weight or the full fallback for expansion/missing-history owners.

Means and standard deviations are blended, standard deviation has a defensive minimum, and samples are clamped to historical league bounds. The UI exposes current/historical sample counts and weights through the model contract and describes the methodology beside the odds.

## Live games

When `CurrentSeason.update_context.contains_live_scores` is true, the model is score-aware: the current score acts as a floor and is blended with team strength. The model is explicitly not lineup-projection-aware because the asset does not contain remaining-player projections or reliable completion metadata.

When live scores are not declared reliable, simulations use pregame team strength. “If scores hold” finalizes available live scores and simulates only later games.

## Invariants

- A fixed seed and snapshot produce identical output.
- Seed probabilities for one owner sum to 100%.
- League playoff probabilities sum to the configured playoff slots.
- League bye probabilities sum to the configured bye slots.
- Saunders probabilities sum to the configured Saunders slots.
- Completed-season results collapse to exact 0%/100% probabilities.
- Clinched and eliminated mathematical states override estimates in the presentation layer.
- When sixth place depends on points for, in-season status labels stay neutral until all games are final; completed standings determine the playoff and bye labels.

The engine loads only when an eligible active Current Season view is rendered. Finalized 2025 therefore reaches ready state without requesting the odds module or probability methodology.
