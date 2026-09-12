import sys, unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parents[1] / "scripts"))
from transaction_history import validate_current_snapshot

def snap(**changes):
    value={"season":2025,"weeks_fetched":[1],"teams":[{"roster_id":1},{"roster_id":2}],"games":[{"week":1,"rosterA":1,"rosterB":2,"matchup_id":1,"status":"final","scoreA":0.0,"scoreB":0.0}]}; value.update(changes); return value
class StrictBoundaryTests(unittest.TestCase):
    def test_boundary_zero_accepts_empty_coverage(self): validate_current_snapshot(snap(weeks_fetched=[], games=[]),2025,2,0,{1,2})
    def test_wrong_season_fails(self):
        with self.assertRaises(ValueError): validate_current_snapshot(snap(season=2024),2025,2,1,{1,2})
    def test_missing_week_fails(self):
        with self.assertRaises(ValueError): validate_current_snapshot(snap(weeks_fetched=[]),2025,2,1,{1,2})
    def test_wrong_roster_fails(self):
        with self.assertRaises(ValueError): validate_current_snapshot(snap(games=[{"week":1,"rosterA":3,"rosterB":4,"matchup_id":1,"status":"final","scoreA":1,"scoreB":2}]),2025,2,1,{1,2})
    def test_nonfinal_and_invalid_scores_fail(self):
        for status, score in [("live",1),("final",None),("final",float("nan")),("final",True)]:
            game={"week":1,"rosterA":1,"rosterB":2,"matchup_id":1,"status":status,"scoreA":score,"scoreB":2}
            with self.assertRaises(ValueError): validate_current_snapshot(snap(games=[game]),2025,2,1,{1,2})
    def test_duplicate_matchup_fails(self):
        game={"week":1,"rosterA":1,"rosterB":2,"matchup_id":1,"status":"final","scoreA":1,"scoreB":2}
        with self.assertRaises(ValueError): validate_current_snapshot(snap(games=[game,dict(game,rosterA=2,rosterB=1)]),2025,2,1,{1,2})
if __name__ == "__main__": unittest.main()
