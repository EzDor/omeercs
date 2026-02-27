#!/usr/bin/env bash
set -euo pipefail

PR_NUMBER="${1:?Usage: get-codex-comments.sh <pr-number>}"

echo "=== Codex Review Comments for PR #${PR_NUMBER} ==="
echo ""

REVIEWS=$(gh api "repos/{owner}/{repo}/pulls/${PR_NUMBER}/reviews" \
  --jq '.[] | select(.user.login == "codex-review[bot]" or .user.login == "codex-bot" or (.user.login | test("codex"; "i"))) | {state: .state, body: .body}' 2>/dev/null || true)

if [ -n "$REVIEWS" ]; then
  echo "--- Review Summary ---"
  echo "$REVIEWS" | jq -r '"[\(.state)] \(.body)"' 2>/dev/null || echo "$REVIEWS"
  echo ""
fi

COMMENTS=$(gh api "repos/{owner}/{repo}/pulls/${PR_NUMBER}/comments" \
  --jq '.[] | select(.user.login == "codex-review[bot]" or .user.login == "codex-bot" or (.user.login | test("codex"; "i"))) | {path: .path, line: .line, body: .body}' 2>/dev/null || true)

if [ -n "$COMMENTS" ]; then
  echo "--- Inline Comments ---"
  echo "$COMMENTS" | jq -r '"\(.path):\(.line // "general") — \(.body)"' 2>/dev/null || echo "$COMMENTS"
  echo ""

  CRITICAL=$(echo "$COMMENTS" | jq -r 'select(.body | test("critical|security|vulnerability|injection|xss"; "i")) | "\(.path):\(.line // "general") — \(.body)"' 2>/dev/null || true)
  HIGH=$(echo "$COMMENTS" | jq -r 'select(.body | test("error|bug|incorrect|wrong|missing"; "i")) | "\(.path):\(.line // "general") — \(.body)"' 2>/dev/null || true)

  if [ -n "$CRITICAL" ]; then
    echo "--- CRITICAL Priority ---"
    echo "$CRITICAL"
    echo ""
  fi

  if [ -n "$HIGH" ]; then
    echo "--- HIGH Priority ---"
    echo "$HIGH"
    echo ""
  fi
else
  echo "No Codex comments found on PR #${PR_NUMBER}"
fi
