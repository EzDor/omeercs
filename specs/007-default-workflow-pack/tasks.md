# Tasks: Default Workflow Pack

**Input**: Design documents from `/specs/007-default-workflow-pack/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Not included (excluded from feature scope per plan.md)

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US7)
- Include exact file paths in descriptions

## Path Conventions

- **Monorepo**: `agent-platform/src/` for services, `dto/src/` for interfaces
- **Workflows**: `agent-platform/workflows/` for YAML definitions
- **Schemas**: `agent-platform/src/run-engine/schemas/` for JSON Schema files

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create directory structure and copy JSON Schema files

- [x] T001 Create workflows directory at `agent-platform/workflows/`
- [x] T002 Create schemas directory at `agent-platform/src/run-engine/schemas/`
- [x] T003 [P] Copy workflow-yaml.schema.json from `specs/007-default-workflow-pack/contracts/workflow-yaml.schema.json` to `agent-platform/src/run-engine/schemas/workflow-yaml.schema.json`
- [x] T004 [P] Copy workflow-index.schema.json from `specs/007-default-workflow-pack/contracts/workflow-index.schema.json` to `agent-platform/src/run-engine/schemas/workflow-index.schema.json`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: TypeScript interfaces and RunContext extension that ALL user stories depend on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T005 Create WorkflowYaml and WorkflowStepYaml interfaces in `agent-platform/src/run-engine/interfaces/workflow-yaml.interface.ts`
- [x] T006 [P] Create InputSelectorYaml and all selector type interfaces in `agent-platform/src/run-engine/interfaces/input-selector.interface.ts`
- [x] T007 [P] Create WorkflowIndexYaml interface in `agent-platform/src/run-engine/interfaces/workflow-yaml.interface.ts` (extend T005 file)
- [x] T008 Extend RunContext interface with baseRunId, baseRunOutputs, baseRunArtifacts in `dto/src/run-engine/run-context.dto.ts`
- [x] T009 Rebuild dto package after interface changes: `pnpm --filter @agentic-template/dto build`

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 7 - Workflow Registry Management (Priority: P1) 🎯 MVP

**Goal**: Load, validate, and expose workflow definitions to the Run Engine so workflows can be discovered and executed

**Independent Test**: Load workflow YAML files and verify they are parsed, validated, and accessible via the registry service

### Implementation for User Story 7

- [x] T010 [US7] Implement InputSelectorInterpreterService with compile() method for trigger source in `agent-platform/src/run-engine/services/input-selector-interpreter.service.ts`
- [x] T011 [US7] Add step_output source compilation to InputSelectorInterpreterService in `agent-platform/src/run-engine/services/input-selector-interpreter.service.ts`
- [x] T012 [US7] Add base_run source compilation to InputSelectorInterpreterService in `agent-platform/src/run-engine/services/input-selector-interpreter.service.ts`
- [x] T013 [US7] Add registry source compilation to InputSelectorInterpreterService in `agent-platform/src/run-engine/services/input-selector-interpreter.service.ts`
- [x] T014 [US7] Add constants source compilation to InputSelectorInterpreterService in `agent-platform/src/run-engine/services/input-selector-interpreter.service.ts`
- [x] T015 [US7] Add merge operation compilation to InputSelectorInterpreterService in `agent-platform/src/run-engine/services/input-selector-interpreter.service.ts`
- [x] T016 [US7] Add pick operation compilation to InputSelectorInterpreterService in `agent-platform/src/run-engine/services/input-selector-interpreter.service.ts`
- [x] T017 [US7] Implement WorkflowYamlLoaderService with loadIndex() method in `agent-platform/src/run-engine/services/workflow-yaml-loader.service.ts`
- [x] T018 [US7] Add loadWorkflowFile() method to WorkflowYamlLoaderService in `agent-platform/src/run-engine/services/workflow-yaml-loader.service.ts`
- [x] T019 [US7] Add validateAgainstSchema() method using Ajv to WorkflowYamlLoaderService in `agent-platform/src/run-engine/services/workflow-yaml-loader.service.ts`
- [x] T020 [US7] Add validateSkillReferences() method to WorkflowYamlLoaderService in `agent-platform/src/run-engine/services/workflow-yaml-loader.service.ts`
- [x] T021 [US7] Add compileToWorkflowSpec() method integrating InputSelectorInterpreterService in `agent-platform/src/run-engine/services/workflow-yaml-loader.service.ts`
- [x] T022 [US7] Add onModuleInit() to WorkflowYamlLoaderService to load all active workflows at startup in `agent-platform/src/run-engine/services/workflow-yaml-loader.service.ts`
- [x] T023 [US7] Register WorkflowYamlLoaderService and InputSelectorInterpreterService in RunEngineModule in `agent-platform/src/run-engine/run-engine.module.ts`
- [x] T024 [US7] Create workflows index.yaml with empty workflow list in `agent-platform/workflows/index.yaml`

**Checkpoint**: Workflow registry infrastructure complete - can now add workflow definitions

---

## Phase 4: User Story 1 - End-to-End Campaign Build (Priority: P1) 🎯 MVP

**Goal**: Generate a complete campaign from a brief with all 14 steps executing in correct dependency order

**Independent Test**: Trigger workflow with campaign brief and verify all expected assets (intro image, intro video, BGM, SFX, game bundle, outcome videos, manifest) are generated

### Implementation for User Story 1

- [x] T025 [US1] Create campaign.build.v1.yaml with plan step (step 1/14) in `agent-platform/workflows/campaign.build.v1.yaml`
- [x] T026 [US1] Add intro_image step with depends_on: [plan] to campaign.build.v1.yaml in `agent-platform/workflows/campaign.build.v1.yaml`
- [x] T027 [US1] Add intro_button_segmentation step with depends_on: [intro_image] to campaign.build.v1.yaml in `agent-platform/workflows/campaign.build.v1.yaml`
- [x] T028 [US1] Add intro_video step with depends_on: [intro_image] to campaign.build.v1.yaml in `agent-platform/workflows/campaign.build.v1.yaml`
- [x] T029 [P] [US1] Add bgm step with depends_on: [plan] to campaign.build.v1.yaml in `agent-platform/workflows/campaign.build.v1.yaml`
- [x] T030 [P] [US1] Add sfx step with depends_on: [plan] to campaign.build.v1.yaml in `agent-platform/workflows/campaign.build.v1.yaml`
- [x] T031 [US1] Add audio_mix step with depends_on: [bgm, sfx] to campaign.build.v1.yaml in `agent-platform/workflows/campaign.build.v1.yaml`
- [x] T032 [US1] Add game_config step with depends_on: [plan] to campaign.build.v1.yaml in `agent-platform/workflows/campaign.build.v1.yaml`
- [x] T033 [US1] Add bundle_game step with depends_on: [audio_mix, game_config] to campaign.build.v1.yaml in `agent-platform/workflows/campaign.build.v1.yaml`
- [x] T034 [P] [US1] Add outcome_win step with depends_on: [plan] to campaign.build.v1.yaml in `agent-platform/workflows/campaign.build.v1.yaml`
- [x] T035 [P] [US1] Add outcome_lose step with depends_on: [plan] to campaign.build.v1.yaml in `agent-platform/workflows/campaign.build.v1.yaml`
- [x] T036 [US1] Add manifest step with depends_on: [intro_button_segmentation, intro_video, bundle_game, outcome_win, outcome_lose] to campaign.build.v1.yaml in `agent-platform/workflows/campaign.build.v1.yaml`
- [x] T037 [US1] Add qa_bundle step with depends_on: [bundle_game] to campaign.build.v1.yaml in `agent-platform/workflows/campaign.build.v1.yaml`
- [x] T038 [US1] Add review_smoke step (optional) with depends_on: [manifest] to campaign.build.v1.yaml in `agent-platform/workflows/campaign.build.v1.yaml`
- [x] T039 [US1] Add campaign.build entry to workflows index.yaml in `agent-platform/workflows/index.yaml`

**Checkpoint**: Full campaign build workflow available - can generate complete campaigns

---

## Phase 5: User Story 2 - Audio Update Workflow (Priority: P2)

**Goal**: Replace or regenerate audio tracks (BGM, SFX) for an existing campaign without full rebuild

**Independent Test**: Provide base run ID and audio parameters, verify only audio-related assets regenerated while visuals remain from base run

### Implementation for User Story 2

- [x] T040 [US2] Create campaign.update_audio.v1.yaml with bgm step using base_run source selectors in `agent-platform/workflows/campaign.update_audio.v1.yaml`
- [x] T041 [US2] Add sfx step to campaign.update_audio.v1.yaml in `agent-platform/workflows/campaign.update_audio.v1.yaml`
- [x] T042 [US2] Add audio_mix step with depends_on: [bgm, sfx] to campaign.update_audio.v1.yaml in `agent-platform/workflows/campaign.update_audio.v1.yaml`
- [x] T043 [US2] Add bundle_game step with depends_on: [audio_mix] to campaign.update_audio.v1.yaml in `agent-platform/workflows/campaign.update_audio.v1.yaml`
- [x] T044 [US2] Add manifest step with depends_on: [bundle_game] to campaign.update_audio.v1.yaml in `agent-platform/workflows/campaign.update_audio.v1.yaml`
- [x] T045 [US2] Add qa_bundle step with depends_on: [bundle_game] to campaign.update_audio.v1.yaml in `agent-platform/workflows/campaign.update_audio.v1.yaml`
- [x] T046 [US2] Add campaign.update_audio entry to workflows index.yaml in `agent-platform/workflows/index.yaml`

**Checkpoint**: Audio update workflow available - can update audio without full rebuild

---

## Phase 6: User Story 3 - Intro Visual Update Workflow (Priority: P2)

**Goal**: Regenerate intro visuals (image, button segmentation, video loop) while preserving other assets

**Independent Test**: Trigger intro update with style overrides, verify only intro-related assets change while audio and outcomes remain from base run

### Implementation for User Story 3

- [x] T047 [US3] Create campaign.update_intro.v1.yaml with intro_image step using base_run and trigger merge selectors in `agent-platform/workflows/campaign.update_intro.v1.yaml`
- [x] T048 [US3] Add intro_button_segmentation step with depends_on: [intro_image] to campaign.update_intro.v1.yaml in `agent-platform/workflows/campaign.update_intro.v1.yaml`
- [x] T049 [US3] Add intro_video step with depends_on: [intro_image] to campaign.update_intro.v1.yaml in `agent-platform/workflows/campaign.update_intro.v1.yaml`
- [x] T050 [US3] Add manifest step with depends_on: [intro_button_segmentation, intro_video] to campaign.update_intro.v1.yaml in `agent-platform/workflows/campaign.update_intro.v1.yaml`
- [x] T051 [US3] Add review_smoke step (optional) with depends_on: [manifest] to campaign.update_intro.v1.yaml in `agent-platform/workflows/campaign.update_intro.v1.yaml`
- [x] T052 [US3] Add campaign.update_intro entry to workflows index.yaml in `agent-platform/workflows/index.yaml`

**Checkpoint**: Intro update workflow available - can iterate on intro visuals

---

## Phase 7: User Story 4 - Outcome Video Update Workflow (Priority: P2)

**Goal**: Regenerate win and/or lose outcome videos for an existing campaign

**Independent Test**: Trigger outcome update, verify only outcome videos and manifest regenerated

### Implementation for User Story 4

- [x] T053 [P] [US4] Create campaign.update_outcome.v1.yaml with outcome_win step using base_run selectors in `agent-platform/workflows/campaign.update_outcome.v1.yaml`
- [x] T054 [P] [US4] Add outcome_lose step to campaign.update_outcome.v1.yaml in `agent-platform/workflows/campaign.update_outcome.v1.yaml`
- [x] T055 [US4] Add manifest step with depends_on: [outcome_win, outcome_lose] to campaign.update_outcome.v1.yaml in `agent-platform/workflows/campaign.update_outcome.v1.yaml`
- [x] T056 [US4] Add review_smoke step (optional) with depends_on: [manifest] to campaign.update_outcome.v1.yaml in `agent-platform/workflows/campaign.update_outcome.v1.yaml`
- [x] T057 [US4] Add campaign.update_outcome entry to workflows index.yaml in `agent-platform/workflows/index.yaml`

**Checkpoint**: Outcome update workflow available - can iterate on win/lose videos

---

## Phase 8: User Story 5 - Game Configuration Update Workflow (Priority: P2)

**Goal**: Adjust game parameters (difficulty, speed, target score, theme) without regenerating media assets

**Independent Test**: Trigger game config update, verify game bundle rebuilt with new parameters while all media assets reused

### Implementation for User Story 5

- [x] T058 [US5] Create campaign.update_game_config.v1.yaml with game_config step using trigger overrides in `agent-platform/workflows/campaign.update_game_config.v1.yaml`
- [x] T059 [US5] Add bundle_game step with depends_on: [game_config] to campaign.update_game_config.v1.yaml in `agent-platform/workflows/campaign.update_game_config.v1.yaml`
- [x] T060 [US5] Add manifest step with depends_on: [bundle_game] to campaign.update_game_config.v1.yaml in `agent-platform/workflows/campaign.update_game_config.v1.yaml`
- [x] T061 [US5] Add qa_bundle step with depends_on: [bundle_game] to campaign.update_game_config.v1.yaml in `agent-platform/workflows/campaign.update_game_config.v1.yaml`
- [x] T062 [US5] Add campaign.update_game_config entry to workflows index.yaml in `agent-platform/workflows/index.yaml`

**Checkpoint**: Game config update workflow available - can tune game parameters

---

## Phase 9: User Story 6 - 3D Asset Replacement Workflow (Priority: P3)

**Goal**: Replace a 3D asset in an existing campaign with a newly generated and optimized model

**Independent Test**: Trigger 3D replacement with prompt and constraints, verify asset generated, optimized, bundled, and validated

### Implementation for User Story 6

- [x] T063 [US6] Create campaign.replace_3d_asset.v1.yaml with generate_3d_asset step in `agent-platform/workflows/campaign.replace_3d_asset.v1.yaml`
- [x] T064 [US6] Add optimize_3d_asset step with depends_on: [generate_3d_asset] to campaign.replace_3d_asset.v1.yaml in `agent-platform/workflows/campaign.replace_3d_asset.v1.yaml`
- [x] T065 [US6] Add bundle_game step with depends_on: [optimize_3d_asset] to campaign.replace_3d_asset.v1.yaml in `agent-platform/workflows/campaign.replace_3d_asset.v1.yaml`
- [x] T066 [US6] Add manifest step with depends_on: [bundle_game] to campaign.replace_3d_asset.v1.yaml in `agent-platform/workflows/campaign.replace_3d_asset.v1.yaml`
- [x] T067 [US6] Add qa_bundle step with depends_on: [bundle_game] to campaign.replace_3d_asset.v1.yaml in `agent-platform/workflows/campaign.replace_3d_asset.v1.yaml`
- [x] T068 [US6] Add campaign.replace_3d_asset entry to workflows index.yaml in `agent-platform/workflows/index.yaml`

**Checkpoint**: 3D asset replacement workflow available - can customize 3D models

---

## Phase 10: Polish & Cross-Cutting Concerns

**Purpose**: Final validation and integration

- [x] T069 Validate all 7 workflow YAML files pass schema validation on load
- [x] T070 Verify skill references in all workflows match registered skills in SkillCatalogService
- [x] T071 Validate dependency graphs have no cycles using DependencyGraphService
- [x] T072 Run quickstart.md validation scenarios

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Story 7 (Phase 3)**: Depends on Foundational - Registry infrastructure
- **User Story 1 (Phase 4)**: Depends on US7 completion - Uses registry to load workflow
- **User Stories 2-6 (Phases 5-9)**: Depend on US7 completion - Can run in parallel after US7
- **Polish (Phase 10)**: Depends on all workflow definitions being complete

### User Story Dependencies

- **User Story 7 (P1)**: MUST complete first - provides registry infrastructure
- **User Story 1 (P1)**: Depends on US7 - can start immediately after
- **User Story 2 (P2)**: Depends on US7 only - can run parallel to US1
- **User Story 3 (P2)**: Depends on US7 only - can run parallel to US1, US2
- **User Story 4 (P2)**: Depends on US7 only - can run parallel to US1-3
- **User Story 5 (P2)**: Depends on US7 only - can run parallel to US1-4
- **User Story 6 (P3)**: Depends on US7 only - can run parallel to US1-5

### Within Each User Story

- YAML steps added in dependency order (plan → image → video, etc.)
- Each step references correct skill_id from catalog
- Input selectors use appropriate sources (trigger, step_output, base_run)

### Parallel Opportunities

- **Foundational phase**: T005-T007 interfaces can be created in parallel
- **US7**: T010-T016 (selector sources) can progress sequentially but are logically independent
- **US1**: T029-T030 (bgm, sfx) can run in parallel; T034-T035 (outcome_win, outcome_lose) can run in parallel
- **US4**: T053-T054 (outcome_win, outcome_lose steps) can run in parallel
- **User Stories 2-6**: ALL can run in parallel once US7 completes

---

## Parallel Example: After US7 Completes

```bash
# Once User Story 7 (registry) is complete, launch ALL workflow definitions in parallel:
Task: "Create campaign.build.v1.yaml" (US1)
Task: "Create campaign.update_audio.v1.yaml" (US2)
Task: "Create campaign.update_intro.v1.yaml" (US3)
Task: "Create campaign.update_outcome.v1.yaml" (US4)
Task: "Create campaign.update_game_config.v1.yaml" (US5)
Task: "Create campaign.replace_3d_asset.v1.yaml" (US6)
```

---

## Implementation Strategy

### MVP First (User Story 7 + User Story 1)

1. Complete Phase 1: Setup (directories and schemas)
2. Complete Phase 2: Foundational (TypeScript interfaces)
3. Complete Phase 3: User Story 7 (workflow registry infrastructure)
4. Complete Phase 4: User Story 1 (campaign.build.v1 workflow)
5. **STOP and VALIDATE**: Trigger a full campaign build workflow
6. Deploy/demo if ready

### Incremental Delivery

1. Complete Setup + Foundational + US7 → Registry infrastructure ready
2. Add US1 (campaign.build) → Full build capability
3. Add US2-5 (update workflows) → Partial rebuild capability
4. Add US6 (3D replacement) → Advanced customization
5. Each workflow adds value without breaking previous workflows

### Parallel Team Strategy

With multiple developers:
1. Developer A: Complete Setup + Foundational + US7 (critical path)
2. After US7 done:
   - Developer A: US1 (build workflow)
   - Developer B: US2 + US3 (audio + intro update)
   - Developer C: US4 + US5 + US6 (outcome + game config + 3D)
3. All workflows complete and load independently

---

## Summary

| Phase | User Story | Tasks | Priority |
|-------|-----------|-------|----------|
| 1 | Setup | T001-T004 (4 tasks) | - |
| 2 | Foundational | T005-T009 (5 tasks) | - |
| 3 | US7 - Registry Management | T010-T024 (15 tasks) | P1 |
| 4 | US1 - Campaign Build | T025-T039 (15 tasks) | P1 |
| 5 | US2 - Audio Update | T040-T046 (7 tasks) | P2 |
| 6 | US3 - Intro Update | T047-T052 (6 tasks) | P2 |
| 7 | US4 - Outcome Update | T053-T057 (5 tasks) | P2 |
| 8 | US5 - Game Config Update | T058-T062 (5 tasks) | P2 |
| 9 | US6 - 3D Asset Replacement | T063-T068 (6 tasks) | P3 |
| 10 | Polish | T069-T072 (4 tasks) | - |

**Total**: 72 tasks

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- US7 is the critical path - all other stories depend on it
