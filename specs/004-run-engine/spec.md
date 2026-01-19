# Feature Specification: Run Engine (Workflow Orchestrator + Partial Rebuild)

**Feature Branch**: `004-run-engine`
**Created**: 2026-01-19
**Status**: Draft
**Input**: User description: "Run Engine - Workflow Orchestrator with Partial Rebuild support for executing workflow DAGs end-to-end with selective re-run capability"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Execute Full Workflow (Priority: P1)

A platform user initiates a campaign build workflow. The system executes all steps in the correct dependency order (topological order), running each step through the appropriate skill, and producing artifacts at each stage until the final campaign manifest is assembled.

**Why this priority**: This is the foundational capability - without end-to-end workflow execution, no other features (partial rebuild, caching) have value. Every workflow must work as a complete initial build first.

**Independent Test**: Can be fully tested by triggering a workflow and verifying all steps execute in order with correct artifact outputs. Delivers a complete campaign build from brief to final manifest.

**Acceptance Scenarios**:

1. **Given** a workflow definition with 13 steps in a DAG structure, **When** the user triggers an initial build, **Then** all steps execute in topological order respecting dependencies.
2. **Given** a step depends on artifacts from two previous steps, **When** both dependencies complete, **Then** the dependent step receives all required inputs and executes.
3. **Given** a workflow run is triggered, **When** execution begins, **Then** a run record is created with unique ID, workflow name, trigger type "initial", and status "running".
4. **Given** all steps complete successfully, **When** the final step finishes, **Then** the run status changes to "completed" and all artifacts are registered.

---

### User Story 2 - Partial Rebuild from Change Request (Priority: P2)

A user requests a specific change to an existing campaign (e.g., "change audio"). The system identifies only the impacted steps and their downstream dependents, re-runs only those steps, and reuses cached outputs for all unchanged steps.

**Why this priority**: Partial rebuild dramatically reduces time and cost for iterative changes - a common user workflow. Without it, every small change requires a full rebuild.

**Independent Test**: Can be tested by completing a full build, then triggering a change request and verifying only impacted steps re-execute while others use cached results.

**Acceptance Scenarios**:

1. **Given** a completed workflow run and a change request of type "audio.update", **When** the update is triggered, **Then** only audio-related steps and their downstream dependents are re-executed.
2. **Given** a step's input has not changed (same input hash), **When** a partial rebuild runs, **Then** the step is marked "skipped" and cached artifacts are reused.
3. **Given** a change request for intro update, **When** computing impacted steps, **Then** steps like "generate_intro_image", "segment_start_button", "generate_intro_video_loop" are marked for re-execution.
4. **Given** a step is re-executed with new inputs, **When** it produces new outputs, **Then** all downstream steps also re-execute with the new artifacts.

---

### User Story 3 - Step Caching for Performance (Priority: P2)

The system caches step outputs based on input hash. When a step runs with identical inputs to a previous execution, the cached result is returned immediately without re-executing the skill.

**Why this priority**: Caching enables both partial rebuild efficiency and cost savings across runs. It's essential for the partial rebuild story but also provides standalone value.

**Independent Test**: Can be tested by running the same step twice with identical inputs and verifying the second execution returns cached results without calling the underlying skill.

**Acceptance Scenarios**:

1. **Given** a step completes successfully, **When** the same step is requested with identical inputs (same input hash), **Then** cached artifacts are returned and step is marked "skipped".
2. **Given** caching is enabled for a step, **When** looking up cache, **Then** the cache key is constructed as "{step_id}:{input_hash}".
3. **Given** a step has cache_policy scope "global", **When** a different run has the same input hash, **Then** cached artifacts from the previous run are reused.
4. **Given** a step has cache_policy scope "run_only", **When** a different run has the same input hash, **Then** the step executes fresh (cache only applies within same run).

---

### User Story 4 - Workflow Failure Handling and Recovery (Priority: P3)

When a step fails, the system retries according to the step's retry policy. If all retries fail, the run is marked as failed while preserving completed step outputs for potential manual intervention or later retry.

**Why this priority**: Production workflows will inevitably encounter failures. Proper failure handling ensures no work is lost and enables recovery.

