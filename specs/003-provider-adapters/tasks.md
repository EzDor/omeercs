# Tasks: Provider Adapters

**Input**: Design documents from `/specs/003-provider-adapters/`
**Prerequisites**: plan.md ✓, spec.md ✓, research.md ✓, data-model.md ✓, contracts/ ✓

**Tests**: No test tasks included (not explicitly requested in specification)

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2)
- Include exact file paths in descriptions

## Path Conventions

This is a monorepo project with the following structure:
- **dto**: `dto/src/providers/` - interfaces and types
- **common**: `common/src/providers/` - implementations
- **agent-platform**: `agent-platform/src/` - consumers (skill handlers)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and directory structure for provider adapters

- [X] T001 Create provider types directory structure in dto/src/providers/types/
- [X] T002 [P] Create provider interfaces directory structure in dto/src/providers/interfaces/
- [X] T003 [P] Create provider implementations directory structure in common/src/providers/
- [X] T004 [P] Create providers adapters directory in common/src/providers/adapters/
- [X] T005 [P] Create providers registries directory in common/src/providers/registries/
- [X] T006 [P] Create providers errors directory in common/src/providers/errors/

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core types and error handling that ALL user stories depend on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T007 Create base GenerationParams interface in dto/src/providers/types/generation-params.interface.ts
- [X] T008 Create GenerationResult interface in dto/src/providers/types/generation-params.interface.ts
- [X] T009 Create ProviderMetadata interface in dto/src/providers/types/generation-params.interface.ts
- [X] T010 [P] Create ProviderErrorCode enum in dto/src/providers/types/provider-error.interface.ts
- [X] T011 [P] Create ProviderErrorDetails interface in dto/src/providers/types/provider-error.interface.ts
- [X] T012 Create barrel export for types in dto/src/providers/types/index.ts
- [X] T013 Create ProviderError class (extends Error) in common/src/providers/errors/provider.error.ts
- [X] T014 Create barrel export for errors in common/src/providers/errors/index.ts
- [X] T015 Update dto/src/providers/index.ts with types export
- [X] T016 Update dto/src/index.ts to export providers module

**Checkpoint**: Foundation ready - base types and error handling available for all provider implementations

---

## Phase 3: User Story 1 - Skill Requests Image Generation (Priority: P1) 🎯 MVP

**Goal**: Enable skills to generate images via ImageProvider interface without knowing the underlying vendor

**Independent Test**: Create a simple skill that requests image generation with a text prompt and verify the returned URI points to a valid image with correct metadata (provider_id, model)

### Implementation for User Story 1

- [X] T017 [US1] Create ImageGenerationParams interface extending GenerationParams in dto/src/providers/interfaces/image-provider.interface.ts
- [X] T018 [US1] Create ImageGenerationMetadata interface extending ProviderMetadata in dto/src/providers/interfaces/image-provider.interface.ts
- [X] T019 [US1] Create ImageGenerationResult interface in dto/src/providers/interfaces/image-provider.interface.ts
- [X] T020 [US1] Create ImageProviderAdapter interface in dto/src/providers/interfaces/image-provider.interface.ts
- [X] T021 [US1] Create barrel export for interfaces in dto/src/providers/interfaces/index.ts
- [X] T022 [US1] Update dto/src/providers/index.ts to export interfaces
- [X] T023 [US1] Implement StabilityAdapter class (implements ImageProviderAdapter) in common/src/providers/adapters/stability.adapter.ts
- [X] T024 [US1] Add mapSize helper method to StabilityAdapter for resolution mapping
- [X] T025 [US1] Add normalizeResponse method to StabilityAdapter for response normalization
- [X] T026 [US1] Create barrel export for adapters in common/src/providers/adapters/index.ts
- [X] T027 [US1] Rebuild dto package to export new interfaces (pnpm --filter @agentic-template/dto build)

**Checkpoint**: ImageProvider interface and Stability adapter implemented - can generate images but no registry lookup yet

---

## Phase 4: User Story 2 - Provider Registry Lookup (Priority: P1)

**Goal**: Enable system components to obtain correct provider implementation via ProviderRegistry

