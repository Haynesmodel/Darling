#!/usr/bin/env python3
"""Generate the Draft Spot Explorer asset from canonical SeasonSummary data."""

from __future__ import annotations

import argparse
import hashlib
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
DEFAULT_GENERATED_AT = "2026-07-16T00:00:00Z"
GENERATOR_VERSION = 1
SCHEMA_VERSION = 1

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


def canonical_json(value: Any) -> str:
    return json.dumps(value, indent=2, sort_keys=True) + "\n"


def sha256_json(value: Any) -> str:
    digest = hashlib.sha256(canonical_json(value).encode("utf-8")).hexdigest()
    return f"sha256:{digest}"


def finite_float(value: Any, fallback: float = 0.0) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return fallback
    return number if math.isfinite(number) else fallback


def finite_int(value: Any, fallback: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return fallback


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
    return numerator / (denom_x * denom_y) if denom_x and denom_y else 0.0


def rows_from_season_summary(source_rows: list[dict[str, Any]]) -> list[DraftRow]:
    by_season: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for item in source_rows:
        by_season[finite_int(item.get("season"))].append(item)

    rows: list[DraftRow] = []
    for season, season_rows in sorted(by_season.items()):
        if not any(row.get("draft_pick") is not None for row in season_rows):
            continue
        team_count = len(season_rows)
        denominator = max(team_count - 1, 1)
        points = [finite_float(row.get("points_for")) for row in season_rows]
        effective_wins = [
            finite_float(row.get("wins")) + 0.5 * finite_float(row.get("ties"))
            for row in season_rows
        ]
        average_points = statistics.mean(points) if points else 0.0
        points_stdev = statistics.pstdev(points) or 1.0
        average_wins = statistics.mean(effective_wins) if effective_wins else 0.0
        points_rank_lookup = {
            id(row): rank
            for rank, row in enumerate(
                sorted(
                    season_rows,
                    key=lambda item: finite_float(item.get("points_for")),
                    reverse=True,
                ),
                start=1,
            )
        }

        for item in season_rows:
            if item.get("draft_pick") is None:
                continue
            pick = finite_int(item.get("draft_pick"))
            zone_key, zone = zone_for_pick(pick)
            wins = finite_float(item.get("wins"))
            losses = finite_float(item.get("losses"))
            ties = finite_float(item.get("ties"))
            games = wins + losses + ties
            finish = finite_int(item.get("finish"))
            points_for = finite_float(item.get("points_for"))
            points_rank = points_rank_lookup[id(item)]
            playoff_games = finite_int(item.get("playoff_wins")) + finite_int(item.get("playoff_losses"))
            rows.append(
                DraftRow(
                    season=season,
                    owner=str(item.get("owner", "")).strip(),
                    draft_pick=pick,
                    team_count=team_count,
                    zone_key=zone_key,
                    zone=zone,
                    wins=wins,
                    losses=losses,
                    ties=ties,
                    finish=finish,
                    points_for=points_for,
                    points_against=finite_float(item.get("points_against")),
                    champion=bool(item.get("champion")),
                    saunders=bool(item.get("saunders")),
                    made_playoffs=bool(
                        playoff_games
                        or item.get("champion")
                        or item.get("bye")
                        or item.get("wild_card")
                    ),
                    top_three=finish <= 3,
                    win_pct=(wins + 0.5 * ties) / games if games else 0.0,
                    finish_score=(team_count - finish) / denominator,
                    draft_percentile=(pick - 1) / denominator,
                    points_rank=points_rank,
                    points_score=(team_count - points_rank) / denominator,
                    points_z=(points_for - average_points) / points_stdev,
                    wins_above_avg=(wins + 0.5 * ties) - average_wins,
                )
            )
    return rows


def average(rows: list[DraftRow], field: str) -> float:
    return statistics.mean(float(getattr(row, field)) for row in rows) if rows else 0.0


def rate(rows: list[DraftRow], field: str) -> float:
    return sum(1 for row in rows if getattr(row, field)) / len(rows) if rows else 0.0


def pick_summary(rows: list[DraftRow]) -> list[dict[str, Any]]:
    groups: dict[int, list[DraftRow]] = defaultdict(list)
    for row in rows:
        groups[row.draft_pick].append(row)
    return [
        {
            "draft_pick": draft_pick,
            "n": len(group),
            "avg_finish": average(group, "finish"),
            "avg_finish_score": average(group, "finish_score"),
            "avg_wins_above_avg": average(group, "wins_above_avg"),
            "avg_points_z": average(group, "points_z"),
            "top_three_rate": rate(group, "top_three"),
            "playoff_rate": rate(group, "made_playoffs"),
            "championships": sum(1 for row in group if row.champion),
            "champion_rate": rate(group, "champion"),
            "saunders_count": sum(1 for row in group if row.saunders),
            "saunders_rate": rate(group, "saunders"),
        }
        for draft_pick, group in sorted(groups.items())
    ]


def zone_summary(rows: list[DraftRow]) -> list[dict[str, Any]]:
    groups: dict[str, list[DraftRow]] = defaultdict(list)
    for row in rows:
        groups[row.zone_key].append(row)
    return [
        {
            "zone_key": key,
            "zone": ZONE_DEFINITIONS[key],
            "n": len(group),
            "avg_pick": average(group, "draft_pick"),
            "avg_finish": average(group, "finish"),
            "avg_finish_score": average(group, "finish_score"),
            "avg_wins_above_avg": average(group, "wins_above_avg"),
            "avg_points_z": average(group, "points_z"),
            "top_three_rate": rate(group, "top_three"),
            "playoff_rate": rate(group, "made_playoffs"),
            "champion_rate": rate(group, "champion"),
            "saunders_rate": rate(group, "saunders"),
        }
        for key in ZONE_ORDER
        if (group := groups.get(key))
    ]


def group_record(
    label: str,
    rows: list[DraftRow],
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    record = {
        "label": label,
        "n": len(rows),
        "avg_finish": average(rows, "finish"),
        "avg_finish_score": average(rows, "finish_score"),
        "playoffs": sum(1 for row in rows if row.made_playoffs),
        "top_three": sum(1 for row in rows if row.top_three),
        "titles": sum(1 for row in rows if row.champion),
        "saunders": sum(1 for row in rows if row.saunders),
    }
    record.update(extra or {})
    return record


def confidence_for_sample(size: int) -> str:
    if size >= 5:
        return "strong"
    if size >= 3:
        return "medium"
    if size >= 2:
        return "small"
    return "league-wide fallback"


def owner_recommendation(
    owner: str,
    owner_rows: list[DraftRow],
    league_picks: list[dict[str, Any]],
) -> dict[str, Any]:
    picks: dict[int, list[DraftRow]] = defaultdict(list)
    zones: dict[str, list[DraftRow]] = defaultdict(list)
    for row in owner_rows:
        picks[row.draft_pick].append(row)
        zones[row.zone_key].append(row)
    pick_records = [
        group_record(f"Pick {pick}", group, {"draft_pick": pick})
        for pick, group in sorted(picks.items())
    ]
    zone_records = [
        group_record(
            ZONE_DEFINITIONS[key],
            zones[key],
            {"zone_key": key, "zone": ZONE_DEFINITIONS[key]},
        )
        for key in ZONE_ORDER
        if zones.get(key)
    ]
    best_pick = max(
        pick_records,
        key=lambda row: (
            row["avg_finish_score"],
            row["titles"],
            row["top_three"],
            row["playoffs"],
            -row["draft_pick"],
        ),
    )
    best_zone = max(
        zone_records,
        key=lambda row: (
            row["avg_finish_score"],
            row["titles"],
            row["top_three"],
            row["playoffs"],
        ),
    )
    repeat_picks = [record for record in pick_records if record["n"] >= 2]
    repeat_zones = [record for record in zone_records if record["n"] >= 2]
    best_repeat_pick = max(
        repeat_picks,
        key=lambda row: (
            row["avg_finish_score"],
            row["titles"],
            row["top_three"],
            row["playoffs"],
        ),
        default=None,
    )
    best_repeat_zone = max(
        repeat_zones,
        key=lambda row: (
            row["avg_finish_score"],
            row["titles"],
            row["top_three"],
            row["playoffs"],
        ),
        default=None,
    )
    worst_zone = min(
        zone_records,
        key=lambda row: (row["avg_finish_score"], -row["saunders"]),
    ) if len(zone_records) > 1 else None

    if len(owner_rows) == 1:
        only = owner_rows[0]
        league_best = max(
            league_picks,
            key=lambda row: (
                row["avg_finish_score"],
                row["playoff_rate"],
                row["championships"],
            ),
        )
        target = f"League-wide fallback: pick {league_best['draft_pick']}"
        recommendation = (
            f"Only one owner-specific sample: pick {only.draft_pick} in {only.season}, "
            f"finish {only.finish}. Use league-wide history first; pick "
            f"{league_best['draft_pick']} has the best observed finish score."
        )
    elif (
        best_repeat_pick
        and best_repeat_pick["n"] >= 3
        and best_repeat_pick["avg_finish_score"] >= best_zone["avg_finish_score"] - 0.03
    ):
        target = best_repeat_pick["label"]
        recommendation = (
            f"Target {best_repeat_pick['label']} specifically. Repeat sample: avg finish "
            f"{best_repeat_pick['avg_finish']:.1f}, playoffs "
            f"{best_repeat_pick['playoffs']}/{best_repeat_pick['n']}, titles "
            f"{best_repeat_pick['titles']}."
        )
    elif best_pick["n"] == 1 and best_repeat_zone:
        target = f"{best_pick['label']} upside; {best_repeat_zone['label']} repeat zone"
        recommendation = (
            f"Best single result is {best_pick['label']}, but the sturdier area is "
            f"{best_repeat_zone['label']} (avg finish "
            f"{best_repeat_zone['avg_finish']:.1f}, n={best_repeat_zone['n']})."
        )
    else:
        target = best_zone["label"]
        recommendation = (
            f"Target {best_zone['label']}. It is this owner's best observed zone: avg "
            f"finish {best_zone['avg_finish']:.1f}, playoffs "
            f"{best_zone['playoffs']}/{best_zone['n']}, titles {best_zone['titles']}."
        )

    caution = "No clear avoid zone yet."
    if worst_zone:
        caution = (
            f"Weakest area: {worst_zone['label']} (avg finish "
            f"{worst_zone['avg_finish']:.1f}, n={worst_zone['n']})."
        )
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


def build_asset(
    source_rows: list[dict[str, Any]],
    generated_at: str = DEFAULT_GENERATED_AT,
) -> dict[str, Any]:
    rows = rows_from_season_summary(source_rows)
    seasons = sorted({row.season for row in rows})
    summaries = pick_summary(rows)
    grouped: dict[str, list[DraftRow]] = defaultdict(list)
    for row in rows:
        grouped[row.owner].append(row)
    return {
        "schema_version": SCHEMA_VERSION,
        "generator_version": GENERATOR_VERSION,
        "source": "SeasonSummary.json",
        "source_sha256": sha256_json(source_rows),
        "generated_at": generated_at,
        "season_range": {
            "start": seasons[0] if seasons else None,
            "end": seasons[-1] if seasons else None,
        },
        "team_seasons": len(rows),
        "correlations": {
            "pick_finish": pearson(
                [row.draft_pick for row in rows],
                [row.finish for row in rows],
            ),
            "draft_percentile_finish_score": pearson(
                [row.draft_percentile for row in rows],
                [row.finish_score for row in rows],
            ),
            "draft_percentile_points_z": pearson(
                [row.draft_percentile for row in rows],
                [row.points_z for row in rows],
            ),
        },
        "rows": [
            asdict(row)
            for row in sorted(rows, key=lambda item: (item.season, item.draft_pick, item.owner))
        ],
        "pick_summary": summaries,
        "zone_summary": zone_summary(rows),
        "owner_recommendations": [
            owner_recommendation(owner, sorted(grouped[owner], key=lambda item: item.season), summaries)
            for owner in sorted(grouped)
        ],
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
    args.out.write_text(canonical_json(asset))
    print(f"Wrote {args.out} with {asset['team_seasons']} draft team-seasons.")


if __name__ == "__main__":
    main()
