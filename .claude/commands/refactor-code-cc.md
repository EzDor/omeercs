---
name: refactor-code-cc
description: Analyze a file and create a clean code refactoring plan following SOLID, DRY, KISS, and YAGNI principles
---

## Clean Code Refactoring Planner

Analyze the specified file and create a detailed refactoring plan following clean code principles.

### Input

File path: $ARGUMENTS

### Process

1. **Read the File**: Load and analyze the entire file content at `$ARGUMENTS`

2. **Analyze for Clean Code Violations**: Identify issues in these categories:

   #### A. Condition Extraction
   - Find complex conditions (if statements, ternary operators, switch cases)
   - Each condition with business logic should become a function with a meaningful name
   - Example: `if (user.age >= 18 && user.verified)` → `if (isEligibleUser(user))`

   #### B. Comment Replacement
   - Find ALL code comments (inline, block, JSDoc describing "what" not "API")
   - Each comment indicates code that needs a descriptive function name instead
   - The function name should express the intent the comment was trying to convey

   #### C. Single Responsibility Violations
   - Find functions doing multiple things (AND in description = split needed)
   - Each function should have ONE reason to change
   - Long functions (>20 lines) are candidates for splitting

   #### D. YAGNI Violations
   - Find unused imports, variables, functions, parameters
   - Find over-engineered abstractions not currently needed
   - Find speculative code paths not being used

   #### E. KISS Violations
   - Find overly complex logic that can be simplified
   - Find nested callbacks/promises that can be flattened
   - Find unnecessary abstractions

   #### F. DRY Violations
   - Find duplicated code blocks (3+ lines repeated)
   - Find similar patterns that can be abstracted
   - Find copy-pasted logic with minor variations

   #### G. Magic Values
   - Find hardcoded numbers (magic numbers)
   - Find hardcoded strings (URLs, messages, keys)
   - These should move to a constants file

3. **Generate Refactoring Plan**: Create an actionable plan with:
   - Priority order (high impact, low risk first)
   - Specific file locations (line numbers)
   - Before/after code examples
   - Suggested function/constant names

### Output Format

```markdown
# Clean Code Refactoring Plan: [filename]

## Summary
- Total violations found: X
- Estimated refactoring effort: [Low/Medium/High]

## Priority 1: Critical Improvements

### [Category]: [Brief description]
**Location**: Line X-Y
**Issue**: [Explain the violation]

**Before**:
```[language]
[current code]
```

**After**:
```[language]
[refactored code]
```

**New function/constant to create**:
```[language]
[extracted function or constant]
```

## Priority 2: Recommended Improvements
[Same format...]

## Priority 3: Nice to Have
[Same format...]

## Constants File Additions
If constants file exists, add to it. Otherwise, suggest creating one.

```[language]
[all magic values extracted as constants]
```

## Summary Checklist
- [ ] Extract X conditions into named functions
- [ ] Replace X comments with descriptive functions
- [ ] Split X functions for single responsibility
- [ ] Remove X unused code blocks (YAGNI)
- [ ] Simplify X complex patterns (KISS)
- [ ] Extract X duplicated blocks (DRY)
- [ ] Move X magic values to constants
```

### Important Guidelines

- DO NOT make changes - only create the plan
- Be specific with line numbers and exact code snippets
- Suggest meaningful names that express intent (verb + noun for functions)
- Consider the existing codebase patterns when suggesting names
- Group related changes together
- Prioritize changes that improve readability the most
