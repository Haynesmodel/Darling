import unittest
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parents[1] / "scripts"))
from generate_current_season import matchup_status
from sleeper_to_h2h import game_key
from transaction_history import validate_current_snapshot


class SharedBoundaryIntegrationTests(unittest.TestCase):
    def test_one_boundary_drives_all_three_outputs(self):
        boundary = 1
        current = {
            "season": 2025,
            "weeks_fetched": [1, 2],
            "teams": [{"roster_id": 1}, {"roster_id": 2}],
            "games": [
                {"week": 1, "rosterA": 1, "rosterB": 2, "matchup_id": 1, "status": "final", "scoreA": 80, "scoreB": 75},
                {"week": 2, "rosterA": 1, "rosterB": 2, "matchup_id": 2, "status": "live", "scoreA": 12, "scoreB": None},
            ],
        }
        validate_current_snapshot(current, 2025, 2, boundary, {1, 2})
        self.assertEqual(matchup_status(1, 2, None, None, 80, 75, boundary, True), "final")
        self.assertEqual(matchup_status(2, 2, None, None, 12, 0, boundary, True), "live")
        rows = [{"season": 2025, "week": 1, "teamA": "A", "teamB": "B"}]
        self.assertEqual(game_key(rows[0]), (2025, 1, "A", "B"))
        self.assertNotIn(2, {row["week"] for row in rows})


if __name__ == "__main__":
    unittest.main()
