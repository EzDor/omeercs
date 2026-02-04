# Feature Specification: Reference Implementations

**Feature Branch**: `009-reference-impl`
**Created**: 2026-02-03
**Status**: Draft
**Input**: User description: "Implement reference skills and workflow for Spec 9 - including 3 working skills (deterministic, provider stub, Claude JSON generation) and a runnable campaign.build.v1 workflow execution path"

## Clarifications

### Session 2026-02-03

- Q: What schema structure should game_config.json follow? → A: Use Spec 9's minimal schema: template_id, difficulty, level_params, spawn_rates, scoring, controls, assets
- Q: What diagnostic information should be captured for skill execution? → A: Standard: input hash, output snapshot, execution duration, and error details for each step

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Execute Full Campaign Build Workflow (Priority: P1)

As a platform operator, I want to trigger a complete campaign build workflow that orchestrates multiple skills to produce a campaign manifest, so that I can validate the end-to-end workflow execution pipeline.

**Why this priority**: This is the core integration story that validates all platform components working together (Registry → Runner → Providers → Artifacts → Run Engine). Without this, individual skills cannot be proven to work in a real orchestration context.

**Independent Test**: Can be fully tested by triggering a campaign build with sample inputs and verifying a complete manifest is produced with all referenced artifacts.

**Acceptance Scenarios**:

1. **Given** a campaign build trigger with valid inputs (campaign_id, template_id, difficulty, theme, assets, audio prompt, placeholder video URIs, rules), **When** the workflow is executed, **Then** the system produces a campaign manifest referencing all generated artifacts (game_config, audio, bundle).

2. **Given** a workflow run completes successfully, **When** I inspect the run status, **Then** all steps show "completed" status with stored input_hash values for cache validation.

3. **Given** the workflow produces artifacts, **When** I examine the manifest, **Then** all URIs in the manifest point to valid artifact locations.

---

### User Story 2 - Generate Game Configuration via Claude JSON (Priority: P2)

As a platform operator, I want to generate a game configuration JSON file using Claude with schema validation and retry logic, so that I can produce valid game configs without manual JSON authoring.

**Why this priority**: The Claude JSON generation skill is a critical pattern that demonstrates safe LLM integration with strict output validation. This is foundational for other LLM-powered skills.

**Independent Test**: Can be tested by invoking the skill directly with template parameters and validating the output JSON conforms to the schema.

**Acceptance Scenarios**:

1. **Given** valid inputs (template_id, difficulty, theme, assets, constraints), **When** the skill is invoked, **Then** Claude generates a JSON file matching the game_config schema.

2. **Given** Claude produces invalid JSON on first attempt, **When** the validation fails, **Then** the skill retries with a corrective prompt and produces valid JSON on the second attempt.

3. **Given** Claude fails after the retry, **When** the validation still fails, **Then** the skill reports a clear error indicating schema validation failure.

---

### User Story 3 - Generate Background Music Track (Priority: P2)

As a platform operator, I want to generate background audio for campaigns using a provider stub, so that the audio generation workflow can be tested and later integrated with real audio providers.

**Why this priority**: This skill demonstrates the provider adapter pattern with a stub implementation, validating the provider abstraction layer works correctly.

**Independent Test**: Can be tested by invoking the skill with audio parameters and verifying an audio file artifact is produced.

**Acceptance Scenarios**:

1. **Given** audio generation inputs (prompt, duration_sec, loopable, provider_id), **When** the skill is invoked, **Then** a placeholder audio file is created and registered as an artifact.

2. **Given** the stub provider is configured, **When** any audio request is made, **Then** the stub produces a valid audio file of the requested duration.

---

### User Story 4 - Assemble Campaign Manifest (Priority: P2)

As a platform operator, I want to assemble a campaign manifest from generated artifacts and configuration, so that the final campaign package references all required components.

**Why this priority**: This deterministic skill validates pure data transformation without LLM or provider dependencies, ensuring the manifest assembly logic is reliable.

**Independent Test**: Can be tested by providing artifact URIs and configuration, then validating the manifest structure.

**Acceptance Scenarios**:

1. **Given** valid inputs (campaign_id, video URIs, button_bounds, game_bundle_uri, outcome URIs, rules), **When** the skill is invoked, **Then** a manifest JSON is created referencing all provided URIs.

2. **Given** all required URIs are provided, **When** the manifest is generated, **Then** the manifest validates against the campaign manifest schema.

---

### User Story 5 - Partial Rebuild with Cache Reuse (Priority: P3)

As a platform operator, I want to update only the audio in an existing campaign while reusing cached steps, so that partial rebuilds are efficient and don't regenerate unchanged artifacts.

**Why this priority**: Cache reuse is an optimization that demonstrates the Run Engine's dependency tracking. This is valuable but not required for core functionality.

**Independent Test**: Can be tested by triggering an audio update on a completed run and verifying only audio-dependent steps re-execute.

**Acceptance Scenarios**:

