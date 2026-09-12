#!/usr/bin/env python3
"""Offline, report-only comparison of Sleeper matchup fixtures."""

from __future__ import annotations

import json
import math
import argparse
import os
import tempfile
import sys
from urllib.request import Request, urlopen
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

import sleeper_to_h2h as sleeper

MAX_RESPONSE_BYTES = 4 * 1024 * 1024

def _write_atomic(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False) as handle:
            json.dump(value, handle, ensure_ascii=False, indent=2, sort_keys=True); handle.write("\n"); temporary = Path(handle.name)
        os.replace(temporary, path)
    finally:
        if temporary is not None and temporary.exists(): temporary.unlink()

def _safe_outputs(canonical: Path, mapping: Path, source: Path | None, out: Path, candidate: Path | None) -> None:
    paths = [canonical, mapping] + ([source] if source else [])
    if candidate and candidate == out: raise ValueError("report and candidate outputs must differ")
    for target in [out] + ([candidate] if candidate else []):
        if (target.name in {"H2H.json", "CurrentSeason.json", "TransactionHistory.json", canonical.name}
                or target.parent == canonical.parent or any(target == item for item in paths)):
            raise ValueError("output path is canonical or unsafe")

def _live_fixture(league: str, season: int, weeks: list[int], mapping: dict[str, Any]) -> tuple[list[dict[str, Any]], str]:
    def get(url: str):
        request = Request(url, headers={"User-Agent": "Darling-Reconciliation/1.0"})
        with urlopen(request, timeout=30) as response:
            length = response.headers.get("Content-Length")
            if length and int(length) > MAX_RESPONSE_BYTES: raise ValueError("Sleeper response exceeds size limit")
            body = response.read(MAX_RESPONSE_BYTES + 1)
            if len(body) > MAX_RESPONSE_BYTES: raise ValueError("Sleeper response exceeds size limit")
            value = json.loads(body.decode("utf-8"))
            if not isinstance(value, list): raise ValueError("Sleeper matchup response must be an array")
            return value
    rows=[]
    for week in weeks:
        rows.extend({"week": week, **row} for row in get(f"https://api.sleeper.app/v1/league/{league}/matchups/{week}"))
    fixture = {"retrieved_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"), "weeks": {str(week): [row for row in rows if row["week"] == week] for week in weeks}}
    descriptor, temporary_name = tempfile.mkstemp(prefix="darling-live-")
    os.close(descriptor)
    temporary = Path(temporary_name); temporary.write_text(json.dumps(fixture), encoding="utf-8")
    try: return load_fixture(temporary, season, mapping)
    finally: temporary.unlink(missing_ok=True)


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
    scores = (sleeper.round2(row["scoreA"]), sleeper.round2(row["scoreB"]))
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
    if (not mapping or any(isinstance(k, bool) or not str(k).isdigit() or not str(v).strip() for k, v in mapping.items())
            or len(set(str(v) for v in mapping.values())) != len(mapping)):
        raise ValueError("mapping must contain unique nonempty canonical owners")
    for week_text, raw_rows in value["weeks"].items():
        try:
            week = int(week_text)
        except (TypeError, ValueError) as error:
            raise ValueError("week keys must be integer strings") from error
        if not 1 <= week <= 25 or not isinstance(raw_rows, list):
            raise ValueError("fixture week is invalid")
        if str(week) != week_text or str(week) in {str(int(other)) for other in value["weeks"] if str(other) != week_text and str(other).isdigit()}:
            raise ValueError("fixture contains duplicate-equivalent week keys")
        by_matchup: dict[Any, list[dict[str, Any]]] = {}
        week_rosters: set[int] = set()
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
            if roster_id in week_rosters:
                raise ValueError("roster appears in multiple matchups in one week")
            week_rosters.add(roster_id)
            by_matchup.setdefault(matchup_id, []).append(raw)
        for matchup_id, pair in by_matchup.items():
            if len(pair) != 2 or pair[0].get("roster_id") == pair[1].get("roster_id"):
                raise ValueError("each matchup must contain exactly two distinct rosters")
            owner_a = str(mapping[str(pair[0]["roster_id"])])
            owner_b = str(mapping[str(pair[1]["roster_id"])])
            week_metadata = metadata.get(str(week), {})
            if not isinstance(week_metadata, dict):
                raise ValueError("metadata week must be an object")
            details = week_metadata.get(str(matchup_id), {})
            if not isinstance(details, dict):
                raise ValueError("matchup metadata must be an object")
            game_date = details.get("date") or sleeper.sunday_for_week(season, week).isoformat()
            try: date.fromisoformat(game_date)
            except (TypeError, ValueError) as error: raise ValueError("matchup metadata date is invalid") from error
            game_type = details.get("type", "Regular")
            if game_type not in {"Regular", "Playoff", "Saunders"}: raise ValueError("matchup metadata type is invalid")
            round_name = details.get("round")
            valid_rounds = {"Playoff": {"Wild Card", "Semi Final", "Championship"}, "Saunders": {"Saunders Wild Card", "Saunders Semi Final", "Saunders Final"}}
            if game_type == "Regular" and round_name not in (None, ""):
                raise ValueError("Regular matchup round must be empty")
            if game_type in valid_rounds and round_name not in valid_rounds[game_type]:
                raise ValueError("postseason matchup round is invalid")
            row = {"season": season, "date": game_date, "teamA": owner_a, "teamB": owner_b,
                   "scoreA": _score(pair[0]["points"]), "scoreB": _score(pair[1]["points"]),
                   "week": week, "round": round_name, "type": game_type}
            key = _key(row)
            if key in seen_keys:
                raise ValueError("fixture contains duplicate canonical matchup")
            seen_keys.add(key); rows.append(row)
    return rows, retrieved_at


