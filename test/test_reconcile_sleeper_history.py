import sys, unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parents[1] / "scripts"))
from reconcile_sleeper_history import reconcile, key

class ReconcileTests(unittest.TestCase):
    def test_orientation_and_differences_are_report_only(self):
        old = {key({"season": 2025, "week": 1, "teamA": "A", "teamB": "B", "scoreA": 80, "scoreB": 75}): {"teamA": "A", "teamB": "B", "scoreA": 80, "scoreB": 75}}
        new = {key({"season": 2025, "week": 1, "teamA": "B", "teamB": "A", "scoreA": 75, "scoreB": 81}): {"teamA": "B", "teamB": "A", "scoreA": 75, "scoreB": 81}}
        report = reconcile(old, new)
        self.assertEqual(report["summary"]["different"], 1)
        self.assertEqual(report["summary"]["new"], 0)

if __name__ == "__main__": unittest.main()
