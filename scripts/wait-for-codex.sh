#!/usr/bin/env bash
set -euo pipefail

PR_NUMBER="${1:?Usage: wait-for-codex.sh <pr-number> [interval_seconds] [max_attempts] [timeout_seconds]}"
INTERVAL="${2:-60}"
MAX_ATTEMPTS="${3:-60}"
TIMEOUT="${4:-600}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
START_TIME=$(date +%s)
ATTEMPT=0

while [ "$ATTEMPT" -lt "$MAX_ATTEMPTS" ]; do
  ELAPSED=$(( $(date +%s) - START_TIME ))
  if [ "$ELAPSED" -ge "$TIMEOUT" ]; then
    echo "TIMEOUT after ${ELAPSED}s"
    exit 0
  fi

  STATUS=$("$SCRIPT_DIR/check-codex-status.sh" "$PR_NUMBER")
  if [ "$STATUS" = "CODEX_REVIEW_EXISTS" ]; then
    echo "CODEX_REVIEW_EXISTS"
    exit 0
  fi

  ATTEMPT=$((ATTEMPT + 1))
  echo "Attempt ${ATTEMPT}/${MAX_ATTEMPTS} — Codex review pending, waiting ${INTERVAL}s..." >&2
  sleep "$INTERVAL"
done

echo "CODEX_PENDING"
