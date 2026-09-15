import importlib.util
import json
import pathlib
import subprocess
import sys
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
SCRIPT = ROOT / 'scripts' / 'generate_season_summary_draft.py'

spec = importlib.util.spec_from_file_location('generate_season_summary_draft', SCRIPT)
module = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(module)


class GenerateSeasonSummaryDraftTests(unittest.TestCase):
    def test_bagels_count_only_exact_zero_scores(self):
        rows = module.derive_rows([
            {'season': 2025, 'teamA': 'Joe', 'teamB': 'Shap', 'scoreA': 0.0, 'scoreB': 90, 'type': 'Regular'},
            {'season': 2025, 'teamA': 'Joe', 'teamB': 'Shap', 'scoreA': 0.01, 'scoreB': 80, 'type': 'Regular'},
        ], [], 2025)

        self.assertEqual({row['owner']: row['bagels_earned'] for row in rows}, {'Joe': 1, 'Shap': 0})

    def test_cli_generates_deterministic_draft_and_preserves_manual_fields(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp = pathlib.Path(tmpdir)
            h2h_path = tmp / 'H2H.json'
            existing_path = tmp / 'SeasonSummary.json'
            out_path = tmp / 'SeasonSummary.draft.json'

            h2h_rows = [
                {'season': 2025, 'date': '2025-09-07', 'teamA': 'Joe', 'teamB': 'Shap', 'scoreA': 101, 'scoreB': 91, 'type': 'Regular', 'round': ''},
                {'season': 2025, 'date': '2025-09-14', 'teamA': 'Shap', 'teamB': 'Joe', 'scoreA': 0.0, 'scoreB': 88, 'type': 'Regular', 'round': ''},
                {'season': 2025, 'date': '2025-12-14', 'teamA': 'Joe', 'teamB': 'Shap', 'scoreA': 99, 'scoreB': 90, 'type': 'Playoff', 'round': 'Wild Card'},
                {'season': 2025, 'date': '2025-12-21', 'teamA': 'Shap', 'teamB': 'Joe', 'scoreA': 77, 'scoreB': 70, 'type': 'Saunders', 'round': 'Saunders Final'},
                {'season': 2024, 'date': '2024-09-07', 'teamA': 'Joe', 'teamB': 'Shap', 'scoreA': 200, 'scoreB': 100, 'type': 'Regular', 'round': ''},
            ]
            existing_rows = [
                {
                    'season': 2025,
                    'owner': 'Joe',
                    'wins': 999,
                    'losses': 999,
                    'ties': 999,
                    'points_for': 0,
                    'points_against': 0,
                    'playoff_wins': 0,
                    'playoff_losses': 0,
                    'saunders_wins': 0,
                    'saunders_losses': 0,
                    'finish': 1,
                    'champion': True,
                    'saunders': False,
                    'bye': True,
                    'saunders_bye': False,
                    'bagels_earned': 2,
                    'draft_pick': 10,
                    'wild_card': True,
                },
                {
                    'season': 2024,
                    'owner': 'Joe',
                    'wins': 12,
                    'losses': 2,
                    'ties': 0,
                    'points_for': 1234,
                    'points_against': 1111,
                    'playoff_wins': 2,
                    'playoff_losses': 0,
                    'saunders_wins': 0,
                    'saunders_losses': 0,
                    'finish': 1,
                    'champion': True,
                    'saunders': False,
                    'bye': True,
                    'saunders_bye': False,
                    'bagels_earned': 0,
                    'draft_pick': 9,
                    'wild_card': True,
                },
            ]

            h2h_path.write_text(json.dumps(h2h_rows), encoding='utf-8')
            existing_path.write_text(json.dumps(existing_rows), encoding='utf-8')

            result = subprocess.run(
                [sys.executable, str(SCRIPT), '--h2h', str(h2h_path), '--existing', str(existing_path), '--out', str(out_path), '--season', '2025'],
                capture_output=True,
                text=True,
                check=False,
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            output = out_path.read_text(encoding='utf-8')
            self.assertTrue(output.startswith('[\n  {\n'))
            self.assertTrue(output.endswith('\n'))

            rows = json.loads(output)
            self.assertEqual([row['owner'] for row in rows], ['Joe', 'Shap'])

            joe, shap = rows
            self.assertEqual(joe['wins'], 2)
            self.assertEqual(joe['losses'], 0)
            self.assertEqual(joe['ties'], 0)
            self.assertEqual(joe['points_for'], 189.0)
            self.assertEqual(joe['points_against'], 91.0)
            self.assertEqual(joe['playoff_wins'], 1)
            self.assertEqual(joe['playoff_losses'], 0)
            self.assertEqual(joe['saunders_wins'], 0)
            self.assertEqual(joe['saunders_losses'], 1)
            self.assertEqual(joe['finish'], 1)
            self.assertEqual(joe['champion'], True)
            self.assertEqual(joe['saunders'], False)
            self.assertEqual(joe['bye'], True)
            self.assertEqual(joe['saunders_bye'], False)
            self.assertEqual(joe['bagels_earned'], 2)
            self.assertEqual(joe['draft_pick'], 10)
            self.assertEqual(joe['wild_card'], True)

            self.assertEqual(shap['wins'], 0)
            self.assertEqual(shap['losses'], 2)
            self.assertEqual(shap['ties'], 0)
            self.assertEqual(shap['points_for'], 91.0)
            self.assertEqual(shap['points_against'], 189.0)
            self.assertEqual(shap['playoff_wins'], 0)
            self.assertEqual(shap['playoff_losses'], 1)
            self.assertEqual(shap['saunders_wins'], 1)
            self.assertEqual(shap['saunders_losses'], 0)
            self.assertIsNone(shap['finish'])
            self.assertIsNone(shap['champion'])
            self.assertIsNone(shap['saunders'])
            self.assertIsNone(shap['bye'])
            self.assertIsNone(shap['saunders_bye'])
            self.assertEqual(shap['bagels_earned'], 1)
            self.assertIsNone(shap['draft_pick'])
            self.assertIsNone(shap['wild_card'])


if __name__ == '__main__':
    unittest.main()
