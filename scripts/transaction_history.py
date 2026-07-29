#!/usr/bin/env python3
"""Pure normalization and materialization helpers for TransactionHistory."""

from __future__ import annotations

import json
from collections import Counter, defaultdict
from copy import deepcopy
from pathlib import Path
from typing import Any

SCHEMA_VERSION = 1
GENERATOR_VERSION = 2
METHODOLOGY_VERSION = 2
COMPLETE_STATUS = "complete"
SUPPORTED_TYPES = {"waiver", "free_agent", "trade", "commissioner"}
MAX_RETAINED_SEASONS = 12
MAX_SEASON_BYTES = 750_000
MAX_ASSET_BYTES = 12 * 1024 * 1024


def round2(value: Any) -> float:
    return float(f"{float(value or 0):.2f}")


def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n"


def load_json(path: str | Path) -> Any:
    with Path(path).open("r", encoding="utf-8") as handle:
        return json.load(handle)


def write_json(path: str | Path, value: Any) -> None:
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_name(f".{target.name}.tmp")
    # This is the largest source asset. Keep deterministic key ordering while
    # avoiding pretty-print whitespace so the reviewed snapshot stays within
    # its transfer and repository-size target.
    temporary.write_text(
        json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )
    temporary.replace(target)


def owner_map(mapping: dict[str, Any], rosters: list[dict[str, Any]]) -> dict[int, str]:
    normalized: dict[int, str] = {}
    seen_owners: set[str] = set()
    for roster in rosters:
        roster_id = int(roster.get("roster_id"))
        owner = str(mapping.get(str(roster_id), "")).strip()
        if not owner:
            raise ValueError(f"Missing canonical owner for roster_id {roster_id}.")
        if owner in seen_owners:
            raise ValueError(f"Duplicate canonical owner in mapping: {owner}.")
        seen_owners.add(owner)
        normalized[roster_id] = owner
    extra = sorted(set(str(key) for key in mapping) - {str(key) for key in normalized})
    if extra:
        raise ValueError(f"Mapping contains unknown roster ids: {', '.join(extra)}.")
    return normalized


def resolve_owner(roster_id: Any, owners: dict[int, str], label: str) -> str:
    try:
        key = int(roster_id)
    except (TypeError, ValueError) as error:
        raise ValueError(f"{label} is missing a valid roster id.") from error
    if key not in owners:
        raise ValueError(f"{label} references unknown roster_id {key}.")
    return owners[key]


def select_draft(
    drafts: list[dict[str, Any]],
    picks_by_draft: dict[str, list[dict[str, Any]]],
    season: int,
    draft_id: str | None = None,
) -> tuple[dict[str, Any] | None, list[dict[str, Any]]]:
    candidates = []
    for draft in drafts:
        candidate_id = str(draft.get("draft_id") or "")
        picks = picks_by_draft.get(candidate_id, [])
        if str(draft.get("season")) != str(season) or not candidate_id or not picks:
            continue
        valid = [pick for pick in picks if pick.get("player_id") and pick.get("roster_id") is not None]
        if valid:
            candidates.append((draft, valid))
    if draft_id:
        selected = next((item for item in candidates if str(item[0].get("draft_id")) == draft_id), None)
        if not selected:
            raise ValueError(f"Draft override {draft_id} is not a valid nonempty season draft.")
        return selected
    if not candidates:
        return None, []
    largest = max(len(item[1]) for item in candidates)
    leaders = [item for item in candidates if len(item[1]) == largest]
    if len(leaders) != 1:
        ids = ", ".join(sorted(str(item[0].get("draft_id")) for item in leaders))
        raise ValueError(f"Ambiguous primary draft ({largest} valid picks): {ids}; pass --draft-id.")
    return leaders[0]


def _normalize_pick(pick: dict[str, Any], owners: dict[int, str]) -> dict[str, Any]:
    metadata = pick.get("metadata") or {}
    roster_id = int(pick.get("roster_id"))
    return {
        "pick_no": int(pick.get("pick_no")),
        "round": int(pick.get("round")),
        "roster_id": roster_id,
        "owner": resolve_owner(roster_id, owners, "draft pick"),
        "player_id": str(pick.get("player_id")),
        "is_keeper": bool(pick.get("is_keeper") or metadata.get("is_keeper")),
    }


