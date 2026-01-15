---
name: make-commit-ready
description: Prepare all workspaces for commit with validation, linting, and building
---

## Make Commit Ready - Full Project Pre-Commit Preparation

This command prepares all workspaces for commit by running validation, linting, formatting, type checking, and build processes.

### Actions:

1. **Branch Safety Check**: First check the current git branch. If the user is on 'development' or 'main' branch, automatically create a new feature branch using the pattern `{git-username}/{few-words-on-task}` (e.g., `EzDor/fix-login-bug`). Ask the user for a brief description of the task to generate the branch name.

2. **New Changes Validation** (ONLY in files modified/added in current branch):
   - **Comments Cleanup**: Remove any remaining code comments from TypeScript files
   - **Type Safety**: Ensure proper TypeScript typing and no `any` usage without justification
   - **i18n Check** (webapp/ only): Ensure all UI texts (not from backend) use i18n internationalization
   - **CSS !important Check** (webapp/ only): Remove any `!important` declarations from CSS

3. **Process All Workspaces**: Run checks globally from the root directory:
   - Run `pnpm lint` from root (auto-fixes all fixable issues in all workspaces)
   - Run `pnpm format` from root (applies formatting to all workspaces)

4. **Root Workspace Check**: Run `pnpm type-check` from the root directory to validate the entire workspace.

5. **Workspace Build**: Run `pnpm build` from the root directory to build all workspaces.

6. **Docker Compose Check**: Check docker compose logs for any errors and fix them:
   - Run `docker compose ps` to check running services
   - Run `docker compose logs` to check for errors
   - Fix any errors found in the logs

7. **Security Review**: Run `/security-review` to perform a security audit of the changes.

8. **Summary**: Provide a summary of all completed actions across all workspaces.

### Error Handling:
- Create feature branch if on protected branches (development/main)
- Auto-fix comments issues in new changes only
- Auto-fix all linting issues that can be automatically resolved
- Auto-fix CSS !important declarations in webapp
- Report and fix any type checking errors with details
- Report and fix any build failures with details
- Report and fix any docker compose errors
- Continue processing other workspaces even if one fails, but report all failures

**Note**: This command processes all pnpm workspaces (agent-platform, api-center, dao, dto, webapp) that have changes in the current branch.
