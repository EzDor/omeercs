#!/bin/bash
set -euo pipefail

PR_NUMBER=${1:-}

if [[ -z "$PR_NUMBER" ]]; then
    echo "Usage: check-codex-status.sh <PR_NUMBER>"
    exit 1
fi

CODEX_BOT="chatgpt-codex-connector[bot]"

has_codex_review() {
    local comments
    comments=$(gh api "repos/{owner}/{repo}/pulls/$PR_NUMBER/comments" --jq ".[].user.login" 2>/dev/null || echo "")

    if echo "$comments" | grep -q "$CODEX_BOT"; then
        return 0
    fi

    local reviews
    reviews=$(gh api "repos/{owner}/{repo}/pulls/$PR_NUMBER/reviews" --jq ".[].user.login" 2>/dev/null || echo "")

    if echo "$reviews" | grep -q "$CODEX_BOT"; then
        return 0
    fi

    return 1
}

if has_codex_review; then
    echo "CODEX_REVIEW_EXISTS"
    exit 0
else
    echo "CODEX_PENDING"
    exit 0
fi
