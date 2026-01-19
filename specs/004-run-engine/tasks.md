# Tasks: Run Engine (Workflow Orchestrator + Partial Rebuild)

**Input**: Design documents from `/specs/004-run-engine/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/run-engine-api.yaml, quickstart.md

**Tests**: Not explicitly requested in feature specification - test tasks omitted.

**Organization**: Tasks grouped by user story for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3, US4, US5)
- Include exact file paths in descriptions

## Path Conventions (Monorepo)

- **DTOs**: `dto/src/run-engine/`
- **Entities**: `dao/src/entities/`
- **Migrations**: `dao/src/migrations/`
- **Common**: `common/src/queues/`
- **Agent Platform**: `agent-platform/src/run-engine/`
- **API Center**: `api-center/src/run-engine/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization, dependencies, and basic structure

- [X] T001 Install new dependencies: `pnpm --filter agent-platform add fast-json-stable-stringify typescript-graph && pnpm --filter agent-platform add -D @types/fast-json-stable-stringify`
- [X] T002 [P] Create run-engine directory structure in `agent-platform/src/run-engine/` with subdirs: services/, processors/, interfaces/
- [X] T003 [P] Create run-engine directory structure in `api-center/src/run-engine/` with subdirs: services/
- [X] T004 [P] Create run-engine directory structure in `dto/src/run-engine/`
- [X] T005 Add RUN_ORCHESTRATION and RUN_STEPS queue names to `common/src/queues/queue-names.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core entities, DTOs, and interfaces that ALL user stories depend on

**CRITICAL**: No user story work can begin until this phase is complete

### DTOs

- [X] T006 [P] Create WorkflowSpec and StepSpec interfaces in `dto/src/run-engine/workflow.dto.ts` per data-model.md
- [X] T007 [P] Create RunContext and StepOutput interfaces in `dto/src/run-engine/run-context.dto.ts` per data-model.md
- [X] T008 [P] Create ChangeRequest and ChangeRequestType types in `dto/src/run-engine/change-request.dto.ts` per data-model.md
- [X] T009 [P] Create TriggerRunRequest, TriggerRunResponse DTOs in `dto/src/run-engine/run.dto.ts` per OpenAPI spec
- [X] T010 [P] Create RunResponse, RunStepsResponse DTOs in `dto/src/run-engine/run.dto.ts` per OpenAPI spec
- [X] T011 [P] Create RunStep, RunError, StepError DTOs in `dto/src/run-engine/run-step.dto.ts` per OpenAPI spec
- [X] T012 Create dto barrel export in `dto/src/run-engine/index.ts` and update `dto/src/index.ts`

### Entities & Database

- [X] T013 [P] Create Run entity in `dao/src/entities/run.entity.ts` extending BaseEntity per data-model.md
- [X] T014 [P] Create RunStep entity in `dao/src/entities/run-step.entity.ts` extending BaseEntity per data-model.md
- [X] T015 [P] Create StepCache entity in `dao/src/entities/step-cache.entity.ts` extending BaseEntity per data-model.md
- [X] T016 Create TypeORM migration for run_status, run_trigger_type, step_status, cache_scope enums and runs, run_steps, step_cache tables in `dao/src/migrations/{timestamp}-CreateRunEngineSchema.ts` per data-model.md
- [X] T017 Register Run, RunStep, StepCache entities in `dao/src/entities/index.ts` and DataSource configuration
- [ ] T018 Run migration: `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/agentic_template pnpm migration:run`

### Core Interfaces

- [X] T019 [P] Create WorkflowSpec interface in `agent-platform/src/run-engine/interfaces/workflow-spec.interface.ts`
- [X] T020 [P] Create StepSpec interface in `agent-platform/src/run-engine/interfaces/step-spec.interface.ts`
- [X] T021 [P] Create RunContext interface in `agent-platform/src/run-engine/interfaces/run-context.interface.ts`

### Core Services

- [X] T022 Implement InputHasherService with computeHash() and createCacheKey() methods using fast-json-stable-stringify in `agent-platform/src/run-engine/services/input-hasher.service.ts` per research.md
- [X] T023 Implement DependencyGraphService with topologicalSort() and downstreamClosure() methods using typescript-graph in `agent-platform/src/run-engine/services/dependency-graph.service.ts` per research.md
- [X] T024 Implement WorkflowRegistryService with register(), getWorkflow(), listWorkflows() methods in `agent-platform/src/run-engine/services/workflow-registry.service.ts`

### Module Setup

- [X] T025 Create RunEngineModule in `agent-platform/src/run-engine/run-engine.module.ts` importing entities, registering services and processors
- [X] T026 Create RunEngineModule in `api-center/src/run-engine/run-engine.module.ts` importing DTOs, registering controller and API service
- [X] T027 Import RunEngineModule in `agent-platform/src/app.module.ts`
- [X] T028 Import RunEngineModule in `api-center/src/app.module.ts`

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 1 - Execute Full Workflow (Priority: P1) MVP

**Goal**: Execute a workflow DAG end-to-end with all steps in topological order, producing artifacts at each stage

**Independent Test**: Trigger a workflow via API, verify all steps execute in correct order, run completes with status "completed"

### Implementation for User Story 1

- [X] T029 [US1] Implement RunEngineService.trigger() method to create Run and RunStep records, enqueue to RUN_ORCHESTRATION queue in `agent-platform/src/run-engine/services/run-engine.service.ts`
- [X] T030 [US1] Implement RunEngineService.createRunSteps() to create pending RunStep records for all workflow steps in `agent-platform/src/run-engine/services/run-engine.service.ts`
- [X] T031 [US1] Implement RunOrchestratorProcessor to process RUN_ORCHESTRATION jobs, execute steps in topological order using DependencyGraphService in `agent-platform/src/run-engine/processors/run-orchestrator.processor.ts`
- [X] T032 [US1] Implement step execution loop: find ready steps (dependencies completed), execute via SkillRunner, update RunStep status in `agent-platform/src/run-engine/processors/run-orchestrator.processor.ts`
- [X] T033 [US1] Implement parallel step execution using Promise.all for independent steps with satisfied dependencies in `agent-platform/src/run-engine/processors/run-orchestrator.processor.ts`
- [X] T034 [US1] Implement input computation for each step using inputSelector from StepSpec and RunContext in `agent-platform/src/run-engine/services/run-engine.service.ts`
- [X] T035 [US1] Implement run completion logic: update Run status to "completed" when all steps complete in `agent-platform/src/run-engine/processors/run-orchestrator.processor.ts`
- [X] T036 [US1] Implement RunEngineApiService.triggerRun() as queue producer in `api-center/src/run-engine/services/run-engine-api.service.ts`
- [X] T037 [US1] Implement POST /runs endpoint in `api-center/src/run-engine/run-engine.controller.ts` per OpenAPI spec
- [X] T038 [US1] Implement GET /runs/{runId} endpoint in `api-center/src/run-engine/run-engine.controller.ts` per OpenAPI spec
- [X] T039 [US1] Add structured logging for run start, step start, step complete, run complete events per FR-031/FR-032 in `agent-platform/src/run-engine/processors/run-orchestrator.processor.ts`

**Checkpoint**: User Story 1 complete - full workflow execution works end-to-end

---

## Phase 4: User Story 3 - Step Caching for Performance (Priority: P2)

**Goal**: Cache step outputs by input hash; return cached results without re-executing skills

**Independent Test**: Run same step twice with identical inputs, verify second execution returns cached result with cacheHit=true

**Note**: US3 (Caching) implemented before US2 (Partial Rebuild) because partial rebuild depends on caching

### Implementation for User Story 3

- [ ] T040 [US3] Implement StepCacheService.getCachedResult() with Redis hot cache lookup, PostgreSQL cold cache fallback, cache promotion in `agent-platform/src/run-engine/services/step-cache.service.ts` per research.md
- [ ] T041 [US3] Implement StepCacheService.setCachedResult() to write to both Redis (with TTL) and PostgreSQL in `agent-platform/src/run-engine/services/step-cache.service.ts`
- [ ] T042 [US3] Implement cache key construction as `{workflowName}:{stepId}:{inputHash}` in StepCacheService per FR-012 in `agent-platform/src/run-engine/services/step-cache.service.ts`
- [ ] T043 [US3] Implement cache scope logic (global vs run_only) in StepCacheService.getCachedResult() per FR-015 in `agent-platform/src/run-engine/services/step-cache.service.ts`
- [ ] T044 [US3] Integrate cache lookup before step execution in RunOrchestratorProcessor: check cache, mark step "skipped" on hit in `agent-platform/src/run-engine/processors/run-orchestrator.processor.ts`
- [ ] T045 [US3] Integrate cache storage after successful step execution in RunOrchestratorProcessor in `agent-platform/src/run-engine/processors/run-orchestrator.processor.ts`
- [ ] T046 [US3] Add structured logging for cache hit/miss events with cache key per FR-033 in `agent-platform/src/run-engine/services/step-cache.service.ts`

**Checkpoint**: User Story 3 complete - caching works, same inputs return cached results

---

## Phase 5: User Story 2 - Partial Rebuild from Change Request (Priority: P2)

**Goal**: Re-execute only impacted steps and downstream dependents based on ChangeRequest type

**Independent Test**: Complete full build, trigger change request, verify only impacted steps re-execute while others use cached results

### Implementation for User Story 2

- [ ] T047 [US2] Implement ChangeRequestMapperService with mappings from ChangeRequestType to impacted seed step IDs in `agent-platform/src/run-engine/services/change-request-mapper.service.ts` per quickstart.md
- [ ] T048 [US2] Implement ChangeRequestMapperService.getImpactedSteps() to compute downstream closure using DependencyGraphService in `agent-platform/src/run-engine/services/change-request-mapper.service.ts`
- [ ] T049 [US2] Implement RunEngineService.triggerUpdate() to create update Run with baseRunId reference in `agent-platform/src/run-engine/services/run-engine.service.ts`
- [ ] T050 [US2] Implement update run step creation: copy non-impacted steps as "skipped" with cached artifacts, create impacted steps as "pending" in `agent-platform/src/run-engine/services/run-engine.service.ts`
- [ ] T051 [US2] Implement TriggerUpdateRequest DTO validation in `dto/src/run-engine/change-request.dto.ts`
- [ ] T052 [US2] Implement POST /runs/{runId}/update endpoint in `api-center/src/run-engine/run-engine.controller.ts` per OpenAPI spec
- [ ] T053 [US2] Validate base run is completed before allowing update in `api-center/src/run-engine/services/run-engine-api.service.ts`

**Checkpoint**: User Story 2 complete - partial rebuild works, only impacted steps re-execute

---

## Phase 6: User Story 4 - Workflow Failure Handling and Recovery (Priority: P3)

**Goal**: Retry failed steps per policy, mark run as failed after exhausted retries, preserve completed step outputs

**Independent Test**: Simulate step failure, verify retry with backoff, final failure marking, and artifact preservation

### Implementation for User Story 4

- [ ] T054 [US4] Implement retry logic in RunOrchestratorProcessor: respect retryPolicy.maxAttempts and backoffMs with exponential backoff in `agent-platform/src/run-engine/processors/run-orchestrator.processor.ts`
- [ ] T055 [US4] Implement step error recording with structured StepError in RunStep.error field in `agent-platform/src/run-engine/processors/run-orchestrator.processor.ts`
- [ ] T056 [US4] Implement run failure handling: update Run status to "failed" when step exhausts retries, preserve completed step artifacts in `agent-platform/src/run-engine/processors/run-orchestrator.processor.ts`
- [ ] T057 [US4] Implement crash recovery: on worker restart, check persisted step status and resume run from last known state in `agent-platform/src/run-engine/processors/run-orchestrator.processor.ts`
- [ ] T058 [US4] Implement idempotent step execution using Redis SETNX lock pattern per research.md in `agent-platform/src/run-engine/services/run-engine.service.ts`
- [ ] T059 [US4] Add structured logging for step failure, retry attempt, final failure events in `agent-platform/src/run-engine/processors/run-orchestrator.processor.ts`

**Checkpoint**: User Story 4 complete - failure handling and recovery work correctly

---

## Phase 7: User Story 5 - Run Monitoring and Status Tracking (Priority: P3)

**Goal**: Query run status, step statuses, and retrieve artifacts produced by workflow

**Independent Test**: Trigger workflow, query status at various points, verify accurate step counts and artifact retrieval

### Implementation for User Story 5

- [ ] T060 [US5] Implement RunEngineService.getRun() with stepsSummary computation in `agent-platform/src/run-engine/services/run-engine.service.ts`
- [ ] T061 [US5] Implement RunEngineService.getRunSteps() with optional status filter in `agent-platform/src/run-engine/services/run-engine.service.ts`
- [ ] T062 [US5] Implement RunEngineService.getRunArtifacts() to retrieve all artifacts from completed steps in `agent-platform/src/run-engine/services/run-engine.service.ts`
- [ ] T063 [US5] Implement GET /runs/{runId}/steps endpoint in `api-center/src/run-engine/run-engine.controller.ts` per OpenAPI spec
- [ ] T064 [US5] Implement GET /runs/{runId}/artifacts endpoint in `api-center/src/run-engine/run-engine.controller.ts` per OpenAPI spec
- [ ] T065 [US5] Implement POST /runs/{runId}/cancel endpoint to cancel running workflow in `api-center/src/run-engine/run-engine.controller.ts` per OpenAPI spec
- [ ] T066 [US5] Implement run cancellation logic: mark Run as "cancelled", stop pending steps in `agent-platform/src/run-engine/services/run-engine.service.ts`
- [ ] T067 [US5] Implement GET /workflows endpoint to list available workflows in `api-center/src/run-engine/run-engine.controller.ts` per OpenAPI spec
- [ ] T068 [US5] Implement GET /workflows/{workflowName} endpoint to get workflow definition in `api-center/src/run-engine/run-engine.controller.ts` per OpenAPI spec

**Checkpoint**: User Story 5 complete - full monitoring and status tracking available

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Validation, edge cases, and final cleanup

- [ ] T069 [P] Implement workflow DAG cycle detection on registration using DependencyGraphService in `agent-platform/src/run-engine/services/workflow-registry.service.ts` per edge case
- [ ] T070 [P] Implement unrecognized ChangeRequest type validation with clear error message in `agent-platform/src/run-engine/services/change-request-mapper.service.ts` per edge case
- [ ] T071 [P] Implement cached artifact URI validation (verify artifact still exists) in StepCacheService per edge case in `agent-platform/src/run-engine/services/step-cache.service.ts`
- [ ] T072 [P] Add input validation decorators (class-validator) to all DTOs in `dto/src/run-engine/`
- [ ] T073 Create sample workflow definition for campaign.build.v1 in `agent-platform/src/run-engine/workflows/campaign-build.workflow.ts` per quickstart.md
- [ ] T074 Run quickstart.md validation: test API endpoints with curl commands

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3-7)**: All depend on Foundational phase completion
  - US1 (Phase 3): No dependencies on other user stories
  - US3 (Phase 4): Depends on US1 completion (needs step execution to cache)
  - US2 (Phase 5): Depends on US3 completion (partial rebuild uses cache)
  - US4 (Phase 6): Depends on US1 completion (needs step execution to retry)
  - US5 (Phase 7): Depends on US1 completion (needs runs to monitor)
- **Polish (Phase 8)**: Depends on all user stories being complete

### User Story Dependencies

```
Phase 1: Setup
    ↓