def _normalize_draft_asset(
    draft: dict[str, Any] | None,
    picks: list[dict[str, Any]],
    owners: dict[int, str],
) -> dict[str, Any]:
    if draft is None:
        return {"status": "unavailable", "draft_id": None, "pick_count": 0, "picks": []}
    normalized = sorted(
        (_normalize_pick(pick, owners) for pick in picks),
        key=lambda pick: pick["pick_no"],
    )
    return {
        "status": "selected",
        "draft_id": str(draft.get("draft_id")),
        "pick_count": len(normalized),
        "picks": normalized,
    }


def _transaction_players(raw: Any, owners: dict[int, str], label: str) -> list[dict[str, str]]:
    if raw is None:
        return []
    if not isinstance(raw, dict):
        raise ValueError(f"{label} must be an object.")
    result = []
    for player_id, roster_id in raw.items():
        result.append({
            "player_id": str(player_id),
            "owner": resolve_owner(roster_id, owners, label),
        })
    return sorted(result, key=lambda row: (row["owner"], row["player_id"]))


def _transaction_picks(raw: Any, owners: dict[int, str]) -> list[dict[str, Any]]:
    if raw is None:
        return []
    if not isinstance(raw, list):
        raise ValueError("draft_picks must be an array.")
    result = []
    for pick in raw:
        roster_id = int(pick.get("roster_id"))
        previous = pick.get("previous_owner_id")
        owner_id = pick.get("owner_id", roster_id)
        result.append({
            "season": int(pick.get("season")),
            "round": int(pick.get("round")),
            "roster_id": roster_id,
            "original_owner": resolve_owner(roster_id, owners, "transaction draft pick"),
            "owner": resolve_owner(owner_id, owners, "transaction draft pick owner"),
            "previous_owner": (
                resolve_owner(previous, owners, "transaction previous pick owner")
                if previous is not None else None
            ),
        })
    return sorted(result, key=lambda row: (
        row["season"], row["round"], row["original_owner"], row["owner"]
    ))


def _waiver_budget(raw: Any, owners: dict[int, str]) -> list[dict[str, Any]]:
    if raw is None:
        return []
    if not isinstance(raw, list):
        raise ValueError("waiver_budget must be an array.")
    result = []
    for transfer in raw:
        result.append({
            "sender": resolve_owner(transfer.get("sender"), owners, "waiver budget sender"),
            "receiver": resolve_owner(transfer.get("receiver"), owners, "waiver budget receiver"),
            "amount": int(transfer.get("amount") or 0),
        })
    return sorted(result, key=lambda row: (row["sender"], row["receiver"], row["amount"]))


def normalize_transactions(
    transaction_rounds: dict[int, list[dict[str, Any]]],
    owners: dict[int, str],
    max_week: int,
) -> list[dict[str, Any]]:
    normalized = []
    seen: set[str] = set()
    for week in range(0, max_week + 1):
        for raw in transaction_rounds.get(week, []):
            transaction_id = str(raw.get("transaction_id") or "")
            if not transaction_id:
                raise ValueError(f"Transaction in round {week} has no transaction_id.")
            if transaction_id in seen:
                raise ValueError(f"Duplicate transaction_id {transaction_id}.")
            seen.add(transaction_id)
            transaction_type = str(raw.get("type") or "")
            if transaction_type not in SUPPORTED_TYPES:
                raise ValueError(f"Unsupported transaction type {transaction_type!r} for {transaction_id}.")
            roster_ids = raw.get("roster_ids") or []
            participants = sorted({
                resolve_owner(roster_id, owners, "transaction participant")
                for roster_id in roster_ids
            })
            adds = _transaction_players(raw.get("adds"), owners, "transaction adds")
            drops = _transaction_players(raw.get("drops"), owners, "transaction drops")
            if not participants:
                participants = sorted({row["owner"] for row in [*adds, *drops]})
            settings = raw.get("settings") or {}
            normalized.append({
                "id": transaction_id,
                "status": str(raw.get("status") or "unknown"),
                "type": transaction_type,
                "week": week,
                "created_ms": int(raw.get("created") or 0),
                "participants": participants,
                "adds": adds,
                "drops": drops,
                "draft_picks": _transaction_picks(raw.get("draft_picks"), owners),
                "faab_bid": (
                    int(settings.get("waiver_bid"))
                    if settings.get("waiver_bid") is not None else None
                ),
                "waiver_budget": _waiver_budget(raw.get("waiver_budget"), owners),
            })
    return sorted(normalized, key=lambda row: (row["created_ms"], row["id"]))


