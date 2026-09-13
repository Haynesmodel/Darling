import sys, unittest
import json
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parents[1] / "scripts"))
from transaction_history import validate_current_snapshot
from transaction_history import _validate_raw_matchups

def snap(**changes):
    value={"season":2025,"weeks_fetched":[1],"teams":[{"roster_id":1},{"roster_id":2}],"games":[{"week":1,"rosterA":1,"rosterB":2,"matchup_id":1,"status":"final","scoreA":0.0,"scoreB":0.0}]}; value.update(changes); return value
class StrictBoundaryTests(unittest.TestCase):
    def test_boundary_zero_accepts_empty_coverage(self): validate_current_snapshot(snap(weeks_fetched=[], games=[]),2025,2,0,{1,2})
    def test_wrong_season_fails(self):
        with self.assertRaises(ValueError): validate_current_snapshot(snap(season=2024),2025,2,1,{1,2})
    def test_missing_week_fails(self):
        with self.assertRaises(ValueError): validate_current_snapshot(snap(weeks_fetched=[]),2025,2,1,{1,2})
    def test_wrong_roster_fails(self):
        with self.assertRaises(ValueError):
            validate_current_snapshot(snap(games=[{"week":1,"rosterA":3,"rosterB":4,"matchup_id":1,"status":"final","scoreA":1,"scoreB":2}]),2025,2,1,{1,2})

    def test_raw_matchup_coverage_validator_matrix(self):
        owners = {1: 'A', 2: 'B'}
        valid = {1: [{'roster_id': 1, 'matchup_id': 1, 'points': 80}, {'roster_id': 2, 'matchup_id': 1, 'points': 75}]}
        _validate_raw_matchups(valid, owners, 1)
        _validate_raw_matchups({}, owners, 0)
        for bad in ({}, {1: valid[1][:1]}, {1: [dict(valid[1][0], roster_id=3), valid[1][1]]},
                    {1: [valid[1][0], dict(valid[1][1], roster_id=1)]},
                    {1: [dict(valid[1][0], matchup_id=None), valid[1][1]]},
                    {1: [dict(valid[1][0], matchup_id=True), valid[1][1]]}):
            with self.assertRaises(ValueError): _validate_raw_matchups(bad, owners, 1)
        for score in (None, True, '80', float('nan'), float('inf')):
            bad = {1: [dict(valid[1][0], points=score), valid[1][1]]}
            with self.assertRaises(ValueError): _validate_raw_matchups(bad, owners, 1)

    def test_classified_postseason_snapshot_and_raw_week_pass(self):
        snapshot = json.loads((Path(__file__).parents[1] / "assets" / "CurrentSeason.json").read_text())
        owners = {int(team["roster_id"]): team.get("owner", str(team["roster_id"])) for team in snapshot["teams"]}
        validate_current_snapshot(snapshot, 2025, 17, 15, set(owners))
        raw = {}
        for week in range(1, 16):
            raw[week] = []
            for index, roster_id in enumerate(sorted(owners), 1):
                raw[week].append({"roster_id": roster_id, "matchup_id": (index + 1) // 2, "points": float(index)})
        _validate_raw_matchups(raw, owners, 15)
        with self.assertRaises(ValueError): validate_current_snapshot({**snapshot, "games": [game for game in snapshot["games"] if not (game.get("week") == 15 and game.get("type") == "Playoff")]}, 2025, 17, 15, set(owners))
    def test_nonfinal_and_invalid_scores_fail(self):
        for status, score in [("live",1),("final",None),("final",float("nan")),("final",True)]:
            game={"week":1,"rosterA":1,"rosterB":2,"matchup_id":1,"status":status,"scoreA":score,"scoreB":2}
            with self.assertRaises(ValueError): validate_current_snapshot(snap(games=[game]),2025,2,1,{1,2})
    def test_duplicate_matchup_fails(self):
        game={"week":1,"rosterA":1,"rosterB":2,"matchup_id":1,"status":"final","scoreA":1,"scoreB":2}
        with self.assertRaises(ValueError): validate_current_snapshot(snap(games=[game,dict(game,rosterA=2,rosterB=1)]),2025,2,1,{1,2})
if __name__ == "__main__": unittest.main()
