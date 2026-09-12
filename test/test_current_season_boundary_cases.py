import importlib.util
import pathlib
import sys
import unittest
from datetime import date
from types import SimpleNamespace
from unittest.mock import patch

ROOT = pathlib.Path(__file__).resolve().parents[1]
SCRIPT_DIR = ROOT / "scripts"
sys.path.insert(0, str(SCRIPT_DIR))
spec = importlib.util.spec_from_file_location("generate_current_season", SCRIPT_DIR / "generate_current_season.py")
module = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(module)


class CurrentSeasonBoundaryTests(unittest.TestCase):
    def build(self, points_a, points_b, boundary):
        args = SimpleNamespace(league="league", season=2025, map="/tmp/no-map", weeks="1", cutoff_date=None,
                               current_week=1, regular_season_max_week=14, max_week=17, allow_postseason=False,
                               h2h_fallback=None, completed_through_week=boundary, completion_basis="fixture")
        teams = [{"roster_id": 1, "display_name": "A", "sleeper_team_name": ""}, {"roster_id": 2, "display_name": "B", "sleeper_team_name": ""}]
        import tempfile, json
        with tempfile.TemporaryDirectory() as tmp:
            path = pathlib.Path(tmp) / "map.json"; path.write_text(json.dumps({"1": "A", "2": "B"})); args.map = str(path)
            rows = [{"matchup_id": 1, "roster_id": 1, "points": points_a}, {"matchup_id": 1, "roster_id": 2, "points": points_b}]
            with patch.object(module.sleeper, "list_teams", return_value=teams), patch.object(module.sleeper, "get_matchups", return_value=rows), patch.object(module.sleeper, "sunday_for_week", return_value=date(2025, 9, 7)):
                return module.build_current_season_asset(args)
    def test_status_matrix_uses_only_resolved_boundary(self):
        self.assertEqual(module.matchup_status(1, 1, date(2025, 9, 7), date(2025, 9, 8), 80, 75, 0, True), "live")
        self.assertEqual(module.matchup_status(2, 1, date(2025, 9, 14), date(2025, 9, 15), 0, 0, 0, False), "scheduled")
        self.assertEqual(module.matchup_status(1, 1, date(2025, 9, 7), date(2025, 9, 8), 0, 0, 1, True), "final")

    def test_completed_pair_validation_rejects_bad_shape_and_rosters(self):
        valid = [{"roster_id": 1, "matchup_id": 1, "points": 0}, {"roster_id": 2, "matchup_id": 1, "points": 0}]
        self.assertEqual(len(module.strict_completed_pairs(valid, {1, 2})), 1)
        for rows in ([None, valid[1]], [{**valid[0], "roster_id": True}, valid[1]], [{**valid[0], "roster_id": 3}, valid[1]], valid[:1]):
            with self.assertRaises(ValueError):
                module.strict_completed_pairs(rows, {1, 2})

    def test_active_one_null_is_live_and_both_null_is_scheduled(self):
        self.assertEqual(self.build(80, None, 0)["games"][0]["status"], "live")
        self.assertIsNone(self.build(80, None, 0)["games"][0]["scoreB"])
        self.assertEqual(self.build(None, None, 0)["games"][0]["status"], "scheduled")
        self.assertIsNone(self.build(None, None, 0)["games"][0]["scoreA"])

    def test_completed_zero_zero_is_final_and_missing_or_invalid_fails(self):
        self.assertEqual(self.build(0, 0, 1)["games"][0]["status"], "final")
        for value in (None, True, "80", float("nan"), float("inf")):
            with self.assertRaises(ValueError):
                self.build(value, 80, 1)

    def test_invalid_completed_team_metadata_is_rejected(self):
        with self.assertRaises(ValueError):
            module.strict_completed_pairs([{"roster_id": 1, "matchup_id": 1, "points": 0}], {1, 2})


if __name__ == "__main__":
    unittest.main()
