#!/usr/bin/env python3
"""Generate assets/CurrentSeason.json from Sleeper.

This keeps live/current matchups separate from historical H2H data so scheduled
games can be displayed without adding unplayed rows to assets/H2H.json.
"""

import argparse
import json
import sys
from datetime import date, datetime, timezone
from pathlib import Path

import sleeper_to_h2h as sleeper


def load_json(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def save_json(path, obj):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)
        f.write("\n")


def validate_mapping(league_id, mapping):
    teams_info = sleeper.list_teams(league_id)
    roster_ids = [str(t["roster_id"]) for t in teams_info]
    missing = [rid for rid in roster_ids if not str(mapping.get(rid, "")).strip()]
    if missing:
      raise ValueError(f"Missing canonical team names for roster ids: {', '.join(missing)}")
    return teams_info, {rid: mapping[rid] for rid in roster_ids}


def public_team_rows(teams_info, rid_to_name):
    return [
        {
            "roster_id": team["roster_id"],
            "owner": rid_to_name[str(team["roster_id"])],
            "display_name": team.get("display_name") or "",
            "sleeper_team_name": team.get("sleeper_team_name") or "",
        }
        for team in teams_info
    ]


def score_or_none(value, has_score):
    if not has_score:
        return None
    return sleeper.round2(value or 0.0)


def matchup_status(week, current_week, game_date, cutoff, score_a, score_b):
    if score_a == 0.0 and score_b == 0.0:
        return "scheduled"
    if game_date <= cutoff:
        return "final"
    if current_week is not None:
        if week < current_week:
            return "final"
        if week == current_week:
            return "live"
        return "scheduled"
    if game_date > cutoff:
        return "scheduled"
    return "final"


def canonical_pair(team_a, team_b):
    return tuple(sorted([str(team_a), str(team_b)]))


def postseason_fallback_rows(path, season, regular_season_max_week):
    if not path:
        return {}
    rows = load_json(path)
    fallback = {}
    for row in rows:
        week = int(row.get("week") or 0)
        if int(row.get("season") or 0) != season or week <= regular_season_max_week:
            continue
        game_type = str(row.get("type") or "").strip()
        if game_type not in {"Playoff", "Saunders"}:
            continue
        key = (week, canonical_pair(row.get("teamA"), row.get("teamB")))
        fallback[key] = row
    return fallback


