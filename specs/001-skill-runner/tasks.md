# Tasks: Skill Runner

**Input**: Design documents from `/specs/001-skill-runner/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/skill-runner.openapi.yaml

**Tests**: Tests are included as they support the reliability requirements (SC-002, SC-006).

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1-US6)
- Include exact file paths in descriptions

## Path Conventions

Based on plan.md structure:
- **agent-platform**: `agent-platform/src/skills/` (main implementation)
- **dao**: `dao/src/entities/`, `dao/src/migrations/` (database)
- **dto**: `dto/src/skills/` (shared DTOs)
- **tests**: `agent-platform/test/` (tests)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization, dependencies, and directory structure

- [X] T001 Add Ajv dependencies to agent-platform package in agent-platform/package.json (ajv ^8.x, ajv-formats ^3.x)
- [X] T002 [P] Create skill-runner directory structure in agent-platform/src/skills/skill-runner/
- [X] T003 [P] Create artifact-registry directory structure in agent-platform/src/skills/artifact-registry/
- [X] T004 [P] Create test directories in agent-platform/test/skill-runner/ and agent-platform/test/artifact-registry/
- [X] T005 Run pnpm install to install new dependencies

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core interfaces, entities, and shared infrastructure that ALL user stories depend on

**CRITICAL**: No user story work can begin until this phase is complete

### Interfaces & Types

- [X] T006 [P] Create SkillErrorCode enum and SkillException base class in agent-platform/src/skills/skill-runner/exceptions/skill.exception.ts
- [X] T007 [P] Create SkillInputValidationException in agent-platform/src/skills/skill-runner/exceptions/skill-input-validation.exception.ts
- [X] T008 [P] Create SkillOutputValidationException in agent-platform/src/skills/skill-runner/exceptions/skill-output-validation.exception.ts
- [X] T009 [P] Create SkillExecutionException in agent-platform/src/skills/skill-runner/exceptions/skill-execution.exception.ts
- [X] T010 [P] Create SkillPolicyViolationException in agent-platform/src/skills/skill-runner/exceptions/skill-policy-violation.exception.ts
- [X] T011 [P] Create SkillTimeoutException in agent-platform/src/skills/skill-runner/exceptions/skill-timeout.exception.ts
- [X] T012 [P] Create EnhancedSkillExecutionContext interface in agent-platform/src/skills/skill-runner/interfaces/execution-context.interface.ts
- [X] T013 [P] Create SkillResult, ArtifactRef, SkillDebugInfo interfaces in agent-platform/src/skills/skill-runner/interfaces/skill-result.interface.ts
- [X] T014 [P] Create SecretsAccessor and SkillPolicy interfaces in agent-platform/src/skills/skill-runner/interfaces/skill-policy.interface.ts
- [X] T015 Create exceptions index barrel file in agent-platform/src/skills/skill-runner/exceptions/index.ts
- [X] T016 Create interfaces index barrel file in agent-platform/src/skills/skill-runner/interfaces/index.ts

### Database Entity & Migration

- [X] T017 [P] Create ArtifactEntity in dao/src/entities/artifact.entity.ts per data-model.md
- [X] T018 [P] Create Artifact DTOs (ArtifactDto, CreateArtifactDto, ArtifactQueryDto) in dto/src/skills/artifact.dto.ts
- [X] T019 Export ArtifactEntity from dao/src/datasource.ts (no index.ts exists in dao)
- [X] T020 Export Artifact DTOs from dto/src/skills/index.ts
- [X] T021 Build dto package (pnpm --filter @agentic-template/dto build)
- [X] T022 Build dao package (pnpm --filter dao build)
- [X] T023 Generate CreateArtifactTable migration in dao/src/migrations/

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 4 - Load Skills from Catalog (Priority: P1) 🎯 MVP-Required

**Goal**: Skills load from YAML descriptors and are available for execution with version support

**Independent Test**: Create a skill descriptor and verify it loads correctly with all required fields validated

**Why P1 & First**: Loading skills from catalog is prerequisite for all other stories - can't execute, validate, or register artifacts without loaded skills

### Tests for User Story 4

- [X] T024 [P] [US4] Unit test for catalog loading in agent-platform/test/skill-runner/skill-catalog-loader.service.spec.ts

### Implementation for User Story 4

- [X] T025 [US4] Review existing SkillCatalogService in agent-platform/src/skills/services/skill-catalog.service.ts for required enhancements
- [X] T026 [US4] Add descriptor validation for required fields (skill_id, version, title, input_schema, output_schema, implementation) in skill-catalog.service.ts
- [X] T027 [US4] Add version resolution logic (latest by semver when not specified) to getSkill method in skill-catalog.service.ts
- [X] T028 [US4] Add getSkillVersions method to return all versions of a skill in skill-catalog.service.ts
- [X] T029 [US4] Add validation error reporting with specific missing fields in skill-catalog.service.ts

**Checkpoint**: Skill catalog loads descriptors and validates required fields, version resolution works

---

## Phase 4: User Story 1 - Execute a Registered Skill (Priority: P1) 🎯 MVP

**Goal**: Execute any registered skill by identifier with proper context and return structured SkillResult

**Independent Test**: Register a simple skill and execute it via the runner, verifying the output matches expected results

### Tests for User Story 1

- [X] T030 [P] [US1] Unit test for SkillRunnerService in agent-platform/test/skill-runner/skill-runner.service.spec.ts
- [X] T031 [P] [US1] Unit test for ExecutionContextService in agent-platform/test/skill-runner/execution-context.service.spec.ts
- [X] T032 [P] [US1] Unit test for WorkspaceService in agent-platform/test/skill-runner/workspace.service.spec.ts

### Implementation for User Story 1

- [X] T033 [P] [US1] Create WorkspaceService for temp directory management in agent-platform/src/skills/skill-runner/services/workspace.service.ts
- [X] T034 [P] [US1] Create SecretsService implementing SecretsAccessor in agent-platform/src/skills/skill-runner/services/secrets.service.ts
- [X] T035 [US1] Create ExecutionContextService to build EnhancedSkillExecutionContext in agent-platform/src/skills/skill-runner/services/execution-context.service.ts
- [X] T036 [US1] Create SkillRunnerService with execute(skillId, input, options?) method in agent-platform/src/skills/skill-runner/skill-runner.service.ts
- [X] T037 [US1] Implement handler resolution and invocation in SkillRunnerService
- [X] T038 [US1] Implement timeout enforcement using AbortController pattern per research.md in SkillRunnerService
- [X] T039 [US1] Implement workspace cleanup on execution completion (success/failure) in SkillRunnerService
- [X] T040 [US1] Create SkillRunnerModule with providers and exports in agent-platform/src/skills/skill-runner/skill-runner.module.ts
- [X] T041 [US1] Update SkillsModule to import SkillRunnerModule in agent-platform/src/skills/skills.module.ts

**Checkpoint**: Can execute a skill by ID with version support, receives structured SkillResult with run_id

---

## Phase 5: User Story 2 - Validate Input and Output Data (Priority: P1)

**Goal**: Validate skill inputs/outputs against JSON schemas before/after execution

**Independent Test**: Provide valid and invalid inputs to a skill and verify appropriate validation responses

### Tests for User Story 2

- [X] T042 [P] [US2] Unit test for SchemaValidatorService in agent-platform/test/skill-runner/schema-validator.service.spec.ts

### Implementation for User Story 2

- [X] T043 [US2] Create SchemaValidatorService with Ajv instance in agent-platform/src/skills/skill-runner/services/schema-validator.service.ts
- [X] T044 [US2] Implement validateInput(schema, input) method returning detailed errors in SchemaValidatorService
- [X] T045 [US2] Implement validateOutput(schema, output) method returning detailed errors in SchemaValidatorService
- [X] T046 [US2] Implement schema compilation caching for performance in SchemaValidatorService
- [X] T047 [US2] Integrate input validation before handler execution in SkillRunnerService
- [X] T048 [US2] Integrate output validation after handler execution in SkillRunnerService
- [X] T049 [US2] Return INPUT_VALIDATION_FAILED error with field details when input invalid
- [X] T050 [US2] Return OUTPUT_VALIDATION_FAILED error with schema violations when output invalid

**Checkpoint**: Invalid inputs are rejected with clear field errors, invalid outputs caught with schema details

---

## Phase 6: User Story 6 - Provide Execution Context to Skills (Priority: P2)

**Goal**: Skills receive rich execution context with run ID, workspace, logger, secrets, and policy

**Independent Test**: Create a skill that reads context values and verify they are correctly populated

### Tests for User Story 6

- [ ] T051 [P] [US6] Integration test verifying context fields in agent-platform/test/skill-runner/integration/context-injection.integration.spec.ts

### Implementation for User Story 6

- [ ] T052 [US6] Ensure runId (UUID) is generated and included in context in ExecutionContextService
- [ ] T053 [US6] Ensure workspaceDir is unique per execution in ExecutionContextService
- [ ] T054 [US6] Create scoped Logger per execution (`SkillRunner:{skillId}:{runId}`) in ExecutionContextService
- [ ] T055 [US6] Inject secrets from ConfigService/environment in SecretsService
- [ ] T056 [US6] Extract and inject policy from skill descriptor in ExecutionContextService
- [ ] T057 [US6] Pass AbortSignal for timeout cancellation in context

**Checkpoint**: Skills can access run_id, workspace_dir, logger, secrets, and policy from context

---

## Phase 7: User Story 3 - Register and Track Artifacts (Priority: P2)

**Goal**: Skills can register artifacts which are persisted with metadata for retrieval

**Independent Test**: Run a skill that produces files and verify artifact metadata is recorded with correct type, location, and content hash

### Tests for User Story 3

- [ ] T058 [P] [US3] Unit test for ArtifactRegistryService in agent-platform/test/artifact-registry/artifact-registry.service.spec.ts

### Implementation for User Story 3

- [ ] T059 [P] [US3] Create ArtifactInterface with registration types in agent-platform/src/skills/artifact-registry/interfaces/artifact.interface.ts
- [ ] T060 [US3] Create ArtifactRegistryService with registerArtifact method in agent-platform/src/skills/artifact-registry/artifact-registry.service.ts
- [ ] T061 [US3] Implement SHA-256 content hashing via Node.js crypto in ArtifactRegistryService
- [ ] T062 [US3] Implement file size calculation in ArtifactRegistryService
- [ ] T063 [US3] Implement URI generation (file:// scheme for local) in ArtifactRegistryService
- [ ] T064 [US3] Implement findByRunId and findById query methods in ArtifactRegistryService
- [ ] T065 [US3] Create ArtifactRegistryModule with TypeORM repository in agent-platform/src/skills/artifact-registry/artifact-registry.module.ts
- [ ] T066 [US3] Integrate artifact registration after skill execution in SkillRunnerService
- [ ] T067 [US3] Include artifact refs in SkillResult response

**Checkpoint**: Artifacts are registered with type, URI, content_hash, size_bytes; queryable by run_id

---

## Phase 8: User Story 5 - Handle Execution Errors Gracefully (Priority: P2)

**Goal**: Standardized error handling with categorized errors and debug information

**Independent Test**: Trigger various error conditions and verify standardized error responses

### Tests for User Story 5

- [ ] T068 [P] [US5] Unit test for error handling scenarios in agent-platform/test/skill-runner/error-handling.spec.ts

### Implementation for User Story 5

- [ ] T069 [US5] Implement error categorization in SkillRunnerService catch blocks
- [ ] T070 [US5] Map handler exceptions to SkillExecutionException with EXECUTION_ERROR code
- [ ] T071 [US5] Map timeout to SkillTimeoutException with TIMEOUT code
- [ ] T072 [US5] Map policy violations to SkillPolicyViolationException with POLICY_VIOLATION code
- [ ] T073 [US5] Ensure all error results include debug info (run_id, skill_id, version, timing)
- [ ] T074 [US5] Include partial timing breakdown in error results
- [ ] T075 [US5] Log errors with correlation ID (runId) for debugging

**Checkpoint**: All errors return structured SkillResult with ok=false, error_code, message, and debug info

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Integration, final validation, and production readiness

- [ ] T076 [P] Create integration test for full skill execution flow in agent-platform/test/skill-runner/integration/skill-execution.integration.spec.ts
- [ ] T077 [P] Create sample test skill YAML descriptor in skills/catalog/hello_world.yaml
- [ ] T078 [P] Create sample HelloWorldHandler for testing in agent-platform/src/skills/handlers/hello-world.handler.ts
- [ ] T079 Run all unit tests (pnpm --filter agent-platform test)
- [ ] T080 Verify quickstart.md scenarios work end-to-end
- [ ] T081 Update existing skill handlers to use new SkillRunnerService if needed
- [ ] T082 Add barrel exports in agent-platform/src/skills/index.ts

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1: Setup → Phase 2: Foundational → Phases 3-8: User Stories → Phase 9: Polish
                                              ↓
                                    (can proceed in priority order)
```