def _matchup_index(
    matchups: dict[int, list[dict[str, Any]]],
    owners: dict[int, str],
    completed_week: int,
) -> dict[tuple[str, str], dict[str, Any]]:
    index: dict[tuple[str, str], dict[str, Any]] = {}
    for week in range(1, completed_week + 1):
        for roster in matchups.get(week, []):
            owner = resolve_owner(roster.get("roster_id"), owners, "matchup roster")
            starters = {str(player_id) for player_id in (roster.get("starters") or []) if player_id}
            players = {str(player_id) for player_id in (roster.get("players") or []) if player_id}
            points = roster.get("players_points") or {}
            for player_id in players:
                key = (owner, player_id)
                row = index.setdefault(key, {
                    "weeks": [],
                    "starts": 0,
                    "total_points": 0.0,
                    "starter_points": 0.0,
                    "by_week": {},
                })
                value = float(points.get(player_id) or 0)
                row["weeks"].append(week)
                row["total_points"] += value
                row["by_week"][week] = {
                    "started": player_id in starters,
                    "points": value,
                }
                if player_id in starters:
                    row["starts"] += 1
                    row["starter_points"] += value
    for row in index.values():
        row["total_points"] = round2(row["total_points"])
        row["starter_points"] = round2(row["starter_points"])
    return index


def _movement_events(
    draft: dict[str, Any],
    transactions: list[dict[str, Any]],
) -> dict[str, list[dict[str, Any]]]:
    events: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for pick in draft["picks"]:
        events[pick["player_id"]].append({
            "kind": "keeper" if pick["is_keeper"] else "draft",
            "owner": pick["owner"],
            "week": 0,
            "created_ms": 0,
            "transaction_id": None,
            "pick_no": pick["pick_no"],
            "is_keeper": pick["is_keeper"],
        })
    for transaction in transactions:
        if transaction["status"] != COMPLETE_STATUS:
            continue
        drop_by_player = {row["player_id"]: row for row in transaction["drops"]}
        add_by_player = {row["player_id"]: row for row in transaction["adds"]}
        for player_id in sorted(set(drop_by_player) | set(add_by_player)):
            dropped = drop_by_player.get(player_id)
            added = add_by_player.get(player_id)
            if dropped:
                events[player_id].append({
                    "kind": "trade_out" if transaction["type"] == "trade" else "drop",
                    "owner": dropped["owner"],
                    "week": transaction["week"],
                    "created_ms": transaction["created_ms"],
                    "transaction_id": transaction["id"],
                    "pick_no": None,
                    "is_keeper": False,
                })
            if added:
                kind = "trade_in" if transaction["type"] == "trade" else (
                    "commissioner" if transaction["type"] == "commissioner" else "add"
                )
                events[player_id].append({
                    "kind": kind,
                    "owner": added["owner"],
                    "week": transaction["week"],
                    "created_ms": transaction["created_ms"],
                    "transaction_id": transaction["id"],
                    "pick_no": None,
                    "is_keeper": False,
                })
    kind_order = {"drop": 0, "trade_out": 0, "draft": 1, "keeper": 1, "add": 1, "trade_in": 1, "commissioner": 1}
    for rows in events.values():
        rows.sort(key=lambda row: (
            row["week"], row["created_ms"], str(row["transaction_id"] or ""),
            kind_order.get(row["kind"], 1),
        ))
    return events


