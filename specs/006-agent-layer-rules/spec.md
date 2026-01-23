# Feature Specification: Agent Layer Decision Rules

**Feature Branch**: `006-agent-layer-rules`
**Created**: 2026-01-22
**Status**: Draft
**Input**: User description: "Implement Agent Layer Decision Rules for Claude Agent SDK vs LangGraph based on spec-06-agent-layer-rules.md"

## Clarifications

### Session 2026-01-22

- Q: When schema validation fails for LLM-generated JSON output, what should the system do? → A: Auto-retry once with validation error injected into prompt (consistent with retry_once pattern)
- Q: How should the system handle LLM API failures (timeout, rate limit, provider errors)? → A: Retry with exponential backoff (max 3 attempts), then fail with error details
- Q: When a review rubric contains criteria the LLM cannot confidently evaluate, what should happen? → A: Mark those specific criteria as "indeterminate" in the result, continue with evaluable criteria

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Skill Developer Creates JSON Generation Skill (Priority: P1)

A developer wants to create a skill that uses Claude Agent SDK to generate structured JSON output (e.g., campaign plan from brief, game config from template). The system provides a template and validation mechanism to ensure outputs conform to a defined schema.

**Why this priority**: This is the core MVP capability - enabling bounded, schema-validated LLM generation is the foundation for all agent-driven workflows.

**Independent Test**: Can be tested by creating a skill that takes input parameters and produces validated JSON output matching a predefined schema.

**Acceptance Scenarios**:

1. **Given** a registered skill template of type `LLM_JSON_GENERATION`, **When** a developer invokes the skill with valid input parameters, **Then** the system returns structured JSON output that passes schema validation.
2. **Given** a skill configured with a JSON schema, **When** the LLM generates output that doesn't match the schema, **Then** the system rejects the output and returns a validation error with details.
3. **Given** a skill definition with required input parameters, **When** a developer invokes the skill with missing parameters, **Then** the system returns a clear error indicating which parameters are missing.

---

### User Story 2 - Skill Developer Creates Review/Critique Skill (Priority: P2)

A developer wants to create a skill that reviews and critiques generated assets (e.g., checking asset quality, theme consistency, visibility). The system provides a structured rubric-based review template that returns pass/fail status with detailed issues and suggested fixes.

**Why this priority**: Review skills enable quality gates in the workflow, essential for maintaining output quality before proceeding to next steps.

**Independent Test**: Can be tested by invoking a review skill with sample asset data and verifying it returns structured feedback with pass/fail, issues list, and suggestions.

**Acceptance Scenarios**:

1. **Given** a registered skill template of type `LLM_REVIEW`, **When** a developer invokes the skill with asset data and a review rubric, **Then** the system returns structured output containing `pass` (boolean), `issues` (array), and `suggested_fixes` (array).
2. **Given** a review skill with quality criteria (e.g., "start button visibility", "theme consistency"), **When** the asset meets all criteria, **Then** the system returns `pass: true` with an empty issues array.
3. **Given** a review skill execution that finds quality issues, **When** the review completes, **Then** each issue includes a specific description and actionable fix suggestion.

---

### User Story 3 - Developer Implements Simple Generate-Review-Retry Pattern (Priority: P3)

A developer wants to implement a simple retry pattern where content is generated, reviewed, and if it fails review, regenerated once with critique suggestions. This should be achievable without LangGraph, using plain code patterns.

**Why this priority**: This pattern is a practical MVP substitute for complex orchestration, allowing iterative improvement without introducing LangGraph complexity.

**Independent Test**: Can be tested by triggering a generation that intentionally fails review, then verifying the system retries with critique suggestions incorporated.

**Acceptance Scenarios**:

1. **Given** a workflow step configured with `retry_once=true`, **When** the initial generation fails review, **Then** the system automatically invokes generation again with critique suggestions included in the prompt.
2. **Given** a retry attempt that still fails review, **When** `retry_once=true` is set, **Then** the system returns the failed result without further retries (one retry maximum).
3. **Given** a workflow without retry configured, **When** generation fails review, **Then** the system returns the failure immediately without attempting regeneration.

---

### Edge Cases

- When the LLM returns malformed JSON or output fails schema validation, the system auto-retries once with the validation error injected into the prompt; if retry also fails, returns validation error to caller.
- When LLM API fails (timeout, rate limit, provider error), the system retries with exponential backoff (max 3 attempts), then fails with detailed error information.
- When a review rubric contains criteria the LLM cannot confidently evaluate, those criteria are marked as "indeterminate" in the result while evaluable criteria proceed normally.
- How does the system behave when retry suggestions are too vague to improve output?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a skill template type `LLM_JSON_GENERATION` for creating skills that generate schema-validated JSON output.
- **FR-002**: System MUST validate all LLM-generated JSON outputs against their configured schema before returning results.
- **FR-003**: System MUST provide a skill template type `LLM_REVIEW` for creating skills that evaluate assets against defined rubrics.
- **FR-004**: System MUST return review results in structured format containing: `pass` (boolean), `issues` (array of strings), `suggested_fixes` (array of strings), and `indeterminate` (array of criteria that could not be confidently evaluated).
- **FR-005**: System MUST support a `retry_once` configuration option that triggers one regeneration attempt when review fails.
- **FR-006**: System MUST include critique suggestions from failed reviews in retry generation prompts.
- **FR-007**: System MUST NOT use Claude as the global workflow orchestrator - orchestration remains in the deterministic Run Engine DAG.
- **FR-008**: System MUST provide an "Agent Usage Policy" document defining when to use Claude Agent SDK vs LangGraph.
- **FR-009**: System MUST include at least one concrete implementation example for each skill template type (LLM_JSON_GENERATION and LLM_REVIEW).
- **FR-010**: System MUST auto-retry once when schema validation fails, injecting the validation error into the retry prompt; if retry also fails, return the validation error to the caller.
- **FR-011**: System MUST retry LLM API failures (timeout, rate limit, provider errors) with exponential backoff up to 3 attempts before returning error details to the caller.

### Key Entities

- **Skill Template Type**: Categorization of skill patterns - specifically `LLM_JSON_GENERATION` for schema-validated generation and `LLM_REVIEW` for rubric-based critique.
- **JSON Schema**: Validation specification that defines the expected structure and constraints for generated outputs.
- **Review Rubric**: Set of quality criteria (e.g., "start button visibility", "theme consistency") that a review skill evaluates against.
- **Review Result**: Structured output from review skills containing pass status, identified issues, suggested fixes, and indeterminate criteria (those that could not be confidently evaluated).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Developers can create and deploy a new JSON generation skill in under 30 minutes using the provided template.
- **SC-002**: 100% of generated JSON outputs are validated against their schema before being returned.
- **SC-003**: Review skills return structured feedback for all evaluated assets within the standard skill execution timeout.
- **SC-004**: The generate-review-retry pattern improves first-pass quality acceptance rate by at least 30% compared to single-attempt generation.
- **SC-005**: All skill implementations follow the agent usage policy with no cases of Claude being used for global orchestration.
- **SC-006**: Documentation enables new developers to understand when to use Claude Agent SDK vs LangGraph (future) within 15 minutes of reading.
