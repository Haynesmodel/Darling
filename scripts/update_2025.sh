#!/usr/bin/env bash
set -euo pipefail

# === Sleeper -> H2H update (Regular + Postseason) ===
# League settings (edit once per year)
LEAGUE_ID="${LEAGUE_ID:-1257071385973362690}"
SEASON="${SEASON:-2025}"
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
MAP_FILE="${SCRIPT_DIR}/${SEASON}_team_mapping.json"
VALIDATE="${SCRIPT_DIR}/validate_assets.cjs"

PY="${PYTHON:-python3}"
UPDATER="${SCRIPT_DIR}/sleeper_to_h2h.py"

echo "=== Sleeper -> H2H update ==="
echo "League:  ${LEAGUE_ID}"
echo "Season:  ${SEASON}"
echo "Input:   ${IN_H2H}"
echo "Output:  ${OUT_H2H}"
echo "Map:     ${MAP_FILE}"
echo

if [[ "${UPDATE_LIVE}" != "1" ]]; then
  echo "ERROR: this script makes live Sleeper API calls. Re-run with UPDATE_LIVE=1." >&2
  exit 2
fi

if [[ ! -f "${MAP_FILE}" ]]; then
  echo "ERROR: mapping file not found: ${MAP_FILE}" >&2
  echo "Create it by running:" >&2
  echo "  ${PY} ${UPDATER} --league ${LEAGUE_ID} --list-teams" >&2
  exit 2
fi

if [[ "${VALIDATE_ONLY}" == "1" ]]; then
  WORKDIR="$(mktemp -d "${SCRIPT_DIR}/.update-XXXXXX")"
  OUT_H2H="${WORKDIR}/H2H.updated.json"
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
node "${VALIDATE}" "${OUT_H2H}" "${ASSETS_DIR}/SeasonSummary.json" "${ASSETS_DIR}/Rivalries.json"

echo
if [[ "${VALIDATE_ONLY}" == "1" ]]; then
  echo "Validation complete. No files were written into assets/."
  exit 0
fi

echo "Done."
echo "Next steps:"
echo "  1) Review diff:  diff -u \"${IN_H2H}\" \"${OUT_H2H}\" | less"
echo "  2) Copy over:    cp \"${OUT_H2H}\" \"${IN_H2H}\""
echo "  3) Commit:       git add \"${IN_H2H}\" && git commit -m \"Update H2H\""
