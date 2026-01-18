# Spec 6 — Agent Layer Decision Rules (Claude Agent SDK vs LangGraph)

## Goal
Define when and how to use Claude Agent SDK and when (optionally) to introduce LangGraph, without blocking MVP.

You chose:
- Claude is allowed for: (C) code/config generation, (E) review/critique
- LangGraph need is unknown → treat as optional upgrade

---

## Use Claude Agent SDK (MVP default)
Use Claude Agent SDK inside bounded Skills for:

### 1) Structured config/code generation
Examples:
- `campaign_plan_from_brief` produces strictly structured JSON plan
- `game_config_from_template` produces `game_config.json` for a known template

Rules:
- Outputs MUST be schema validated.
- Prefer generating JSON configs over generating executable code.
- If generating TS snippets at all, must pass `tsc` check (avoid in MVP).

### 2) Review / critique
Examples:
- `review_asset_quality` checks:
  - “start button visibility”
  - “theme consistency”
  - “video loop subtlety”
  - “asset quality”

Return structured output:
- `{ pass: boolean, issues: [...], suggested_fixes: [...] }`

---

## Do NOT use Claude as the orchestrator (MVP)
- Claude does not decide the global workflow.
- Orchestration is deterministic DAG in the Run Engine.

---

## LangGraph (optional, later)
Only introduce LangGraph when you have at least one of:
- multi-iteration loops (“generate → critique → revise”) that are messy in plain code
- branching tool selection based on intermediate results
- complex “self-healing” behaviors that require stateful reasoning

### MVP substitute for LangGraph
Implement a simple pattern in code:
- attempt generation once
- run `review_asset_quality`
- if fail and `retry_once=true`, generate again with critique suggestions

---

## Practical Heuristic
- DAG + invalidation + partial rebuild → **Run Engine**
- bounded generation and critique within a step → **Claude Agent SDK**
- repeated reasoning loops / branching within a step → **LangGraph** (later)

---

## Deliverables
- A short “Agent Usage Policy” doc in repo
- Skill templates for:
  - `LLM_JSON_GENERATION` (schema enforced)
  - `LLM_REVIEW` (rubric enforced)
- One concrete implementation example for each
