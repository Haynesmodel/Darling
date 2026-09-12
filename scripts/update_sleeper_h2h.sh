#!/usr/bin/env bash
set -euo pipefail

# === Sleeper -> H2H update (Regular + Postseason) ===
# League settings (override per season)
LEAGUE_ID="${LEAGUE_ID:-1257071385973362690}"
REQUESTED_SEASON="${SEASON:-}"
REQUESTED_CURRENT_WEEK="${CURRENT_WEEK:-}"
CUTOFF_DATE="${CUTOFF_DATE:-}"
COMPLETED_OVERRIDE="${COMPLETED_THROUGH_WEEK_OVERRIDE:-}"
COMPLETED_OVERRIDE_REASON="${COMPLETED_THROUGH_WEEK_REASON:-}"
SCHEDULED_RUN="${SCHEDULED_RUN:-0}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --completed-through-week) [[ -z "${COMPLETED_OVERRIDE}" && $# -ge 2 ]] || { echo "ERROR: duplicate/missing completed-through-week" >&2; exit 2; }; COMPLETED_OVERRIDE="$2"; shift 2 ;;
    --reason) [[ -z "${COMPLETED_OVERRIDE_REASON}" && $# -ge 2 ]] || { echo "ERROR: duplicate/missing reason" >&2; exit 2; }; COMPLETED_OVERRIDE_REASON="$2"; shift 2 ;;
    --cutoff-date) [[ -z "${CUTOFF_DATE}" && $# -ge 2 ]] || { echo "ERROR: duplicate/missing cutoff-date" >&2; exit 2; }; CUTOFF_DATE="$2"; shift 2 ;;
    *) echo "ERROR: unknown argument $1" >&2; exit 2 ;;
  esac
done
if [[ -n "${COMPLETED_OVERRIDE_REASON}" && -z "${COMPLETED_OVERRIDE}" ]]; then echo "ERROR: --reason requires --completed-through-week" >&2; exit 2; fi
UPDATE_LIVE="${UPDATE_LIVE:-0}"
VALIDATE_ONLY="${VALIDATE_ONLY:-0}"

# Week settings
REG_SEASON_WEEKS="1-14"
POSTSEASON_WEEKS="15-17"
REG_SEASON_MAX_WEEK="14"
MAX_WEEK="17"

# Paths (relative to this script's directory)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ASSETS_DIR="${SCRIPT_DIR}/../assets"

IN_H2H="${ASSETS_DIR}/H2H.json"
OUT_H2H="${ASSETS_DIR}/H2H.updated.json"
OUT_CURRENT="${ASSETS_DIR}/CurrentSeason.updated.json"
OUT_TRANSACTIONS="${ASSETS_DIR}/TransactionHistory.updated.json"
VALIDATE="${SCRIPT_DIR}/validate_assets.cjs"

PY="${PYTHON:-python3}"
UPDATER="${SCRIPT_DIR}/sleeper_to_h2h.py"
CURRENT_UPDATER="${SCRIPT_DIR}/generate_current_season.py"
TRANSACTION_UPDATER="${SCRIPT_DIR}/generate_transaction_history.py"

if [[ "${UPDATE_LIVE}" != "1" ]]; then
  echo "ERROR: this script makes live Sleeper API calls. Re-run with UPDATE_LIVE=1." >&2
  exit 2
fi

STATE_SEASON=""
STATE_LEAGUE_SEASON=""
STATE_WEEK=""
COMPLETED_THROUGH_WEEK=""
COMPLETION_BASIS=""
STATE_JSON="$("${PY}" - "${LEAGUE_ID}" <<'PY'
import json
import sys
from urllib.request import Request, urlopen

league_id = sys.argv[1]
headers = {"User-Agent": "Sleeper-H2H-Updater/1.0"}

state_req = Request("https://api.sleeper.app/v1/state/nfl", headers=headers)
with urlopen(state_req, timeout=30) as resp:
    state = json.loads(resp.read().decode("utf-8"))

league_req = Request(f"https://api.sleeper.app/v1/league/{league_id}", headers=headers)
with urlopen(league_req, timeout=30) as resp:
    league = json.loads(resp.read().decode("utf-8"))

print(json.dumps({
    "nfl_season": state.get("season"),
    "league_season": league.get("season"),
    "nfl_week": state.get("week") or state.get("display_week"),
    "nfl_season_type": state.get("season_type"),
    "league_status": league.get("status"),
}))
PY
)"
STATE_SEASON="$(node -e "const x=JSON.parse(process.argv[1]||'{}'); if (x.nfl_season) process.stdout.write(String(x.nfl_season));" "${STATE_JSON}")"
STATE_LEAGUE_SEASON="$(node -e "const x=JSON.parse(process.argv[1]||'{}'); if (x.league_season) process.stdout.write(String(x.league_season));" "${STATE_JSON}")"
STATE_WEEK="$(node -e "const x=JSON.parse(process.argv[1]||'{}'); if (x.nfl_week) process.stdout.write(String(x.nfl_week));" "${STATE_JSON}")"

SEASON="${REQUESTED_SEASON:-${STATE_LEAGUE_SEASON:-${STATE_SEASON:-2025}}}"
if [[ -z "${STATE_LEAGUE_SEASON}" ]]; then
  echo "ERROR: Sleeper league metadata did not report a season; refusing extraction." >&2
  exit 2
fi
if [[ "${STATE_LEAGUE_SEASON}" != "${SEASON}" ]]; then
  echo "ERROR: requested season ${SEASON} does not match Sleeper league season ${STATE_LEAGUE_SEASON}; refusing extraction." >&2
  exit 2
fi
if [[ -n "${REQUESTED_CURRENT_WEEK}" ]]; then
  CURRENT_WEEK="${REQUESTED_CURRENT_WEEK}"
elif [[ -n "${STATE_WEEK}" && "${STATE_SEASON}" == "${SEASON}" ]]; then
  CURRENT_WEEK="${STATE_WEEK}"
else
  CURRENT_WEEK=""
fi
MAP_FILE="${SCRIPT_DIR}/${SEASON}_team_mapping.json"

COMPLETION_JSON="$(${PY} - "${SEASON}" "${MAX_WEEK}" "${STATE_JSON}" "${SCRIPT_DIR}" "${CUTOFF_DATE}" "${COMPLETED_OVERRIDE}" "${COMPLETED_OVERRIDE_REASON}" "${SCHEDULED_RUN}" "${ASSETS_DIR}/CurrentSeason.json" <<'PY'
import json, sys
from datetime import datetime, timezone
sys.path.insert(0, sys.argv[4])
from scoring_completion import resolve_completion, retained_boundary_from_snapshot
from sleeper_to_h2h import WEEK1_ANCHORS
season, max_week, raw = int(sys.argv[1]), int(sys.argv[2]), json.loads(sys.argv[3])
import pathlib
snapshot_path = pathlib.Path(sys.argv[9]); retained = 0
if snapshot_path.exists(): retained = retained_boundary_from_snapshot(json.loads(snapshot_path.read_text()), season, max_week)
clock = datetime.fromisoformat(sys.argv[5] + 'T13:00:00+00:00') if sys.argv[5] else datetime.now(timezone.utc)
override = int(sys.argv[6]) if sys.argv[6] else None
result = resolve_completion(season=season, max_week=max_week, week1_sunday=WEEK1_ANCHORS[season], league_status=raw.get('league_status'), league_season=int(raw['league_season']), nfl_state={'season': raw.get('nfl_season'), 'season_type': raw.get('nfl_season_type'), 'week': raw.get('nfl_week')}, last_verified_completed=retained, now=clock, override=override, override_reason=sys.argv[7], scheduled=sys.argv[8] == '1')
print(json.dumps({'completed': result.completed_through_week, 'active': result.active_week, 'basis': result.basis, 'warnings': list(result.warnings), 'clock': clock.isoformat(), 'override_reason': sys.argv[7] if override is not None else None}))
PY
)"
COMPLETED_THROUGH_WEEK="$(node -e "const x=JSON.parse(process.argv[1]); process.stdout.write(String(x.completed));" "${COMPLETION_JSON}")"
COMPLETED_ACTIVE_WEEK="$(node -e "const x=JSON.parse(process.argv[1]); if (x.active != null) process.stdout.write(String(x.active));" "${COMPLETION_JSON}")"
COMPLETION_BASIS="$(node -e "const x=JSON.parse(process.argv[1]); process.stdout.write(String(x.basis));" "${COMPLETION_JSON}")"
COMPLETION_REPORT="${COMPLETION_REPORT_PATH:-${RUNNER_TEMP:-/tmp}/darling-completion-report.json}"
node -e 'require("node:fs").writeFileSync(process.argv[2], process.argv[1] + "\n")' "${COMPLETION_JSON}" "${COMPLETION_REPORT}"

