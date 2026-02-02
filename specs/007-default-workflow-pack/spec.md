# Feature Specification: Default Workflow Pack

**Feature Branch**: `007-default-workflow-pack`
**Created**: 2026-01-26
**Status**: Draft
**Input**: User description: "Default Workflow Pack - Campaign Build and Update Workflows based on spec-07"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - End-to-End Campaign Build (Priority: P1)

A content operator wants to generate a complete campaign from a brief, including intro visuals, audio, game configuration, and outcome videos, all in one automated workflow run.

**Why this priority**: This is the core value proposition - automating the entire campaign creation process from a single brief, eliminating manual orchestration of multiple generation steps.

**Independent Test**: Can be fully tested by triggering a workflow with a campaign brief and verifying all expected assets (intro image, intro video, BGM, SFX, game bundle, outcome videos, manifest) are generated and assembled.

**Acceptance Scenarios**:

1. **Given** a valid campaign brief with brand assets and constraints, **When** the build workflow is triggered, **Then** all campaign assets are generated in the correct dependency order
2. **Given** a campaign build in progress, **When** a step fails, **Then** dependent steps are not executed and the failure is reported
3. **Given** a completed campaign build, **When** the manifest is assembled, **Then** it references all generated artifacts with correct paths and metadata
4. **Given** parallel-capable steps (e.g., BGM and SFX), **When** the workflow executes, **Then** these steps run concurrently to optimize build time

---

### User Story 2 - Audio Update Workflow (Priority: P2)

A content operator needs to replace or regenerate the audio tracks (BGM, SFX) for an existing campaign without rebuilding the entire campaign.

**Why this priority**: Audio updates are common iteration requests and demonstrate the partial rebuild capability that saves significant processing time.

**Independent Test**: Can be tested by providing a base run ID and audio parameters, then verifying only audio-related assets are regenerated while visual assets remain from the base run.

**Acceptance Scenarios**:

1. **Given** an existing campaign run, **When** an audio update is triggered with new BGM parameters, **Then** only BGM, SFX, audio mix, game bundle, and manifest are regenerated
2. **Given** an audio update request, **When** the workflow executes, **Then** it reuses the plan and visual assets from the base run
3. **Given** an audio update with custom SFX list, **When** the workflow completes, **Then** the new SFX are mixed with the regenerated BGM

---

### User Story 3 - Intro Visual Update Workflow (Priority: P2)

A content operator needs to regenerate the intro visuals (image, button segmentation, video loop) for an existing campaign while preserving other assets.

**Why this priority**: Intro visuals are the first impression; being able to iterate on them quickly without full rebuilds is essential for creative refinement.

**Independent Test**: Can be tested by triggering an intro update with style overrides and verifying only intro-related assets change while audio and outcomes remain from base run.

**Acceptance Scenarios**:

1. **Given** an existing campaign run, **When** an intro update is triggered with style overrides, **Then** only intro image, button segmentation, intro video, and manifest are regenerated
2. **Given** an intro update request, **When** the workflow executes, **Then** the button segmentation uses the newly generated intro image
3. **Given** an intro update with brand asset overrides, **When** the workflow completes, **Then** the new brand assets are reflected in the generated visuals

---

### User Story 4 - Outcome Video Update Workflow (Priority: P2)

A content operator needs to regenerate the win and/or lose outcome videos for an existing campaign.

**Why this priority**: Outcome videos often require iteration based on brand feedback without affecting the gameplay or intro experience.

**Independent Test**: Can be tested by triggering an outcome update and verifying only outcome videos and manifest are regenerated.

**Acceptance Scenarios**:

1. **Given** an existing campaign run, **When** an outcome update is triggered, **Then** only win video, lose video, and manifest are regenerated
2. **Given** an outcome update with only win prompt override, **When** the workflow executes, **Then** only the win outcome video is regenerated while lose video is reused

---

### User Story 5 - Game Configuration Update Workflow (Priority: P2)

A content operator needs to adjust game parameters (difficulty, speed, target score, theme) for an existing campaign without regenerating media assets.

**Why this priority**: Game tuning is a rapid iteration cycle that should not require expensive media regeneration.

