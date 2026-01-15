## PR Changes - Complete PR Workflow

This command handles the complete pull request workflow: branch validation, commit, push, and review request.

### Actions:

1. **Branch Validation**:
   - Check if currently on a feature branch (not main/development)
   - If on main or development, prompt user to provide a branch name and create/switch to it
   - Use naming convention: `<username>/<feature-description>` (e.g., `ezdor/add-new-feature`)

2. **Commit Changes**:
   - Stage all changes (`git add -A`)
   - Create a commit with a descriptive message based on the changes
   - Follow conventional commit format

3. **Push to Remote**:
   - Push the branch to origin with upstream tracking (`git push -u origin <branch>`)
   - Check if PR exists using GitHub CLI: `gh pr view --json number`
   - If PR doesn't exist, create one using GitHub CLI: `gh pr create --title "..." --body "..."`

4. **Request Review** (using GitHub CLI):
   - Get the PR number using: `gh pr view --json number --jq '.number'`
   - Add a comment to the PR using GitHub CLI: `gh pr comment <PR_NUMBER> --body "@codex please review this pull request"`

5. **Run PR Review**: Execute the `/review` command to perform automated code review

### GitHub CLI Requirements:
- **ALL GitHub operations MUST use the `gh` CLI tool**
- Ensure `gh` is authenticated: `gh auth status`
- Use `gh pr create` to create pull requests
- Use `gh pr comment` to add comments
- Use `gh pr view` to get PR information
- Use `gh api` for any other GitHub API interactions

### Error Handling:
- Stop if there are no changes to commit
- Verify `gh` CLI is authenticated before GitHub operations
- Handle push failures (e.g., remote branch conflicts)
- Verify PR exists before commenting
- Report all errors with clear instructions for resolution

### Important Notes:
- This command will create commits - only run when ready to commit changes
- Requires GitHub CLI (`gh`) to be installed and authenticated
- The review comment mentions @codex for automated review
- All sub-commands must complete successfully before proceeding to the next step