Phase 2: Foundational (BLOCKS ALL)
    ↓
Phase 3: US1 - Execute Full Workflow (MVP)
    ↓
    ├── Phase 4: US3 - Step Caching (depends on US1)
    │       ↓
    │   Phase 5: US2 - Partial Rebuild (depends on US3)
    │
    ├── Phase 6: US4 - Failure Handling (depends on US1)
    │
    └── Phase 7: US5 - Monitoring (depends on US1)
            ↓
        Phase 8: Polish
```

### Within Each User Story

- Services before processors
- Core logic before API endpoints
- Implementation before logging/validation

### Parallel Opportunities

- All Setup tasks marked [P] can run in parallel
- All Foundational DTO tasks (T006-T011) can run in parallel
- All Foundational entity tasks (T013-T015) can run in parallel
- All Foundational interface tasks (T019-T021) can run in parallel
- All Polish tasks marked [P] can run in parallel
- US4 and US5 can run in parallel (both only depend on US1)

---

## Parallel Example: Foundational DTOs

```bash
# Launch all DTO tasks together:
Task: "Create WorkflowSpec and StepSpec interfaces in dto/src/run-engine/workflow.dto.ts"
Task: "Create RunContext and StepOutput interfaces in dto/src/run-engine/run-context.dto.ts"
Task: "Create ChangeRequest and ChangeRequestType types in dto/src/run-engine/change-request.dto.ts"
Task: "Create TriggerRunRequest, TriggerRunResponse DTOs in dto/src/run-engine/run.dto.ts"
Task: "Create RunResponse, RunStepsResponse DTOs in dto/src/run-engine/run.dto.ts"
Task: "Create RunStep, RunError, StepError DTOs in dto/src/run-engine/run-step.dto.ts"
```

## Parallel Example: Foundational Entities

```bash
# Launch all entity tasks together:
Task: "Create Run entity in dao/src/entities/run.entity.ts"
Task: "Create RunStep entity in dao/src/entities/run-step.entity.ts"
Task: "Create StepCache entity in dao/src/entities/step-cache.entity.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Test full workflow execution via POST /runs
5. Deploy/demo if ready

### Incremental Delivery

1. Complete Setup + Foundational -> Foundation ready
2. Add User Story 1 -> Test workflow execution -> Deploy/Demo (MVP!)
3. Add User Story 3 (Caching) -> Test cache behavior -> Deploy/Demo
4. Add User Story 2 (Partial Rebuild) -> Test partial rebuild -> Deploy/Demo
5. Add User Story 4 (Failure Handling) -> Test retry behavior -> Deploy/Demo
6. Add User Story 5 (Monitoring) -> Test status queries -> Deploy/Demo

### Execution Order Recommendation

Execute in this exact order for optimal dependency flow:

```
T001 -> T002-T005 (parallel) -> T006-T011 (parallel) -> T012 ->
T013-T015 (parallel) -> T016 -> T017 -> T018 ->
T019-T021 (parallel) -> T022-T024 (sequential) -> T025-T028 (sequential) ->
[US1: T029-T039] -> [US3: T040-T046] -> [US2: T047-T053] ->
[US4: T054-T059 + US5: T060-T068 in parallel] -> [Polish: T069-T074]
```

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- US3 (Caching) implemented before US2 (Partial Rebuild) because partial rebuild depends on caching
- US4 and US5 can run in parallel after US1 completes
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Total tasks: 74
