# Tasks: Campaign Context Model

**Input**: Design documents from `/specs/008-campaign-context/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Tests are NOT included per user request.

**Organization**: Tasks are grouped by user story to enable independent implementation of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, US4)
- Include exact file paths in descriptions

## Path Conventions (Monorepo)

- **dto**: `dto/src/` - Shared interfaces and types
- **common**: `common/src/` - Shared services
- **dao**: `dao/src/` - Entity modifications and migrations
- **agent-platform**: `agent-platform/src/` - Workflow integration

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create package structure and shared type definitions

- [X] T001 [P] Create campaign-context directory structure in dto/src/campaign-context/
- [X] T002 [P] Create campaign-context directory structure in common/src/campaign-context/
- [X] T003 [P] Copy JSON Schema for artifact types to common/src/campaign-context/schemas/artifact-types.schema.json

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core interfaces and types that ALL user stories depend on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T004 [P] Define TriggerType and TriggerInfo interface in dto/src/campaign-context/trigger-info.interface.ts
- [X] T005 [P] Define ArtifactData interface in dto/src/campaign-context/artifact-data.interface.ts
- [X] T006 [P] Define ArtifactReferences interface with 12 standard refs in dto/src/campaign-context/artifact-references.interface.ts
- [X] T007 [P] Define QualityStatus, QualityCheckResult, and ComputedData interfaces in dto/src/campaign-context/computed-data.interface.ts
- [X] T008 [P] Define StandardArtifactType enum with 12 types in dto/src/campaign-context/standard-artifact-types.enum.ts
- [X] T009 [P] Define ContextErrorCode constants and error types in dto/src/campaign-context/context-error.interface.ts
- [X] T010 Define CampaignContext interface (imports from T004-T009) in dto/src/campaign-context/campaign-context.interface.ts
- [X] T011 Export all interfaces from dto/src/campaign-context/ (add to dto main exports)
- [X] T012 Build dto package to verify compilation (pnpm --filter @agentic-template/dto build)
- [X] T013 Create database migration AddContextColumnToRuns in dao/src/migrations/{timestamp}-AddContextColumnToRuns.ts
- [X] T014 Add context JSONB column to Run entity in dao/src/entities/run.entity.ts
- [X] T015 Build dao package to verify compilation (pnpm --filter dao build)
- [X] T016 Implement ReferenceTypeRegistryService with standard types and JSON Schema config loading in common/src/campaign-context/reference-type-registry.service.ts
- [X] T017 Create CampaignContextModule NestJS module in common/src/campaign-context/campaign-context.module.ts
- [X] T018 Export campaign-context module from common package

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 1 - Orchestrator Updates Context After Step Completion (Priority: P1) 🎯 MVP

**Goal**: Enable workflow orchestrators to create contexts, attach step results with artifacts, and have references automatically updated

**Independent Validation**: Execute a single workflow step, attach its output artifact, verify context is updated with artifact metadata and reference pointer

- [X] T019 [US1] Implement CampaignContextService.create() - initialize empty context with campaign_id, run_id, workflow_name, trigger in common/src/campaign-context/campaign-context.service.ts
- [X] T020 [US1] Implement CampaignContextService.attachStepResult() - add artifacts to map with UUID generation in common/src/campaign-context/campaign-context.service.ts
- [X] T021 [US1] Implement automatic ref update logic in attachStepResult() - map artifact.type to refName using convention in common/src/campaign-context/campaign-context.service.ts
- [X] T022 [US1] Implement artifact ID uniqueness validation in attachStepResult() in common/src/campaign-context/campaign-context.service.ts
- [X] T023 [US1] Implement 50 artifact capacity check in attachStepResult() in common/src/campaign-context/campaign-context.service.ts
- [X] T024 [US1] Implement CampaignContextService.persist() - update Run entity context column in common/src/campaign-context/campaign-context.service.ts

**Checkpoint**: User Story 1 complete - orchestrators can create contexts, attach step results, and persist

---

## Phase 4: User Story 2 - Input Selector Resolves Artifacts from Context (Priority: P1)

**Goal**: Enable input selectors to retrieve artifacts from context using logical reference names

**Independent Validation**: Create context with known artifacts and references, call resolver by logical name, verify correct artifact data returned

- [X] T025 [US2] Implement ContextResolverService.getRef() - two-level lookup (refs → artifacts) in common/src/campaign-context/context-resolver.service.ts
- [X] T026 [US2] Implement ContextResolverService.getArtifact() - direct ID lookup in artifacts map in common/src/campaign-context/context-resolver.service.ts
- [X] T027 [US2] Implement ContextResolverService.hasRef() - check if ref exists and has artifact ID in common/src/campaign-context/context-resolver.service.ts
- [X] T028 [US2] Implement ContextResolverService.listRefs() - return list of populated reference names in common/src/campaign-context/context-resolver.service.ts
- [X] T029 [US2] Implement ContextResolverService.getArtifactsByType() - filter artifacts by type in common/src/campaign-context/context-resolver.service.ts
- [X] T030 [US2] Add ContextResolverService to CampaignContextModule exports in common/src/campaign-context/campaign-context.module.ts

**Checkpoint**: User Story 2 complete - input selectors can resolve artifacts by logical name or direct ID

---

## Phase 5: User Story 3 - Load Context from Previous Run for Updates (Priority: P2)

**Goal**: Enable update workflows to initialize context from a previous completed run

**Independent Validation**: Create completed run with artifacts, load new context from that run, verify all artifacts and references populated

- [X] T031 [US3] Implement loadFromRun() - query Run by ID with tenant check in common/src/campaign-context/campaign-context.service.ts
- [X] T032 [US3] Implement loadFromRun() - query Artifacts by runId and populate artifacts map in common/src/campaign-context/campaign-context.service.ts
- [X] T033 [US3] Implement loadFromRun() - reconstruct refs from artifact types in common/src/campaign-context/campaign-context.service.ts
- [X] T034 [US3] Implement loadFromRun() - query RunSteps for inputHashes to populate computed area in common/src/campaign-context/campaign-context.service.ts
- [X] T035 [US3] Add error handling for BASE_RUN_NOT_FOUND and UNAUTHORIZED cases in common/src/campaign-context/campaign-context.service.ts

**Checkpoint**: User Story 3 complete - update workflows can load context from previous runs

---

## Phase 6: User Story 4 - Access Computed Data During Workflow Execution (Priority: P3)

**Goal**: Enable workflow steps to store and retrieve computed data (input hashes, quality checks)

**Independent Validation**: Store input hashes and quality check results, verify they can be retrieved for cache decisions

- [X] T036 [US4] Implement CampaignContextService.storeInputHash() - add hash to computed.inputHashesByStep in common/src/campaign-context/campaign-context.service.ts
- [X] T037 [US4] Implement CampaignContextService.storeQualityCheck() - add result to computed.qualityChecks array in common/src/campaign-context/campaign-context.service.ts
- [X] T038 [US4] Ensure computed area is initialized lazily (create if not exists) in common/src/campaign-context/campaign-context.service.ts

**Checkpoint**: User Story 4 complete - computed data (hashes, quality checks) accessible throughout workflow

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Integration, validation, and finalization

- [ ] T039 [P] Run database migration to add context column (pnpm migration:run) - ⚠️ REQUIRES DATABASE (start Colima + docker compose)
- [ ] T040 [P] Verify Run entity can save and load context JSONB correctly - ⚠️ REQUIRES DATABASE
- [X] T041 Build all packages in dependency order (dto → common → dao)
- [X] T042 Validate quickstart.md code examples compile and work
- [X] T043 Remove any unused imports or dead code

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3-6)**: All depend on Foundational phase completion
  - US1 and US2 are both P1 - can proceed in parallel after foundational
  - US3 (P2) depends on US1 completion (needs attachStepResult to create data)
  - US4 (P3) can start after foundational, no story dependencies
- **Polish (Phase 7)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 2 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 3 (P2)**: Can start after Foundational - Uses US1's create/attach for setup but independently implementable
- **User Story 4 (P3)**: Can start after Foundational (Phase 2) - No dependencies on other stories

### Parallel Opportunities

**Phase 1 (Setup)**:
```
T001, T002, T003 - all parallel (different directories)
```

**Phase 2 (Foundational)**:
```
T004, T005, T006, T007, T008, T009 - all parallel (different interface files)
Then: T010 (depends on T004-T009)
Then: T011, T012
Parallel: T013, T014 (different packages)
Then: T015
Then: T016, T017, T018
```

**Phase 3-6 (User Stories)**:
```
US1 and US2 can start in parallel after Phase 2
US3 can start after Phase 2 (or after US1 if using US1 for data setup)
US4 can start in parallel with US1/US2 after Phase 2
```

---

## Parallel Example: Foundational Phase

```bash
# Launch all interface definitions together:
Task: "Define TriggerType and TriggerInfo interface in dto/src/campaign-context/trigger-info.interface.ts"
Task: "Define ArtifactData interface in dto/src/campaign-context/artifact-data.interface.ts"
Task: "Define ArtifactReferences interface in dto/src/campaign-context/artifact-references.interface.ts"
Task: "Define ComputedData interfaces in dto/src/campaign-context/computed-data.interface.ts"
Task: "Define StandardArtifactType enum in dto/src/campaign-context/standard-artifact-types.enum.ts"
Task: "Define ContextErrorCode constants in dto/src/campaign-context/context-error.interface.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (3 tasks)
2. Complete Phase 2: Foundational (15 tasks)
3. Complete Phase 3: User Story 1 (6 tasks)
4. **STOP and VALIDATE**: Verify US1 independently - orchestrators can create, attach, persist
5. Deploy/demo MVP