### User Story Dependencies

| Story | Priority | Depends On | Independent? |
|-------|----------|------------|--------------|
| US4 - Load Catalog | P1 | Foundational only | Yes - MVP foundation |
| US1 - Execute Skill | P1 | US4 (need loaded skills) | Yes after US4 |
| US2 - Validation | P1 | US1 (validation during execution) | Yes after US1 |
| US6 - Context | P2 | US1 (context for execution) | Yes after US1 |
| US3 - Artifacts | P2 | US1 (artifacts from execution) | Yes after US1 |
| US5 - Errors | P2 | US1 (errors during execution) | Yes after US1 |

### Within Each User Story

1. Tests (if included) FIRST
2. Interfaces/DTOs
3. Services (dependencies first)
4. Integration into SkillRunnerService
5. Story validation

### Parallel Opportunities

**Phase 2 (Foundational)**: T006-T016 all run in parallel (different files)

**Phase 3 (US4)**: T024 parallel with nothing (first test)

**Phase 4 (US1)**: T030-T032 parallel, T033-T034 parallel

**Phase 5 (US2)**: T042 can start immediately

**Phase 6-8**: P2 stories can run in parallel after US1 complete

---

## Parallel Example: Phase 2 (Foundational)

```bash
# Launch all exception classes in parallel:
T006: Create SkillException base in agent-platform/src/skills/skill-runner/exceptions/skill.exception.ts
T007: Create SkillInputValidationException in agent-platform/src/skills/skill-runner/exceptions/skill-input-validation.exception.ts
T008: Create SkillOutputValidationException in agent-platform/src/skills/skill-runner/exceptions/skill-output-validation.exception.ts
T009: Create SkillExecutionException in agent-platform/src/skills/skill-runner/exceptions/skill-execution.exception.ts
T010: Create SkillPolicyViolationException in agent-platform/src/skills/skill-runner/exceptions/skill-policy-violation.exception.ts
T011: Create SkillTimeoutException in agent-platform/src/skills/skill-runner/exceptions/skill-timeout.exception.ts

# Launch all interfaces in parallel:
T012: Create EnhancedSkillExecutionContext in agent-platform/src/skills/skill-runner/interfaces/execution-context.interface.ts
T013: Create SkillResult interfaces in agent-platform/src/skills/skill-runner/interfaces/skill-result.interface.ts
T014: Create SkillPolicy interfaces in agent-platform/src/skills/skill-runner/interfaces/skill-policy.interface.ts

# Launch database work in parallel:
T017: Create ArtifactEntity in dao/src/entities/artifact.entity.ts
T018: Create Artifact DTOs in dto/src/skills/artifact.dto.ts
```

