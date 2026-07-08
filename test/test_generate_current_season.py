import importlib.util
import json
import pathlib
import sys
import tempfile
import unittest
from datetime import date
from types import SimpleNamespace
from unittest.mock import patch

ROOT = pathlib.Path(__file__).resolve().parents[1]
SCRIPT_DIR = ROOT / 'scripts'
SCRIPT = SCRIPT_DIR / 'generate_current_season.py'
sys.path.insert(0, str(SCRIPT_DIR))

spec = importlib.util.spec_from_file_location('generate_current_season', SCRIPT)
module = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(module)


class GenerateCurrentSeasonTests(unittest.TestCase):
    def test_build_current_season_asset_keeps_scheduled_scores_null(self):
        with tempfile.TemporaryDirectory() as tmp:
            mapping_path = pathlib.Path(tmp) / 'mapping.json'
            mapping_path.write_text('{"1":"Joe","2":"Shap","3":"Nuss","4":"Joel"}', encoding='utf-8')

            args = SimpleNamespace(
                league='league',
                season=2025,
                map=str(mapping_path),
                weeks='1-2',
                cutoff_date='2025-09-07',
                current_week=None,
                regular_season_max_week=14,
                max_week=17,
                allow_postseason=False,
                h2h_fallback=None,
            )

            teams = [
                {'roster_id': 1, 'owner_user_id': 'u1', 'display_name': 'Joe', 'username': 'joe', 'sleeper_team_name': ''},
                {'roster_id': 2, 'owner_user_id': 'u2', 'display_name': 'Shap', 'username': 'shap', 'sleeper_team_name': ''},
                {'roster_id': 3, 'owner_user_id': 'u3', 'display_name': 'Nuss', 'username': 'nuss', 'sleeper_team_name': ''},
                {'roster_id': 4, 'owner_user_id': 'u4', 'display_name': 'Joel', 'username': 'joel', 'sleeper_team_name': ''},
            ]

            def matchups(_league, week):
                if week == 1:
                    return [
                        {'matchup_id': 1, 'roster_id': 1, 'points': 100},
                        {'matchup_id': 1, 'roster_id': 2, 'points': 90},
                    ]
                return [
                    {'matchup_id': 2, 'roster_id': 3, 'points': 0},
                    {'matchup_id': 2, 'roster_id': 4, 'points': 0},
                ]

            with patch.object(module.sleeper, 'list_teams', return_value=teams), \
                 patch.object(module.sleeper, 'get_matchups', side_effect=matchups), \
                 patch.object(module.sleeper, 'sunday_for_week', side_effect=lambda _season, week: date(2025, 9, 7 + (7 * (week - 1)))):
                asset = module.build_current_season_asset(args)

            self.assertEqual(asset['source'], 'sleeper')
            self.assertEqual(asset['season'], 2025)
            self.assertEqual(asset['current_week'], 2)
            self.assertEqual(asset['games'][0]['status'], 'final')
            self.assertEqual(asset['games'][0]['scoreA'], 100.0)
            self.assertEqual(asset['games'][1]['status'], 'scheduled')
            self.assertIsNone(asset['games'][1]['scoreA'])
            self.assertIsNone(asset['games'][1]['scoreB'])

    def test_build_current_season_asset_uses_current_week_as_live_boundary(self):
        with tempfile.TemporaryDirectory() as tmp:
            mapping_path = pathlib.Path(tmp) / 'mapping.json'
            mapping_path.write_text('{"1":"Joe","2":"Shap","3":"Nuss","4":"Joel"}', encoding='utf-8')

            args = SimpleNamespace(
                league='league',
                season=2025,
                map=str(mapping_path),
                weeks='1-3',
                cutoff_date='2025-08-01',
                current_week=2,
                regular_season_max_week=14,
                max_week=17,
                allow_postseason=False,
                h2h_fallback=None,
            )

            teams = [
                {'roster_id': 1, 'display_name': 'Joe', 'sleeper_team_name': ''},
                {'roster_id': 2, 'display_name': 'Shap', 'sleeper_team_name': ''},
                {'roster_id': 3, 'display_name': 'Nuss', 'sleeper_team_name': ''},
                {'roster_id': 4, 'display_name': 'Joel', 'sleeper_team_name': ''},
            ]

            def matchups(_league, week):
                rows = {
                    1: [
                        {'matchup_id': 1, 'roster_id': 1, 'points': 100},
                        {'matchup_id': 1, 'roster_id': 2, 'points': 90},
                    ],
                    2: [
                        {'matchup_id': 2, 'roster_id': 3, 'points': 101.5},
                        {'matchup_id': 2, 'roster_id': 4, 'points': 98.25},
                    ],
                    3: [
                        {'matchup_id': 3, 'roster_id': 1, 'points': 120},
                        {'matchup_id': 3, 'roster_id': 3, 'points': 95},
                    ],
                }
                return rows[week]

            with patch.object(module.sleeper, 'list_teams', return_value=teams), \
                 patch.object(module.sleeper, 'get_matchups', side_effect=matchups), \
                 patch.object(module.sleeper, 'sunday_for_week', side_effect=lambda _season, week: date(2025, 9, 7 + (7 * (week - 1)))):
                asset = module.build_current_season_asset(args)

            self.assertEqual(asset['current_week'], 2)
            self.assertEqual(asset['games'][0]['status'], 'final')
            self.assertEqual(asset['games'][1]['status'], 'live')
            self.assertEqual(asset['games'][1]['scoreA'], 101.5)
            self.assertEqual(asset['games'][2]['status'], 'scheduled')
            self.assertIsNone(asset['games'][2]['scoreA'])

    def test_build_current_season_asset_keeps_completed_later_weeks_with_stale_current_week(self):
        with tempfile.TemporaryDirectory() as tmp:
            mapping_path = pathlib.Path(tmp) / 'mapping.json'
            mapping_path.write_text('{"1":"Joe","2":"Shap"}', encoding='utf-8')

            args = SimpleNamespace(
                league='league',
                season=2025,
                map=str(mapping_path),
                weeks='17',
                cutoff_date='2026-06-17',
                current_week=16,
                regular_season_max_week=14,
                max_week=17,
                allow_postseason=True,
                h2h_fallback=None,
            )

            teams = [
                {'roster_id': 1, 'display_name': 'Joe', 'sleeper_team_name': ''},
                {'roster_id': 2, 'display_name': 'Shap', 'sleeper_team_name': ''},
            ]

            with patch.object(module.sleeper, 'list_teams', return_value=teams), \
                 patch.object(module.sleeper, 'get_matchups', return_value=[
                     {'matchup_id': 1, 'roster_id': 1, 'points': 120},
                     {'matchup_id': 1, 'roster_id': 2, 'points': 100},
                 ]), \
                 patch.object(module.sleeper, 'sunday_for_week', return_value=date(2025, 12, 28)), \
                 patch.object(module.sleeper, 'build_bracket_roster_pairs', return_value=({(1, 2)}, set())):
                asset = module.build_current_season_asset(args)

            self.assertEqual(asset['games'][0]['status'], 'final')
            self.assertEqual(asset['games'][0]['scoreA'], 120.0)

    def test_build_current_season_asset_uses_h2h_fallback_for_missing_postseason_classification(self):
        with tempfile.TemporaryDirectory() as tmp:
            mapping_path = pathlib.Path(tmp) / 'mapping.json'
            mapping_path.write_text('{"1":"Zook","2":"Singer"}', encoding='utf-8')
            h2h_path = pathlib.Path(tmp) / 'H2H.json'
            h2h_path.write_text(json.dumps([{
                'season': 2025,
                'date': '2025-12-28',
                'teamA': 'Zook',
                'teamB': 'Singer',
                'scoreA': 153.74,
                'scoreB': 91.78,
                'week': 17,
                'round': 'Championship',
                'type': 'Playoff',
            }]), encoding='utf-8')

            args = SimpleNamespace(
                league='league',
                season=2025,
                map=str(mapping_path),
                weeks='17',
                cutoff_date='2026-06-17',
                current_week=16,
                regular_season_max_week=14,
                max_week=17,
                allow_postseason=True,
                h2h_fallback=str(h2h_path),
            )

            teams = [
                {'roster_id': 1, 'display_name': 'Zook', 'sleeper_team_name': ''},
                {'roster_id': 2, 'display_name': 'Singer', 'sleeper_team_name': ''},
            ]

            with patch.object(module.sleeper, 'list_teams', return_value=teams), \
                 patch.object(module.sleeper, 'get_matchups', return_value=[
                     {'matchup_id': 1, 'roster_id': 1, 'points': 153.74},
                     {'matchup_id': 1, 'roster_id': 2, 'points': 91.78},
                 ]), \
                 patch.object(module.sleeper, 'sunday_for_week', return_value=date(2025, 12, 28)), \
                 patch.object(module.sleeper, 'build_bracket_roster_pairs', return_value=(set(), set())):
                asset = module.build_current_season_asset(args)

            self.assertEqual(asset['current_week'], 16)
            self.assertEqual(asset['games'][0]['type'], 'Playoff')
            self.assertEqual(asset['games'][0]['round'], 'Championship')
            self.assertEqual(asset['games'][0]['status'], 'final')

    def test_build_current_season_asset_fails_when_postseason_week_has_no_classified_games(self):
        with tempfile.TemporaryDirectory() as tmp:
            mapping_path = pathlib.Path(tmp) / 'mapping.json'
            mapping_path.write_text('{"1":"Joe","2":"Shap"}', encoding='utf-8')

            args = SimpleNamespace(
                league='league',
                season=2025,
                map=str(mapping_path),
                weeks='17',
                cutoff_date='2026-06-17',
                current_week=None,
                regular_season_max_week=14,
                max_week=17,
                allow_postseason=True,
                h2h_fallback=None,
            )

            teams = [
                {'roster_id': 1, 'display_name': 'Joe', 'sleeper_team_name': ''},
                {'roster_id': 2, 'display_name': 'Shap', 'sleeper_team_name': ''},
            ]

            with patch.object(module.sleeper, 'list_teams', return_value=teams), \
                 patch.object(module.sleeper, 'get_matchups', return_value=[
                     {'matchup_id': 1, 'roster_id': 1, 'points': 120},
                     {'matchup_id': 1, 'roster_id': 2, 'points': 100},
                 ]), \
                 patch.object(module.sleeper, 'sunday_for_week', return_value=date(2025, 12, 28)), \
                 patch.object(module.sleeper, 'build_bracket_roster_pairs', return_value=(set(), set())):
                with self.assertRaisesRegex(ValueError, 'postseason week 17 yielded zero classified games'):
                    module.build_current_season_asset(args)


if __name__ == '__main__':
    unittest.main()