**Independent Test**: Register providers of different types and verify the registry returns the correct implementation for each lookup combination (by type, by type+providerId, default provider)

### Implementation for User Story 2

- [X] T028 [US2] Create ProviderType type union in dto/src/providers/interfaces/provider-registry.interface.ts
- [X] T029 [US2] Create AnyProviderAdapter union type in dto/src/providers/interfaces/provider-registry.interface.ts
- [X] T030 [US2] Create ProviderInfo interface in dto/src/providers/interfaces/provider-registry.interface.ts
- [X] T031 [US2] Create ProviderRegistry interface in dto/src/providers/interfaces/provider-registry.interface.ts
- [X] T032 [US2] Update dto/src/providers/interfaces/index.ts to export registry interfaces
- [X] T033 [US2] Implement ImageProviderRegistry class in common/src/providers/registries/image-provider.registry.ts
- [X] T034 [US2] Add getProvider method to ImageProviderRegistry
- [X] T035 [US2] Add getDefaultProvider method to ImageProviderRegistry
- [X] T036 [US2] Add listProviders method to ImageProviderRegistry
- [X] T037 [US2] Add hasProvider method to ImageProviderRegistry
- [X] T038 [US2] Create barrel export for registries in common/src/providers/registries/index.ts
- [X] T039 [US2] Create ProvidersModule NestJS module in common/src/providers/providers.module.ts
- [X] T040 [US2] Create barrel export for providers in common/src/providers/index.ts
- [X] T041 [US2] Update common/src/index.ts to export providers module
- [X] T042 [US2] Rebuild dto and common packages (pnpm --filter @agentic-template/dto build && pnpm --filter @agentic-template/common build)

**Checkpoint**: User Stories 1 AND 2 complete - skills can generate images via registry lookup (SC-001, SC-006, SC-007 met)

---

## Phase 5: User Story 3 - Skill Requests Video Generation (Priority: P2)

**Goal**: Define VideoProvider interface for future video generation capabilities

**Independent Test**: Verify VideoProviderAdapter interface compiles and can be implemented (interface-only for MVP)

### Implementation for User Story 3

- [X] T043 [P] [US3] Create VideoGenerationParams interface in dto/src/providers/interfaces/video-provider.interface.ts
- [X] T044 [P] [US3] Create VideoGenerationMetadata interface in dto/src/providers/interfaces/video-provider.interface.ts
- [X] T045 [US3] Create VideoGenerationResult interface in dto/src/providers/interfaces/video-provider.interface.ts
- [X] T046 [US3] Create VideoProviderAdapter interface in dto/src/providers/interfaces/video-provider.interface.ts
- [X] T047 [US3] Update dto/src/providers/interfaces/index.ts to export video interfaces

**Checkpoint**: Video provider interface defined - ready for future adapter implementations

---

## Phase 6: User Story 4 - Skill Requests Audio Generation (Priority: P2)

**Goal**: Define AudioProvider interface for future audio generation capabilities

**Independent Test**: Verify AudioProviderAdapter interface compiles and can be implemented (interface-only for MVP)

### Implementation for User Story 4

- [X] T048 [P] [US4] Create AudioGenerationParams interface in dto/src/providers/interfaces/audio-provider.interface.ts
- [X] T049 [P] [US4] Create AudioGenerationMetadata interface in dto/src/providers/interfaces/audio-provider.interface.ts
- [X] T050 [US4] Create AudioGenerationResult interface in dto/src/providers/interfaces/audio-provider.interface.ts
- [X] T051 [US4] Create AudioProviderAdapter interface in dto/src/providers/interfaces/audio-provider.interface.ts
- [X] T052 [US4] Update dto/src/providers/interfaces/index.ts to export audio interfaces

**Checkpoint**: Audio provider interface defined - ready for future adapter implementations

---

## Phase 7: User Story 5 - Skill Requests 3D Asset Generation (Priority: P3)

**Goal**: Define Asset3DProvider interface for future 3D asset generation capabilities

**Independent Test**: Verify Asset3DProviderAdapter interface compiles and can be implemented (interface-only for MVP)