---

## Implementation Strategy

### MVP First (US4 + US1 + US2)

1. Complete Phase 1: Setup (T001-T005)
2. Complete Phase 2: Foundational (T006-T023)
3. Complete Phase 3: US4 - Catalog Loading (T024-T029)
4. Complete Phase 4: US1 - Skill Execution (T030-T041)
5. Complete Phase 5: US2 - Validation (T042-T050)
6. **STOP and VALIDATE**: Test MVP independently
7. Deploy/demo if ready

**MVP Delivers**: Execute skills with validation, structured results, timeout handling

### Incremental Delivery

| Increment | Stories | Cumulative Value |
|-----------|---------|------------------|
| MVP | US4, US1, US2 | Execute validated skills |
| +Context | US6 | Skills access runtime resources |
| +Artifacts | US3 | Track and retrieve skill outputs |
| +Errors | US5 | Production-ready error handling |
| +Polish | All | Integration tested, documented |

### Parallel Team Strategy

With 2+ developers after Foundational phase:

- **Developer A**: US4 → US1 → US2 (core P1 path)
- **Developer B**: Foundational → US3 + US6 (P2 stories)
- **Developer C**: US5 + Polish (error handling + integration)

---

## Notes

- [P] tasks = different files, no dependencies between them
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Avoid: vague tasks, same file conflicts, cross-story dependencies that break independence
- All file paths are relative to repository root
- Run `pnpm build` in dependent packages before running tests
