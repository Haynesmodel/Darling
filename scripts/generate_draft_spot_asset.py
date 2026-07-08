#!/usr/bin/env python3
"""Generate the Draft Spot Explorer JSON asset from SeasonSummary data."""

from __future__ import annotations

import argparse
import json
import math
import statistics
from collections import defaultdict
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SEASON_SUMMARY = ROOT / "assets" / "SeasonSummary.json"
DEFAULT_OUT = ROOT / "assets" / "DraftSpot.json"
DEFAULT_GENERATED_AT = "2026-07-08T00:00:00Z"

ZONE_DEFINITIONS = {
    "early": "Early (1-3)",
    "middle": "Middle (4-7)",
    "late": "Late (8+)",
}
ZONE_ORDER = ["early", "middle", "late"]


@dataclass(frozen=True)
class DraftRow:
    season: int
    owner: str
    draft_pick: int
    team_count: int
    zone_key: str
    zone: str
    wins: float
    losses: float
    ties: float
    finish: int
    points_for: float
    points_against: float
    champion: bool
    saunders: bool
    made_playoffs: bool
    top_three: bool
    win_pct: float
    finish_score: float
    draft_percentile: float
    points_rank: int
    points_score: float
    points_z: float
    wins_above_avg: float


def finite_float(value: Any, fallback: float = 0.0) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return fallback
    return number if math.isfinite(number) else fallback


def finite_int(value: Any, fallback: int = 0) -> int:
    try:
        number = int(value)
    except (TypeError, ValueError):
        return fallback
    return number


def zone_for_pick(pick: int) -> tuple[str, str]:
    if pick <= 3:
        return "early", ZONE_DEFINITIONS["early"]
    if pick <= 7:
        return "middle", ZONE_DEFINITIONS["middle"]
    return "late", ZONE_DEFINITIONS["late"]


def pearson(xs: list[float], ys: list[float]) -> float:
    if len(xs) < 2:
        return 0.0
    mean_x = statistics.mean(xs)
    mean_y = statistics.mean(ys)
    numerator = sum((x - mean_x) * (y - mean_y) for x, y in zip(xs, ys))
    denom_x = math.sqrt(sum((x - mean_x) ** 2 for x in xs))
    denom_y = math.sqrt(sum((y - mean_y) ** 2 for y in ys))
    if not denom_x or not denom_y:
        return 0.0
    return numerator / (denom_x * denom_y)


def rows_from_season_summary(season_summary_rows: list[dict[str, Any]]) -> list[DraftRow]:
    by_season: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for item in season_summary_rows:
        by_season[finite_int(item.get("season"))].append(item)

    rows: list[DraftRow] = []
    for season, season_rows in sorted(by_season.items()):
        with_picks = [row for row in season_rows if row.get("draft_pick") is not None]
        if not with_picks:
            continue

        team_count = len(season_rows)
        denom = max(team_count - 1, 1)
        points = [finite_float(row.get("points_for")) for row in season_rows]
        avg_points = statistics.mean(points) if points else 0.0
        stdev_points = statistics.pstdev(points) or 1.0
        win_values = [finite_float(row.get("wins")) + 0.5 * finite_float(row.get("ties")) for row in season_rows]
        avg_wins = statistics.mean(win_values) if win_values else 0.0
        points_rank_lookup = {
            id(row): rank
            for rank, row in enumerate(
                sorted(season_rows, key=lambda item: finite_float(item.get("points_for")), reverse=True),
                start=1,
            )
        }

        for item in season_rows:
            raw_pick = item.get("draft_pick")
            if raw_pick is None:
                continue
            pick = finite_int(raw_pick)
            zone_key, zone_label = zone_for_pick(pick)
            wins = finite_float(item.get("wins"))
            losses = finite_float(item.get("losses"))
            ties = finite_float(item.get("ties"))
            games = wins + losses + ties
            finish = finite_int(item.get("finish"))
            points_for = finite_float(item.get("points_for"))
            points_against = finite_float(item.get("points_against"))
            playoff_games = finite_int(item.get("playoff_wins")) + finite_int(item.get("playoff_losses"))
            made_playoffs = bool(playoff_games or item.get("champion") or item.get("bye") or item.get("wild_card"))
            points_rank = points_rank_lookup[id(item)]
            effective_wins = wins + 0.5 * ties
            rows.append(
                DraftRow(
                    season=season,
                    owner=str(item.get("owner", "")).strip(),
                    draft_pick=pick,
                    team_count=team_count,
                    zone_key=zone_key,
                    zone=zone_label,
                    wins=wins,
                    losses=losses,
                    ties=ties,
                    finish=finish,
                    points_for=points_for,
                    points_against=points_against,
                    champion=bool(item.get("champion")),
                    saunders=bool(item.get("saunders")),
                    made_playoffs=made_playoffs,
                    top_three=finish <= 3,
                    win_pct=effective_wins / games if games else 0.0,
                    finish_score=(team_count - finish) / denom,
                    draft_percentile=(pick - 1) / denom,
                    points_rank=points_rank,
                    points_score=(team_count - points_rank) / denom,
                    points_z=(points_for - avg_points) / stdev_points,
                    wins_above_avg=effective_wins - avg_wins,
                )
            )
    return rows


