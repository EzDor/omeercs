#!/bin/bash
set -euo pipefail

PR_NUMBER=${1:-}
INITIAL_WAIT=${2:-300}
POLL_INTERVAL=${3:-120}
MAX_WAIT=${4:-900}

if [[ -z "$PR_NUMBER" ]]; then
    echo "Usage: wait-for-codex.sh <PR_NUMBER> [INITIAL_WAIT_SEC] [POLL_INTERVAL_SEC] [MAX_WAIT_SEC]"
    exit 1
fi

CODEX_BOT="chatgpt-codex-connector[bot]"
ELAPSED=0

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
fi

echo "Waiting ${INITIAL_WAIT}s for Codex to start review..."
sleep "$INITIAL_WAIT"
ELAPSED=$((ELAPSED + INITIAL_WAIT))

while [[ $ELAPSED -lt $MAX_WAIT ]]; do
    if has_codex_review; then
        echo "CODEX_REVIEW_COMPLETE"
        exit 0
    fi

    echo "No Codex review yet. Polling again in ${POLL_INTERVAL}s... (${ELAPSED}s elapsed)"
    sleep "$POLL_INTERVAL"
    ELAPSED=$((ELAPSED + POLL_INTERVAL))
done

echo "CODEX_TIMEOUT"
echo "No Codex review detected after ${MAX_WAIT}s. Proceeding with other reviews."
exit 0
