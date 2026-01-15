---
name: browser-mode
description: Browser testing and UI validation mode
---

## Browser Mode - UI Testing and Validation

This command enables browser testing mode for UI validation and testing.

### Instructions:

**Map:** Open & pin Map; target elements by role:name.

**Navigation (extension):**
- Initial load: `browser_navigate(current URL)` if needed.
- Then **OK to navigate via internal app routing** (click links/buttons, `router.push`, hash/query changes) as long as **origin and port stay the same**.
- **Never** use the address bar, open new tabs/windows, or change origin/port.

**Snapshot:** `A = browser_snapshot()` → perform in-app route/action → `B = browser_snapshot()`.

**Diff:** Compare by role:name (+ aria-label/data-*). Report added/removed, text deltas, state/attr changes; include brief counts (nav/CTAs).

**Proof:** `browser_take_screenshot(fullPage)` + element shots of changed nodes; include saved paths.

**Output:** `ui_diff.json` + 3-line human summary + quick fixes.

**Console (opt):** If asked to **ignore console errors/warnings**, omit them; otherwise include a one-line summary.