def avg(rows: list[DraftRow], field: str) -> float:
    if not rows:
        return 0.0
    return statistics.mean(float(getattr(row, field)) for row in rows)


def rate(rows: list[DraftRow], field: str) -> float:
    if not rows:
        return 0.0
    return sum(1 for row in rows if getattr(row, field)) / len(rows)


def pick_summary(rows: list[DraftRow]) -> list[dict[str, Any]]:
    groups: dict[int, list[DraftRow]] = defaultdict(list)
    for row in rows:
        groups[row.draft_pick].append(row)

    summaries = []
    for draft_pick in sorted(groups):
        grouped = groups[draft_pick]
        summaries.append(
            {
                "draft_pick": draft_pick,
                "n": len(grouped),
                "avg_finish": avg(grouped, "finish"),
                "avg_finish_score": avg(grouped, "finish_score"),
                "avg_wins_above_avg": avg(grouped, "wins_above_avg"),
                "avg_points_z": avg(grouped, "points_z"),
                "top_three_rate": rate(grouped, "top_three"),
                "playoff_rate": rate(grouped, "made_playoffs"),
                "championships": sum(1 for row in grouped if row.champion),
                "champion_rate": rate(grouped, "champion"),
                "saunders_count": sum(1 for row in grouped if row.saunders),
                "saunders_rate": rate(grouped, "saunders"),
            }
        )
    return summaries


def zone_summary(rows: list[DraftRow]) -> list[dict[str, Any]]:
    groups: dict[str, list[DraftRow]] = defaultdict(list)
    for row in rows:
        groups[row.zone_key].append(row)

    summaries = []
    for zone_key in ZONE_ORDER:
        grouped = groups.get(zone_key, [])
        if not grouped:
            continue
        summaries.append(
            {
                "zone_key": zone_key,
                "zone": ZONE_DEFINITIONS[zone_key],
                "n": len(grouped),
                "avg_pick": avg(grouped, "draft_pick"),
                "avg_finish": avg(grouped, "finish"),
                "avg_finish_score": avg(grouped, "finish_score"),
                "avg_wins_above_avg": avg(grouped, "wins_above_avg"),
                "avg_points_z": avg(grouped, "points_z"),
                "top_three_rate": rate(grouped, "top_three"),
                "playoff_rate": rate(grouped, "made_playoffs"),
                "champion_rate": rate(grouped, "champion"),
                "saunders_rate": rate(grouped, "saunders"),
            }
        )
    return summaries


def group_record(label: str, rows: list[DraftRow], extra: dict[str, Any] | None = None) -> dict[str, Any]:
    record = {
        "label": label,
        "n": len(rows),
        "avg_finish": avg(rows, "finish"),
        "avg_finish_score": avg(rows, "finish_score"),
        "playoffs": sum(1 for row in rows if row.made_playoffs),
        "top_three": sum(1 for row in rows if row.top_three),
        "titles": sum(1 for row in rows if row.champion),
        "saunders": sum(1 for row in rows if row.saunders),
    }
    if extra:
        record.update(extra)
    return record


def confidence_for_sample(n: int) -> str:
    if n >= 5:
        return "strong"
    if n >= 3:
        return "medium"
    if n >= 2:
        return "small"
    return "league-wide fallback"


