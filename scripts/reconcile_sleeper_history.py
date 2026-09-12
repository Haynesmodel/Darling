#!/usr/bin/env python3
"""Offline, report-only comparison of Sleeper matchup fixtures."""

from __future__ import annotations

import json
import math
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

import sleeper_to_h2h as sleeper


def _utc_timestamp(value: Any) -> str:
    if not isinstance(value, str) or not value.endswith("Z"):
        raise ValueError("retrieved_at must be an ISO-8601 UTC timestamp")
    try:
        parsed = datetime.fromisoformat(value[:-1] + "+00:00")
    except ValueError as error:
        raise ValueError("retrieved_at must be an ISO-8601 UTC timestamp") from error
    if parsed.tzinfo is None:
        raise ValueError("retrieved_at must include UTC")
    return value


def _score(value: Any) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValueError("points must be finite numeric values")
    return sleeper.round2(value)


def _key(row: dict[str, Any]) -> tuple[int, int, tuple[str, str]]:
    return int(row["season"]), int(row["week"]), tuple(sorted((str(row["teamA"]), str(row["teamB"]))))


def _orient(row: dict[str, Any]) -> tuple[float, float]:
    scores = (row["scoreA"], row["scoreB"])
    return scores if str(row["teamA"]) <= str(row["teamB"]) else scores[::-1]


def load_fixture(path: str | Path, season: int, mapping: dict[str, Any]) -> tuple[list[dict[str, Any]], str]:
    fixture_path = Path(path).resolve()
    value = json.loads(fixture_path.read_text(encoding="utf-8"))
    if not isinstance(value, dict) or not isinstance(value.get("weeks"), dict):
        raise ValueError("fixture must contain retrieved_at and weeks")
    retrieved_at = _utc_timestamp(value.get("retrieved_at"))
    rows: list[dict[str, Any]] = []
    seen_keys: set[tuple[int, int, tuple[str, str]]] = set()
    metadata = value.get("metadata", {})
    if not isinstance(metadata, dict):
        raise ValueError("metadata must be an object")
    for week_text, raw_rows in value["weeks"].items():
        try:
            week = int(week_text)
        except (TypeError, ValueError) as error:
            raise ValueError("week keys must be integer strings") from error
        if not 1 <= week <= 25 or not isinstance(raw_rows, list):
            raise ValueError("fixture week is invalid")
        by_matchup: dict[Any, list[dict[str, Any]]] = {}
        for raw in raw_rows:
            if not isinstance(raw, dict):
                raise ValueError("raw matchup rows must be objects")
            roster_id = raw.get("roster_id")
            matchup_id = raw.get("matchup_id")
            if isinstance(roster_id, bool) or not isinstance(roster_id, int) or str(roster_id) not in mapping:
                raise ValueError("raw row has unknown or invalid roster_id")
            if matchup_id is None or isinstance(matchup_id, (dict, list, bool)):
                raise ValueError("raw row has invalid matchup_id")
            _score(raw.get("points"))
            by_matchup.setdefault(matchup_id, []).append(raw)
        for matchup_id, pair in by_matchup.items():
            if len(pair) != 2 or pair[0].get("roster_id") == pair[1].get("roster_id"):
                raise ValueError("each matchup must contain exactly two distinct rosters")
            owner_a = str(mapping[str(pair[0]["roster_id"])])
            owner_b = str(mapping[str(pair[1]["roster_id"])])
            details = metadata.get(str(week), {}).get(str(matchup_id), {})
            if not isinstance(details, dict):
                raise ValueError("matchup metadata must be an object")
            game_date = details.get("date") or sleeper.sunday_for_week(season, week).isoformat()
            row = {"season": season, "date": game_date, "teamA": owner_a, "teamB": owner_b,
                   "scoreA": _score(pair[0]["points"]), "scoreB": _score(pair[1]["points"]),
                   "week": week, "round": details.get("round"), "type": details.get("type", "Regular")}
            key = _key(row)
            if key in seen_keys:
                raise ValueError("fixture contains duplicate canonical matchup")
            seen_keys.add(key); rows.append(row)
    return rows, retrieved_at


def reconcile(canonical: list[dict[str, Any]], candidate: list[dict[str, Any]], season: int,
              source_path: str = "", mapping_path: str = "", canonical_path: str = "",
              retrieved_at: str = "") -> dict[str, Any]:
    before = {_key(row): row for row in canonical if int(row.get("season", 0)) == season}
    after = {_key(row): row for row in candidate if int(row.get("season", 0)) == season}
    matched, missing, new, different = [], [], [], []
    fields = ("date", "type", "round")
    for key, row in before.items():
        other = after.get(key)
        if other is None:
            missing.append({"key": list(key)})
            continue
        diagnostics = {}
        if _orient(row) != _orient(other): diagnostics["scores"] = {"before": _orient(row), "after": _orient(other)}
        for field in fields:
            if row.get(field) != other.get(field): diagnostics[field] = {"before": row.get(field), "after": other.get(field)}
        (different if diagnostics else matched).append({"key": list(key), **({"before": row, "after": other, "diagnostics": diagnostics} if diagnostics else {})})
    for key, row in after.items():
        if key not in before: new.append({"key": list(key), "after": row})
    return {"season": season, "source_path": source_path, "mapping_path": mapping_path,
            "canonical_path": canonical_path, "retrieved_at": retrieved_at,
            "generated_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
            "matched": matched, "missing": missing, "new": new, "different": different,
            "summary": {"matched": len(matched), "missing": len(missing), "new": len(new), "different": len(different)},
            "downstream_consequences": "Differences may affect records, trophies, odds, recaps, and derived statistics."}