def build_journeys(
    draft: dict[str, Any],
    transactions: list[dict[str, Any]],
    matchup_index: dict[tuple[str, str], dict[str, Any]],
    boundary_rosters: dict[str, set[str]],
    completed_week: int,
) -> list[dict[str, Any]]:
    events = _movement_events(draft, transactions)
    journeys = []
    for player_id, rows in events.items():
        open_stints: dict[str, dict[str, Any]] = {}
        stints: list[dict[str, Any]] = []
        for event in rows:
            owner = event["owner"]
            if event["kind"] in {"drop", "trade_out"}:
                stint = open_stints.pop(owner, None)
                if stint:
                    stint["release"] = {
                        "kind": event["kind"],
                        "week": event["week"],
                        "transaction_id": event["transaction_id"],
                    }
                    stints.append(stint)
                continue
            previous = open_stints.pop(owner, None)
            if previous:
                stints.append(previous)
            open_stints[owner] = {
                "owner": owner,
                "_acquisition_order": (
                    event["week"],
                    event["created_ms"],
                    str(event["transaction_id"] or ""),
                ),
                "acquisition": {
                    "kind": event["kind"],
                    "week": event["week"],
                    "transaction_id": event["transaction_id"],
                    "pick_no": event["pick_no"],
                    "is_keeper": event["is_keeper"],
                },
                "release": None,
            }
        stints.extend(open_stints.values())
        allocated_weeks: dict[int, list[int]] = defaultdict(list)
        retained_stint_indexes: set[int] = set()
        for owner in sorted({stint["owner"] for stint in stints}):
            scoring = matchup_index.get((owner, player_id), {
                "weeks": [],
                "starts": 0,
                "total_points": 0.0,
                "starter_points": 0.0,
                "by_week": {},
            })
            owner_stints = [
                (index, stint) for index, stint in enumerate(stints)
                if stint["owner"] == owner
            ]
            for week in sorted(set(scoring["weeks"])):
                eligible = [
                    (index, stint) for index, stint in owner_stints
                    if week >= max(1, stint["acquisition"]["week"])
                    and (
                        stint["release"] is None
                        or week <= stint["release"]["week"]
                    )
                ]
                if eligible:
                    # Sleeper exposes matchup scoring at weekly granularity but
                    # transactions at millisecond granularity. When multiple
                    # stints touch the same scoring week, assign that one weekly
                    # row to the latest acquisition so it can never be counted
                    # by both sides of a same-week drop/re-add.
                    selected, _ = max(
                        eligible,
                        key=lambda item: item[1]["_acquisition_order"],
                    )
                    allocated_weeks[selected].append(week)
            retained_eligible = [
                (index, stint) for index, stint in owner_stints
                if stint["acquisition"]["week"] <= completed_week
                and (
                    stint["release"] is None
                    or stint["release"]["week"] > completed_week
                )
            ]
            if retained_eligible:
                selected, _ = max(
                    retained_eligible,
                    key=lambda item: item[1]["_acquisition_order"],
                )
                retained_stint_indexes.add(selected)
        for index, stint in enumerate(stints):
            scoring = matchup_index.get((stint["owner"], player_id), {
                "by_week": {},
            })
            weeks = allocated_weeks[index]
            scoped_rows = [
                scoring.get("by_week", {}).get(week, {"started": False, "points": 0.0})
                for week in weeks
            ]
            stint.update({
                "rostered_weeks": len(set(weeks)),
                "starts": sum(1 for row in scoped_rows if row["started"]),
                "total_points": round2(sum(row["points"] for row in scoped_rows)),
                "starter_points": round2(sum(
                    row["points"] for row in scoped_rows if row["started"]
                )),
                "retained": (
                    stint["acquisition"]["week"] <= completed_week
                    and (stint["release"] is None or stint["release"]["week"] > completed_week)
                    and index in retained_stint_indexes
                    and player_id in boundary_rosters.get(stint["owner"], set())
                ),
            })
        ordered_stints = sorted(stints, key=lambda row: (
            row["_acquisition_order"],
            row["owner"],
        ))
        for stint in ordered_stints:
            del stint["_acquisition_order"]
        journeys.append({
            "player_id": player_id,
            "stints": ordered_stints,
        })
    return sorted(journeys, key=lambda row: row["player_id"])


