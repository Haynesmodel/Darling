import argparse, json, pathlib, sys, tempfile, unittest
from datetime import date
from unittest.mock import patch
ROOT=pathlib.Path(__file__).parents[1]; sys.path.insert(0,str(ROOT/'scripts'))
import generate_current_season, generate_transaction_history, sleeper_to_h2h

class SharedBoundaryIntegrationTests(unittest.TestCase):
    def test_one_boundary_drives_h2h_current_and_transactions(self):
        matchups={1:[{"matchup_id":1,"roster_id":1,"points":80},{"matchup_id":1,"roster_id":2,"points":75}],2:[{"matchup_id":2,"roster_id":1,"points":12},{"matchup_id":2,"roster_id":2,"points":None}]}
        with tempfile.TemporaryDirectory() as tmp:
            root=pathlib.Path(tmp); mapping=root/'map.json'; mapping.write_text('{"1":"A","2":"B"}'); h2h=root/'h2h.json'; h2h.write_text('[]'); output=root/'h2h.out.json'
            teams=[{"roster_id":1,"display_name":"A","sleeper_team_name":""},{"roster_id":2,"display_name":"B","sleeper_team_name":""}]
            with patch.object(sleeper_to_h2h,'list_teams',return_value=teams), patch.object(sleeper_to_h2h,'get_matchups',side_effect=lambda _l,w:matchups[w]):
                with patch.object(sys,'argv',["sleeper_to_h2h.py","--league","x","--season","2025","--h2h",str(h2h),"--out",str(output),"--map",str(mapping),"--weeks","1-2","--max-week","2","--only-played","--completed-through-week","1"]): sleeper_to_h2h.main()
            self.assertEqual([row['week'] for row in json.loads(output.read_text())],[1])
            args=argparse.Namespace(league='x',season=2025,map=str(mapping),weeks='1-2',cutoff_date=None,current_week=2,regular_season_max_week=14,max_week=2,allow_postseason=False,h2h_fallback=None,completed_through_week=1,completion_basis='fixture')
            with patch.object(generate_current_season.sleeper,'list_teams',return_value=teams), patch.object(generate_current_season.sleeper,'get_matchups',side_effect=lambda _l,w:matchups[w]), patch.object(generate_current_season.sleeper,'sunday_for_week',side_effect=lambda _s,w:date(2025,9,7+(w-1)*7)): current=generate_current_season.build_current_season_asset(args)
            self.assertEqual([row['status'] for row in current['games']],['final','live']); self.assertIsNone(current['games'][1]['scoreB'])
            fixture=ROOT/'test/fixtures/transaction-history'; txargs=argparse.Namespace(league='12345',season=2025,map=str(fixture/'mapping.json'),max_week=2,current_season=str(fixture/'current-season.json'),out=str(root/'tx.json'),existing=None,draft_id=None,players_cache=None,fixture_dir=str(fixture),completed_through_week=1)
            result=generate_transaction_history.generate(txargs); self.assertEqual(result['seasons'][0]['coverage']['completed_week'],1)
if __name__=='__main__': unittest.main()
