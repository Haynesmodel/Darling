import importlib.util
import pathlib
import sys
import unittest
from unittest.mock import patch

ROOT = pathlib.Path(__file__).resolve().parents[1]
SCRIPT = ROOT / 'scripts' / 'sleeper_to_h2h.py'

spec = importlib.util.spec_from_file_location('sleeper_to_h2h', SCRIPT)
module = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(module)


class SleeperToH2HTests(unittest.TestCase):
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
            {'p': 1, 't1': 5, 't2': 6},
            {'p': 0, 't1': None, 't2': 7},
        ]
        losers = [
            {'p': 0, 't1': 2, 't2': 3},
            {'p': 2, 't1': 6, 't2': 7},
        ]

        with patch.object(module, 'get_winners_bracket', return_value=winners), \
             patch.object(module, 'get_losers_bracket', return_value=losers):
            playoff_pairs, saunders_pairs = module.build_bracket_roster_pairs('league')

        self.assertEqual(playoff_pairs, {(1, 4)})
        self.assertEqual(saunders_pairs, {(2, 3)})

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


if __name__ == '__main__':
    unittest.main()
