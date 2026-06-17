#!/usr/bin/env bash
set -euo pipefail

# === Sleeper -> H2H update (Regular + Postseason) ===
# League settings (override per season)
LEAGUE_ID="${LEAGUE_ID:-1257071385973362690}"
REQUESTED_SEASON="${SEASON:-}"
REQUESTED_CURRENT_WEEK="${CURRENT_WEEK:-}"
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
VALIDATE="${SCRIPT_DIR}/validate_assets.cjs"

PY="${PYTHON:-python3}"
UPDATER="${SCRIPT_DIR}/sleeper_to_h2h.py"
CURRENT_UPDATER="${SCRIPT_DIR}/generate_current_season.py"

if [[ "${UPDATE_LIVE}" != "1" ]]; then
  echo "ERROR: this script makes live Sleeper API calls. Re-run with UPDATE_LIVE=1." >&2
  exit 2
fi

STATE_SEASON=""
STATE_LEAGUE_SEASON=""
STATE_WEEK=""
if [[ -z "${REQUESTED_SEASON}" || -z "${REQUESTED_CURRENT_WEEK}" ]]; then
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
}))
PY
)"
  STATE_SEASON="$(node -e "const x=JSON.parse(process.argv[1]||'{}'); if (x.nfl_season) process.stdout.write(String(x.nfl_season));" "${STATE_JSON}")"
  STATE_LEAGUE_SEASON="$(node -e "const x=JSON.parse(process.argv[1]||'{}'); if (x.league_season) process.stdout.write(String(x.league_season));" "${STATE_JSON}")"
  STATE_WEEK="$(node -e "const x=JSON.parse(process.argv[1]||'{}'); if (x.nfl_week) process.stdout.write(String(x.nfl_week));" "${STATE_JSON}")"
fi

SEASON="${REQUESTED_SEASON:-${STATE_LEAGUE_SEASON:-${STATE_SEASON:-2025}}}"
if [[ -n "${REQUESTED_CURRENT_WEEK}" ]]; then
  CURRENT_WEEK="${REQUESTED_CURRENT_WEEK}"
elif [[ -n "${STATE_WEEK}" && "${STATE_SEASON}" == "${SEASON}" ]]; then
  CURRENT_WEEK="${STATE_WEEK}"
else
  CURRENT_WEEK=""
fi
MAP_FILE="${SCRIPT_DIR}/${SEASON}_team_mapping.json"

echo "=== Sleeper -> H2H update ==="
echo "League:       ${LEAGUE_ID}"
echo "Season:       ${SEASON}"
echo "Current week: ${CURRENT_WEEK:-auto}"
echo "Input:        ${IN_H2H}"
echo "Output:       ${OUT_H2H}"
echo "Current:      ${OUT_CURRENT}"
echo "Map:          ${MAP_FILE}"
echo

if [[ ! -f "${MAP_FILE}" ]]; then
  echo "ERROR: mapping file not found: ${MAP_FILE}" >&2
  echo "Create it by running:" >&2
  echo "  ${PY} ${UPDATER} --league ${LEAGUE_ID} --list-teams" >&2
  exit 2
fi

if [[ "${VALIDATE_ONLY}" == "1" ]]; then
  WORKDIR="$(mktemp -d "${SCRIPT_DIR}/.update-XXXXXX")"
  OUT_H2H="${WORKDIR}/H2H.updated.json"
  OUT_CURRENT="${WORKDIR}/CurrentSeason.updated.json"
  cleanup() {
    rm -rf "${WORKDIR}"
  }
  trap cleanup EXIT INT TERM HUP
  echo "[info] Validation-only mode enabled; generated output will be discarded."
fi

# 1) Regular season (safe to re-run; script de-dupes)
${PY} "${UPDATER}"   --league "${LEAGUE_ID}"   --season "${SEASON}"   --h2h "${IN_H2H}"   --out "${OUT_H2H}"   --map "${MAP_FILE}"   --weeks "${REG_SEASON_WEEKS}"   --regular-season-max-week "${REG_SEASON_MAX_WEEK}"   --max-week "${MAX_WEEK}"   --only-played   --sort-mode season

# 2) Postseason (winners + Saunders brackets), appended onto the file we just wrote
${PY} "${UPDATER}"   --league "${LEAGUE_ID}"   --season "${SEASON}"   --h2h "${OUT_H2H}"   --out "${OUT_H2H}"   --map "${MAP_FILE}"   --weeks "${POSTSEASON_WEEKS}"   --regular-season-max-week "${REG_SEASON_MAX_WEEK}"   --max-week "${MAX_WEEK}"   --only-played   --allow-postseason   --sort-mode season

# 3) Validate the generated bundle before it is copied into the canonical asset file
CURRENT_ARGS=()
if [[ -n "${CURRENT_WEEK}" ]]; then
  CURRENT_ARGS+=(--current-week "${CURRENT_WEEK}")
fi

${PY} "${CURRENT_UPDATER}" \
  --league "${LEAGUE_ID}" \
  --season "${SEASON}" \
  --out "${OUT_CURRENT}" \
  --map "${MAP_FILE}" \
  --weeks "1-${MAX_WEEK}" \
  --regular-season-max-week "${REG_SEASON_MAX_WEEK}" \
  --max-week "${MAX_WEEK}" \
  "${CURRENT_ARGS[@]}" \
  --allow-postseason

# 4) Validate the generated bundle before it is copied into the canonical asset file
node "${VALIDATE}" "${OUT_H2H}" "${ASSETS_DIR}/SeasonSummary.json" "${ASSETS_DIR}/Rivalries.json" "${OUT_CURRENT}"

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
echo "  3) Commit:       git add \"${IN_H2H}\" \"${ASSETS_DIR}/CurrentSeason.json\" && git commit -m \"Update Sleeper data\""
