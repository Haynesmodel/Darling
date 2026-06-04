#!/usr/bin/env python3
"""Sleeper -> H2H updater (regular + postseason, with placement-game exclusion)

Fixes for your league:
- Week 15 = Wild Card (Playoff + Saunders)
- Week 16 = Semi Finals
- Week 17 = Championship / Saunders Final
- Saunders ONLY for losers bracket.
- Excludes placement games (e.g. 5-6 and 7-8) by only accepting matchups whose
  roster pair appears in Sleeper's winners_bracket (playoff) or losers_bracket (Saunders),
  with bracket rows where p==1 excluded.

Important implementation detail:
Sleeper bracket endpoints sometimes reuse/overlap the integer in field 'm' across winners/losers,
so we do NOT key postseason classification by matchup_id. Instead we key by the roster_id pair
(t1,t2) from the bracket and match weekly matchup pairs against those roster pairs.

Usage (unchanged from your scripts):
  python3 sleeper_to_h2h.py --league ... --season 2025 --h2h ../assets/H2H.json --out ../assets/H2H.updated.json \
    --map ./2025_team_mapping.json --weeks 15-17 --only-played --allow-postseason
"""

import argparse
import json
import sys
from datetime import date, timedelta, datetime
from urllib.request import urlopen, Request
from urllib.error import URLError, HTTPError

API_BASE = "https://api.sleeper.app/v1"
WEEK1_ANCHORS = {
    2025: date(2025, 9, 7),  # Week 1 Sunday
}

# ---------------- HTTP helpers ----------------
def http_get_json(url: str):
    req = Request(url, headers={"User-Agent": "Sleeper-H2H-Updater/1.0"})
    try:
        with urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except HTTPError as e:
        print(f"[HTTPError] {e.code} for {url}", file=sys.stderr)
        raise
    except URLError as e:
        print(f"[URLError] {e.reason} for {url}", file=sys.stderr)
        raise

def get_users(league_id: str):
    return http_get_json(f"{API_BASE}/league/{league_id}/users")

def get_rosters(league_id: str):
    return http_get_json(f"{API_BASE}/league/{league_id}/rosters")

def get_matchups(league_id: str, week: int):
    return http_get_json(f"{API_BASE}/league/{league_id}/matchups/{week}")

def get_winners_bracket(league_id: str):
    return http_get_json(f"{API_BASE}/league/{league_id}/winners_bracket")

def get_losers_bracket(league_id: str):
    return http_get_json(f"{API_BASE}/league/{league_id}/losers_bracket")

# ---------------- League mapping ----------------
def list_teams(league_id: str):
    users = get_users(league_id)
    rosters = get_rosters(league_id)
    users_by_id = {u.get("user_id"): u for u in users}
    result = []
    for r in rosters:
        owner_id = r.get("owner_id")
        user = users_by_id.get(owner_id, {}) if owner_id else {}
        display_name = user.get("display_name") or user.get("username") or ""
        username = user.get("username") or ""
        roster_id = r.get("roster_id")
        team_name = (r.get("metadata") or {}).get("team_name") or (user.get("metadata") or {}).get("team_name") or ""
        result.append({
            "roster_id": roster_id,
            "owner_user_id": owner_id,
            "display_name": display_name,
            "username": username,
            "sleeper_team_name": team_name,
        })
    result.sort(key=lambda x: int(x["roster_id"]))
    return result

# ---------------- Date helpers ----------------
def sunday_for_week(season: int, week: int) -> date:
    if season not in WEEK1_ANCHORS:
        raise ValueError(
            f"No week-1 anchor configured for season {season}. "
            f"Add it to WEEK1_ANCHORS in sleeper_to_h2h.py and retry."
        )
    return WEEK1_ANCHORS[season] + timedelta(days=7 * (week - 1))

# ---------------- Matchup pairing ----------------
def pair_matchups(matchups):
    by_mid = {}
    for m in matchups:
        mid = m.get("matchup_id")
        if mid is None:
            continue
        by_mid.setdefault(mid, []).append(m)
    return [(items[0], items[1]) for items in by_mid.values() if len(items) == 2]

def round2(x):
    return float(f"{float(x):.2f}")

def load_json(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)

def save_json(path, obj):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)

def parse_weeks(weeks_str: str):
    weeks = set()
    for token in weeks_str.split(","):
        token = token.strip()
        if not token:
            continue
        if "-" in token:
            a, b = token.split("-")
            for w in range(int(a), int(b) + 1):
                weeks.add(w)
        else:
            weeks.add(int(token))
    return sorted(weeks)