def build_current_season_asset(args):
    if args.season not in sleeper.WEEK1_ANCHORS:
        raise ValueError(f"No week-1 anchor configured for season {args.season}.")

    mapping = {str(k): v for k, v in load_json(args.map).items()}
    teams_info, rid_to_name = validate_mapping(args.league, mapping)
    weeks = [w for w in sleeper.parse_weeks(args.weeks) if w <= args.max_week]
    cutoff = datetime.strptime(args.cutoff_date, "%Y-%m-%d").date() if args.cutoff_date else date.today()

    playoff_pairs = set()
    saunders_pairs = set()
    if args.allow_postseason and any(w > args.regular_season_max_week for w in weeks):
        playoff_pairs, saunders_pairs = sleeper.build_bracket_roster_pairs(args.league)
    fallback_rows = postseason_fallback_rows(args.h2h_fallback, args.season, args.regular_season_max_week)

    games = []
    fetched_weeks = []
    unclassified_postseason = {}

    for week in weeks:
        if week > args.regular_season_max_week and not args.allow_postseason:
            continue

        pairs = sleeper.pair_matchups(sleeper.get_matchups(args.league, week))
        if not pairs:
            continue

        fetched_weeks.append(week)
        game_date = sleeper.sunday_for_week(args.season, week)

        for a, b in pairs:
            rid_a = int(a.get("roster_id"))
            rid_b = int(b.get("roster_id"))
            score_a_raw = sleeper.round2(a.get("points", 0.0))
            score_b_raw = sleeper.round2(b.get("points", 0.0))
            status = matchup_status(week, args.current_week, game_date, cutoff, score_a_raw, score_b_raw)

            game_type = "Regular"
            round_name = ""
            if week > args.regular_season_max_week:
                game_type, round_name = sleeper.classify_postseason_game(
                    rid_a,
                    rid_b,
                    playoff_pairs,
                    saunders_pairs,
                    week,
                )
                if not game_type:
                    fallback_key = (week, canonical_pair(rid_to_name[str(rid_a)], rid_to_name[str(rid_b)]))
                    fallback = fallback_rows.get(fallback_key)
                    if fallback:
                        game_type = fallback.get("type") or ""
                        round_name = fallback.get("round") or ""
                    else:
                        unclassified_postseason.setdefault(week, []).append(
                            f"{rid_to_name[str(rid_a)]} vs {rid_to_name[str(rid_b)]}"
                        )
                        continue

            games.append({
                "season": args.season,
                "date": game_date.strftime("%Y-%m-%d"),
                "teamA": rid_to_name[str(rid_a)],
                "teamB": rid_to_name[str(rid_b)],
                "scoreA": score_or_none(score_a_raw, status in {"final", "live"}),
                "scoreB": score_or_none(score_b_raw, status in {"final", "live"}),
                "week": week,
                "round": round_name,
                "type": game_type,
                "status": status,
                "matchup_id": a.get("matchup_id"),
                "rosterA": rid_a,
                "rosterB": rid_b,
            })

    if args.allow_postseason:
        for week in [w for w in fetched_weeks if w > args.regular_season_max_week]:
            classified_count = sum(1 for game in games if game["week"] == week)
            if classified_count == 0:
                missed = ", ".join(unclassified_postseason.get(week, [])) or "no classified pairs"
                raise ValueError(f"Fetched postseason week {week} yielded zero classified games: {missed}")

    current_week = args.current_week
    if current_week is None:
        scheduled_weeks = sorted({g["week"] for g in games if g["status"] == "scheduled"})
        final_weeks = sorted({g["week"] for g in games if g["status"] == "final"})
        current_week = scheduled_weeks[0] if scheduled_weeks else (final_weeks[-1] if final_weeks else None)

    return {
        "source": "sleeper",
        "league_id": str(args.league),
        "season": args.season,
        "generated_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "current_week": current_week,
        "regular_season_max_week": args.regular_season_max_week,
        "max_week": args.max_week,
        "weeks_fetched": fetched_weeks,
        "teams": public_team_rows(teams_info, rid_to_name),
        "games": sorted(games, key=lambda g: (g["week"], g["date"], g["teamA"], g["teamB"])),
    }


def main():
    parser = argparse.ArgumentParser(description="Generate CurrentSeason.json from Sleeper")
    parser.add_argument("--league", required=True, help="Sleeper league ID")
    parser.add_argument("--season", type=int, required=True, help="Season")
    parser.add_argument("--out", required=True, help="Path to write CurrentSeason.json")
    parser.add_argument("--map", required=True, help="Path to roster_id -> canonical team name mapping json")
    parser.add_argument("--weeks", default="1-17", help="Weeks to fetch, e.g. '1-14' or '1-17'")
    parser.add_argument("--cutoff-date", default=None, help="Optional YYYY-MM-DD cutoff for final/scheduled status")
    parser.add_argument("--current-week", type=int, default=None, help="Override current week")
    parser.add_argument("--regular-season-max-week", type=int, default=14)
    parser.add_argument("--max-week", type=int, default=17)
    parser.add_argument("--allow-postseason", action="store_true", default=False)
    parser.add_argument("--h2h-fallback", default=None, help="Optional H2H asset used to classify postseason pairs that Sleeper brackets omit")
    args = parser.parse_args()

    try:
        save_json(args.out, build_current_season_asset(args))
    except Exception as exc:
        print(exc, file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
