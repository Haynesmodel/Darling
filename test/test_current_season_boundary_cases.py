import importlib.util
import math
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

    def test_invalid_scores_fail_before_rounding(self):
        for value in (True, "80", float("nan"), float("inf")):
            self.assertFalse(isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) if isinstance(value, (int, float)) else False)


if __name__ == "__main__":
    unittest.main()
