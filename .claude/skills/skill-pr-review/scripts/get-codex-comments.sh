#!/bin/bash
set -euo pipefail

PR_NUMBER=${1:-}

if [[ -z "$PR_NUMBER" ]]; then
    echo "Usage: get-codex-comments.sh <PR_NUMBER>"
    exit 1
fi

CODEX_BOT="chatgpt-codex-connector[bot]"

echo "=== CODEX REVIEW COMMENTS ==="
echo ""

gh api "repos/{owner}/{repo}/pulls/$PR_NUMBER/comments" \
    --jq ".[] | select(.user.login == \"$CODEX_BOT\") | {path: .path, line: .line, body: .body}" 2>/dev/null | \
    jq -r '
        "FILE: \(.path):\(.line // "N/A")",
        "PRIORITY: " + (
            if .body | test("P0") then "CRITICAL"
            elif .body | test("P1") then "HIGH"
            elif .body | test("P2") then "MEDIUM"
            elif .body | test("P3") then "LOW"
            else "MEDIUM"
            end
        ),
        "COMMENT:",
        (.body | gsub("<[^>]*>"; "") | gsub("\\*\\*"; "") | split("\n") | map(select(. != "")) | join("\n")),
        "",
        "---",
        ""
    ' 2>/dev/null || echo "No inline comments found"

echo ""
echo "=== CODEX REVIEW SUMMARY ==="
echo ""

gh api "repos/{owner}/{repo}/pulls/$PR_NUMBER/reviews" \
    --jq ".[] | select(.user.login == \"$CODEX_BOT\" and .body != \"\") | .body" 2>/dev/null | \
    head -1 || echo "No review summary found"
