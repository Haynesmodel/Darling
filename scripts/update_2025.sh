#!/usr/bin/env bash
set -euo pipefail

# === Sleeper -> H2H update (Regular + Postseason) ===
# League settings (edit once per year)
LEAGUE_ID="${LEAGUE_ID:-1257071385973362690}"
SEASON="${SEASON:-2025}"

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

PY="${PYTHON:-python3}"
UPDATER="${SCRIPT_DIR}/sleeper_to_h2h.py"

echo "=== Sleeper -> H2H update ==="
echo "League:  ${LEAGUE_ID}"
echo "Season:  ${SEASON}"
echo "Input:   ${IN_H2H}"
echo "Output:  ${OUT_H2H}"
echo "Map:     ${MAP_FILE}"
echo

if [[ ! -f "${MAP_FILE}" ]]; then
  echo "ERROR: mapping file not found: ${MAP_FILE}" >&2
  echo "Create it by running:" >&2
  echo "  ${PY} ${UPDATER} --league ${LEAGUE_ID} --list-teams" >&2
  exit 2
fi

# 1) Regular season (safe to re-run; script de-dupes)
${PY} "${UPDATER}"   --league "${LEAGUE_ID}"   --season "${SEASON}"   --h2h "${IN_H2H}"   --out "${OUT_H2H}"   --map "${MAP_FILE}"   --weeks "${REG_SEASON_WEEKS}"   --regular-season-max-week "${REG_SEASON_MAX_WEEK}"   --max-week "${MAX_WEEK}"   --only-played   --sort-mode season

# 2) Postseason (winners + Saunders brackets), appended onto the file we just wrote
${PY} "${UPDATER}"   --league "${LEAGUE_ID}"   --season "${SEASON}"   --h2h "${OUT_H2H}"   --out "${OUT_H2H}"   --map "${MAP_FILE}"   --weeks "${POSTSEASON_WEEKS}"   --regular-season-max-week "${REG_SEASON_MAX_WEEK}"   --max-week "${MAX_WEEK}"   --only-played   --allow-postseason   --sort-mode season

echo
echo "Done."
echo "Next steps:"
echo "  1) Review diff:  diff -u "${IN_H2H}" "${OUT_H2H}" | less"
echo "  2) Copy over:    cp "${OUT_H2H}" "${IN_H2H}""
echo "  3) Commit:       git add "${IN_H2H}" && git commit -m "Update H2H""
