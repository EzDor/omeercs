---
name: push
description: Stage all changes, commit with a descriptive message, and push to remote
---

## Push - Quick Commit and Push

This command stages all changes, creates a commit, and pushes to the remote repository.

### Actions:

1. **Branch Safety Check**: Verify not on `main` or `development` branch. If on protected branch, stop and warn.

2. **Check for Changes**: Run `git status` to verify there are changes to commit. If no changes, inform and exit.

3. **Stage All Changes**: Run `git add -A` to stage all changes.

4. **Create Commit**:
   - Analyze the staged changes using `git diff --cached`
   - Generate a descriptive commit message following conventional commit format
   - Create the commit

5. **Push to Remote**: Push with upstream tracking `git push -u origin <branch>`

### Error Handling:
- Stop if on protected branches (main/development)
- Stop if no changes to commit
- Report push failures with resolution steps