**Independent Test**: Can be tested by simulating a step failure and verifying retry behavior, final failure marking, and preservation of successful step artifacts.

**Acceptance Scenarios**:

1. **Given** a step fails during execution, **When** retry policy allows more attempts, **Then** the step is retried with configured backoff.
2. **Given** a step exhausts all retry attempts, **When** the final attempt fails, **Then** the step is marked "failed" and run status becomes "failed".
3. **Given** a run fails at step 7, **When** checking run state, **Then** steps 1-6 show "completed" with their artifacts preserved.
4. **Given** a worker crashes mid-run, **When** the worker restarts, **Then** the run can be resumed by checking DB step status.

---

### User Story 5 - Run Monitoring and Status Tracking (Priority: P3)

Users and system operators can query the current status of any run, view the status of individual steps, and retrieve artifacts produced by the workflow.

**Why this priority**: Visibility into run progress is essential for debugging and user confidence, but the core execution must work first.

**Independent Test**: Can be tested by triggering a workflow and querying run status, step statuses, and artifacts at various points during execution.

**Acceptance Scenarios**:

1. **Given** a run is in progress, **When** querying run status, **Then** the current status, all step statuses, and timestamps are returned.
2. **Given** a step has completed, **When** querying step details, **Then** the output artifact IDs, input hash, and timing information are returned.
3. **Given** a run has completed, **When** querying run artifacts, **Then** all artifacts produced by all steps are returned with their metadata.

---

### Edge Cases

- What happens when a circular dependency is detected in workflow definition? System must reject the workflow at registration time.
- How does system handle a step that produces no artifacts? Step can complete successfully with empty output_artifact_ids array.
- What happens when two steps have the same input hash in the same run? Each step is cached independently by step_id, so different steps with same input still execute separately.
- How does system handle external service timeout during skill execution? Respects retry policy, eventually marking step as failed with timeout error.
- What happens when cached artifacts are no longer available (deleted externally)? Cache lookup should verify artifact URI is valid; if not, treat as cache miss and re-execute.
- What happens when a change request type is unrecognized? System should reject the change request with a clear error message.

## Requirements *(mandatory)*

### Functional Requirements

**Run Lifecycle**
- **FR-001**: System MUST create a new run record when a workflow is triggered, with unique ID, workflow name, trigger type, and initial status "queued" or "running".
- **FR-002**: System MUST create run_step records for all steps in the workflow when a run is created, with initial status "pending".
- **FR-003**: System MUST update run status to "completed" when all steps complete successfully.
- **FR-004**: System MUST update run status to "failed" when any step fails after exhausting retries.
- **FR-005**: System MUST support cancellation of a run, updating status to "cancelled".

**Step Execution**
- **FR-006**: System MUST execute steps in topological order, ensuring all dependencies complete before a step begins. Independent steps with all dependencies satisfied MUST execute concurrently (parallel execution).
- **FR-007**: System MUST compute input hash as SHA256 of canonically-formatted JSON input for each step.
- **FR-008**: System MUST call the appropriate skill for each step execution with the computed input.
- **FR-009**: System MUST update step status to "running" when execution begins, "completed" when successful, "failed" when unsuccessful.
- **FR-010**: System MUST track step attempt count, incrementing on each retry.

**Caching**
- **FR-011**: System MUST check step cache before execution when caching is enabled for the step.
- **FR-012**: System MUST construct cache keys using format "{step_id}:{input_hash}".
- **FR-013**: System MUST mark steps as "skipped" when valid cached results are found and attach cached artifacts.
- **FR-014**: System MUST store step results in cache after successful execution when caching is enabled.
- **FR-015**: System MUST respect cache_policy scope (run_only vs global) when checking cache.
- **FR-015a**: Cache expiration policy MUST be storage-dependent: Redis-based cache MUST use configurable TTL; database/local cache MUST NOT use TTL but MUST provide a cleanup mechanism (e.g., manual invalidation, size-based eviction).

**Partial Rebuild**
- **FR-016**: System MUST accept ChangeRequest objects specifying the type and scope of requested changes.
- **FR-017**: System MUST map ChangeRequest types to impacted seed steps according to defined mappings.
- **FR-018**: System MUST compute downstream closure of impacted steps using workflow DAG edges.
- **FR-019**: System MUST create a new run of type "update" that re-executes only impacted steps.
- **FR-020**: System MUST reuse cached artifacts for non-impacted steps in partial rebuild runs.