def reconcile(canonical: list[dict[str, Any]], candidate: list[dict[str, Any]], season: int,
              source_path: str = "", mapping_path: str = "", canonical_path: str = "",
              retrieved_at: str = "") -> dict[str, Any]:
    def index(rows: list[dict[str, Any]], label: str) -> dict[tuple[int, int, tuple[str, str]], dict[str, Any]]:
        result = {}
        for row in rows:
            if not isinstance(row, dict) or int(row.get("season", 0)) != season:
                continue
            if not row.get("teamA") or not row.get("teamB") or row["teamA"] == row["teamB"]:
                raise ValueError(f"{label} contains invalid owner names")
            _score(row.get("scoreA")); _score(row.get("scoreB"))
            key = _key(row)
            if key in result: raise ValueError(f"{label} contains duplicate canonical key")
            result[key] = row
        return result
    before = index(canonical, "canonical")
    after = index(candidate, "candidate")
    matched, missing, new, different = [], [], [], []
    fields = ("date", "type", "round")
    for key in sorted(before):
        row = before[key]
        other = after.get(key)
        if other is None:
            missing.append({"key": list(key), "before": row})
            continue
        diagnostics = {}
        if _orient(row) != _orient(other): diagnostics["scores"] = {"before": _orient(row), "after": _orient(other)}
        for field in fields:
            if row.get(field) != other.get(field): diagnostics[field] = {"before": row.get(field), "after": other.get(field)}
        (different if diagnostics else matched).append({"key": list(key), **({"before": row, "after": other, "diagnostics": diagnostics} if diagnostics else {})})
    for key in sorted(after):
        if key not in before: new.append({"key": list(key), "after": after[key]})
    return {"season": season, "source_path": source_path, "mapping_path": mapping_path,
            "canonical_path": canonical_path, "retrieved_at": retrieved_at,
            "generated_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
            "matched": matched, "missing": missing, "new": new, "different": different,
            "summary": {"matched": len(matched), "missing": len(missing), "new": len(new), "different": len(different)},
            "downstream_consequences": "Differences may affect records, trophies, odds, recaps, and derived statistics."}

def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--season", type=int, required=True); parser.add_argument("--mapping", required=True)
    parser.add_argument("--canonical", required=True); parser.add_argument("--out", required=True)
    parser.add_argument("--source-fixture"); parser.add_argument("--live-league"); parser.add_argument("--weeks", default="1-17"); parser.add_argument("--out-candidate"); parser.add_argument("--allow-live", action="store_true")
    args = parser.parse_args()
    try:
        if bool(args.source_fixture) == bool(args.live_league): raise ValueError("exactly one source input is required")
        if args.live_league and not args.allow_live: raise ValueError("--allow-live is required for live mode")
        canonical = Path(args.canonical).resolve(); mapping_path = Path(args.mapping).resolve(); out = Path(args.out).resolve(); candidate = Path(args.out_candidate).resolve() if args.out_candidate else None
        source = Path(args.source_fixture).resolve() if args.source_fixture else None
        _safe_outputs(canonical, mapping_path, source, out, candidate)
        mapping = json.loads(mapping_path.read_text(encoding="utf-8"))
        if not isinstance(mapping, dict): raise ValueError("mapping must be an object")
        if source:
            rows, retrieved = load_fixture(source, args.season, mapping); source_name = str(source)
        else:
            rows, retrieved = _live_fixture(args.live_league, args.season, [int(w) for w in sleeper.parse_weeks(args.weeks)], mapping); source_name = f"sleeper://league/{args.live_league}"
        canonical_rows = json.loads(canonical.read_text(encoding="utf-8"))
        if not isinstance(canonical_rows, list): raise ValueError("canonical H2H must be an array")
        result = reconcile(canonical_rows, rows, args.season, source_name, str(mapping_path), str(canonical), retrieved)
        _write_atomic(out, result)
        if candidate: _write_atomic(candidate, rows)
        return 0
    except (OSError, ValueError, json.JSONDecodeError) as error:
        print(f"reconciliation failed: {error}", file=sys.stderr); return 2

if __name__ == "__main__":
    raise SystemExit(main())