def _catalog_name(player_id: str, catalog: dict[str, dict[str, Any]]) -> str:
    return str(catalog.get(player_id, {}).get("name") or player_id)


def build_insights(
    transactions: list[dict[str, Any]],
    draft: dict[str, Any],
    journeys: list[dict[str, Any]],
    catalog: dict[str, dict[str, Any]],
    teams: list[dict[str, Any]],
    season: int,
    completed_week: int,
    league_status: str,
) -> dict[str, Any]:
    stints = [
        (journey["player_id"], stint)
        for journey in journeys for stint in journey["stints"]
    ]
    stint_lookup = defaultdict(list)
    for player_id, stint in stints:
        transaction_id = stint["acquisition"]["transaction_id"]
        if transaction_id:
            stint_lookup[(transaction_id, stint["owner"], player_id)].append(stint)

    trades = []
    for transaction in transactions:
        if transaction["status"] != COMPLETE_STATUS or transaction["type"] != "trade":
            continue
        sides = []
        unresolved = any(pick["season"] > season for pick in transaction["draft_picks"])
        for owner in transaction["participants"]:
            received = [row["player_id"] for row in transaction["adds"] if row["owner"] == owner]
            side_stints = [
                stint_lookup[(transaction["id"], owner, player_id)][-1]
                for player_id in received if stint_lookup[(transaction["id"], owner, player_id)]
            ]
            picks = [
                pick for pick in transaction["draft_picks"]
                if pick["owner"] == owner and pick["previous_owner"] != owner
            ]
            faab = sum(
                transfer["amount"] for transfer in transaction["waiver_budget"]
                if transfer["receiver"] == owner
            ) - sum(
                transfer["amount"] for transfer in transaction["waiver_budget"]
                if transfer["sender"] == owner
            )
            sides.append({
                "owner": owner,
                "players": received,
                "picks": picks,
                "faab": faab,
                "starts": sum(row["starts"] for row in side_stints),
                "starter_points": round2(sum(row["starter_points"] for row in side_stints)),
                "total_points": round2(sum(row["total_points"] for row in side_stints)),
                "rostered_weeks": sum(row["rostered_weeks"] for row in side_stints),
                "retained_players": sum(1 for row in side_stints if row["retained"]),
            })
        has_week = completed_week > transaction["week"]
        status = "too_early" if not has_week else (
            "incomplete" if unresolved else (
                "final" if league_status == "complete" else "provisional"
            )
        )
        best = max((side["starter_points"] for side in sides), default=0)
        leaders = [side["owner"] for side in sides if side["starter_points"] == best]
        even = len(leaders) != 1
        trades.append({
            "transaction_id": transaction["id"],
            "week": transaction["week"],
            "created_ms": transaction["created_ms"],
            "status": status,
            "even": even,
            "edge_owner": leaders[0] if len(leaders) == 1 and has_week and not unresolved else None,
            "completed_through_week": completed_week,
            "sides": sides,
        })

    wire_finds = []
    for player_id, stint in stints:
        acquisition = stint["acquisition"]
        if acquisition["kind"] != "add" or not acquisition["transaction_id"]:
            continue
        transaction = next((row for row in transactions if row["id"] == acquisition["transaction_id"]), None)
        if (
            not transaction
            or transaction["type"] not in {"waiver", "free_agent"}
            or completed_week == 0
            or transaction["week"] > completed_week
        ):
            continue
        wire_finds.append({
            "transaction_id": transaction["id"],
            "player_id": player_id,
            "owner": stint["owner"],
            "acquisition_type": transaction["type"],
            "week": transaction["week"],
            "starts": stint["starts"],
            "starter_points": stint["starter_points"],
            "rostered_weeks": stint["rostered_weeks"],
            "retained": stint["retained"],
        })
    wire_finds.sort(key=lambda row: (
        -row["starter_points"], -row["starts"], -row["rostered_weeks"],
        -int(row["retained"]), _catalog_name(row["player_id"], catalog).casefold(), row["player_id"],
    ))

    movement: dict[str, Counter[str]] = defaultdict(Counter)
    owner_rows = {
        team["owner"]: {
            "owner": team["owner"], "transactions": 0, "adds": 0, "drops": 0,
            "trades": 0, "commissioner_moves": 0, "faab_spent": 0,
            "distinct_incoming_players": 0, "retention": None, "turnover": None,
        }
        for team in teams
    }
    incoming: dict[str, set[str]] = defaultdict(set)
    for transaction in transactions:
        if transaction["status"] != COMPLETE_STATUS:
            continue
        for owner in transaction["participants"]:
            owner_rows[owner]["transactions"] += 1
            if transaction["type"] == "trade":
                owner_rows[owner]["trades"] += 1
            if transaction["type"] == "commissioner":
                owner_rows[owner]["commissioner_moves"] += 1
        if transaction["type"] in {"waiver", "free_agent"}:
            for row in transaction["adds"]:
                movement[row["player_id"]]["adds"] += 1
                owner_rows[row["owner"]]["adds"] += 1
                incoming[row["owner"]].add(row["player_id"])
            for row in transaction["drops"]:
                movement[row["player_id"]]["drops"] += 1
                owner_rows[row["owner"]]["drops"] += 1
        for row in transaction["adds"]:
            incoming[row["owner"]].add(row["player_id"])
        if transaction["type"] == "waiver" and transaction["faab_bid"]:
            for row in transaction["adds"]:
                owner_rows[row["owner"]]["faab_spent"] += transaction["faab_bid"]

    retention = []
    picks_by_owner: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for pick in draft["picks"]:
        picks_by_owner[pick["owner"]].append(pick)
    for team in teams:
        owner = team["owner"]
        drafted = picks_by_owner.get(owner, [])
        current = [stint for player_id, stint in stints if stint["owner"] == owner and stint["retained"]]
        retained_ids = {player_id for player_id, stint in stints if stint["owner"] == owner and stint["retained"]}
        retained = sum(1 for pick in drafted if pick["player_id"] in retained_ids)
        available = draft["status"] == "selected" and completed_week > 0 and bool(drafted)
        rate = round(retained / len(drafted), 4) if available else None
        row = {
            "owner": owner,
            "available": available,
            "drafted": len(drafted),
            "retained": retained,
            "retention": rate,
            "turnover": round(1 - rate, 4) if rate is not None else None,
        }
        retention.append(row)
        owner_rows[owner]["retention"] = row["retention"]
        owner_rows[owner]["turnover"] = row["turnover"]
        owner_rows[owner]["distinct_incoming_players"] = len(incoming[owner])
        del current

    keeper_return = []
    for pick in draft["picks"]:
        if not pick["is_keeper"]:
            continue
        matching = [
            stint for player_id, stint in stints
            if player_id == pick["player_id"] and stint["owner"] == pick["owner"]
        ]
        stint = matching[0] if matching else None
        keeper_return.append({
            "player_id": pick["player_id"],
            "owner": pick["owner"],
            "round": pick["round"],
            "starts": stint["starts"] if stint else 0,
            "starter_points": stint["starter_points"] if stint else 0.0,
        })
    keeper_return.sort(key=lambda row: (
        -row["starter_points"], -row["starts"], -row["round"], row["player_id"]
    ))

    movement_counts = [{
        "player_id": player_id,
        "adds": counts["adds"],
        "drops": counts["drops"],
    } for player_id, counts in movement.items()]
    movement_counts.sort(key=lambda row: (
        -max(row["adds"], row["drops"]), -row["adds"], -row["drops"],
        _catalog_name(row["player_id"], catalog).casefold(), row["player_id"],
    ))
    activity = sorted(owner_rows.values(), key=lambda row: (
        -row["transactions"], -row["trades"], -row["adds"], row["owner"].casefold()
    ))
    return {
        "trades": trades,
        "wire_finds": wire_finds,
        "movement_counts": movement_counts,
        "owner_activity": activity,
        "draft_retention": retention,
        "keeper_return": keeper_return,
    }


