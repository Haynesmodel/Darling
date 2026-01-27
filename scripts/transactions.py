# sleeper_turnstile_2025.py
# Stdlib-only (no requests/jq). Works on macOS/Homebrew Python.
import json, urllib.request, urllib.error, time
from collections import defaultdict, Counter

LEAGUE_ID = "1257071385973362690"
SEASON = "2025"
BASE = "https://api.sleeper.app/v1"

def get(url):
    with urllib.request.urlopen(url, timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))

# --- league + display names ---
rosters = get(f"{BASE}/league/{LEAGUE_ID}/rosters")  # roster_id, owner_id, metadata.team_name
users   = get(f"{BASE}/league/{LEAGUE_ID}/users")    # user_id -> display_name / username

user_name = {}
for u in users:
    nm = u.get("display_name") or (u.get("metadata") or {}).get("team_name") or u.get("username")
    user_name[u["user_id"]] = nm or f"user:{u['user_id']}"

def roster_display_name(rid):
    # Prefer custom team name; fallback to owner display name.
    for r in rosters:
        if r["roster_id"] == rid:
            tname = (r.get("metadata") or {}).get("team_name")
            if tname and tname.strip():
                return tname
            return user_name.get(r.get("owner_id"), f"roster:{rid}")
    return f"roster:{rid}"

# --- draft (seed first owner) ---
drafts = get(f"{BASE}/league/{LEAGUE_ID}/drafts")
draft_id = drafts[0]["draft_id"] if drafts else None
picks = get(f"{BASE}/draft/{draft_id}/picks") if draft_id else []

# player ownership (unique teams) and ordered history (adds only)
owned_by_sets   = defaultdict(set)      # player_id -> {roster_ids}
owned_by_order  = defaultdict(list)     # player_id -> [roster_ids in chronological, no consecutive dupes]

def push_history(pid, rid):
    if not owned_by_order[pid] or owned_by_order[pid][-1] != rid:
        owned_by_order[pid].append(rid)
    owned_by_sets[pid].add(rid)

# seed from the draft (draft pick == first team)
for p in picks:
    pid = p.get("player_id")
    rid = p.get("roster_id")
    if pid and rid:
        push_history(pid, rid)

# --- iterate weekly transactions in chronological order ---
state  = get(f"{BASE}/state/nfl")
max_leg = int(state.get("leg", 18))

# We’ll collect all transactions then sort by `created` timestamp to ensure correct order.
all_txs = []
for week in range(1, max_leg + 1):
    for tx in get(f"{BASE}/league/{LEAGUE_ID}/transactions/{week}"):
        all_txs.append(tx)

all_txs.sort(key=lambda t: t.get("created", 0))  # strictly increasing time

# pickups/drops (waiver/FA only)
pickups = Counter()   # player_id -> count of successful waiver/FA adds
drops   = Counter()   # player_id -> count of successful waiver/FA drops

WAIVER_FA = {"waiver", "free_agent"}  # what counts as "pickup"/"drop"
# We still update team history for successful trades (recipient is in adds)

for tx in all_txs:
    if tx.get("status") != "complete":
        continue  # ignore failed bids, pending, etc.

    tx_type = tx.get("type")
    adds = tx.get("adds") or {}     # {player_id: roster_id}
    drps = tx.get("drops") or {}    # {player_id: roster_id}

    # Team history: only from ADD events (draft already seeded above).
    # This captures waiver adds, FA adds, AND trade receipts (tx_type == "trade").
    for pid_str, rid in adds.items():
        if rid:
            push_history(pid_str, rid)

    # Pickups/drops counters: only from successful WAIVER/FA transactions.
    if tx_type in WAIVER_FA:
        for pid_str, _rid in adds.items():
            pickups[pid_str] += 1
        for pid_str, _rid in drps.items():
            drops[pid_str] += 1

# --- resolve player names ---
players = get(f"{BASE}/players/nfl")  # id (string) -> player object

def pname(pid):
    p = players.get(str(pid), {})
    full = p.get("full_name")
    if full: return full
    fn, ln = p.get("first_name") or "", p.get("last_name") or ""
    txt = (fn + " " + ln).strip()
    return txt or str(pid)

def chain_str(pid, seq):
    names = [roster_display_name(rid) for rid in seq]
    return " -> ".join(names)

# --- Top 10: most different teams (unique owners) ---
most_teams = sorted(((pid, len(owned_by_sets[pid])) for pid in owned_by_sets),
                    key=lambda x: (-x[1], pname(x[0])))[:10]

print("\n== Top 10: Most different teams (2025) ==")
for pid, cnt in most_teams:
    print(f"{pname(pid)} — {cnt} teams ({chain_str(pid, owned_by_order[pid])})")

# --- Top 10: most pickups (waiver/FA only) ---
most_pickups = pickups.most_common(10)
print("\n== Top 10: Most pickups (waiver/FA only, 2025) ==")
# For the pickups chain, show the teams that successfully ADDED the player in order.
adds_history = defaultdict(list)  # player_id -> [roster_id of successful WAIVER/FA adds]
for tx in all_txs:
    if tx.get("status") == "complete" and tx.get("type") in WAIVER_FA:
        for pid_str, rid in (tx.get("adds") or {}).items():
            if rid:
                adds_history[pid_str].append(rid)

for pid, c in most_pickups:
    seq = adds_history.get(pid, [])
    print(f"{pname(pid)} — {c} pickups ({chain_str(pid, seq) if seq else '—'})")

# --- Top 10: most drops (waiver/FA only) ---
most_drops = drops.most_common(10)
print("\n== Top 10: Most drops (waiver/FA only, 2025) ==")
drops_history = defaultdict(list)  # player_id -> [roster_id of successful WAIVER/FA drops]
for tx in all_txs:
    if tx.get("status") == "complete" and tx.get("type") in WAIVER_FA:
        for pid_str, rid in (tx.get("drops") or {}).items():
            if rid:
                drops_history[pid_str].append(rid)

for pid, c in most_drops:
    seq = drops_history.get(pid, [])
    print(f"{pname(pid)} — {c} drops ({chain_str(pid, seq) if seq else '—'})")
