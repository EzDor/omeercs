#!/usr/bin/env bash
set -euo pipefail

BRANCH="${1:-$(git rev-parse --abbrev-ref HEAD)}"

PR_NUMBER=$(gh pr list --head "$BRANCH" --state open --json number --jq '.[0].number // empty' 2>/dev/null)

if [ -n "$PR_NUMBER" ]; then
  echo "$PR_NUMBER"
else
  echo "none"
fi