# ---------------- Postseason helpers ----------------
def build_bracket_roster_pairs(league_id: str):
    """Return (playoff_pairs, saunders_pairs) where each is a set of (min_rid, max_rid) ints.

    Excludes placement games via p==1.
    Excludes placeholders with missing t1/t2.
    """
    playoff_pairs = set()
    saunders_pairs = set()

    def ingest(items, dest_set):
        if not isinstance(items, list):
            return
        for g in items:
            p = g.get("p", 0)
            # Sleeper uses 'p' to indicate placement/consolation games (e.g., 5th place, 7th place).
            # Exclude ANY bracket row with a positive placement value.
            if p is not None and int(p) > 0:
                continue  # placement/consolation game
            t1 = g.get("t1")
            t2 = g.get("t2")
            if t1 is None or t2 is None:
                continue
            a, b = int(t1), int(t2)
            dest_set.add((a, b) if a < b else (b, a))

    ingest(get_winners_bracket(league_id), playoff_pairs)
    ingest(get_losers_bracket(league_id), saunders_pairs)
    return playoff_pairs, saunders_pairs

def postseason_label_for_week(week: int, game_type: str) -> str:
    # Your league mapping:
    # 15 = Wild Card, 16 = Semi Final, 17 = Championship / Saunders Final
    if game_type == "Playoff":
        if week == 15:
            return "Wild Card"
        if week == 16:
            return "Semi Final"
        if week == 17:
            return "Championship"
    if game_type == "Saunders":
        if week == 15:
            return "Saunders Wild Card"
        if week == 16:
            return "Saunders Semi Final"
        if week == 17:
            return "Saunders Final"
    return ""