**Independent Test**: Can be tested by triggering a game config update and verifying the game bundle is rebuilt with new parameters while all media assets are reused.

**Acceptance Scenarios**:

1. **Given** an existing campaign run, **When** a game config update is triggered, **Then** only game config, game bundle, manifest, and QA validation are executed
2. **Given** a game config update with difficulty changes, **When** the workflow completes, **Then** the new bundle reflects the updated difficulty settings
3. **Given** a game config update, **When** QA validation runs, **Then** it verifies the bundle integrity with the updated configuration

---

### User Story 6 - 3D Asset Replacement Workflow (Priority: P3)

A content operator needs to replace a 3D asset in an existing campaign with a newly generated and optimized model.

**Why this priority**: 3D asset updates are less common but represent an important capability for game customization.

**Independent Test**: Can be tested by triggering a 3D replacement with prompt and constraints, verifying the asset is generated, optimized, bundled, and validated.

**Acceptance Scenarios**:

1. **Given** an existing campaign run, **When** a 3D asset replacement is triggered, **Then** a new 3D asset is generated, optimized, bundled, and validated
2. **Given** a 3D replacement request with polygon budget constraints, **When** the asset is optimized, **Then** it meets the specified polygon budget

---

### User Story 7 - Workflow Registry Management (Priority: P1)

A platform administrator needs to load, validate, and expose workflow definitions to the Run Engine so that workflows can be discovered and executed.

**Why this priority**: Without the registry service, no workflows can be loaded or executed. This is foundational infrastructure.

**Independent Test**: Can be tested by loading workflow YAML files and verifying they are parsed, validated, and accessible via the registry service.

**Acceptance Scenarios**:

1. **Given** valid workflow YAML files in the registry directory, **When** the registry service starts, **Then** all workflows are loaded and available for execution
2. **Given** a workflow YAML with invalid schema, **When** the registry attempts to load it, **Then** a validation error is reported and the workflow is not registered
3. **Given** a registered workflow, **When** the Run Engine requests it by name and version, **Then** the workflow definition is returned

---

### Edge Cases

- When a base_run_id references a run that failed or was partially completed, the system MUST reject the update workflow with an error; only successfully completed base runs are valid references.
- Concurrent update workflows for the same campaign use optimistic locking: if another update completed after the referenced base_run_id, the system MUST reject the request with a stale reference error, requiring the user to retry with the latest run.
- When a referenced skill_id in a workflow step is unavailable or fails to load, the system MUST fail workflow registration entirely; all skill references are validated at load time (fail-fast).
- When input selectors in workflow definitions are missing or have invalid syntax, the system MUST fail workflow registration; selector syntax is validated at load time.
- When an update workflow references a base run that has been archived or deleted, the system MUST reject with a "not found" error; archived/deleted runs are not valid base references.

## Requirements *(mandatory)*

### Functional Requirements

**Workflow Registry**

- **FR-001**: System MUST load workflow definitions from YAML files in the `/workflows/` directory on startup
- **FR-002**: System MUST validate each workflow YAML against a defined schema before registration
- **FR-003**: System MUST expose registered workflows to the Run Engine for discovery and execution
- **FR-004**: System MUST support workflow versioning (workflow_name + version identifier)
- **FR-005**: System MUST provide an index file (`/workflows/index.yaml`) listing all available workflows

**Workflow Definition Structure**

- **FR-006**: Each workflow MUST define: workflow_name, version, and steps array
- **FR-007**: Each step MUST define: step_id, skill_id, and depends_on array (may be empty)
- **FR-008**: System MUST support input_selector configuration for declarative input mapping
- **FR-009**: System MUST support optional cache_policy per step
- **FR-010**: System MUST support optional retry_policy per step

**Input Selector System**

- **FR-011**: System MUST support `trigger` source for accessing run trigger payload data
- **FR-012**: System MUST support `step_output` source for accessing previous step artifacts and metadata
- **FR-013**: System MUST support `registry` source for accessing prompt/config/rubric identifiers
- **FR-014**: System MUST support `constants` source for fixed parameter values
- **FR-015**: System MUST implement `get(path)` operation for JSONPath-like lookups
- **FR-016**: System MUST implement `merge([...objects])` operation for combining objects
- **FR-017**: System MUST implement `pick(obj, keys[])` operation for selecting specific keys
- **FR-018**: System MUST implement `literal(value)` operation for constant values