### Implementation for User Story 5

- [X] T053 [P] [US5] Create Asset3DGenerationParams interface in dto/src/providers/interfaces/asset3d-provider.interface.ts
- [X] T054 [P] [US5] Create Asset3DGenerationMetadata interface in dto/src/providers/interfaces/asset3d-provider.interface.ts
- [X] T055 [US5] Create Asset3DGenerationResult interface in dto/src/providers/interfaces/asset3d-provider.interface.ts
- [X] T056 [US5] Create Asset3DProviderAdapter interface in dto/src/providers/interfaces/asset3d-provider.interface.ts
- [X] T057 [US5] Update dto/src/providers/interfaces/index.ts to export 3D asset interfaces

**Checkpoint**: 3D asset provider interface defined - ready for future adapter implementations

---

## Phase 8: User Story 6 - Skill Requests Image Segmentation (Priority: P3)

**Goal**: Define SegmentationProvider interface for future segmentation capabilities

**Independent Test**: Verify SegmentationProviderAdapter interface compiles and can be implemented (interface-only for MVP)

### Implementation for User Story 6

- [X] T058 [P] [US6] Create SegmentationParams interface in dto/src/providers/interfaces/segmentation-provider.interface.ts
- [X] T059 [P] [US6] Create BoundingBox interface in dto/src/providers/interfaces/segmentation-provider.interface.ts
- [X] T060 [P] [US6] Create Segment interface in dto/src/providers/interfaces/segmentation-provider.interface.ts
- [X] T061 [US6] Create SegmentationMetadata interface in dto/src/providers/interfaces/segmentation-provider.interface.ts
- [X] T062 [US6] Create SegmentationResult interface in dto/src/providers/interfaces/segmentation-provider.interface.ts
- [X] T063 [US6] Create SegmentationProviderAdapter interface in dto/src/providers/interfaces/segmentation-provider.interface.ts
- [X] T064 [US6] Update dto/src/providers/interfaces/index.ts to export segmentation interfaces

**Checkpoint**: Segmentation provider interface defined - all 5 provider type interfaces complete

---

## Phase 9: Integration & Sample Skill

**Purpose**: Integrate providers with agent-platform and create sample skill demonstrating usage

- [X] T065 Import ProvidersModule in agent-platform/src/app.module.ts
- [X] T066 Update an existing skill handler to use ImageProviderRegistry (e.g., generate-intro-image.handler.ts)
- [X] T067 Add provider selection logic to skill handler (use registry.getProvider or registry.getDefaultProvider)
- [X] T068 Update skill handler to return artifact with provider metadata
- [X] T069 Rebuild all packages (pnpm -r build)
- [X] T070 Verify skill execution with provider adapter works end-to-end

**Checkpoint**: Sample skill successfully calls provider adapter and returns artifact URI (SC-007)

---

## Phase 10: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [X] T071 [P] Add JSDoc comments to all public interfaces in dto/src/providers/
- [X] T072 [P] Add logging statements to StabilityAdapter for observability
- [X] T073 Verify error messages don't expose internal details (SC-005)
- [X] T074 Run quickstart.md validation steps
- [X] T075 Verify TypeScript strict mode compliance (no any types)
- [X] T076 Run linting and fix any issues (pnpm lint:fix)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational - implements image provider
- **User Story 2 (Phase 4)**: Depends on US1 - implements registry (needs adapter to register)
- **User Stories 3-6 (Phases 5-8)**: Depend on Foundational only - interface definitions only
- **Integration (Phase 9)**: Depends on US1 + US2 completion
- **Polish (Phase 10)**: Depends on all desired user stories being complete

### User Story Dependencies

```
Foundational (Phase 2)
        │
        ├─────────────────────────────────────────────────────┐
        │                                                     │
        ▼                                                     ▼
User Story 1 (P1)                              User Stories 3-6 (P2/P3)
Image Generation                               Interface definitions only
        │                                      (can run in parallel)
        ▼
User Story 2 (P1)
Provider Registry
        │
        ▼
Integration (Phase 9)
Sample skill using registry
```

