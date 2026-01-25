---
name: skill-pr-review
description: Comprehensive PR review workflow that orchestrates PR creation, waits for Codex review, runs Claude code review, performs security review, and consolidates all issues into a prioritized fix plan. This skill should be triggered by the /skill-pr-review command when preparing code for review or when wanting a full automated review cycle.
---

# PR Review Workflow

This skill orchestrates a complete pull request review cycle including automated Codex review, Claude code review, security review, and issue consolidation into a prioritized fix plan.

## Prerequisites

- GitHub CLI (`gh`) must be installed and authenticated
- Current branch must not be `main` or `development`
- Codex must be configured to review PRs in the repository

## Workflow Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  1. Check PR Status                                             │
│     └── If no PR exists → Run /pr-changes command               │
├─────────────────────────────────────────────────────────────────┤
│  2. Wait for Codex Review                                       │
│     └── Poll every 2 minutes after initial 5-minute wait        │
├─────────────────────────────────────────────────────────────────┤
│  3. Run Claude Code Review                                      │
│     └── Use project-manager-reviewer agent                      │
├─────────────────────────────────────────────────────────────────┤
│  4. Run Security Review                                         │
│     └── Analyze for OWASP Top 10 and security vulnerabilities   │
├─────────────────────────────────────────────────────────────────┤
│  5. Consolidate All Issues                                      │
│     └── Gather from Codex, Claude review, and security review   │
├─────────────────────────────────────────────────────────────────┤
│  6. Create Prioritized Fix Plan                                 │
│     └── Focus on Critical/High, ask about impactful Medium      │
└─────────────────────────────────────────────────────────────────┘
```

## Phase 1: PR Status Check

Execute the script to check if a PR exists for the current branch:

```bash
scripts/check-pr-status.sh
```

**Decision Tree:**
- **PR exists**: Proceed to Phase 2
- **No PR exists**: Execute `/pr-changes` command to create one, then wait for Codex

## Phase 2: Wait for Codex Review

After PR creation or if PR already exists, wait for Codex to complete its review.

Execute the polling script:

```bash
scripts/wait-for-codex.sh <PR_NUMBER>
```

**Polling Strategy:**
1. Initial wait: 5 minutes (Codex typically takes 3-5 minutes)
2. Subsequent polls: Every 2 minutes
3. Stop conditions:
   - Codex review detected (has comments from `chatgpt-codex-connector[bot]`)
   - Codex not configured/running (no review after reasonable time)
   - Maximum wait time exceeded (15 minutes)

**Important:** The script outputs the Codex review status. Capture this for Phase 5.

## Phase 3: Claude Code Review

Launch the `project-manager-reviewer` agent to perform a comprehensive code review.

**Agent Configuration:**
- Agent type: `project-manager-reviewer`
- Focus: All changes in the current branch compared to `main`

**Review Scope:**
- Code quality and best practices
- Test coverage verification
- Documentation completeness
- Architecture alignment
- Edge case handling

Capture the agent's output for consolidation in Phase 5.

## Phase 4: Security Review

Perform a security-focused review of all changes.

**Security Review Checklist:**

### OWASP Top 10 Analysis
1. **Injection** - SQL, NoSQL, OS, LDAP injection vulnerabilities
2. **Broken Authentication** - Session management, credential handling
3. **Sensitive Data Exposure** - Data encryption, PII handling
4. **XML External Entities (XXE)** - XML parser configuration
5. **Broken Access Control** - Authorization checks, RBAC
6. **Security Misconfiguration** - Default configs, error handling
7. **Cross-Site Scripting (XSS)** - Input sanitization, output encoding
8. **Insecure Deserialization** - Object serialization safety
9. **Using Components with Known Vulnerabilities** - Dependency audit
10. **Insufficient Logging & Monitoring** - Audit trails, alerts

### Additional Security Checks
- Secrets in code (API keys, passwords, tokens)
- Hardcoded credentials
- Insecure direct object references
- Missing rate limiting
- CORS misconfigurations
- Input validation gaps

**Output Format:** List all findings with severity (Critical/High/Medium/Low).

## Phase 5: Issue Consolidation

Gather all issues from the three review sources:

### Collecting Codex Issues

Execute the script to fetch Codex review comments:

```bash
scripts/get-codex-comments.sh <PR_NUMBER>
```

**Codex Priority Mapping:**
- `P0` badge → Critical
- `P1` badge → High
- `P2` badge → Medium
- `P3` badge → Low
- No badge → Medium (default)

### Collecting Claude Review Issues
Parse the output from Phase 3 (project-manager-reviewer agent).

### Collecting Security Issues
Parse the output from Phase 4 (security review).

### Consolidation Format

Create a unified issue list:

```
Issue ID | Source    | Priority | Category     | Description                | File:Line
---------|-----------|----------|--------------|----------------------------|----------
ISS-001  | Codex     | High     | Code Quality | Missing null check         | src/foo.ts:42
ISS-002  | Claude    | Critical | Architecture | Circular dependency        | src/bar.ts:15
ISS-003  | Security  | Critical | OWASP-A1     | SQL injection risk         | src/db.ts:88
```

## Phase 6: Create Fix Plan

Generate a prioritized action plan based on consolidated issues.

### Priority Levels

1. **Critical** - Must fix before merge
   - Security vulnerabilities
   - Data corruption risks
   - Breaking changes

2. **High** - Should fix before merge
   - Significant bugs
   - Performance issues
   - Missing error handling

3. **Medium** - Evaluate impact
   - Code quality improvements
   - Documentation gaps
   - Minor edge cases

### Plan Generation

**Step 1:** Automatically include all Critical and High priority issues in the plan.

**Step 2:** For Medium priority issues, evaluate and ask:
- Does this issue have security implications?
- Could this cause user-facing problems?
- Would fixing this significantly improve maintainability?

If any answer is "yes", include in the plan.

### Output Format

```markdown
# PR Review Fix Plan

## Summary
- Total issues found: X
- Critical: X (must fix)
- High: X (should fix)
- Medium included: X (high impact)

## Action Items

### Critical Priority

#### ISS-XXX: [Issue Title]
**Source:** [Codex/Claude/Security]
**Location:** `file:line`
**Issue:** [Description]
**Fix:** [Recommended action]

### High Priority
[Same format...]

### Medium Priority (High Impact)
[Same format...]

## Issues Deferred
[List of Medium/Low issues not included with brief reason]
```

## Scripts Reference

### scripts/check-pr-status.sh
Checks if current branch has an open PR and outputs PR number or "none".

### scripts/wait-for-codex.sh
Polls GitHub API for Codex review completion with configurable timing.

### scripts/get-codex-comments.sh
Fetches and parses Codex review comments with priority extraction.

## Error Handling

- **No PR after /pr-changes**: Fail with message to check git status
- **Codex timeout**: Proceed with Claude and security reviews only
- **GitHub API errors**: Retry with exponential backoff, max 3 attempts
- **Agent failures**: Log error and continue with available reviews

## Usage Example

```
User: /skill-pr-review

[Skill checks for PR, creates if needed]
[Waits for Codex review]
[Runs Claude code review]
[Performs security review]
[Consolidates issues]
[Generates fix plan in console]
```
