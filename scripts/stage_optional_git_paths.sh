#!/usr/bin/env bash
set -euo pipefail

if (( $# == 0 )); then
  echo "Usage: scripts/stage_optional_git_paths.sh <path> [<path> ...]" >&2
  exit 2
fi

for candidate_path in "$@"; do
  if [[ -e "${candidate_path}" || -L "${candidate_path}" ]] \
    || git ls-files --error-unmatch -- "${candidate_path}" >/dev/null 2>&1; then
    git add -A -- "${candidate_path}"
  fi
done