### Within Each User Story

- Interface files before implementation files
- Types before interfaces that use them
- Adapter before registry (registry needs adapter to register)
- Build packages after interface changes
- Story complete before moving to next priority

### Parallel Opportunities

**Phase 1 (Setup)**: T001-T006 can all run in parallel (directory creation)

**Phase 2 (Foundational)**: T010-T011 can run in parallel (error types)

**Phase 3-8 (User Stories)**: Once Foundational completes:
- US3, US4, US5, US6 can all run in parallel (interface definitions only)
- US1 must complete before US2

**Within User Stories**:
- Tasks marked [P] within a user story can run in parallel
- e.g., T043-T044 (video params and metadata) can run in parallel

---

## Parallel Example: Phase 1 Setup

```bash
# Launch all directory creation tasks together:
Task: "Create provider types directory structure in dto/src/providers/types/"
Task: "Create provider interfaces directory structure in dto/src/providers/interfaces/"
Task: "Create provider implementations directory structure in common/src/providers/"
Task: "Create providers adapters directory in common/src/providers/adapters/"
Task: "Create providers registries directory in common/src/providers/registries/"
Task: "Create providers errors directory in common/src/providers/errors/"
```

## Parallel Example: Interface Phases (US3-US6)

```bash
# After Foundational phase, launch all interface user stories in parallel:
Task: "Phase 5: Video provider interfaces"
Task: "Phase 6: Audio provider interfaces"
Task: "Phase 7: 3D asset provider interfaces"
Task: "Phase 8: Segmentation provider interfaces"
```

---

## Implementation Strategy

### MVP First (User Stories 1 + 2 Only)

1. Complete Phase 1: Setup (6 tasks)
2. Complete Phase 2: Foundational (10 tasks) ← CRITICAL blocking phase
3. Complete Phase 3: User Story 1 - Image Generation (11 tasks)
4. Complete Phase 4: User Story 2 - Provider Registry (15 tasks)
5. **STOP and VALIDATE**: Test image generation via registry lookup
6. Deploy/demo if ready → This is the **MVP**

**MVP Scope**: 42 tasks total (T001-T042)
**MVP Delivers**: SC-001, SC-006, SC-007 met

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add US1 + US2 → Test independently → Deploy/Demo (**MVP!**)
3. Add US3-US6 interfaces → All provider types defined (parallel work)
4. Add Integration → Sample skill demonstrates pattern
5. Add Polish → Production ready

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together (Day 1)
2. Once Foundational is done:
   - Developer A: User Story 1 → User Story 2 → Integration
   - Developer B: User Stories 3, 4 (interface definitions)
   - Developer C: User Stories 5, 6 (interface definitions) → Polish
3. Integration and Polish once MVP path complete

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- **No database migrations** - this feature is interface/implementation only
- **No REST endpoints** - providers are internal services used by skills
- **Success Criteria Mapping**:
  - SC-001 (vendor decoupling): Validated by US1 implementation
  - SC-002 (add providers without code changes): Validated by registry pattern in US2
  - SC-003 (switch providers via config): Validated by registry default provider in US2
  - SC-004 (<500ms overhead): Validated in Integration phase
  - SC-005 (user-friendly errors): Validated in Polish phase
  - SC-006 (one concrete adapter): Stability adapter in US1
  - SC-007 (sample skill): Integration phase

---

## Summary

| Category | Count |
|----------|-------|
| **Total Tasks** | 76 |
| Phase 1: Setup | 6 |
| Phase 2: Foundational | 10 |
| Phase 3: User Story 1 (P1) | 11 |
| Phase 4: User Story 2 (P1) | 15 |
| Phase 5: User Story 3 (P2) | 5 |
| Phase 6: User Story 4 (P2) | 5 |
| Phase 7: User Story 5 (P3) | 5 |
| Phase 8: User Story 6 (P3) | 7 |
| Phase 9: Integration | 6 |
| Phase 10: Polish | 6 |
| **MVP Tasks** | 42 (Phases 1-4) |
| **Parallel Opportunities** | 35+ tasks marked [P] or parallelizable phases |