### Recommended Delivery Order

1. **MVP**: Setup + Foundational + US1 → Orchestrators can manage context
2. **+US2**: Add resolver capability → Input selectors can retrieve artifacts
3. **+US3**: Add context loading → Update workflows enabled
4. **+US4**: Add computed data → Caching and quality tracking enabled
5. **Polish**: Validation and finalization

---

## Summary

| Phase | Tasks | Purpose |
|-------|-------|---------|
| Phase 1: Setup | 3 | Directory structure |
| Phase 2: Foundational | 15 | Interfaces, types, migration, registry |
| Phase 3: US1 (P1) | 6 | Create, attach, persist context |
| Phase 4: US2 (P1) | 6 | Resolve artifacts by reference |
| Phase 5: US3 (P2) | 5 | Load context from previous run |
| Phase 6: US4 (P3) | 3 | Computed data (hashes, quality) |
| Phase 7: Polish | 5 | Validation, finalization |
| **Total** | **43** | |

### Tasks per User Story

- US1: 6 tasks (MVP)
- US2: 6 tasks
- US3: 5 tasks
- US4: 3 tasks

### MVP Scope

**Recommended MVP**: Phase 1 + Phase 2 + Phase 3 (US1) = 24 tasks
This delivers: context creation, artifact attachment with auto-ref update, and persistence.
