---
name: client-commit-ready
description: Prepare webapp folder for commit with validation and formatting
---

## Client Commit Ready - Webapp Pre-Commit Preparation

This command prepares the webapp/ folder for commit by running validation, linting, formatting, and build checks.

### Actions:

1. **Branch Safety Check**: First check the current git branch. If the user is on 'development' or 'main' branch, stop immediately and inform them to switch to a feature branch.

2. **New Changes Validation** (ONLY in files modified/added in current branch within webapp/):
   - **i18n Check**: Ensure all UI texts (not from backend) use i18n internationalization
   - **CSS !important Check**: Remove any `!important` declarations from CSS
   - **Comments Cleanup**: Remove any remaining code comments

3. **Webapp Linting & Formatting**: Navigate to the `webapp/` directory and run:
   - `pnpm lint` (auto-fixes all fixable ESLint issues)
   - `pnpm format` (applies Prettier formatting)

4. **Webapp Build**: Run `pnpm build` to ensure the project compiles successfully with type checking.

5. **Summary**: Provide a summary of completed actions.

### Error Handling:
- Stop execution if on protected branches (development/main)
- Auto-fix i18n, CSS !important, and comments issues in new changes only (within webapp/)
- Auto-fix all linting issues that can be automatically resolved
- Report and fix any build failures with details