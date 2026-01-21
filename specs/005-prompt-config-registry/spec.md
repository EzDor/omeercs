# Feature Specification: Prompt & Config Registry

**Feature Branch**: `005-prompt-config-registry`
**Created**: 2026-01-20
**Status**: Draft
**Input**: User description: "Centralize prompt templates, config templates, and review rubrics so Skills can reuse them consistently. This enables fast iteration without scattering prompts across code."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Skill Developer Loads Prompt Template (Priority: P1)

As a skill developer, I want to load a versioned prompt template by ID so that I can use consistent, centrally-managed prompts across different skills without duplicating prompt text in code.

**Why this priority**: This is the core value proposition - without the ability to load prompts, the registry serves no purpose. Every other feature depends on this foundational capability.

**Independent Test**: Can be fully tested by creating a prompt template file and calling the registry service to retrieve it. Delivers immediate value by enabling prompt reuse.

**Acceptance Scenarios**:

1. **Given** a prompt template exists at `/prompts/campaign_plan/1.0.0.md`, **When** I call `getPrompt("campaign_plan", "1.0.0")`, **Then** I receive the template content with all metadata (description, vars_schema, model_defaults, output_schema).
2. **Given** a prompt template exists with multiple versions, **When** I call `getPrompt("campaign_plan")` without specifying a version, **Then** I receive the latest version of the template.
3. **Given** no prompt template exists for the requested ID, **When** I call `getPrompt("nonexistent")`, **Then** I receive a clear error indicating the template was not found.

---

### User Story 2 - Skill Renders Prompt with Variables (Priority: P1)

As a skill developer, I want to render a prompt template with specific variable values so that I can generate context-specific prompts for LLM calls.

**Why this priority**: Prompt rendering is essential for practical use - templates without variable substitution provide limited value. This story is co-equal with loading because both are required for minimum viable functionality.

**Independent Test**: Can be fully tested by loading a template with variables and rendering it with provided values. Verifies that variable substitution works correctly.

**Acceptance Scenarios**:

1. **Given** a prompt template with variables `{{brand_name}}` and `{{campaign_goal}}`, **When** I call `renderPrompt("campaign_plan", "1.0.0", {brand_name: "Acme", campaign_goal: "awareness"})`, **Then** I receive the fully resolved prompt with variables replaced.
2. **Given** a prompt template requires variable `brand_name`, **When** I call `renderPrompt` without providing `brand_name`, **Then** I receive a validation error listing the missing required variables.
3. **Given** a prompt template with optional variable `tone` having a default value, **When** I call `renderPrompt` without providing `tone`, **Then** the default value is used in rendering.

---

### User Story 3 - Skill Loads Review Rubric (Priority: P2)

As a skill developer, I want to load a versioned review rubric so that I can apply consistent quality criteria when reviewing generated content or assets.

**Why this priority**: Rubrics support quality assurance use cases. Important but secondary to core prompt functionality since not all skills need rubric-based review.

**Independent Test**: Can be fully tested by creating a rubric file and calling the registry service to retrieve it. Enables consistent review criteria across skills.

**Acceptance Scenarios**:

1. **Given** a rubric exists at `/rubrics/asset_quality/1.0.0.json`, **When** I call `getRubric("asset_quality", "1.0.0")`, **Then** I receive the rubric with all criteria (name, description, scoring guidance) and output_schema.
2. **Given** a rubric exists with multiple versions, **When** I call `getRubric("asset_quality")` without specifying a version, **Then** I receive the latest version of the rubric.

---

### User Story 4 - Skill Loads Config Template (Priority: P2)

As a skill developer, I want to load a versioned config template so that I can apply consistent configuration structures across different skills.

**Why this priority**: Config templates support structured output generation. Useful but similar patterns can be achieved with prompt templates, making this a secondary priority.

**Independent Test**: Can be fully tested by creating a config template file and calling the registry service to retrieve it. Enables consistent configuration generation.

**Acceptance Scenarios**:

1. **Given** a config template exists at `/configs/game_settings/1.0.0.json`, **When** I call `getConfig("game_settings", "1.0.0")`, **Then** I receive the config template JSON with its vars_schema.
2. **Given** a config template has variables, **When** I call `renderConfig("game_settings", "1.0.0", {difficulty: "hard"})`, **Then** I receive the fully resolved configuration with variables replaced.

---

### User Story 5 - Run Step Records Resolved Prompt (Priority: P3)

As a system operator, I want resolved prompts to be recorded in run step debug data so that I can audit, debug, and analyze what prompts were actually sent to LLMs.

**Why this priority**: Observability is important for debugging and compliance but the system functions without it. Can be added after core registry functionality is working.

**Independent Test**: Can be fully tested by executing a skill that uses a prompt template and verifying the resolved prompt appears in the run_steps.debug field.

