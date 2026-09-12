import sys
import unittest
from datetime import date, datetime, timezone
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parents[1] / "scripts"))
from scoring_completion import resolve_completion

class CompletionTests(unittest.TestCase):
    def setUp(self): self.anchor = date(2026, 9, 13)
    def test_exact_tuesday_guard(self):
        state = {"season": 2026, "season_type": "regular", "week": 2}
        for second, expected in [(12 * 3600 + 59 * 60 + 59, 0), (13 * 3600, 1), (13 * 3600 + 1, 1)]:
            now = datetime(2026, 9, 15, tzinfo=timezone.utc).replace(hour=0) + __import__('datetime').timedelta(seconds=second)
            self.assertEqual(resolve_completion(season=2026, max_week=17, week1_sunday=self.anchor, nfl_state=state, now=now).completed_through_week, expected)
    def test_unknown_state_retains_verified_boundary(self):
        result = resolve_completion(season=2026, max_week=17, week1_sunday=self.anchor, last_verified_completed=2, nfl_state={"season": 2025}, now=datetime.now(timezone.utc))
        self.assertEqual(result.completed_through_week, 2)
    def test_override_requires_reason_and_is_not_scheduled(self):
        with self.assertRaises(ValueError): resolve_completion(season=2026, max_week=17, week1_sunday=self.anchor, override=1)
        with self.assertRaises(ValueError): resolve_completion(season=2026, max_week=17, week1_sunday=self.anchor, override=1, override_reason="x", scheduled=True)
        self.assertEqual(resolve_completion(season=2026, max_week=17, week1_sunday=self.anchor, override=1, override_reason="postponed").basis, "manual_override")

if __name__ == "__main__": unittest.main()
