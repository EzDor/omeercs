#!/usr/bin/env bash
set -euo pipefail

PR_NUMBER="${1:?Usage: check-codex-status.sh <pr-number>}"

REVIEWS=$(gh api "repos/{owner}/{repo}/pulls/${PR_NUMBER}/reviews" --jq '[.[] | select(.user.login == "codex-review[bot]" or .user.login == "codex-bot" or (.user.login | test("codex"; "i")))] | length' 2>/dev/null || echo "0")

COMMENTS=$(gh api "repos/{owner}/{repo}/pulls/${PR_NUMBER}/comments" --jq '[.[] | select(.user.login == "codex-review[bot]" or .user.login == "codex-bot" or (.user.login | test("codex"; "i")))] | length' 2>/dev/null || echo "0")

if [ "$REVIEWS" -gt 0 ] || [ "$COMMENTS" -gt 0 ]; then
  echo "CODEX_REVIEW_EXISTS"
else
  echo "CODEX_PENDING"
fi
