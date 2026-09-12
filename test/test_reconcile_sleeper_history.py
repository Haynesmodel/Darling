import json, tempfile, unittest, sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parents[1]/'scripts'))
from reconcile_sleeper_history import load_fixture, reconcile

class ReconciliationFixtureTests(unittest.TestCase):
    def fixture(self,value):
        directory=tempfile.TemporaryDirectory(); path=Path(directory.name)/'source.json'; path.write_text(json.dumps(value),encoding='utf-8'); return directory,path
    def test_normalizes_orientation_ties_and_rounding(self):
        value={'retrieved_at':'2025-09-20T12:00:00Z','weeks':{'1':[{'roster_id':1,'matchup_id':7,'points':80.004},{'roster_id':2,'matchup_id':7,'points':80.005}]}}
        directory,path=self.fixture(value)
        try:
            rows,retrieved=load_fixture(path,2025,{'1':'Zed','2':'Amy'}); self.assertEqual(retrieved,value['retrieved_at']); self.assertEqual(rows[0]['teamA'],'Zed'); self.assertEqual(reconcile(rows,rows,2025,retrieved_at=retrieved)['summary']['matched'],1)
        finally: directory.cleanup()
    def test_reports_field_difference(self):
        value={'retrieved_at':'2025-09-20T12:00:00Z','weeks':{'1':[{'roster_id':1,'matchup_id':7,'points':80},{'roster_id':2,'matchup_id':7,'points':75}]}}
        directory,path=self.fixture(value)
        try:
            rows,_=load_fixture(path,2025,{'1':'A','2':'B'}); report=reconcile(rows,[dict(rows[0],date='2025-09-08',type='Playoff',round='Wild Card')],2025); self.assertEqual(report['summary']['different'],1)
        finally: directory.cleanup()
    def test_rejects_bad_fixture_rows(self):
        cases=[{'retrieved_at':'bad','weeks':{}},{'retrieved_at':'2025-09-20T12:00:00Z','weeks':{'1':[{'roster_id':1,'matchup_id':1,'points':1}]}},{'retrieved_at':'2025-09-20T12:00:00Z','weeks':{'1':[{'roster_id':3,'matchup_id':1,'points':1},{'roster_id':2,'matchup_id':1,'points':1}]}}]
        for value in cases:
            directory,path=self.fixture(value)
            try:
                with self.assertRaises(ValueError): load_fixture(path,2025,{'1':'A','2':'B'})
            finally: directory.cleanup()
if __name__=='__main__': unittest.main()