**Acceptance Scenarios**:

1. **Given** a skill step calls the LLM using a registered prompt, **When** the step completes, **Then** the resolved prompt (or hash + vars) is stored in `run_steps.debug` along with `model_used` and parameters.
2. **Given** a skill step fails during LLM call, **When** viewing the run step, **Then** I can see the resolved prompt that was attempted.

---

### Edge Cases

- What happens when a prompt template file exists but has invalid JSON Schema for vars_schema? The system returns a validation error at load time with details about the schema issue.
- How does system handle circular variable references in templates? The renderer detects circular references and returns an error before infinite loops occur.
- What happens when a template version is requested that doesn't exist but other versions do? The system returns an error listing available versions for that prompt_id.
- How does system handle concurrent updates to the registry (git-based)? Since it's file-based and loaded at startup, the registry reflects the state at startup time. Changes require service restart.
- What happens when a prompt template is syntactically valid but semantically broken (e.g., unclosed variable tags)? The renderer validates template syntax at load time and returns parsing errors.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST load prompt templates from the filesystem at startup from path `/prompts/<prompt_id>/<version>.md`
- **FR-002**: System MUST validate prompt template vars_schema against JSON Schema specification at load time
- **FR-003**: System MUST support semantic versioning (semver) for all templates and rubrics
- **FR-004**: System MUST provide `getPrompt(prompt_id, version?)` method that returns template content and metadata
- **FR-005**: System MUST provide `renderPrompt(prompt_id, version, vars)` method that substitutes variables in templates
- **FR-006**: System MUST validate provided variables against vars_schema before rendering
- **FR-007**: System MUST return the latest version when version parameter is omitted
- **FR-008**: System MUST load config templates from `/configs/<config_id>/<version>.json`
- **FR-009**: System MUST load review rubrics from `/rubrics/<rubric_id>/<version>.json`
- **FR-010**: System MUST provide `getRubric(rubric_id, version?)` method that returns rubric criteria and output_schema
- **FR-011**: System MUST store resolved prompts in `run_steps.debug` field when skills execute LLM calls
- **FR-012**: System MUST store model_used, parameters, and provider metadata alongside resolved prompts
- **FR-013**: System MUST support optional model_defaults in prompt templates (preferred model, temperature, max tokens)
- **FR-014**: System MUST support optional output_schema in prompt templates for structured output validation
- **FR-015**: System MUST use a template engine compatible with `{{variable}}` syntax for variable substitution

### Key Entities

- **PromptTemplate**: A versioned prompt template containing: prompt_id (unique identifier), version (semver), description (human-readable purpose), template (string with `{{variable}}` placeholders), vars_schema (JSON Schema for variable validation), model_defaults (optional LLM preferences), output_schema (optional JSON Schema for expected output)

- **ConfigTemplate**: A versioned configuration template containing: config_id (unique identifier), version (semver), template_json (configuration structure with variables), vars_schema (JSON Schema for variable validation)

- **ReviewRubric**: A versioned quality review rubric containing: rubric_id (unique identifier), version (semver), criteria (array of name, description, scoring guidance objects), output_schema (JSON Schema for structured critique output)

- **ResolvedPromptRecord**: Debug data stored per run step containing: resolved_prompt (full text or hash + vars), model_used, parameters (temperature, max_tokens, etc.), provider_metadata

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Skill developers can retrieve any registered prompt template in under 100 milliseconds after initial load
- **SC-002**: 100% of prompt templates pass schema validation at startup or return actionable error messages
- **SC-003**: Skills can share and reuse prompt templates - at least 3 example prompts are created and usable by multiple skills
- **SC-004**: All LLM calls made through registry prompts have their resolved prompts recorded for debugging
- **SC-005**: Variable substitution errors are caught before LLM calls, preventing wasted API costs from malformed prompts
- **SC-006**: New prompt iterations can be deployed by updating files and restarting the service, without code changes

## Clarifications

### Session 2026-01-20

- Q: Multi-tenancy scope for registry content (global vs per-tenant vs hybrid)? → A: Global (shared across all tenants)

## Assumptions

- Registry content (prompts, configs, rubrics) is global and shared across all tenants - templates are platform resources, not tenant-specific data
- The registry is file-based and loaded at startup; runtime updates require service restart (acceptable for MVP)
- Mustache/Handlebars-compatible syntax (`{{variable}}`) is used for template rendering
- JSON Schema draft-07 or later is used for vars_schema validation
- The service has filesystem access to the `/prompts`, `/configs`, and `/rubrics` directories
- Prompt template files use markdown format (`.md`) to support rich formatting and documentation
- Config and rubric files use JSON format (`.json`) for structured data
- Skills already integrate with the existing SkillRunner service which will be extended to use the registry
