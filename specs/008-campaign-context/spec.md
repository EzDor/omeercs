# Feature Specification: Campaign Context Model

**Feature Branch**: `008-campaign-context`
**Created**: 2026-02-03
**Status**: Draft
**Input**: User description: "Campaign Context Model - runtime contract passed between workflow steps"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Orchestrator Updates Context After Step Completion (Priority: P1)

As a workflow orchestrator, I need to update the campaign context with step results so that subsequent steps can access artifacts produced by earlier steps.

**Why this priority**: This is the core mechanism that enables multi-step workflows. Without the ability to attach step results and update references, no workflow can function beyond a single step.

**Independent Test**: Can be fully tested by executing a single workflow step, attaching its output artifact, and verifying the context is correctly updated with both the artifact metadata and the appropriate reference pointer.

**Acceptance Scenarios**:

1. **Given** a running workflow with an initialized campaign context, **When** a step produces an artifact, **Then** the orchestrator can attach the artifact to the context with its type, URI, hash, and metadata.
2. **Given** a step has completed with an artifact of a known type (e.g., plan), **When** the orchestrator processes the result, **Then** the appropriate reference (e.g., plan_artifact_id) is automatically updated to point to the new artifact.
3. **Given** a step produces multiple artifacts, **When** the orchestrator attaches step results, **Then** all artifacts are stored and their references are correctly updated.

---

### User Story 2 - Input Selector Resolves Artifacts from Context (Priority: P1)

As an input selector for a workflow step, I need to retrieve required artifacts from the campaign context using logical names so that I can prepare the correct inputs for skill execution.

**Why this priority**: Input selectors are the consumers of context data. Without the ability to resolve artifacts by logical reference, steps cannot receive their required inputs.

**Independent Test**: Can be fully tested by creating a context with known artifacts and references, then calling the resolver to retrieve artifacts by logical name and verifying correct artifact data is returned.

**Acceptance Scenarios**:

1. **Given** a campaign context with a "plan" artifact referenced by plan_artifact_id, **When** an input selector requests the "plan" artifact, **Then** the resolver returns the complete artifact data including type, URI, hash, and metadata.
2. **Given** a campaign context where a requested artifact reference is not set, **When** an input selector requests that artifact, **Then** the resolver returns a clear indication that the artifact is not available.
3. **Given** a campaign context with an artifact referenced by ID, **When** the resolver is called with that artifact ID directly, **Then** the complete artifact data is returned from the artifacts map.

---

### User Story 3 - Load Context from Previous Run for Updates (Priority: P2)

As a workflow system, I need to initialize a new campaign context from a previous run so that update workflows can start with existing artifacts and only regenerate what has changed.

**Why this priority**: This enables the "update workflow" pattern where existing campaign assets are carried forward and only specific steps are re-executed. Important for efficiency but not required for basic workflow execution.

**Independent Test**: Can be fully tested by creating a completed run with artifacts, then loading a new context from that run and verifying all artifacts and references are correctly populated.

**Acceptance Scenarios**:

1. **Given** a completed workflow run with artifacts in the artifact registry, **When** a new update workflow starts with that run as base_run_id, **Then** the context loader populates the new context's artifacts map with all artifacts from the base run.
2. **Given** a base run with specific step outputs stored, **When** the context is loaded from that run, **Then** all reference pointers (plan_artifact_id, game_bundle_artifact_id, etc.) are populated from the base run's step outputs.
3. **Given** a base run ID that does not exist, **When** the context loader attempts to load from it, **Then** a clear error is returned indicating the run was not found.

---

### User Story 4 - Access Computed Data During Workflow Execution (Priority: P3)

As a workflow step or quality checker, I need to access computed scratch data (like input hashes and quality check results) so that I can make decisions about caching and validation.

**Why this priority**: The computed area supports advanced features like input-hash-based caching and quality tracking. These are optimization and monitoring features that build on the core context functionality.

**Independent Test**: Can be fully tested by storing input hashes and quality check results in the computed area, then verifying they can be retrieved and used for cache decisions or quality reporting.

**Acceptance Scenarios**:

1. **Given** a step has been executed with specific inputs, **When** the input hash is computed and stored, **Then** the hash can be retrieved from computed.input_hashes_by_step using the step ID.
2. **Given** a quality check has been performed on a step output, **When** the result is stored in computed.quality_checks, **Then** subsequent processes can retrieve the quality status for that artifact.

