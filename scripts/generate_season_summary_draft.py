#!/usr/bin/env python3
"""Generate a draft SeasonSummary JSON from the canonical H2H records."""

from __future__ import annotations

import argparse
import json
from collections import defaultdict
from pathlib import Path
from typing import Any


MANUAL_FIELDS = [
    'finish',
    'champion',
    'saunders',
    'bye',
    'saunders_bye',
    'bagels_earned',
    'draft_pick',
    'wild_card',
]


def read_json(path: Path) -> Any:
    with path.open('r', encoding='utf-8') as handle:
        return json.load(handle)


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('w', encoding='utf-8') as handle:
        json.dump(data, handle, ensure_ascii=False, indent=2)
        handle.write('\n')


def is_regular(game: dict[str, Any]) -> bool:
    return str(game.get('type') or '').strip().lower() == 'regular'


def is_saunders(game: dict[str, Any]) -> bool:
    round_name = str(game.get('round') or '').strip().lower()
    game_type = str(game.get('type') or '').strip().lower()
    return game_type == 'saunders' or 'saunders' in round_name


def is_third_place(game: dict[str, Any]) -> bool:
    return 'third place' in str(game.get('round') or '').strip().lower()


def is_playoff(game: dict[str, Any]) -> bool:
    return not is_regular(game) and not is_saunders(game)


def season_value(row: dict[str, Any]) -> int:
    try:
        return int(row.get('season') or -1)
    except (TypeError, ValueError):
        return -1


def row_lookup(existing_rows: list[dict[str, Any]], season: int) -> dict[str, dict[str, Any]]:
    lookup: dict[str, dict[str, Any]] = {}
    for row in existing_rows:
        if season_value(row) != season:
            continue
        owner = row.get('owner')
        if isinstance(owner, str) and owner not in lookup:
            lookup[owner] = row
    return lookup


def row_order(existing_rows: list[dict[str, Any]], season: int) -> dict[str, int]:
    order: dict[str, int] = {}
    index = 0
    for row in existing_rows:
        if season_value(row) != season:
            continue
        owner = row.get('owner')
        if isinstance(owner, str) and owner not in order:
            order[owner] = index
            index += 1
    return order


def derive_rows(h2h_rows: list[dict[str, Any]], existing_rows: list[dict[str, Any]], season: int) -> list[dict[str, Any]]:
    season_games = [row for row in h2h_rows if season_value(row) == season]
    if not season_games:
        raise ValueError(f'No H2H rows found for season {season}.')

    teams = sorted({
        str(team).strip()
        for game in season_games
        for team in (game.get('teamA'), game.get('teamB'))
        if isinstance(team, str) and team.strip()
    })
    existing_by_owner = row_lookup(existing_rows, season)
    existing_order = row_order(existing_rows, season)

    derived = defaultdict(lambda: {
        'wins': 0,
        'losses': 0,
        'ties': 0,
        'points_for': 0.0,
        'points_against': 0.0,
        'playoff_wins': 0,
        'playoff_losses': 0,
        'saunders_wins': 0,
        'saunders_losses': 0,
    })

    for game in season_games:
        if is_third_place(game):
            continue

        team_a = str(game.get('teamA'))
        team_b = str(game.get('teamB'))
        score_a = float(game.get('scoreA') or 0)
        score_b = float(game.get('scoreB') or 0)

        if is_regular(game):
            a = derived[team_a]
            b = derived[team_b]
            a['points_for'] += score_a
            a['points_against'] += score_b
            b['points_for'] += score_b
            b['points_against'] += score_a
            if score_a > score_b:
                a['wins'] += 1
                b['losses'] += 1
            elif score_b > score_a:
                a['losses'] += 1
                b['wins'] += 1
            else:
                a['ties'] += 1
                b['ties'] += 1
            continue

        if is_saunders(game):
            a = derived[team_a]
            b = derived[team_b]
            if score_a > score_b:
                a['saunders_wins'] += 1
                b['saunders_losses'] += 1
            elif score_b > score_a:
                a['saunders_losses'] += 1
                b['saunders_wins'] += 1
            continue

        a = derived[team_a]
        b = derived[team_b]
        if score_a > score_b:
            a['playoff_wins'] += 1
            b['playoff_losses'] += 1
        elif score_b > score_a:
            a['playoff_losses'] += 1
            b['playoff_wins'] += 1

    ordered_owners = sorted(
        teams,
        key=lambda owner: (existing_order.get(owner, 10_000), owner),
    )

    rows = []
    for owner in ordered_owners:
        base = {
            'season': season,
            'owner': owner,
            'wins': derived[owner]['wins'],
            'losses': derived[owner]['losses'],
            'ties': derived[owner]['ties'],
            'points_for': round(derived[owner]['points_for'], 2),
            'points_against': round(derived[owner]['points_against'], 2),
            'playoff_wins': derived[owner]['playoff_wins'],
            'playoff_losses': derived[owner]['playoff_losses'],
            'saunders_wins': derived[owner]['saunders_wins'],
            'saunders_losses': derived[owner]['saunders_losses'],
        }
        manual = existing_by_owner.get(owner, {})
        for field in MANUAL_FIELDS:
            base[field] = manual.get(field) if field in manual else None
        rows.append(base)

    return rows


def main() -> int:
    parser = argparse.ArgumentParser(description='Generate a draft SeasonSummary.json file from H2H data.')
    parser.add_argument('--h2h', required=True, type=Path, help='Path to assets/H2H.json')
    parser.add_argument('--existing', required=True, type=Path, help='Path to assets/SeasonSummary.json')
    parser.add_argument('--out', required=True, type=Path, help='Path to write the draft JSON file')
    parser.add_argument('--season', required=True, type=int, help='Season to generate')
    args = parser.parse_args()

    h2h_rows = read_json(args.h2h)
    existing_rows = read_json(args.existing)
    if not isinstance(h2h_rows, list):
        raise TypeError(f'{args.h2h} must contain a JSON array.')
    if not isinstance(existing_rows, list):
        raise TypeError(f'{args.existing} must contain a JSON array.')

    rows = derive_rows(h2h_rows, existing_rows, args.season)
    write_json(args.out, rows)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
