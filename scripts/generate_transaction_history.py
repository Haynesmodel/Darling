#!/usr/bin/env python3
"""Generate a deterministic TransactionHistory season from the Sleeper API."""

from __future__ import annotations

import argparse
import json
import os
import socket
import sys
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from transaction_history import (
    build_season,
    load_json,
    merge_asset,
    select_draft,
    validate_asset_invariants,
    write_json,
)

API_BASE = "https://api.sleeper.app/v1"
USER_AGENT = "Darling-Transaction-History/1.0"
NORMAL_MAX_BYTES = 2 * 1024 * 1024
PLAYER_MAX_BYTES = 16 * 1024 * 1024
CACHE_MAX_AGE_SECONDS = 24 * 60 * 60


class SleeperClient:
    def __init__(self, fixture_dir: str | None = None, sleep=time.sleep):
        self.fixture_dir = Path(fixture_dir) if fixture_dir else None
        self.sleep = sleep

    def _fixture(self, name: str):
        if not self.fixture_dir:
            return None
        return load_json(self.fixture_dir / f"{name}.json")

    def get(self, endpoint: str, fixture: str, *, max_bytes: int = NORMAL_MAX_BYTES):
        value = self._fixture(fixture)
        if value is not None:
            return value
        url = f"{API_BASE}{endpoint}"
        for attempt in range(3):
            request = Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
            try:
                with urlopen(request, timeout=30) as response:
                    length = response.headers.get("Content-Length")
                    if length and int(length) > max_bytes:
                        raise ValueError(f"Sleeper response exceeds {max_bytes} bytes.")
                    body = response.read(max_bytes + 1)
                    if len(body) > max_bytes:
                        raise ValueError(f"Sleeper response exceeds {max_bytes} bytes.")
                    try:
                        value = json.loads(body.decode("utf-8"))
                    except (UnicodeDecodeError, json.JSONDecodeError) as error:
                        raise ValueError("Sleeper returned invalid UTF-8 JSON.") from error
                    if not isinstance(value, (dict, list)):
                        raise ValueError("Sleeper response must be a JSON object or array.")
                    return value
            except HTTPError as error:
                if error.code not in {429, 500, 503} or attempt == 2:
                    raise
                retry_after = error.headers.get("Retry-After")
                delay = min(float(retry_after), 30) if retry_after and retry_after.isdigit() else 2 ** attempt
                self.sleep(delay)
            except (URLError, socket.timeout):
                raise
        raise RuntimeError("Unreachable retry state.")


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(description=__doc__)
    result.add_argument("--league", required=True)
    result.add_argument("--season", required=True, type=int)
    result.add_argument("--map", required=True)
    result.add_argument("--max-week", required=True, type=int)
    result.add_argument("--current-season", required=True)
    result.add_argument("--out", required=True)
    result.add_argument("--existing")
    result.add_argument("--draft-id")
    result.add_argument("--players-cache")
    result.add_argument("--fixture-dir")
    return result


def cached_players(path: str | None):
    if not path:
        return None
    target = Path(path)
    try:
        if time.time() - target.stat().st_mtime > CACHE_MAX_AGE_SECONDS:
            return None
        value = load_json(target)
        return value if isinstance(value, dict) else None
    except (FileNotFoundError, OSError, ValueError, json.JSONDecodeError):
        return None


def fetch_inputs(args, client: SleeperClient):
    league = client.get(f"/league/{args.league}", "league")
    if not isinstance(league, dict):
        raise ValueError("League response must be an object.")
    if str(league.get("season")) != str(args.season):
        raise ValueError("Configured league season does not match --season.")
    rosters = client.get(f"/league/{args.league}/rosters", "rosters")
    drafts = client.get(f"/league/{args.league}/drafts", "drafts")
    if not isinstance(rosters, list) or not isinstance(drafts, list):
        raise ValueError("Rosters and drafts responses must be arrays.")
    picks_by_draft = {}
    for draft in drafts:
        draft_id = str(draft.get("draft_id") or "")
        if draft_id:
            picks = client.get(f"/draft/{draft_id}/picks", f"draft-{draft_id}-picks")
            if not isinstance(picks, list):
                raise ValueError(f"Draft picks for {draft_id} must be an array.")
            picks_by_draft[draft_id] = picks
    selected, selected_picks = select_draft(drafts, picks_by_draft, args.season, args.draft_id)
    transactions = {}
    for week in range(0, args.max_week + 1):
        rows = client.get(f"/league/{args.league}/transactions/{week}", f"transactions-{week}")
        if not isinstance(rows, list):
            raise ValueError(f"Transactions round {week} must be an array.")
        transactions[week] = rows
    matchups = {}
    for week in range(1, args.max_week + 1):
        rows = client.get(f"/league/{args.league}/matchups/{week}", f"matchups-{week}")
        if not isinstance(rows, list):
            raise ValueError(f"Matchups week {week} must be an array.")
        matchups[week] = rows
    players = cached_players(args.players_cache)
    if players is None:
        players = client.get("/players/nfl", "players", max_bytes=PLAYER_MAX_BYTES)
        if not isinstance(players, dict):
            raise ValueError("Player directory must be an object.")
        if args.players_cache and not args.fixture_dir:
            write_json(args.players_cache, players)
    return league, rosters, selected, selected_picks, transactions, matchups, players


def generate(args):
    if args.season < 2025 or args.season > 2100:
        raise ValueError("--season must be between 2025 and 2100.")
    if args.max_week < 1 or args.max_week > 25:
        raise ValueError("--max-week must be between 1 and 25.")
    client = SleeperClient(args.fixture_dir)
    league, rosters, draft, picks, transactions, matchups, players = fetch_inputs(args, client)
    season, catalog = build_season(
        season=args.season,
        league_id=args.league,
        league=league,
        rosters=rosters,
        mapping=load_json(args.map),
        selected_draft=draft,
        draft_picks=picks,
        transaction_rounds=transactions,
        matchups=matchups,
        current=load_json(args.current_season),
        player_directory=players,
        max_week=args.max_week,
    )
    existing = load_json(args.existing) if args.existing else None
    result = merge_asset(season, catalog, existing)
    validate_asset_invariants(result)
    write_json(args.out, result)
    return result


def main() -> int:
    args = parser().parse_args()
    target = Path(args.out)
    try:
        result = generate(args)
    except Exception as error:
        try:
            target.unlink()
        except FileNotFoundError:
            pass
        print(f"Transaction history generation failed: {error}", file=sys.stderr)
        return 1
    season = next(row for row in result["seasons"] if row["season"] == args.season)
    coverage = season["coverage"]
    print(
        f"Wrote {target} for configured league season {args.season}: "
        f"{coverage['transaction_count']} transactions, "
        f"{coverage['complete_count']} complete, {coverage['failed_count']} failed."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