**Retry and Error Handling**
- **FR-021**: System MUST retry failed steps according to step-specific retry policy (max_attempts, backoff_ms).
- **FR-022**: System MUST record step errors with structured error information.
- **FR-023**: System MUST be safe to resume after worker crash by checking persisted step status.
- **FR-024**: System MUST ensure step execution is idempotent (safe to retry without corrupting state).

**Artifact Management**
- **FR-025**: System MUST register artifacts produced by steps with type, URI, content hash, and metadata.
- **FR-026**: System MUST associate artifacts with the step that produced them via output_artifact_ids.
- **FR-027**: System SHOULD deduplicate artifacts by content hash when possible.

**Workflow Registry**
- **FR-028**: System MUST provide a registry to retrieve workflow definitions by name and optional version.
- **FR-029**: System MUST validate workflow DAG has no circular dependencies.
- **FR-030**: System MUST support workflow definition with steps, dependencies, input selectors, cache policies, and retry policies.

**Observability**
- **FR-031**: System MUST emit structured log events for key lifecycle moments: run start, run complete, run failed, step start, step complete, step failed, step skipped (cache hit).
- **FR-032**: Each log event MUST include context: run_id, step_id (where applicable), status, duration, and error details (on failure).
- **FR-033**: System MUST log cache hit/miss events with cache key for debugging cache behavior.

### Key Entities

- **Run**: Represents one execution instance of a workflow. Contains run ID, workflow name, trigger type (initial/update), trigger payload, status, and timestamps.
- **RunStep**: Represents one step's execution within a run. Contains step ID, run reference, status, input hash, timing, attempt count, error details, and output artifact references.
- **Artifact**: Output produced by a step. Contains type (MIME type), storage URI, content hash, and metadata.
- **StepCache**: Mapping from cache key to artifact references for reuse. Key format: "{step_id}:{input_hash}".
- **WorkflowSpec**: Definition of a workflow including name, version, and ordered steps.
- **StepSpec**: Definition of a workflow step including step ID, skill reference, dependencies, input selector, cache policy, and retry policy.
- **ChangeRequest**: Specification of a requested change including type and payload for partial rebuild.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A 13-step workflow completes end-to-end initial build successfully within expected time bounds based on individual skill execution times.
- **SC-002**: Partial rebuild for a single-domain change (e.g., audio) completes in less than 50% of full rebuild time by skipping unchanged steps.
- **SC-003**: Cached steps return results within 1 second (cache lookup time) rather than full skill execution time.
- **SC-004**: Failed steps retry according to policy before marking the run as failed, ensuring transient failures are handled automatically.
- **SC-005**: After worker crash, runs can be resumed without data loss or corruption by checking persisted step status.
- **SC-006**: System maintains correct execution order for all valid DAG topologies, never executing a step before its dependencies complete.
- **SC-007**: Input hash computation is deterministic - same inputs always produce same hash regardless of JSON key ordering.
- **SC-008**: All run, step, and artifact data can be queried to provide full visibility into workflow execution state.

## Clarifications

### Session 2026-01-19

- Q: Should independent steps (no dependency relationship) execute in parallel or sequentially? → A: Parallel execution - Independent steps with satisfied dependencies run concurrently
- Q: What is the cache expiration policy? → A: Storage-dependent: Redis cache uses TTL; database/local cache has no TTL but requires cleanup mechanism
- Q: What observability signals should the Run Engine emit? → A: Structured logging only - Key events logged with context (run_id, step_id, status, duration, errors)

## Assumptions

- The SkillRunner service from Spec 1 is available and functional for executing individual skills.
- BullMQ is the job queue infrastructure and is already configured in the platform.
- The input_selector functions in step definitions are synchronous and deterministic.
- Artifact storage (URIs) is handled externally; this spec focuses on metadata registration.
- Canonical JSON serialization follows stable key ordering and handles standard JSON types.
- The platform's database supports the required tables (runs, run_steps, artifacts, step_cache).