**Build Workflow (campaign.build.v1)**

- **FR-019**: System MUST execute the full build workflow with 14 defined steps in dependency order
- **FR-020**: System MUST support parallel execution of independent steps (e.g., BGM and SFX)
- **FR-021**: System MUST generate and assemble a campaign manifest as the final artifact
- **FR-022**: System MUST validate the game bundle before completing the workflow
- **FR-023**: System MUST support optional quality review step using Claude critique

**Update Workflows**

- **FR-024**: Update workflows MUST accept a base_run_id to reference artifacts from a previous run
- **FR-025**: Update workflows MUST overlay change request fields onto base run artifacts
- **FR-026**: System MUST execute only the steps required for the specific update type
- **FR-027**: System MUST regenerate the manifest after any update workflow completes

**Specific Update Workflows**

- **FR-028**: Audio update workflow MUST execute: BGM, SFX, audio mix, bundle, manifest, QA steps
- **FR-029**: Intro update workflow MUST execute: intro image, segmentation, intro video, manifest, optional review steps
- **FR-030**: Outcome update workflow MUST execute: win video, lose video, manifest, optional review steps
- **FR-031**: Game config update workflow MUST execute: game config, bundle, manifest, QA steps
- **FR-032**: 3D asset workflow MUST execute: generate, optimize, bundle, manifest, QA steps

### Key Entities

- **Workflow Definition**: Represents a complete workflow with name, version, steps, and policies. Contains the DAG of skill executions.
- **Workflow Step**: Individual step within a workflow, referencing a skill, dependencies, input selectors, and optional policies.
- **Input Selector**: Declarative mapping configuration that defines how step inputs are derived from trigger, previous steps, registry, or constants.
- **Workflow Registry**: Central repository of all available workflow definitions, indexed by name and version.
- **Base Run Reference**: Link from an update workflow run to the original build run, enabling artifact reuse.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Full campaign build workflow completes within expected time bounds, generating all 14 step artifacts
- **SC-002**: Update workflows execute only their specified steps, reducing execution time by reusing unchanged artifacts
- **SC-003**: All workflow YAML files pass schema validation on registry load with zero failures
- **SC-004**: Input selector system correctly resolves all four source types (trigger, step_output, registry, constants)
- **SC-005**: Parallel-capable steps execute concurrently, improving overall build workflow efficiency
- **SC-006**: 100% of workflow steps that complete successfully produce artifacts accessible to dependent steps
- **SC-007**: Failed workflow steps correctly prevent execution of all dependent downstream steps
- **SC-008**: QA validation step successfully detects bundle integrity issues before workflow completion

## Clarifications

### Session 2026-02-02

- Q: What happens when a base_run_id references a run that failed or was partially completed? → A: Reject with error unless base run completed successfully
- Q: How does the system handle concurrent update workflows for the same campaign? → A: Optimistic locking - reject if base_run_id is stale
- Q: What happens when a referenced skill in a workflow step is unavailable? → A: Fail workflow registration if any skill_id is unresolved
- Q: How does the system handle missing or invalid input selectors? → A: Validate selector syntax at registration, fail if malformed
- Q: What happens when base run is archived or deleted? → A: Treat as invalid base_run_id, reject with "not found" error

## Assumptions

- The platform already has the Run Engine (spec-04) and Skill Runner (spec-01) services available and functional
- The recommended skills referenced in workflows (campaign_plan_from_brief, generate_intro_image, etc.) are already defined and registered
- Provider adapters (spec-03) for media generation services are operational
- The Prompt Registry (spec-05) is available for accessing prompts and configurations referenced in input selectors
- Workflow YAML files are version-controlled and deployed with the platform codebase
- A single workflow version is active at any time; versioning is for future capability, not runtime selection

## Dependencies

- Spec-01: Skill Runner Service - for executing individual workflow steps
- Spec-03: Provider Adapters - for media generation capabilities
- Spec-04: Run Engine - for workflow orchestration and step scheduling
- Spec-05: Prompt/Config Registry - for accessing prompts and configurations in input selectors