---

### Edge Cases

- What happens when an artifact reference is requested but the artifact was deleted from storage? The resolver should detect the inconsistency and return an appropriate error.
- How does the system handle circular references or duplicate artifact IDs? The context should validate uniqueness of artifact IDs when attaching step results.
- What happens when loading context from a partially completed run? The loader should populate only the artifacts and references that exist from completed steps.
- How does the system handle very large contexts with many artifacts? The context should support efficient lookups without loading all artifact data into memory simultaneously.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a CampaignContext structure that contains campaign_id, run_id, workflow_name, trigger information, artifact references, artifacts map, and computed data area.
- **FR-002**: System MUST allow orchestrators to attach step results including one or more artifacts with type, URI, hash, and metadata.
- **FR-003**: System MUST automatically update logical reference pointers (e.g., plan_artifact_id, game_bundle_artifact_id) when corresponding artifact types are attached.
- **FR-004**: System MUST provide a resolver that retrieves artifacts by logical reference name (e.g., "plan", "game_bundle") returning the full artifact data.
- **FR-005**: System MUST provide a context loader that initializes a new context from an existing run ID, populating artifacts and references from that run.
- **FR-006**: System MUST support storing computed data including input hashes per step and quality check results.
- **FR-007**: System MUST maintain a map of artifact_id to artifact data (type, URI, hash, metadata) for direct artifact access.
- **FR-008**: System MUST validate artifact ID uniqueness when attaching step results.
- **FR-009**: System MUST provide clear error responses when requested artifacts or references are not found.
- **FR-010**: System MUST support the following standard reference types: plan_artifact_id, intro_image_artifact_id, intro_video_artifact_id, button_segmentation_artifact_id, bgm_artifact_id, sfx_artifact_id, audio_manifest_artifact_id, game_config_artifact_id, game_bundle_artifact_id, outcome_win_video_artifact_id, outcome_lose_video_artifact_id, campaign_manifest_artifact_id.
- **FR-011**: System MUST persist the CampaignContext after each step completion to enable crash recovery and workflow debugging.
- **FR-012**: System MUST support up to 50 artifacts per CampaignContext to accommodate standard campaign complexity.
- **FR-013**: System MUST support extensible reference types via a configuration registry; custom reference types are validated against this registry before use.

### Key Entities

- **CampaignContext**: The runtime container holding all workflow execution state including identifiers (campaign_id, run_id, workflow_name), trigger details, artifact references, artifacts map, and computed scratch data.
- **Artifact**: A unit of output from a workflow step, containing type classification, storage URI, content hash for integrity verification, and flexible metadata.
- **Trigger**: Information about what initiated the workflow including type (manual, scheduled, API) and associated payload data.
- **ArtifactReference**: A logical pointer (by name like "plan" or "game_bundle") that resolves to an artifact ID in the context.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Workflow steps can attach artifacts and retrieve them by reference within the same workflow execution with 100% reliability.
- **SC-002**: Context loading from a previous run populates all existing artifacts and references correctly, enabling update workflows to resume with prior state.
- **SC-003**: Input selectors can resolve any standard reference type to its artifact data in a single operation.
- **SC-004**: Computed data (input hashes, quality checks) is accessible throughout workflow execution for cache optimization and quality monitoring.
- **SC-005**: Invalid artifact references or missing artifacts return clear, actionable error information rather than silent failures.
- **SC-006**: The context structure supports all 12 standard artifact reference types used in campaign generation workflows.

## Clarifications

### Session 2026-02-03

- Q: Should the context be persisted after each step, only at workflow completion, or on-demand? → A: Persist context after each step completion
- Q: What is the expected maximum number of artifacts a single CampaignContext should support? → A: Up to 50 artifacts (standard campaign complexity)
- Q: Should the system support custom reference types beyond the 12 standard types? → A: Extensible via configuration (new types registered, then validated)

## Assumptions

- The artifact registry and run/step storage systems already exist and are accessible for context loading operations.
- Artifact IDs are globally unique identifiers generated by the system.
- The trigger payload structure varies by trigger type and is stored as flexible structured data.
- Reference names follow a convention of `{artifact_type}_artifact_id` for automatic reference updates.
