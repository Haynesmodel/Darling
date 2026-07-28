import argparse
import json
import os
import socket
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock
from urllib.error import HTTPError

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import generate_transaction_history as generator  # noqa: E402
import transaction_history as history  # noqa: E402
from generate_transaction_history import SleeperClient, cached_players, fetch_inputs, generate  # noqa: E402
from transaction_history import (  # noqa: E402
    build_journeys,
    completed_week_from_current,
    merge_asset,
    owner_map,
    rosters_at_completed_week,
    select_draft,
    validate_asset_invariants,
)


FIXTURES = ROOT / "test" / "fixtures" / "transaction-history"


def fixture_args(output):
    return argparse.Namespace(
        league="12345",
        season=2025,
        map=str(FIXTURES / "mapping.json"),
        max_week=2,
        current_season=str(FIXTURES / "current-season.json"),
        out=str(output),
        existing=None,
        draft_id=None,
        players_cache=None,
        fixture_dir=str(FIXTURES),
    )


class TransactionHistoryTests(unittest.TestCase):
    def test_fixture_generation_is_deterministic_and_reconciled(self):
        with tempfile.TemporaryDirectory() as directory:
            first = Path(directory) / "first.json"
            second = Path(directory) / "second.json"
            one = generate(fixture_args(first))
            two = generate(fixture_args(second))
            self.assertEqual(first.read_bytes(), second.read_bytes())
            season = one["seasons"][0]
            self.assertEqual(season["coverage"]["transaction_count"], 3)
            self.assertEqual(season["coverage"]["complete_count"], 2)
            self.assertEqual(season["coverage"]["failed_count"], 1)
            self.assertEqual(season["draft"]["draft_id"], "primary")
            self.assertEqual(season["draft"]["pick_count"], 2)
            self.assertEqual(len(season["insights"]["trades"]), 1)
            self.assertEqual(season["insights"]["trades"][0]["status"], "incomplete")
            self.assertFalse(any(row["transaction_id"] == "failed-waiver" for row in season["insights"]["wire_finds"]))
            validate_asset_invariants(two)

    def test_cli_failure_preserves_an_existing_output_and_removes_only_temporary_data(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "TransactionHistory.json"
            output.write_text('{"preserved":true}\n')
            temporary = output.with_name(f".{output.name}.tmp")
            temporary.write_text("partial")
            argv = [
                "generate_transaction_history.py",
                "--league", "12345",
                "--season", "2025",
                "--map", str(Path(directory) / "missing-map.json"),
                "--max-week", "2",
                "--current-season", str(FIXTURES / "current-season.json"),
                "--out", str(output),
                "--fixture-dir", str(FIXTURES),
            ]
            with mock.patch.object(sys, "argv", argv), mock.patch("sys.stderr"):
                self.assertEqual(generator.main(), 1)
            self.assertEqual(output.read_text(), '{"preserved":true}\n')
            self.assertFalse(temporary.exists())

    def test_target_replacement_preserves_other_season(self):
        with tempfile.TemporaryDirectory() as directory:
            asset = generate(fixture_args(Path(directory) / "asset.json"))
            other = json.loads(json.dumps(asset["seasons"][0]))
            other["season"] = 2026
            other["league_id"] = "other"
            existing = dict(asset, seasons=[asset["seasons"][0], other])
            merged = merge_asset(asset["seasons"][0], asset["players"], existing)
            self.assertEqual(merged["seasons"][1], other)

    def test_ambiguous_drafts_require_override(self):
        drafts = [
            {"draft_id": "a", "season": "2025"},
            {"draft_id": "b", "season": "2025"},
        ]
        picks = {
            "a": [{"player_id": "p1", "roster_id": 1}],
            "b": [{"player_id": "p2", "roster_id": 2}],
        }
        with self.assertRaisesRegex(ValueError, "Ambiguous primary draft"):
            select_draft(drafts, picks, 2025)
        selected, _ = select_draft(drafts, picks, 2025, "b")
        self.assertEqual(selected["draft_id"], "b")

    def test_full_and_empty_drafts_choose_the_only_nonempty_draft(self):
        drafts = [
            {"draft_id": "empty", "season": "2025"},
            {"draft_id": "full", "season": "2025"},
        ]
        selected, picks = select_draft(
            drafts,
            {
                "empty": [],
                "full": [{"player_id": "p1", "roster_id": 1}],
            },
            2025,
        )
        self.assertEqual(selected["draft_id"], "full")
        self.assertEqual(len(picks), 1)
        self.assertEqual(select_draft([], {}, 2025), (None, []))

    def test_mapping_rejects_missing_and_duplicate_owners(self):
        rosters = [{"roster_id": 1}, {"roster_id": 2}]
        with self.assertRaisesRegex(ValueError, "Missing canonical owner"):
            owner_map({"1": "Alpha"}, rosters)
        with self.assertRaisesRegex(ValueError, "Duplicate canonical owner"):
            owner_map({"1": "Alpha", "2": "Alpha"}, rosters)

    def test_reacquired_player_stints_use_only_their_own_matchup_weeks(self):
        draft = {
            "picks": [{
                "player_id": "p1",
                "owner": "Alpha",
                "pick_no": 1,
                "is_keeper": False,
            }]
        }
        transactions = [
            {
                "id": "drop",
                "status": "complete",
                "type": "free_agent",
                "week": 2,
                "created_ms": 20,
                "adds": [],
                "drops": [{"player_id": "p1", "owner": "Alpha"}],
            },
            {
                "id": "readd",
                "status": "complete",
                "type": "free_agent",
                "week": 4,
                "created_ms": 40,
                "adds": [{"player_id": "p1", "owner": "Alpha"}],
                "drops": [],
            },
        ]
        scoring = {
            ("Alpha", "p1"): {
                "weeks": [1, 2, 4, 5],
                "starts": 4,
                "total_points": 50.0,
                "starter_points": 50.0,
                "by_week": {
                    1: {"started": True, "points": 10.0},
                    2: {"started": True, "points": 11.0},
                    4: {"started": True, "points": 14.0},
                    5: {"started": True, "points": 15.0},
                },
            }
        }
        journey = build_journeys(
            draft,
            transactions,
            scoring,
            {"Alpha": {"p1"}},
            5,
        )[0]
        first, second = journey["stints"]
        self.assertEqual(first["starter_points"], 21.0)
        self.assertEqual(first["rostered_weeks"], 2)
        self.assertFalse(first["retained"])
        self.assertEqual(second["starter_points"], 29.0)
        self.assertEqual(second["rostered_weeks"], 2)
        self.assertTrue(second["retained"])

    def test_completed_week_and_roster_retention_ignore_live_week_moves(self):
        current = {
            "season": 2025,
            "games": [
                {"week": 1, "status": "final"},
                {"week": 1, "status": "final"},
                {"week": 2, "status": "final"},
                {"week": 2, "status": "live"},
            ],
        }
        self.assertEqual(completed_week_from_current(current, 2025, 17, "in_season"), 1)
        self.assertEqual(completed_week_from_current(current, 2025, 17, "complete"), 17)
        transactions = [
            {
                "id": "future-swap",
                "status": "complete",
                "type": "free_agent",
                "week": 2,
                "created_ms": 20,
                "adds": [{"player_id": "new", "owner": "Alpha"}],
                "drops": [{"player_id": "old", "owner": "Alpha"}],
            },
        ]
        boundary = rosters_at_completed_week(
            [{"roster_id": 1, "players": ["new"]}],
            {1: "Alpha"},
            transactions,
            1,
        )
        self.assertEqual(boundary, {"Alpha": {"old"}})
        journeys = build_journeys(
            {
                "picks": [{
                    "player_id": "old",
                    "owner": "Alpha",
                    "pick_no": 1,
                    "is_keeper": False,
                }],
            },
            transactions,
            {},
            boundary,
            1,
        )
        by_player = {row["player_id"]: row["stints"][0] for row in journeys}
        self.assertTrue(by_player["old"]["retained"])
        self.assertFalse(by_player["new"]["retained"])

    def test_fetch_inventory_includes_exact_round_and_matchup_boundaries(self):
        class RecordingClient:
            def __init__(self):
                self.calls = []

            def get(self, endpoint, fixture, **_kwargs):
                self.calls.append((endpoint, fixture))
                return json.loads((FIXTURES / f"{fixture}.json").read_text())

        client = RecordingClient()
        with tempfile.TemporaryDirectory() as directory:
            args = fixture_args(Path(directory) / "unused.json")
            fetch_inputs(args, client)
        endpoints = {endpoint for endpoint, _fixture in client.calls}
        self.assertIn("/league/12345/transactions/0", endpoints)
        self.assertIn("/league/12345/transactions/2", endpoints)
        self.assertNotIn("/league/12345/transactions/3", endpoints)
        self.assertIn("/league/12345/matchups/1", endpoints)
        self.assertIn("/league/12345/matchups/2", endpoints)
        self.assertNotIn("/league/12345/matchups/0", endpoints)

    def test_client_retries_only_retryable_http_statuses_with_a_bound(self):
        class Response:
            headers = {"Content-Length": "2"}

            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

            def read(self, _limit):
                return b"{}"

        for status in (429, 500, 503):
            with self.subTest(status=status):
                sleeps = []
                responses = [
                    HTTPError("https://example.test", status, "retry", {}, None),
                    HTTPError("https://example.test", status, "retry", {}, None),
                    Response(),
                ]
                with mock.patch.object(generator, "urlopen", side_effect=responses) as request:
                    value = SleeperClient(sleep=sleeps.append).get("/test", "unused")
                self.assertEqual(value, {})
                self.assertEqual(request.call_count, 3)
                self.assertEqual(sleeps, [1, 2])

        with mock.patch.object(
            generator,
            "urlopen",
            side_effect=HTTPError("https://example.test", 404, "missing", {}, None),
        ) as request:
            with self.assertRaises(HTTPError):
                SleeperClient().get("/test", "unused")
        self.assertEqual(request.call_count, 1)

    def test_client_rejects_oversize_and_invalid_json_responses(self):
        class Response:
            def __init__(self, body, length=None):
                self.body = body
                self.headers = {"Content-Length": str(length)} if length is not None else {}

            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

            def read(self, limit):
                return self.body[:limit]

        with mock.patch.object(generator, "urlopen", return_value=Response(b"{}", 11)):
            with self.assertRaisesRegex(ValueError, "exceeds 10 bytes"):
                SleeperClient().get("/test", "unused", max_bytes=10)
        with mock.patch.object(generator, "urlopen", return_value=Response(b"{bad")):
            with self.assertRaisesRegex(ValueError, "invalid UTF-8 JSON"):
                SleeperClient().get("/test", "unused")
        with mock.patch.object(generator, "urlopen", side_effect=socket.timeout()) as request:
            with self.assertRaises(socket.timeout):
                SleeperClient().get("/test", "unused")
        self.assertEqual(request.call_count, 1)

    def test_player_cache_accepts_fresh_and_rejects_expired_corrupt_or_oversize_data(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "players.json"
            target.write_text('{"p1":{"full_name":"Player One"}}')
            self.assertIn("p1", cached_players(str(target)))
            os.utime(target, (0, 0))
            self.assertIsNone(cached_players(str(target)))
            target.write_text("{bad")
            self.assertIsNone(cached_players(str(target)))
            with target.open("wb") as cache:
                cache.truncate(generator.PLAYER_MAX_BYTES + 1)
            self.assertIsNone(cached_players(str(target)))

    def test_failed_and_pending_moves_never_create_player_journeys(self):
        draft = {"picks": []}
        transactions = [
            {
                "id": "failed",
                "status": "failed",
                "type": "waiver",
                "week": 1,
                "created_ms": 1,
                "adds": [{"player_id": "p1", "owner": "Alpha"}],
                "drops": [],
            },
            {
                "id": "pending",
                "status": "pending",
                "type": "trade",
                "week": 1,
                "created_ms": 2,
                "adds": [{"player_id": "p2", "owner": "Alpha"}],
                "drops": [],
            },
        ]
        self.assertEqual(build_journeys(draft, transactions, {}, {"Alpha": set()}, 1), [])

    def test_hard_size_boundaries_are_inclusive_and_fail_one_byte_over(self):
        empty = {
            "schema_version": 1,
            "generator_version": 1,
            "methodology_version": 1,
            "source": "sleeper",
            "source_updated_ms": 0,
            "players": [],
            "seasons": [],
        }
        with mock.patch.object(history, "canonical_json", return_value="x" * 2_000_000):
            validate_asset_invariants(empty)
        with mock.patch.object(history, "canonical_json", return_value="x" * 2_000_001):
            with self.assertRaisesRegex(ValueError, "exceeds 2000000 bytes"):
                validate_asset_invariants(empty)


if __name__ == "__main__":
    unittest.main()
