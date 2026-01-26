#!/bin/bash
set -euo pipefail

CURRENT_BRANCH=$(git branch --show-current)

if [[ "$CURRENT_BRANCH" == "main" || "$CURRENT_BRANCH" == "development" ]]; then
    echo "ERROR: Cannot run PR review on protected branch: $CURRENT_BRANCH"
    exit 1
fi

PR_INFO=$(gh pr view --json number,state,url 2>/dev/null || echo "none")

if [[ "$PR_INFO" == "none" ]]; then
    echo "NO_PR"
    exit 0
fi

PR_NUMBER=$(echo "$PR_INFO" | jq -r '.number')
PR_STATE=$(echo "$PR_INFO" | jq -r '.state')
PR_URL=$(echo "$PR_INFO" | jq -r '.url')

if [[ "$PR_STATE" == "OPEN" ]]; then
    echo "PR_EXISTS"
    echo "PR_NUMBER=$PR_NUMBER"
    echo "PR_URL=$PR_URL"
else
    echo "NO_PR"
fi