# ---------------- Main ----------------
def main():
    parser = argparse.ArgumentParser(description="Pull matchups from Sleeper and append to H2H.json")
    parser.add_argument("--league", required=True, help="Sleeper league ID")
    parser.add_argument("--season", type=int, default=2025, help="Season (default: 2025)")
    parser.add_argument("--h2h", required=True, help="Path to existing H2H.json")
    parser.add_argument("--out", required=True, help="Path to write updated H2H.json")
    parser.add_argument("--map", required=False, help="Path to roster_id -> canonical team name mapping json")
    parser.add_argument("--list-teams", action="store_true", help="Only list teams from Sleeper and exit")
    parser.add_argument("--weeks", type=str, default="1-14", help="Weeks to fetch, e.g. '1-14' or '15-17'")
    parser.add_argument("--only-played", dest="only_played", action="store_true", default=False,
                        help="Include only games that have happened (by week Sunday) and are not 0-0")
    parser.add_argument("--cutoff-date", type=str, default=None, help="Optional YYYY-MM-DD cutoff for only-played")
    parser.add_argument("--max-week", type=int, default=17, help="Hard cap for weeks (default: 17)")
    parser.add_argument("--regular-season-max-week", type=int, default=14, help="Regular season last week (default: 14)")
    parser.add_argument("--allow-postseason", action="store_true", default=False,
                        help="Allow fetching weeks beyond regular season and classify them via bracket endpoints.")
    parser.add_argument("--sort-mode", choices=["none", "season", "global"], default="season",
                        help="Sort mode: none|season|global (default: season)")

    args = parser.parse_args()

    if args.season not in WEEK1_ANCHORS:
        known = ", ".join(str(season) for season in sorted(WEEK1_ANCHORS)) or "none"
        print(
            f"Error: no week-1 anchor configured for season {args.season}. "
            f"Known seasons: {known}. Add the anchor to WEEK1_ANCHORS in sleeper_to_h2h.py and retry.",
            file=sys.stderr,
        )
        sys.exit(2)

    if args.list_teams:
        teams = list_teams(args.league)
        print(json.dumps(teams, indent=2, ensure_ascii=False))
        print("\nTip: create a mapping JSON like:")
        mapping = {str(t["roster_id"]): "" for t in teams}
        print(json.dumps(mapping, indent=2))
        return

    if not args.map:
        print("Error: --map is required when appending data.", file=sys.stderr)
        sys.exit(2)

    h2h = load_json(args.h2h)
    if not isinstance(h2h, list):
        print("H2H.json must be a list of game objects.", file=sys.stderr)
        sys.exit(1)

    mapping = load_json(args.map)
    mapping = {str(k): v for k, v in mapping.items()}

    teams_info = list_teams(args.league)
    roster_ids = [str(t["roster_id"]) for t in teams_info]
    missing = [rid for rid in roster_ids if not str(mapping.get(rid, "")).strip()]
    if missing:
        print("The following roster_ids are missing a canonical name in your mapping:", file=sys.stderr)
        for rid in missing:
            t = next((ti for ti in teams_info if str(ti["roster_id"]) == rid), None)
            print(
                f"  roster_id={rid}  display_name={t.get('display_name') if t else ''}  username={t.get('username') if t else ''}  sleeper_team_name={t.get('sleeper_team_name') if t else ''}",
                file=sys.stderr,
            )
        print("Please update your mapping JSON and re-run.", file=sys.stderr)
        sys.exit(3)

    rid_to_name = {rid: mapping[rid] for rid in roster_ids}

    weeks_requested = parse_weeks(args.weeks)
    weeks = [w for w in weeks_requested if w <= args.max_week]
    skipped = [w for w in weeks_requested if w > args.max_week]
    if skipped:
        print(f"[warn] Skipping weeks beyond max-week (>{args.max_week}): {skipped}", file=sys.stderr)

    if not args.allow_postseason:
        filtered = [w for w in weeks if w <= args.regular_season_max_week]
        removed = [w for w in weeks if w > args.regular_season_max_week]
        if removed:
            print(f"[warn] Skipping weeks beyond regular season (>{args.regular_season_max_week}): {removed}", file=sys.stderr)
        weeks = filtered

    playoff_pairs = set()
    saunders_pairs = set()
    if args.allow_postseason:
        playoff_pairs, saunders_pairs = build_bracket_roster_pairs(args.league)
        print(f"[info] postseason bracket pairs loaded: playoff={len(playoff_pairs)}, saunders={len(saunders_pairs)}")

    # Existing game keying (avoid duplicates)
    def key_of(game):
        wk = game.get("week") or 0
        teams = sorted([game.get("teamA", ""), game.get("teamB", "")])
        return (int(game.get("season")), int(wk), teams[0], teams[1])

    existing_keys = set()
    for g in h2h:
        try:
            existing_keys.add(key_of(g))
        except Exception:
            continue

    cutoff = datetime.strptime(args.cutoff_date, "%Y-%m-%d").date() if args.cutoff_date else date.today()

    appended = 0
    skipped_placement = 0
    skipped_unclassified = 0
    fetched_weeks = []

    for w in weeks:
        matchups = get_matchups(args.league, w)
        pairs = pair_matchups(matchups)
        if not pairs:
            continue

        fetched_weeks.append(w)
        game_date = sunday_for_week(args.season, w)
        if args.only_played and game_date > cutoff:
            continue

        for a, b in pairs:
            ridA = int(a.get("roster_id"))
            ridB = int(b.get("roster_id"))
            teamA = rid_to_name[str(ridA)]
            teamB = rid_to_name[str(ridB)]

            scoreA = round2(a.get("points", 0.0))
            scoreB = round2(b.get("points", 0.0))
            if args.only_played and (scoreA == 0.0 and scoreB == 0.0):
                continue

            k = (args.season, w, *sorted([teamA, teamB]))
            if k in existing_keys:
                continue

            game_type = "Regular"
            round_name = None

            is_postseason_week = w > args.regular_season_max_week
            if is_postseason_week:
                if not args.allow_postseason:
                    continue

                pair_key = (ridA, ridB) if ridA < ridB else (ridB, ridA)

                if pair_key in playoff_pairs:
                    game_type = "Playoff"
                    round_name = postseason_label_for_week(w, game_type)
                elif pair_key in saunders_pairs:
                    game_type = "Saunders"
                    round_name = postseason_label_for_week(w, game_type)
                else:
                    # Not in playoff or saunders bracket => placement game (5-6, 7-8) or irrelevant
                    # Track a counter so you can see it happening.
                    skipped_unclassified += 1
                    continue

                # Extra safety: if it's a placement game it should have been excluded by p==1,
                # but in case Sleeper returns it only via matchups, we still skip if round_name blank.
                if not round_name:
                    skipped_placement += 1
                    continue

            row = {
                "season": args.season,
                "date": game_date.strftime("%Y-%m-%d"),
                "teamA": teamA,
                "teamB": teamB,
                "scoreA": scoreA,
                "scoreB": scoreB,
                "week": w,
                "round": round_name,
                "type": game_type,
            }

            h2h.append(row)
            existing_keys.add(k)
            appended += 1

    # Sorting
    if args.sort_mode == "none":
        h2h_final = h2h
    elif args.sort_mode == "season":
        before = [g for g in h2h if g.get("season") != args.season]
        target = [g for g in h2h if g.get("season") == args.season]
        target_sorted = sorted(target, key=lambda g: (g.get("date", ""), g.get("week") or 0, g.get("teamA", ""), g.get("teamB", "")))
        h2h_final = before + target_sorted
    else:
        h2h_final = sorted(h2h, key=lambda g: (g.get("season", 0), g.get("date", ""), g.get("week") or 0, g.get("teamA", ""), g.get("teamB", "")))

    save_json(args.out, h2h_final)
    print(
        "Done. Appended {n} new games. Wrote: {out}. Sort mode: {sort}. Only-played: {op}. "
        "Cutoff: {cut}. Weeks fetched: {weeks}. Skipped postseason-unclassified: {su}.".format(
            n=appended,
            out=args.out,
            sort=args.sort_mode,
            op=args.only_played,
            cut=args.cutoff_date or "today",
            weeks=fetched_weeks,
            su=skipped_unclassified,
        )
    )

if __name__ == "__main__":
    main()