def owner_recommendation(owner: str, owner_rows: list[DraftRow], league_pick_summary: list[dict[str, Any]]) -> dict[str, Any]:
    by_pick: dict[int, list[DraftRow]] = defaultdict(list)
    by_zone: dict[str, list[DraftRow]] = defaultdict(list)
    for row in owner_rows:
        by_pick[row.draft_pick].append(row)
        by_zone[row.zone_key].append(row)

    pick_records = [
        group_record(f"Pick {pick}", sorted(grouped, key=lambda row: row.season), {"draft_pick": pick})
        for pick, grouped in sorted(by_pick.items())
    ]
    zone_records = [
        group_record(ZONE_DEFINITIONS[key], sorted(by_zone[key], key=lambda row: row.season), {"zone_key": key, "zone": ZONE_DEFINITIONS[key]})
        for key in ZONE_ORDER
        if by_zone.get(key)
    ]
    best_pick = max(pick_records, key=lambda item: (item["avg_finish_score"], item["titles"], item["top_three"], item["playoffs"], -item["draft_pick"]))
    best_zone = max(zone_records, key=lambda item: (item["avg_finish_score"], item["titles"], item["top_three"], item["playoffs"]))
    repeat_picks = [record for record in pick_records if record["n"] >= 2]
    repeat_zones = [record for record in zone_records if record["n"] >= 2]
    best_repeat_pick = max(repeat_picks, key=lambda item: (item["avg_finish_score"], item["titles"], item["top_three"], item["playoffs"])) if repeat_picks else None
    best_repeat_zone = max(repeat_zones, key=lambda item: (item["avg_finish_score"], item["titles"], item["top_three"], item["playoffs"])) if repeat_zones else None
    worst_zone = min(zone_records, key=lambda item: (item["avg_finish_score"], -item["saunders"])) if len(zone_records) > 1 else None

    if len(owner_rows) == 1:
        only = owner_rows[0]
        league_best = max(league_pick_summary, key=lambda item: (item["avg_finish_score"], item["playoff_rate"], item["championships"]))
        target = f"League-wide fallback: pick {league_best['draft_pick']}"
        recommendation = (
            f"Only one owner-specific sample: pick {only.draft_pick} in {only.season}, finish {only.finish}. "
            f"Use league-wide history first; pick {league_best['draft_pick']} has the best observed finish score."
        )
    elif best_repeat_pick and best_repeat_pick["n"] >= 3 and best_repeat_pick["avg_finish_score"] >= best_zone["avg_finish_score"] - 0.03:
        target = best_repeat_pick["label"]
        recommendation = (
            f"Target {best_repeat_pick['label']} specifically. Repeat sample: avg finish "
            f"{best_repeat_pick['avg_finish']:.1f}, playoffs {best_repeat_pick['playoffs']}/{best_repeat_pick['n']}, "
            f"titles {best_repeat_pick['titles']}."
        )
    elif best_pick["n"] == 1 and best_repeat_zone:
        target = f"{best_pick['label']} upside; {best_repeat_zone['label']} repeat zone"
        recommendation = (
            f"Best single result is {best_pick['label']}, but the sturdier area is {best_repeat_zone['label']} "
            f"(avg finish {best_repeat_zone['avg_finish']:.1f}, n={best_repeat_zone['n']})."
        )
    else:
        target = best_zone["label"]
        recommendation = (
            f"Target {best_zone['label']}. It is this owner's best observed zone: avg finish "
            f"{best_zone['avg_finish']:.1f}, playoffs {best_zone['playoffs']}/{best_zone['n']}, titles {best_zone['titles']}."
        )

    caution = "No clear avoid zone yet."
    if worst_zone:
        caution = f"Weakest area: {worst_zone['label']} (avg finish {worst_zone['avg_finish']:.1f}, n={worst_zone['n']})."
    if len(owner_rows) <= 2:
        caution = f"{caution} Sample is too small for a firm owner-specific read."

    return {
        "owner": owner,
        "target": target,
        "recommendation": recommendation,
        "caution": caution,
        "best_pick": best_pick,
        "best_zone": best_zone,
        "history": [
            {
                "season": row.season,
                "draft_pick": row.draft_pick,
                "finish": row.finish,
                "champion": row.champion,
                "saunders": row.saunders,
                "made_playoffs": row.made_playoffs,
            }
            for row in sorted(owner_rows, key=lambda item: item.season)
        ],
        "confidence": confidence_for_sample(len(owner_rows)),
    }


def owner_recommendations(rows: list[DraftRow], summaries_by_pick: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: dict[str, list[DraftRow]] = defaultdict(list)
    for row in rows:
        grouped[row.owner].append(row)
    return [
        owner_recommendation(owner, sorted(grouped[owner], key=lambda item: item.season), summaries_by_pick)
        for owner in sorted(grouped)
    ]


def build_asset(season_summary_rows: list[dict[str, Any]], generated_at: str = DEFAULT_GENERATED_AT) -> dict[str, Any]:
    rows = rows_from_season_summary(season_summary_rows)
    seasons = sorted({row.season for row in rows})
    summaries_by_pick = pick_summary(rows)
    return {
        "source": "SeasonSummary.json",
        "generated_at": generated_at,
        "season_range": {
            "start": seasons[0] if seasons else None,
            "end": seasons[-1] if seasons else None,
        },
        "team_seasons": len(rows),
        "correlations": {
            "pick_finish": pearson([row.draft_pick for row in rows], [row.finish for row in rows]),
            "draft_percentile_finish_score": pearson([row.draft_percentile for row in rows], [row.finish_score for row in rows]),
            "draft_percentile_points_z": pearson([row.draft_percentile for row in rows], [row.points_z for row in rows]),
        },
        "rows": [asdict(row) for row in sorted(rows, key=lambda item: (item.season, item.draft_pick, item.owner))],
        "pick_summary": summaries_by_pick,
        "zone_summary": zone_summary(rows),
        "owner_recommendations": owner_recommendations(rows, summaries_by_pick),
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--season-summary", type=Path, default=DEFAULT_SEASON_SUMMARY)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--generated-at", default=DEFAULT_GENERATED_AT)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    source_rows = json.loads(args.season_summary.read_text())
    asset = build_asset(source_rows, generated_at=args.generated_at)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(asset, indent=2, sort_keys=True) + "\n")
    print(f"Wrote {args.out} with {asset['team_seasons']} draft team-seasons.")


if __name__ == "__main__":
    main()