echo "=== Sleeper -> H2H update ==="
echo "League:       configured"
echo "Season:       ${SEASON}"
echo "Current week: ${CURRENT_WEEK:-auto}"
echo "Completed through: ${COMPLETED_THROUGH_WEEK} (${COMPLETION_BASIS})"
echo "Input:        ${IN_H2H}"
echo "Output:       ${OUT_H2H}"
echo "Current:      ${OUT_CURRENT}"
echo "Transactions: ${OUT_TRANSACTIONS}"
echo "Map:          ${MAP_FILE}"
echo

if [[ ! -f "${MAP_FILE}" ]]; then
  echo "ERROR: mapping file not found: ${MAP_FILE}" >&2
  echo "Create it by running:" >&2
  echo "  ${PY} ${UPDATER} --league <configured-league-id> --list-teams" >&2
  exit 2
fi

if [[ "${VALIDATE_ONLY}" == "1" ]]; then
  WORKDIR="$(mktemp -d "${SCRIPT_DIR}/.update-XXXXXX")"
  OUT_H2H="${WORKDIR}/H2H.updated.json"
  OUT_CURRENT="${WORKDIR}/CurrentSeason.updated.json"
  OUT_TRANSACTIONS="${WORKDIR}/TransactionHistory.updated.json"
  cleanup() {
    rm -rf "${WORKDIR}"
  }
  trap cleanup EXIT INT TERM HUP
  echo "[info] Validation-only mode enabled; generated output will be discarded."