def referenced_player_ids(season: dict[str, Any]) -> set[str]:
    result = {pick["player_id"] for pick in season["draft"]["picks"]}
    for transaction in season["transactions"]:
        result.update(row["player_id"] for row in transaction["adds"])
        result.update(row["player_id"] for row in transaction["drops"])
    result.update(row["player_id"] for row in season["player_journeys"])
    return result


def build_player_catalog(
    player_ids: set[str],
    player_directory: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
    result = []
    for player_id in sorted(player_ids):
        source = player_directory.get(player_id) or {}
        name = source.get("full_name") or " ".join(
            part for part in [source.get("first_name"), source.get("last_name")] if part
        ) or None
        result.append({
            "id": player_id,
            "name": str(name) if name else None,
            "position": str(source.get("position")) if source.get("position") else None,
            "nfl_team": str(source.get("team")) if source.get("team") else None,
        })
    return result


def completed_week_from_current(
    current: dict[str, Any],
    season: int,
    max_week: int,
    league_status: str,
) -> int:
    if league_status == "complete":
        return max_week
    if int(current.get("season") or 0) == season:
        statuses_by_week: dict[int, list[str]] = defaultdict(list)
        for game in current.get("games") or []:
            week = int(game.get("week") or 0)
            if 1 <= week <= max_week:
                statuses_by_week[week].append(str(game.get("status") or "unknown"))
        completed = 0
        for week in range(1, max_week + 1):
            statuses = statuses_by_week.get(week, [])
            if not statuses or any(status != "final" for status in statuses):
                break
            completed = week
        return completed
    return 0


def rosters_at_completed_week(
    rosters: list[dict[str, Any]],
    owners: dict[int, str],
    transactions: list[dict[str, Any]],
    completed_week: int,
) -> dict[str, set[str]]:
    boundary = {
        owners[int(roster["roster_id"])]: {
            str(player_id) for player_id in (roster.get("players") or []) if player_id
        }
        for roster in rosters
    }
    future = [
        transaction for transaction in transactions
        if transaction["status"] == COMPLETE_STATUS and transaction["week"] > completed_week
    ]
    for transaction in sorted(future, key=lambda row: (row["created_ms"], row["id"]), reverse=True):
        for movement in transaction["adds"]:
            boundary[movement["owner"]].discard(movement["player_id"])
        for movement in transaction["drops"]:
            boundary[movement["owner"]].add(movement["player_id"])
    return boundary


def build_season(
    *,
    season: int,
    league_id: str,
    league: dict[str, Any],
    rosters: list[dict[str, Any]],
    mapping: dict[str, Any],
    selected_draft: dict[str, Any] | None,
    draft_picks: list[dict[str, Any]],
    transaction_rounds: dict[int, list[dict[str, Any]]],
    matchups: dict[int, list[dict[str, Any]]],
    current: dict[str, Any],
    player_directory: dict[str, dict[str, Any]],
    max_week: int,
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    owners = owner_map(mapping, rosters)
    teams = [{"roster_id": roster_id, "owner": owner} for roster_id, owner in sorted(owners.items())]
    league_status = str(league.get("status") or "unknown")
    completed_week = completed_week_from_current(current, season, max_week, league_status)
    draft = _normalize_draft_asset(selected_draft, draft_picks, owners)
    transactions = normalize_transactions(transaction_rounds, owners, max_week)
    boundary_rosters = rosters_at_completed_week(rosters, owners, transactions, completed_week)
    score_index = _matchup_index(matchups, owners, completed_week)
    journeys = build_journeys(
        draft, transactions, score_index, boundary_rosters, completed_week
    )
    provisional = {
        "season": season,
        "league_id": str(league_id),
        "league_status": league_status,
        "max_week": max_week,
        "coverage": {},
        "teams": teams,
        "draft": draft,
        "transactions": transactions,
        "player_journeys": journeys,
        "insights": {},
    }
    player_ids = referenced_player_ids(provisional)
    players = build_player_catalog(player_ids, player_directory)
    catalog = {player["id"]: player for player in players}
    type_counts = Counter(row["type"] for row in transactions)
    status_counts = Counter(row["status"] for row in transactions)
    provisional["coverage"] = {
        "completed_week": completed_week,
        "transaction_rounds": list(range(0, max_week + 1)),
        "matchup_weeks": list(range(1, max_week + 1)),
        "transaction_count": len(transactions),
        "complete_count": status_counts[COMPLETE_STATUS],
        "failed_count": status_counts["failed"],
        "pending_count": sum(
            count for status, count in status_counts.items()
            if status not in {COMPLETE_STATUS, "failed"}
        ),
        "type_counts": {
            transaction_type: type_counts[transaction_type]
            for transaction_type in sorted(SUPPORTED_TYPES)
        },
        "missing_player_metadata": sum(1 for player in players if player["name"] is None),
        "outcome_methodology_version": METHODOLOGY_VERSION,
    }
    provisional["insights"] = build_insights(
        transactions, draft, journeys, catalog, teams, season, completed_week, league_status
    )
    return provisional, players


def merge_asset(
    season: dict[str, Any],
    players: list[dict[str, Any]],
    existing: dict[str, Any] | None = None,
) -> dict[str, Any]:
    if existing:
        if any(int(row["season"]) == int(season["season"]) for row in existing.get("seasons", []) if row is not None):
            if sum(int(row["season"]) == int(season["season"]) for row in existing["seasons"]) > 1:
                raise ValueError(f"Existing asset contains duplicate season {season['season']}.")
        non_target_seasons = [
            deepcopy(row) for row in existing.get("seasons", [])
            if int(row["season"]) != int(season["season"])
        ]
        non_target_seasons.sort(key=lambda row: int(row["season"]), reverse=True)
        seasons = non_target_seasons[:MAX_RETAINED_SEASONS - 1]
        seasons.append(season)
        seasons.sort(key=lambda row: int(row["season"]))
        referenced = set()
        for row in seasons:
            referenced.update(referenced_player_ids(row))
        merged_catalog = {
            row["id"]: deepcopy(row) for row in existing.get("players", [])
            if row.get("id") in referenced
        }
        merged_catalog.update({row["id"]: row for row in players})
        catalog = [merged_catalog[player_id] for player_id in sorted(referenced)]
    else:
        seasons = [season]
        catalog = sorted(players, key=lambda row: row["id"])
    source_updated_ms = max(
        (transaction["created_ms"] for row in seasons for transaction in row["transactions"]),
        default=0,
    )
    return {
        "schema_version": SCHEMA_VERSION,
        "generator_version": GENERATOR_VERSION,
        "methodology_version": METHODOLOGY_VERSION,
        "source": "sleeper",
        "source_updated_ms": source_updated_ms,
        "players": catalog,
        "seasons": seasons,
    }


def validate_asset_invariants(asset: dict[str, Any]) -> None:
    seasons = asset.get("seasons") or []
    values = [int(row["season"]) for row in seasons]
    if values != sorted(values) or len(values) != len(set(values)):
        raise ValueError("Seasons must be unique and sorted.")
    player_ids = {row["id"] for row in asset.get("players") or []}
    for season in seasons:
        ids = [row["id"] for row in season["transactions"]]
        if len(ids) != len(set(ids)):
            raise ValueError(f"Season {season['season']} contains duplicate transaction IDs.")
        missing = referenced_player_ids(season) - player_ids
        if missing:
            raise ValueError(f"Season {season['season']} references missing players: {sorted(missing)}.")
        raw_size = len(canonical_json(season).encode("utf-8"))
        if raw_size > MAX_SEASON_BYTES:
            raise ValueError(
                f"Season {season['season']} exceeds {MAX_SEASON_BYTES} bytes ({raw_size})."
            )
    if len(seasons) > MAX_RETAINED_SEASONS:
        raise ValueError(
            f"TransactionHistory exceeds {MAX_RETAINED_SEASONS} retained seasons."
        )
    total_size = len(canonical_json(asset).encode("utf-8"))
    if total_size > MAX_ASSET_BYTES:
        raise ValueError(
            f"TransactionHistory exceeds {MAX_ASSET_BYTES} bytes ({total_size})."
        )
