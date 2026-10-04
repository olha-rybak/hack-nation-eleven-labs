#!/usr/bin/env bash
# Acceptance check for T-400 off-the-record: text from the window must be gone from disk,
# and frame files with ts >= from_ts_ms must be absent.
#
# Usage: verify-off-the-record.sh <session_id> <text> [from_ts_ms] [data_dir]
# Default data_dir matches apps/server Settings.SESSIONS_DIR via repo_path → <repo>/data/sessions

set -euo pipefail

if [[ $# -lt 2 || $# -gt 4 ]]; then
  echo "Usage: $0 <session_id> <text> [from_ts_ms] [data_dir]" >&2
  exit 2
fi

SESSION_ID=$1
TEXT=$2
FROM_TS_MS=${3:-}
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
REPO_ROOT=$(cd "$SCRIPT_DIR/.." && pwd)
DEFAULT_DATA_DIR="$REPO_ROOT/data/sessions"

if [[ $# -ge 4 ]]; then
  DATA_DIR=$4
elif [[ $# -eq 3 && ! "$3" =~ ^[0-9]+$ ]]; then
  # Allow: <session_id> <text> <data_dir>
  FROM_TS_MS=
  DATA_DIR=$3
else
  DATA_DIR=$DEFAULT_DATA_DIR
fi

SESSION_DIR="$DATA_DIR/$SESSION_ID"
FAIL=0

if [[ ! -d "$SESSION_DIR" ]]; then
  echo "FAIL: session folder not found: $SESSION_DIR"
  exit 1
fi

echo "Checking session: $SESSION_DIR"
echo "Searching for text: $TEXT"

# -r recursive, -i case-insensitive; print matches if any remain.
MATCHES=$(grep -ri -- "$TEXT" "$SESSION_DIR" 2>/dev/null || true)
if [[ -n "$MATCHES" ]]; then
  echo "FAIL: text still present on disk:"
  echo "$MATCHES"
  FAIL=1
else
  echo "OK: text not found in session folder"
fi

if [[ -n "${FROM_TS_MS:-}" ]]; then
  FRAMES_DIR="$SESSION_DIR/frames"
  REMAINING=()
  if [[ -d "$FRAMES_DIR" ]]; then
    shopt -s nullglob
    for jpg in "$FRAMES_DIR"/*.jpg; do
      base=$(basename "$jpg" .jpg)
      if [[ "$base" =~ ^[0-9]+$ ]] && (( 10#$base >= 10#$FROM_TS_MS )); then
        REMAINING+=("$(basename "$jpg")")
      fi
    done
    shopt -u nullglob
  fi
  if (( ${#REMAINING[@]} > 0 )); then
    echo "FAIL: frames still present with ts >= $FROM_TS_MS:"
    printf '  %s\n' "${REMAINING[@]}"
    FAIL=1
  else
    echo "OK: no frames with ts >= $FROM_TS_MS"
  fi
fi

if (( FAIL )); then
  echo "FAIL"
  exit 1
fi

echo "PASS"
exit 0