fi

# 1) Regular season (safe to re-run; script de-dupes)
${PY} "${UPDATER}"   --league "${LEAGUE_ID}"   --season "${SEASON}"   --h2h "${IN_H2H}"   --out "${OUT_H2H}"   --map "${MAP_FILE}"   --weeks "${REG_SEASON_WEEKS}"   --regular-season-max-week "${REG_SEASON_MAX_WEEK}"   --max-week "${MAX_WEEK}"   --only-played   --completed-through-week "${COMPLETED_THROUGH_WEEK}" --completion-basis "${COMPLETION_BASIS}" --sort-mode season

# 2) Postseason (winners + Saunders brackets), appended onto the file we just wrote
${PY} "${UPDATER}"   --league "${LEAGUE_ID}"   --season "${SEASON}"   --h2h "${OUT_H2H}"   --out "${OUT_H2H}"   --map "${MAP_FILE}"   --weeks "${POSTSEASON_WEEKS}"   --regular-season-max-week "${REG_SEASON_MAX_WEEK}"   --max-week "${MAX_WEEK}"   --only-played   --completed-through-week "${COMPLETED_THROUGH_WEEK}" --completion-basis "${COMPLETION_BASIS}" --allow-postseason   --sort-mode season

# 3) Generate CurrentSeason.json from Sleeper, using the generated H2H as a postseason fallback
CURRENT_CMD=(
  "${PY}" "${CURRENT_UPDATER}"
  --league "${LEAGUE_ID}"
  --season "${SEASON}"
  --out "${OUT_CURRENT}"
  --map "${MAP_FILE}"
  --weeks "1-${MAX_WEEK}"
  --regular-season-max-week "${REG_SEASON_MAX_WEEK}"
  --max-week "${MAX_WEEK}"
  --h2h-fallback "${OUT_H2H}"
  --completed-through-week "${COMPLETED_THROUGH_WEEK}"
  --completion-basis "${COMPLETION_BASIS}"
)
if [[ -n "${COMPLETED_ACTIVE_WEEK}" ]]; then
CURRENT_CMD+=(--current-week "${COMPLETED_ACTIVE_WEEK}")
fi
CURRENT_CMD+=(--allow-postseason)

"${CURRENT_CMD[@]}"

# 4) Generate the target transaction season against the candidate scoring boundary.
TRANSACTION_CMD=(
  "${PY}" "${TRANSACTION_UPDATER}"
  --league "${LEAGUE_ID}"
  --season "${SEASON}"
  --map "${MAP_FILE}"
  --max-week "${MAX_WEEK}"
  --current-season "${OUT_CURRENT}"
  --out "${OUT_TRANSACTIONS}"
  --completed-through-week "${COMPLETED_THROUGH_WEEK}"
  --players-cache "${WORKDIR:-${RUNNER_TEMP:-${TMPDIR:-/tmp}}}/sleeper-players-cache.json"
)
if [[ -f "${ASSETS_DIR}/TransactionHistory.json" ]]; then
  TRANSACTION_CMD+=(--existing "${ASSETS_DIR}/TransactionHistory.json")
fi
"${TRANSACTION_CMD[@]}"

# 5) Validate the generated bundle before it is copied into canonical asset files.
node "${VALIDATE}" "${OUT_H2H}" "${ASSETS_DIR}/SeasonSummary.json" "${ASSETS_DIR}/Rivalries.json" "${OUT_CURRENT}" "${OUT_TRANSACTIONS}"

echo
if [[ "${VALIDATE_ONLY}" == "1" ]]; then
  echo "Validation complete. No files were written into assets/."
  exit 0
fi

echo "Done."
echo "Next steps:"
echo "  1) Review diff:  diff -u \"${IN_H2H}\" \"${OUT_H2H}\" | less"
echo "  2) Copy over:    cp \"${OUT_H2H}\" \"${IN_H2H}\""
echo "                  cp \"${OUT_CURRENT}\" \"${ASSETS_DIR}/CurrentSeason.json\""
echo "                  cp \"${OUT_TRANSACTIONS}\" \"${ASSETS_DIR}/TransactionHistory.json\""
echo "  3) Commit:       git add \"${IN_H2H}\" \"${ASSETS_DIR}/CurrentSeason.json\" \"${ASSETS_DIR}/TransactionHistory.json\" && git commit -m \"Update Sleeper data\""
