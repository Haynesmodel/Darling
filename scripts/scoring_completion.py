"""Conservative, shared weekly scoring completion policy.

The resolver is deliberately independent of HTTP and file I/O so scheduled and
fixture-driven runs use exactly the same boundary calculation.
"""
from __future__ import annotations

from dataclasses import dataclass
import math
from datetime import date, datetime, time, timedelta, timezone
from typing import Any


@dataclass(frozen=True)
class Completion:
    completed_through_week: int
    active_week: int | None
    basis: str
    warnings: tuple[str, ...] = ()

def retained_boundary_from_snapshot(snapshot: dict[str, Any], season: int, max_week: int) -> int:
    """Return a trusted contiguous boundary, or zero for a different season."""
    if not isinstance(snapshot, dict) or snapshot.get("season") != season:
        return 0
    weeks_fetched = snapshot.get("weeks_fetched")
    teams = snapshot.get("teams")
    games = snapshot.get("games")
    if not isinstance(weeks_fetched, list) or not isinstance(teams, list) or not isinstance(games, list) or not teams:
        raise ValueError("same-season CurrentSeason snapshot lacks coverage metadata")
    owner_count = len(teams)
    game_by_week: dict[int, list[dict[str, Any]]] = {}
    for game in games:
        if not isinstance(game, dict): raise ValueError("CurrentSeason game must be an object")
        week = game.get("week")
        if not isinstance(week, int) or not 1 <= week <= max_week: raise ValueError("invalid CurrentSeason week")
        game_by_week.setdefault(week, []).append(game)
    boundary = 0
    for week in range(1, max_week + 1):
        if week not in weeks_fetched: break
        rows = game_by_week.get(week, [])
        if len(rows) != owner_count // 2 or owner_count % 2 or any(game.get("status") != "final" for game in rows): break
        rosters: set[int] = set(); matchups: set[Any] = set()
        for game in rows:
            if not all(isinstance(game.get(field), (int, float)) and not isinstance(game.get(field), bool) and math.isfinite(game[field]) for field in ("scoreA", "scoreB")):
                break
            pair = (game.get("rosterA"), game.get("rosterB"))
            if any(not isinstance(value, int) or value in rosters for value in pair) or game.get("matchup_id") in matchups:
                break
            rosters.update(pair); matchups.add(game.get("matchup_id"))
        else:
            if len(rosters) == owner_count: boundary = week; continue
        break
    return boundary


def _integer(value: Any, label: str, minimum: int, maximum: int) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or not minimum <= value <= maximum:
        raise ValueError(f"{label} must be an integer between {minimum} and {maximum}.")
    return value


def _state_season(state: dict[str, Any]) -> int | None:
    value = state.get("season")
    try:
        return int(value) if not isinstance(value, bool) else None
    except (TypeError, ValueError):
        return None


def resolve_completion(*, season: int, max_week: int, week1_sunday: date,
                       league_status: str | None = None, league_season: int | None = None,
                       nfl_state: dict[str, Any] | None = None,
                       last_verified_completed: int = 0,
                       now: datetime | None = None,
                       override: int | None = None, override_reason: str | None = None,
                       scheduled: bool = False) -> Completion:
    season = _integer(season, "season", 2025, 2100)
    max_week = _integer(max_week, "max_week", 1, 25)
    last_verified_completed = _integer(last_verified_completed, "last_verified_completed", 0, max_week)
    if week1_sunday.weekday() != 6:
        raise ValueError("week1_sunday must be a Sunday.")
    if league_season is not None and league_season != season:
        raise ValueError("league metadata season does not match requested season.")
    if override is not None:
        _integer(override, "completed-through-week", 0, max_week)
        if scheduled:
            raise ValueError("manual completion override is disabled for scheduled runs.")
        if not str(override_reason or "").strip():
            raise ValueError("manual completion override requires a non-empty reason.")
        if override < last_verified_completed:
            raise ValueError("manual completion override cannot regress the verified boundary.")
        return Completion(override, override + 1 if override < max_week else None, "manual_override")

    now = now or datetime.now(timezone.utc)
    if now.tzinfo is None:
        raise ValueError("now must be timezone-aware UTC.")
    now = now.astimezone(timezone.utc)
    status = str(league_status or "unknown").lower()
    state = nfl_state or {}
    state_season = _state_season(state)
    state_type = state.get("season_type")
    contradictory = status in {"pre_draft", "drafting"} and state_season == season and state.get("week") is not None
    if status == "complete" and league_season != season:
        raise ValueError("complete league metadata must match requested season.")
    if status in {"pre_draft", "drafting"}:
        inferred, basis = 0, "league_not_started"
    elif status == "complete":
        guard = datetime.combine(week1_sunday + timedelta(days=7 * (max_week - 1) + 2), time(13), timezone.utc)
        inferred = max_week if now >= guard else 0
        basis = "league_complete_after_guard" if inferred else "league_complete_before_guard"
    else:
        if state_season != season or not isinstance(state_type, str) or not state_type.strip():
            inferred, basis = last_verified_completed, "verified_boundary_unknown_state"
        elif state_type.lower() != "regular":
            inferred, basis = last_verified_completed, "verified_boundary_non_regular_state"
        else:
            week = state.get("week", state.get("display_week"))
            if isinstance(week, bool) or not isinstance(week, int) or not 1 <= week <= 18:
                inferred, basis = last_verified_completed, "verified_boundary_unknown_week"
            else:
                eligible = [w for w in range(1, max_week + 1)
                            if datetime.combine(week1_sunday + timedelta(days=7 * (w - 1) + 2), time(13), timezone.utc) <= now]
                inferred = min(max_week, week - 1, max(eligible, default=0))
                basis = "nfl_state_and_calendar_guard"
    if contradictory:
        inferred = 0
        basis = "contradictory_metadata"
    if inferred < last_verified_completed:
        raise ValueError("upstream state would regress the verified completion boundary; refusing ambiguity.")
    active = inferred + 1 if inferred < max_week else None
    warnings = ("provider state is delayed or ambiguous; retaining verified boundary.",) if basis.startswith("verified_boundary") else ()
    return Completion(inferred, active, basis, warnings)
