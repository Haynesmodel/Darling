import json, tempfile, unittest, sys, subprocess, os
from unittest.mock import patch
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parents[1]/'scripts'))
import reconcile_sleeper_history as recon
from reconcile_sleeper_history import load_fixture, reconcile

class ReconciliationFixtureTests(unittest.TestCase):
    def fixture(self,value):
        directory=tempfile.TemporaryDirectory(); path=Path(directory.name)/'source.json'; path.write_text(json.dumps(value),encoding='utf-8'); return directory,path
    def test_normalizes_orientation_ties_and_rounding(self):
        value={'retrieved_at':'2025-09-20T12:00:00Z','weeks':{'1':[{'roster_id':1,'matchup_id':7,'points':80.004},{'roster_id':2,'matchup_id':7,'points':75.125}]}}
        directory,path=self.fixture(value)
        try:
            rows,retrieved=load_fixture(path,2025,{'1':'Zed','2':'Amy'}); self.assertEqual(retrieved,value['retrieved_at'])
            self.assertEqual((rows[0]['teamA'], rows[0]['teamB'], rows[0]['scoreA'], rows[0]['scoreB']), ('Amy', 'Zed', 75.12, 80.0))
            reversed_candidate=[dict(rows[0], teamA='Zed', teamB='Amy', scoreA=80.0, scoreB=75.12, date='2025-09-08')]
            report=reconcile(rows,reversed_candidate,2025,retrieved_at=retrieved)
            self.assertEqual(report['summary']['different'],1)
            self.assertEqual((report['different'][0]['before']['teamA'], report['different'][0]['before']['scoreA']), ('Amy', 75.12))
            self.assertEqual((report['different'][0]['after']['teamA'], report['different'][0]['after']['scoreA']), ('Amy', 75.12))
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
        canonical = [row, dict(row, week=2, scoreA=3, scoreB=4, date="2025-09-14"), dict(row, week=4)]
        candidate = [dict(row, scoreA=9), dict(row, week=3, scoreA=5, scoreB=6), dict(row, week=4)]
        report = reconcile(canonical, candidate, 2025)
        self.assertEqual(report["summary"], {"matched": 1, "missing": 1, "new": 1, "different": 1})
        self.assertEqual(report["missing"][0]["before"], canonical[1])
        self.assertEqual(report["new"][0]["after"], candidate[1])

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

    def test_cli_output_safety_preserves_inputs_and_stale_outputs(self):
        directory = tempfile.TemporaryDirectory(); root = Path(directory.name)
        source = root/'source.json'; source.write_text(json.dumps({'retrieved_at':'2025-09-20T12:00:00Z','weeks':{'1':[{'roster_id':1,'matchup_id':1,'points':1},{'roster_id':2,'matchup_id':1,'points':2}]}}))
        mapping = root/'mapping.json'; mapping.write_text('{"1":"A","2":"B"}')
        assets = root/'assets'; assets.mkdir(); canonical = assets/'H2H.json'; canonical.write_text('[]')
        before = {path: path.read_bytes() for path in (source, mapping, canonical)}
        invalid_candidates = [mapping, source, canonical, assets/'direct.json', assets/'nested'/'report.json']
        for target in invalid_candidates:
            argv = ['tool', '--season', '2025', '--mapping', str(mapping), '--canonical', str(canonical),
                    '--source-fixture', str(source), '--out', str(root/'report.json'), '--out-candidate', str(target)]
            with patch.object(sys, 'argv', argv):
                self.assertEqual(recon.main(), 2)
        argv = ['tool', '--season', '2025', '--mapping', str(mapping), '--canonical', str(canonical),
                '--source-fixture', str(source), '--out', str(root/'same.json'), '--out-candidate', str(root/'same.json')]
        with patch.object(sys, 'argv', argv): self.assertEqual(recon.main(), 2)
        stale_report = root/'stale-report.json'; stale_candidate = root/'stale-candidate.json'
        stale_report.write_bytes(b'old report'); stale_candidate.write_bytes(b'old candidate')
        bad_source = root/'bad.json'; bad_source.write_bytes(b'not json')
        argv = ['tool', '--season', '2025', '--mapping', str(mapping), '--canonical', str(canonical),
                '--source-fixture', str(bad_source), '--out', str(stale_report), '--out-candidate', str(stale_candidate)]
        with patch.object(sys, 'argv', argv): self.assertEqual(recon.main(), 2)
        self.assertEqual(stale_report.read_bytes(), b'old report'); self.assertEqual(stale_candidate.read_bytes(), b'old candidate')
        self.assertEqual({path: path.read_bytes() for path in before}, before)
        self.assertFalse(list(root.rglob('.tmp*')))
        directory.cleanup()

    def test_live_fixture_checks_season_and_classifies_postseason(self):
        class Response:
            def __init__(self, value): self.value = value; self.headers = {}
            def __enter__(self): return self
            def __exit__(self, *args): return False
            def read(self, limit): return json.dumps(self.value).encode()
        def fake_open(request, timeout=0):
            self.assertEqual(timeout, 30)
            url = request.full_url
            if url.endswith('/league/league'): return Response({'season': '2025'})
            if url.endswith('/winners_bracket'): return Response([{'p': 0, 't1': 1, 't2': 2}])
            if url.endswith('/losers_bracket'): return Response([{'p': 0, 't1': 3, 't2': 4}])
            if url.endswith('/matchups/1') or url.endswith('/matchups/15'):
                rows = [{'roster_id': 1, 'matchup_id': 7, 'points': 80}, {'roster_id': 2, 'matchup_id': 7, 'points': 75}]
                if url.endswith('/matchups/15'):
                    rows += [{'roster_id': 3, 'matchup_id': 8, 'points': 70}, {'roster_id': 4, 'matchup_id': 8, 'points': 65}]
                return Response(rows)
            raise AssertionError(url)
        with patch.object(recon, 'urlopen', fake_open):
            rows, retrieved = recon._live_fixture('league', 2025, [1, 15], {'1': 'A', '2': 'B', '3': 'C', '4': 'D'})
        self.assertEqual(len(rows), 3)
        self.assertEqual(rows[0]['type'], 'Regular')
        self.assertEqual(rows[1]['type'], 'Playoff')
        self.assertEqual(rows[1]['round'], 'Wild Card')
        self.assertEqual(rows[2]['type'], 'Saunders')
        self.assertEqual(rows[2]['round'], 'Saunders Wild Card')
        self.assertTrue(retrieved.endswith('Z'))

    def test_bounded_http_rejects_bad_payloads_and_sets_headers(self):
        class Response:
            def __init__(self, body, headers=None): self.body = body; self.headers = headers or {}
            def __enter__(self): return self
            def __exit__(self, *args): return False
            def read(self, limit): return self.body
        seen = []
        def call(response):
            def fake(request, timeout=0):
                seen.append((request.headers.get('User-agent'), timeout)); return response
            with patch.object(recon, 'urlopen', fake):
                with self.assertRaises(ValueError): recon._fetch_json('https://example.test', list)
        call(Response(b'not json')); call(Response(b'[]', {'Content-Length': str(recon.MAX_RESPONSE_BYTES + 1)}))
        call(Response(b'x' * (recon.MAX_RESPONSE_BYTES + 1))); call(Response(b'{}'))
        self.assertEqual(len(seen), 4)
        self.assertTrue(all(timeout == 30 and agent for agent, timeout in seen))

    def test_live_postseason_malformed_group_is_not_silently_dropped(self):
        class Response:
            headers = {}
            def __init__(self, value): self.value = value
            def __enter__(self): return self
            def __exit__(self, *args): return False
            def read(self, limit): return json.dumps(self.value).encode()
        def fake_open(request, timeout=0):
            url = request.full_url
            if url.endswith('/league/league'): return Response({'season': '2025'})
            if url.endswith('/winners_bracket'): return Response([{'p': 0, 't1': 1, 't2': 2}])
            if url.endswith('/losers_bracket'): return Response([])
            if url.endswith('/matchups/15'):
                return Response([{'roster_id': 1, 'matchup_id': 7, 'points': 80}, {'roster_id': 2, 'matchup_id': 7, 'points': 75}, {'roster_id': 1, 'matchup_id': 8, 'points': 70}])
            raise AssertionError(url)
        with patch.object(recon, 'urlopen', fake_open):
            with self.assertRaises(ValueError): recon._live_fixture('league', 2025, [15], {'1': 'A', '2': 'B'})

    def test_postseason_null_matchup_rows_are_ignored_but_regular_null_is_rejected(self):
        value = {'retrieved_at': '2025-09-20T12:00:00Z', 'weeks': {
            '15': [
                {'roster_id': 1, 'matchup_id': 7, 'points': 80},
                {'roster_id': 2, 'matchup_id': 7, 'points': 75},
                {'roster_id': 3, 'matchup_id': None, 'points': 0},
            ]}}
        directory, path = self.fixture(value)
        try:
            rows, _ = load_fixture(path, 2025, {'1': 'A', '2': 'B', '3': 'C'})
            self.assertEqual(len(rows), 1)
        finally:
            directory.cleanup()
        value['weeks'] = {'1': value['weeks']['15']}
        directory, path = self.fixture(value)
        try:
            with self.assertRaises(ValueError): load_fixture(path, 2025, {'1': 'A', '2': 'B', '3': 'C'})
        finally:
            directory.cleanup()
        value['weeks'] = {'15': [
            {'roster_id': 1, 'matchup_id': None, 'points': 1},
            {'roster_id': 1, 'matchup_id': None, 'points': 2},
        ]}
        directory, path = self.fixture(value)
        try:
            with self.assertRaises(ValueError): load_fixture(path, 2025, {'1': 'A'})
        finally:
            directory.cleanup()

    def test_live_postseason_null_rows_are_ignored(self):
        class Response:
            headers = {}
            def __init__(self, value): self.value = value
            def __enter__(self): return self
            def __exit__(self, *args): return False
            def read(self, limit): return json.dumps(self.value).encode()
        def fake_open(request, timeout=0):
            url = request.full_url
            if url.endswith('/league/league'): return Response({'season': '2025'})
            if url.endswith('/winners_bracket'): return Response([{'p': 0, 't1': 1, 't2': 2}])
            if url.endswith('/losers_bracket'): return Response([])
            if url.endswith('/matchups/15'):
                return Response([{'roster_id': 1, 'matchup_id': 1, 'points': 80}, {'roster_id': 2, 'matchup_id': 1, 'points': 75}, {'roster_id': 3, 'matchup_id': None, 'points': 0}])
            raise AssertionError(url)
        with patch.object(recon, 'urlopen', fake_open):
            rows, _ = recon._live_fixture('league', 2025, [15], {'1': 'A', '2': 'B', '3': 'C'})
        self.assertEqual(len(rows), 1)

if __name__=='__main__': unittest.main()
