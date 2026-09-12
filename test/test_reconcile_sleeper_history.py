import json, tempfile, unittest, sys, subprocess
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
            rows,retrieved=load_fixture(path,2025,{'1':'Zed','2':'Amy'}); self.assertEqual(retrieved,value['retrieved_at']); self.assertEqual(rows[0]['teamA'],'Zed')
            reversed_candidate=[dict(rows[0], teamA='Amy', teamB='Zed', scoreA=80.00, scoreB=80.004)]
            self.assertEqual(reconcile(rows,reversed_candidate,2025,retrieved_at=retrieved)['summary']['matched'],1)
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

    def test_rejects_duplicates_and_invalid_points_metadata(self):
        base = lambda rows, metadata=None: {"retrieved_at": "2025-09-20T12:00:00Z", "weeks": {"1": rows}, **({"metadata": metadata} if metadata is not None else {})}
        rows = [{"roster_id": 1, "matchup_id": 1, "points": 1}, {"roster_id": 2, "matchup_id": 1, "points": 2}]
        for extra in ([{"roster_id": 1, "matchup_id": 2, "points": 3}, {"roster_id": 2, "matchup_id": 2, "points": 4}], rows[:1]):
            directory, path = self.fixture(base(rows + extra))
            try:
                with self.assertRaises(ValueError): load_fixture(path, 2025, {"1": "A", "2": "B"})
            finally: directory.cleanup()
        for points in (None, True, "1", float("nan"), float("inf")):
            bad = [{"roster_id": 1, "matchup_id": 1, "points": points}, {"roster_id": 2, "matchup_id": 1, "points": 2}]
            directory, path = self.fixture(base(bad))
            try:
                with self.assertRaises(ValueError): load_fixture(path, 2025, {"1": "A", "2": "B"})
            finally: directory.cleanup()
        for metadata in ({"1": {"1": {"date": "bad"}}}, {"1": {"1": {"type": "Other"}}}, {"1": {"1": []}}):
            directory, path = self.fixture(base(rows, metadata))
            try:
                with self.assertRaises(ValueError): load_fixture(path, 2025, {"1": "A", "2": "B"})
            finally: directory.cleanup()

    def test_duplicate_candidate_key_is_rejected(self):
        value = {"retrieved_at": "2025-09-20T12:00:00Z", "weeks": {"1": [{"roster_id": 1, "matchup_id": 1, "points": 80}, {"roster_id": 2, "matchup_id": 1, "points": 75}]}}
        directory, path = self.fixture(value)
        try:
            rows, _ = load_fixture(path, 2025, {"1": "A", "2": "B"})
            with self.assertRaises(ValueError): reconcile(rows, rows + [dict(rows[0])], 2025)
        finally: directory.cleanup()

    def test_combined_counts_and_payloads(self):
        row = {"season": 2025, "week": 1, "teamA": "A", "teamB": "B", "scoreA": 1, "scoreB": 2, "date": "2025-09-07", "type": "Regular", "round": None}
        canonical = [row, dict(row, week=2, scoreA=3, scoreB=4, date="2025-09-14")]
        candidate = [row, dict(row, week=2, scoreA=9), dict(row, week=3, scoreA=5, scoreB=6)]
        report = reconcile(canonical, candidate, 2025)
        self.assertEqual(report["summary"], {"matched": 1, "missing": 0, "new": 1, "different": 1})
        self.assertEqual(report["new"][0]["after"], candidate[2])

    def test_duplicate_canonical_and_invalid_round_rejected(self):
        row = {"season": 2025, "week": 1, "teamA": "A", "teamB": "B", "scoreA": 1, "scoreB": 2, "date": "2025-09-07", "type": "Regular", "round": None}
        with self.assertRaises(ValueError): reconcile([row, dict(row)], [], 2025)
        value = {"retrieved_at": "2025-09-20T12:00:00Z", "weeks": {"1": [{"roster_id": 1, "matchup_id": 1, "points": 1}, {"roster_id": 2, "matchup_id": 1, "points": 2}]}, "metadata": {"1": {"1": {"type": "Playoff", "round": "Bad"}}}}
        directory, path = self.fixture(value)
        try:
            with self.assertRaises(ValueError): load_fixture(path, 2025, {"1": "A", "2": "B"})
        finally: directory.cleanup()

    def test_cli_fixture_writes_candidate(self):
        directory = tempfile.TemporaryDirectory(); root = Path(directory.name)
        source = root/'source.json'; source.write_text(json.dumps({'retrieved_at':'2025-09-20T12:00:00Z','weeks':{'1':[{'roster_id':1,'matchup_id':1,'points':1},{'roster_id':2,'matchup_id':1,'points':2}]}}))
        mapping = root/'mapping.json'; mapping.write_text('{"1":"A","2":"B"}'); (root/'assets').mkdir(); canonical = root/'assets'/'canonical.json'; canonical.write_text('[]'); report = root/'report.json'; candidate = root/'candidate.json'
        command=[sys.executable,str(Path(__file__).parents[1]/'scripts/reconcile_sleeper_history.py'),'--season','2025','--mapping',str(mapping),'--canonical',str(canonical),'--source-fixture',str(source),'--out',str(report),'--out-candidate',str(candidate)]
        completed = subprocess.run(command, capture_output=True, text=True)
        self.assertEqual(completed.returncode, 0, completed.stderr)
        self.assertEqual(json.loads(candidate.read_text())[0]['teamA'],'A')
        self.assertEqual(json.loads(report.read_text())['retrieved_at'], '2025-09-20T12:00:00Z')
        directory.cleanup()

    def test_cli_live_requires_explicit_opt_in(self):
        directory = tempfile.TemporaryDirectory(); root = Path(directory.name)
        mapping = root/'mapping.json'; mapping.write_text('{"1":"A","2":"B"}')
        canonical = root/'assets'/'H2H.json'; canonical.parent.mkdir(); canonical.write_text('[]')
        command = [sys.executable, str(Path(__file__).parents[1]/'scripts/reconcile_sleeper_history.py'),
                   '--season', '2025', '--mapping', str(mapping), '--canonical', str(canonical),
                   '--live-league', 'league', '--out', str(root/'report.json')]
        completed = subprocess.run(command, capture_output=True, text=True)
        self.assertNotEqual(completed.returncode, 0)
        self.assertIn('--allow-live', completed.stderr)
        self.assertFalse((root/'report.json').exists())
        directory.cleanup()

if __name__=='__main__': unittest.main()
