import sys
import unittest
from datetime import date, datetime, timezone
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parents[1] / "scripts"))
from scoring_completion import resolve_completion, retained_boundary_from_snapshot

class CompletionTests(unittest.TestCase):
    def setUp(self): self.anchor = date(2026, 9, 13)
    def test_exact_tuesday_guard(self):
        state = {"season": 2026, "season_type": "regular", "week": 2}
        for second, expected in [(12 * 3600 + 59 * 60 + 59, 0), (13 * 3600, 1), (13 * 3600 + 1, 1)]:
            now = datetime(2026, 9, 15, tzinfo=timezone.utc).replace(hour=0) + __import__('datetime').timedelta(seconds=second)
            self.assertEqual(resolve_completion(season=2026, max_week=17, week1_sunday=self.anchor, league_status="in_season", league_season=2026, nfl_state=state, now=now).completed_through_week, expected)
    def test_unknown_state_retains_verified_boundary(self):
        result = resolve_completion(season=2026, max_week=17, week1_sunday=self.anchor, league_season=2026, last_verified_completed=2, nfl_state={"season": 2025}, now=datetime.now(timezone.utc))
        self.assertEqual(result.completed_through_week, 2)
    def test_override_requires_reason_and_is_not_scheduled(self):
        with self.assertRaises(ValueError): resolve_completion(season=2026, max_week=17, week1_sunday=self.anchor, league_season=2026, override=1)
        with self.assertRaises(ValueError): resolve_completion(season=2026, max_week=17, week1_sunday=self.anchor, league_season=2026, override=1, override_reason="x", scheduled=True)
        self.assertEqual(resolve_completion(season=2026, max_week=17, week1_sunday=self.anchor, league_season=2026, override=1, override_reason="postponed").basis, "manual_override")
    def test_retained_boundary_requires_exact_verified_snapshot(self):
        snapshot = {"season": 2026, "weeks_fetched": [1], "teams": [{"roster_id": 1}, {"roster_id": 2}], "games": [{"week": 1, "status": "final", "rosterA": 1, "rosterB": 2, "matchup_id": 1, "scoreA": 0.0, "scoreB": 0.0}]}
        self.assertEqual(retained_boundary_from_snapshot(snapshot, 2026, 17), 1)
        self.assertEqual(retained_boundary_from_snapshot({**snapshot, "season": 2025}, 2026, 17), 0)
        with self.assertRaises(ValueError): retained_boundary_from_snapshot({"season": 2026}, 2026, 17)
    def test_unknown_type_and_pre_draft_do_not_advance(self):
        now = datetime(2026, 9, 30, tzinfo=timezone.utc)
        self.assertEqual(resolve_completion(season=2026, max_week=17, week1_sunday=self.anchor, league_status="pre_draft", league_season=2026, last_verified_completed=0, nfl_state={"season": 2026, "season_type": "regular", "week": 3}, now=now).completed_through_week, 0)
        self.assertEqual(resolve_completion(season=2026, max_week=17, week1_sunday=self.anchor, league_season=2026, nfl_state={"season": 2026, "week": 3}, now=now).completed_through_week, 0)

    def test_published_postseason_snapshot_retains_boundary_seventeen(self):
        import json
        snapshot = json.loads((Path(__file__).parents[1] / "assets" / "CurrentSeason.json").read_text())
        self.assertEqual(retained_boundary_from_snapshot(snapshot, 2025, 17), 17)
        delayed = resolve_completion(season=2025, max_week=17, week1_sunday=date(2025, 9, 7), league_season=2025,
                                     last_verified_completed=15, nfl_state={"season": 2024}, now=datetime(2025, 12, 1, tzinfo=timezone.utc))
        self.assertEqual(delayed.completed_through_week, 15)

    def test_postseason_snapshot_missing_game_stops_before_that_week(self):
        import json
        snapshot = json.loads((Path(__file__).parents[1] / "assets" / "CurrentSeason.json").read_text())
        snapshot["games"] = [game for game in snapshot["games"] if not (game["week"] == 16 and game["type"] == "Playoff")]
        self.assertEqual(retained_boundary_from_snapshot(snapshot, 2025, 17), 15)

    def test_resolver_truth_table_and_input_validation(self):
        from datetime import timedelta
        base = dict(season=2026, max_week=17, week1_sunday=self.anchor, league_status="in_season", league_season=2026,
                    nfl_state={"season": 2026, "season_type": "regular", "week": 2})
        for offset, expected in ((timedelta(days=2, seconds=12 * 3600 + 59 * 60 + 59), 0), (timedelta(days=3), 1)):
            result = resolve_completion(**base, now=datetime(2026, 9, 13, tzinfo=timezone.utc) + offset)
            self.assertEqual(result.completed_through_week, expected)
        for state in ({"season": 2025, "season_type": "regular", "week": 2}, {"season": 2027, "season_type": "regular", "week": 2},
                      {"season": 2026, "season_type": "postseason", "week": 2}, {"season": 2026, "season_type": "regular"},
                      {"season": 2026, "season_type": 4, "week": 2}):
            result = resolve_completion(**{**base, "nfl_state": state}, last_verified_completed=3, now=datetime.now(timezone.utc))
            self.assertEqual(result.completed_through_week, 3)
            self.assertTrue(result.warnings)
        with self.assertRaises(ValueError): resolve_completion(**{**base, "nfl_state": []})
        unknown = resolve_completion(**{**base, "league_status": "mystery"}, last_verified_completed=2, now=datetime.now(timezone.utc))
        self.assertEqual((unknown.completed_through_week, unknown.basis, unknown.active_week), (2, "verified_boundary_unknown_status", 3))
        for kwargs in ({"league_season": 2025}, {"override": -1, "override_reason": "x"}, {"override": 18, "override_reason": "x"},
                       {"override": True, "override_reason": "x"}, {"override": 2, "last_verified_completed": 3, "override_reason": "x"},
                       {"override": 1, "override_reason": ""}, {"override": 1, "override_reason": "x", "scheduled": True}):
            with self.assertRaises(ValueError): resolve_completion(**{**base, **kwargs})
        result = resolve_completion(**{**base, "override": 0, "override_reason": "manual"})
        self.assertEqual((result.completed_through_week, result.active_week, result.basis, result.warnings), (0, 1, "manual_override", ()))

if __name__ == "__main__": unittest.main()