1. **Given** a completed campaign run, **When** I trigger an audio update with a new prompt, **Then** only `generate_bgm_track`, `bundle_game_template`, and `assemble_campaign_manifest` re-run.

2. **Given** an audio update is triggered, **When** `game_config_from_template` has unchanged inputs, **Then** the step is marked as reused/skipped with the cached output.

3. **Given** a partial rebuild completes, **When** I inspect the new run, **Then** reused steps show "skipped" status while re-executed steps show "completed".

---

### Edge Cases

- What happens when Claude generates invalid JSON that cannot be fixed in the retry? The skill reports a validation error and the step fails with diagnostic information.
- What happens when a required artifact URI is missing from manifest assembly inputs? The skill validates required inputs and fails fast with a clear error message.
- What happens when the stub audio provider encounters an error? The skill surfaces the provider error and the step fails with the underlying cause.
- What happens when cache lookup fails or is corrupted? The Run Engine falls back to re-executing the step rather than failing the entire run.
- What happens when a workflow step depends on a failed upstream step? The dependent step is marked as blocked and not attempted until the upstream is resolved.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a deterministic skill (`assemble_campaign_manifest`) that creates campaign manifest JSON from artifact URIs and configuration without any external dependencies.

- **FR-002**: System MUST provide a provider-backed skill (`generate_bgm_track`) with a stub implementation that produces placeholder audio files for testing.

- **FR-003**: System MUST provide a Claude-powered skill (`game_config_from_template`) that generates JSON output validated against the game_config schema containing: template_id, difficulty, level_params (numbers), spawn_rates, scoring, controls, and assets refs.

- **FR-004**: System MUST support automatic retry with corrective prompting when Claude produces invalid JSON, with a maximum of 1 retry attempt.

- **FR-005**: System MUST provide a runnable workflow definition (`campaign.build.v1`) that orchestrates the three reference skills plus a stub bundler.

- **FR-006**: System MUST compute and store input hashes for each step execution to enable cache-based reuse.

- **FR-007**: System MUST support partial rebuilds where only steps with changed inputs are re-executed.

- **FR-008**: System MUST register all produced artifacts (manifest, audio, game_config, bundle) with content hashes for verification.

- **FR-009**: System MUST support a stub `bundle_game_template` step that produces a placeholder game bundle artifact.

- **FR-010**: System MUST support trigger payloads that include placeholder video URIs for testing the full manifest assembly flow.

- **FR-011**: System MUST capture diagnostic data for each step execution including: input hash, output snapshot, execution duration, and error details (if failed).

### Key Entities

- **Skill Execution**: Represents a single invocation of a skill handler with inputs, outputs, artifacts produced, and execution metadata.

- **Workflow Run**: Represents a complete execution of a workflow definition including all step statuses, timing, and produced artifacts.

- **Run Step**: Represents an individual step within a workflow run, tracking status (pending/running/completed/failed/skipped), input hash, and cache hit status.

- **Artifact Record**: Represents a produced artifact with type, URI, content hash, and metadata for verification and retrieval.

- **Campaign Manifest**: The final output artifact that references all campaign components (videos, audio, game bundle, config) for player consumption.

- **Game Config**: Generated configuration containing template_id, difficulty setting, level_params (numeric tuning values), spawn_rates (enemy/item generation), scoring rules, control mappings, and asset references.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A campaign build workflow completes successfully, producing 4 distinct artifacts (game_config, audio, bundle, manifest) all referenced correctly in the final manifest.

- **SC-002**: The Claude JSON generation skill produces valid output on first attempt for well-formed inputs at least 80% of the time, and successfully recovers via retry for remaining cases.

- **SC-003**: Partial rebuild (audio update) re-executes only 3 steps (bgm, bundle, manifest) while reusing 1 step (game_config), demonstrating working cache logic.

- **SC-004**: All workflow steps complete within reasonable time bounds for the stub implementations (full workflow under 30 seconds for stub providers).

- **SC-005**: The reference implementation validates the complete data flow: Registry → Runner → Providers → Artifacts → Run Engine → Workflow Registry.

## Assumptions

- The existing platform infrastructure (Registry, Runner, Artifacts, Run Engine services) from Specs 1-8 is implemented and functional.
- A stub audio provider will return a valid audio file format (WAV or MP3) without actual audio content for testing purposes.
- Claude API access is available for the JSON generation skill via the existing LiteLLM proxy.
- Video assets (intro, outcome_win, outcome_lose) are provided as placeholder URIs in the trigger payload rather than generated.
- The game template bundler produces a minimal valid bundle (index.html + placeholder JS) sufficient for manifest validation.

## Dependencies

- Spec 1: Skill Catalog and YAML loaders for skill registration
- Spec 2: Skill Runner service for executing skill handlers
- Spec 3: Provider adapters for stub audio provider
- Spec 4: Run Engine for workflow orchestration and step caching
- Spec 5: Prompt Registry for Claude skill prompts
- Spec 7: Workflow Registry for workflow definitions
- Spec 8: Campaign Context for run-scoped state management
