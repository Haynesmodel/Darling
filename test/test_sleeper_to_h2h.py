import importlib.util
import pathlib
import sys
import unittest
import tempfile
import json
from types import SimpleNamespace
from unittest.mock import patch

ROOT = pathlib.Path(__file__).resolve().parents[1]
SCRIPT = ROOT / 'scripts' / 'sleeper_to_h2h.py'

spec = importlib.util.spec_from_file_location('sleeper_to_h2h', SCRIPT)
module = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(module)


class SleeperToH2HTests(unittest.TestCase):
    def test_2026_anchor_matches_the_published_week_1_sunday(self):
        self.assertEqual(module.sunday_for_week(2026, 1).isoformat(), '2026-09-13')
        self.assertEqual(module.sunday_for_week(2026, 17).isoformat(), '2027-01-03')

    def test_parse_weeks_supports_ranges_and_single_weeks(self):
        self.assertEqual(module.parse_weeks('1-3,5,7-8'), [1, 2, 3, 5, 7, 8])

    def test_pair_matchups_groups_by_matchup_id(self):
        matchups = [
            {'matchup_id': 1, 'roster_id': 2},
            {'matchup_id': 1, 'roster_id': 4},
            {'matchup_id': 2, 'roster_id': 6},
            {'matchup_id': 3, 'roster_id': 8},
            {'matchup_id': 3, 'roster_id': 10},
            {'roster_id': 12},
        ]

        self.assertEqual(module.pair_matchups(matchups), [
            (matchups[0], matchups[1]),
            (matchups[3], matchups[4]),
        ])

    def test_build_bracket_roster_pairs_filters_placement_rows(self):
        winners = [
            {'p': 0, 't1': 1, 't2': 4},
            {'p': 1, 'r': 3, 't1': 5, 't2': 6},
            {'p': 3, 'r': 3, 't1': 7, 't2': 8},
            {'p': 0, 't1': None, 't2': 7},
        ]
        losers = [
            {'p': 0, 't1': 2, 't2': 3},
            {'p': 1, 'r': 3, 't1': 6, 't2': 7},
            {'p': 5, 'r': 3, 't1': 8, 't2': 9},
        ]

        with patch.object(module, 'get_winners_bracket', return_value=winners), \
             patch.object(module, 'get_losers_bracket', return_value=losers):
            playoff_pairs, saunders_pairs = module.build_bracket_roster_pairs('league')

        self.assertEqual(playoff_pairs, {(1, 4), (5, 6)})
        self.assertEqual(saunders_pairs, {(2, 3), (6, 7)})

    def test_build_bracket_roster_pairs_rejects_coerced_metadata(self):
        for bad in (
            [{'p': True, 't1': 1, 't2': 2}],
            [{'p': 1.0, 't1': 1, 't2': 2}],
            [{'p': 1, 'r': 3.9, 't1': 1, 't2': 2}],
            [{'p': 1, 'r': 3, 't1': 1.5, 't2': 2}],
            [{'p': 1, 'r': 3, 't1': 1, 't2': 1}],
        ):
            with patch.object(module, 'get_winners_bracket', return_value=bad), patch.object(module, 'get_losers_bracket', return_value=[]):
                with self.assertRaises(ValueError): module.build_bracket_roster_pairs('league')

    def test_postseason_labels_match_the_league_mapping(self):
        self.assertEqual(module.postseason_label_for_week(15, 'Playoff'), 'Wild Card')
        self.assertEqual(module.postseason_label_for_week(16, 'Playoff'), 'Semi Final')
        self.assertEqual(module.postseason_label_for_week(17, 'Playoff'), 'Championship')
        self.assertEqual(module.postseason_label_for_week(15, 'Saunders'), 'Saunders Wild Card')
        self.assertEqual(module.postseason_label_for_week(17, 'Saunders'), 'Saunders Final')
        self.assertEqual(module.postseason_label_for_week(14, 'Playoff'), '')

    def test_classify_postseason_game_distinguishes_brackets(self):
        playoff_pairs = {(1, 4)}
        saunders_pairs = {(2, 3)}

        self.assertEqual(
            module.classify_postseason_game(4, 1, playoff_pairs, saunders_pairs, 15),
            ('Playoff', 'Wild Card'),
        )
        self.assertEqual(
            module.classify_postseason_game(3, 2, playoff_pairs, saunders_pairs, 17),
            ('Saunders', 'Saunders Final'),
        )
        self.assertEqual(
            module.classify_postseason_game(6, 7, playoff_pairs, saunders_pairs, 15),
            (None, ''),
        )

    def test_validate_completed_matchups_rejects_malformed_matrix_and_accepts_zero_zero(self):
        valid = [{'roster_id': 1, 'matchup_id': 1, 'points': 0}, {'roster_id': 2, 'matchup_id': 1, 'points': 0}]
        self.assertEqual(module.validate_completed_matchups(valid, [1, 2]), [(valid[0], valid[1])])
        cases = [
            [None, valid[1]],
            [dict(valid[0], roster_id=3), valid[1]],
            [dict(valid[0], roster_id=True), valid[1]],
            [valid[0], dict(valid[1], roster_id=1)],
            [dict(valid[0], matchup_id=None), valid[1]],
            [dict(valid[0], matchup_id=True), valid[1]],
            [dict(valid[0], matchup_id=[]), valid[1]],
            [valid[0]],
            [*valid, dict(valid[0], roster_id=3, matchup_id=2)],
        ]
        for points in (None, True, '0', float('nan'), float('inf')):
            cases.append([dict(valid[0], points=points), valid[1]])
        for rows in cases:
            with self.assertRaises(ValueError):
                module.validate_completed_matchups(rows, [1, 2])

    def test_game_key_normalizes_team_order(self):
        self.assertEqual(
            module.game_key({'season': 2025, 'week': 15, 'teamA': 'Shap', 'teamB': 'Joe'}),
            (2025, 15, 'Joe', 'Shap'),
        )

    def test_sort_h2h_rows_keeps_other_seasons_before_target_season(self):
        rows = [
            {'season': 2025, 'date': '2025-09-14', 'week': 2, 'teamA': 'B', 'teamB': 'A'},
            {'season': 2024, 'date': '2024-09-08', 'week': 1, 'teamA': 'Z', 'teamB': 'Y'},
            {'season': 2025, 'date': '2025-09-07', 'week': 1, 'teamA': 'A', 'teamB': 'B'},
        ]

        self.assertEqual(
            module.sort_h2h_rows(rows, 2025, 'season'),
            [
                {'season': 2024, 'date': '2024-09-08', 'week': 1, 'teamA': 'Z', 'teamB': 'Y'},
                {'season': 2025, 'date': '2025-09-07', 'week': 1, 'teamA': 'A', 'teamB': 'B'},
                {'season': 2025, 'date': '2025-09-14', 'week': 2, 'teamA': 'B', 'teamB': 'A'},
            ],
        )

    def test_sort_h2h_rows_global_orders_by_season_then_date(self):
        rows = [
            {'season': 2025, 'date': '2025-09-14', 'week': 2, 'teamA': 'B', 'teamB': 'A'},
            {'season': 2024, 'date': '2024-09-08', 'week': 1, 'teamA': 'Z', 'teamB': 'Y'},
            {'season': 2025, 'date': '2025-09-07', 'week': 1, 'teamA': 'A', 'teamB': 'B'},
        ]

        self.assertEqual(
            module.sort_h2h_rows(rows, 2025, 'global'),
            [
                {'season': 2024, 'date': '2024-09-08', 'week': 1, 'teamA': 'Z', 'teamB': 'Y'},
                {'season': 2025, 'date': '2025-09-07', 'week': 1, 'teamA': 'A', 'teamB': 'B'},
                {'season': 2025, 'date': '2025-09-14', 'week': 2, 'teamA': 'B', 'teamB': 'A'},
            ],
        )

    def test_append_requires_boundary_and_excludes_later_nonzero_week(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory); h2h = root / 'h2h.json'; out = root / 'out.json'; mapping = root / 'map.json'
            h2h.write_text('[]'); mapping.write_text('{"1":"A","2":"B"}')
            args = ['tool', '--league', 'league', '--season', '2025', '--h2h', str(h2h), '--out', str(out), '--map', str(mapping), '--weeks', '1-2', '--max-week', '2']
            with patch.object(sys, 'argv', args):
                with self.assertRaises(SystemExit): module.main()
            rows = {1: [{'roster_id': 1, 'matchup_id': 1, 'points': 80}], 2: [{'roster_id': 2, 'matchup_id': 1, 'points': 75}]}
            rows[1].append({'roster_id': 2, 'matchup_id': 1, 'points': 75})
            rows[2] = [{'roster_id': 1, 'matchup_id': 2, 'points': 90}, {'roster_id': 2, 'matchup_id': 2, 'points': 80}]
            teams = [{'roster_id': 1, 'display_name': 'A', 'sleeper_team_name': ''}, {'roster_id': 2, 'display_name': 'B', 'sleeper_team_name': ''}]
            args += ['--only-played', '--completed-through-week', '1']
            with patch.object(sys, 'argv', args), patch.object(module, 'list_teams', return_value=teams), patch.object(module, 'get_matchups', side_effect=lambda _l, week: rows[week]):
                module.main()
            self.assertEqual([row['week'] for row in json.loads(out.read_text())], [1])


if __name__ == '__main__':
    unittest.main()
