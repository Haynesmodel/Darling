# Current Season probability model

The Current Season command center keeps deterministic standings, clinched/eliminated status, and configured tiebreakers authoritative. Probabilities are a separate estimate layer.

## Model contract

- Model version: `team-score-monte-carlo-v1`.
- Default run count: 10,000.
- Seed: data version, season, selected week, model version, and the current game-score snapshot.
- Outputs: playoff, bye, every seed, and Saunders probabilities for each active owner.
- Additional snapshots: matching pre-week baseline, if-current-scores-hold, and selected-owner win/loss scenarios.
- Historical week selection truncates the analyzed snapshot after that week, so movement always compares post-week N with pre-week N.
- Forced win/loss scenarios condition normally sampled matchup scores and preserve live scores as hard floors.

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

The engine loads only when Current Season is rendered, preserving the critical entry bundle budget.
