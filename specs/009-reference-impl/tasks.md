# Tasks: Reference Implementations

**Input**: Design documents from `/specs/009-reference-impl/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Integration tests are included as this feature validates the end-to-end platform pipeline.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## User Story Summary

| Story | Priority | Description | MVP |
|-------|----------|-------------|-----|
| US1 | P1 | Execute Full Campaign Build Workflow | ✅ Yes |
| US2 | P2 | Generate Game Configuration via Claude JSON | |
| US3 | P2 | Generate Background Music Track (Stub Provider) | |
| US4 | P2 | Assemble Campaign Manifest (Deterministic) | |
| US5 | P3 | Partial Rebuild with Cache Reuse | |

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create test fixtures and environment configuration for reference implementation

- [x] T001 Create placeholder video fixtures directory at agent-platform/test/fixtures/videos/
- [x] T002 [P] Create placeholder intro video file at agent-platform/test/fixtures/videos/placeholder-intro.mp4
- [x] T003 [P] Create placeholder win video file at agent-platform/test/fixtures/videos/placeholder-win.mp4
- [x] T004 [P] Create placeholder lose video file at agent-platform/test/fixtures/videos/placeholder-lose.mp4
- [x] T005 Add AUDIO_PROVIDER_STUB environment variable to .env.example

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Implement stub audio provider and minimal workflow that ALL user stories depend on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T006 Implement StubAudioProvider adapter at common/src/providers/adapters/stub-audio.adapter.ts following StabilityAdapter pattern
- [x] T007 Implement WAV file generation utility function generateSilentWav() in common/src/providers/adapters/stub-audio.adapter.ts
- [x] T008 Create AudioProviderRegistry at common/src/providers/registries/audio-provider.registry.ts with stub/real provider switching
- [x] T009 Register StubAudioProvider and AudioProviderRegistry in common/src/providers/providers.module.ts
- [x] T010 Export audio provider components from common/src/providers/providers.module.ts
- [x] T011 Create minimal workflow YAML at agent-platform/workflows/campaign.build.v1.minimal.yaml with 4 steps (game_config, bgm, bundle_game, manifest)
- [x] T012 Add campaign.build.minimal to workflow index at agent-platform/workflows/index.yaml
- [x] T013 Verify game_config_from_template.yaml has retry_on_validation_failure: true at skills/catalog/game_config_from_template.yaml

**Checkpoint**: Foundation ready - stub provider and minimal workflow available for user story testing

---

## Phase 3: User Story 1 - Execute Full Campaign Build Workflow (Priority: P1) 🎯 MVP

**Goal**: Trigger a complete campaign build workflow that orchestrates multiple skills to produce a campaign manifest with 4 artifacts.

**Independent Test**: Trigger campaign.build.minimal workflow with sample inputs and verify all 4 artifacts are produced (game_config, audio, bundle, manifest).

**Acceptance Criteria**:
- AC1: Workflow produces campaign manifest referencing all generated artifacts
- AC2: All steps show "completed" status with stored input_hash values
- AC3: All URIs in manifest point to valid artifact locations

### Integration Tests for User Story 1

- [x] T014 [P] [US1] Create e2e test file at agent-platform/test/e2e/campaign-build-workflow.e2e-spec.ts
- [x] T015 [US1] Implement test: should produce 4 distinct artifacts when workflow completes at agent-platform/test/e2e/campaign-build-workflow.e2e-spec.ts
- [x] T016 [US1] Implement test: should have all steps with completed status and input_hash at agent-platform/test/e2e/campaign-build-workflow.e2e-spec.ts
- [x] T017 [US1] Implement test: should have valid URIs in manifest for all artifacts at agent-platform/test/e2e/campaign-build-workflow.e2e-spec.ts

### Implementation for User Story 1

- [x] T018 [US1] Update generate-bgm-track.handler.ts to use AudioProviderRegistry instead of direct LiteLLM at agent-platform/src/skills/handlers/generate-bgm-track.handler.ts
- [x] T019 [US1] Inject AudioProviderRegistry into GenerateBgmTrackHandler constructor at agent-platform/src/skills/handlers/generate-bgm-track.handler.ts
- [x] T020 [US1] Add stub provider detection logic (AUDIO_PROVIDER_STUB env var) at agent-platform/src/skills/handlers/generate-bgm-track.handler.ts
- [x] T021 [US1] Verify workflow trigger endpoint accepts placeholder video URIs at api-center/src/workflows/workflows.controller.ts
- [x] T022 [US1] Create sample trigger payload JSON for testing at agent-platform/test/fixtures/campaign-build-trigger.json
- [x] T023 [US1] Run minimal workflow end-to-end and verify SC-001 (4 distinct artifacts)

**Checkpoint**: User Story 1 complete - full workflow execution produces all required artifacts

---

## Phase 4: User Story 2 - Generate Game Configuration via Claude JSON (Priority: P2)

**Goal**: Generate a game configuration JSON file using Claude with schema validation and retry logic.

**Independent Test**: Invoke game_config_from_template skill directly and validate output JSON conforms to schema.

**Acceptance Criteria**:
- AC1: Claude generates JSON matching game_config schema
- AC2: Retry with corrective prompt produces valid JSON on second attempt
- AC3: Clear error indicating schema validation failure after retry exhaustion

### Integration Tests for User Story 2

- [x] T024 [P] [US2] Create skill test file at agent-platform/test/skills/game-config-from-template.skill-spec.ts
- [x] T025 [US2] Implement test: should generate valid JSON on first attempt for well-formed inputs at agent-platform/test/skills/game-config-from-template.skill-spec.ts
- [x] T026 [US2] Implement test: should retry and succeed when first attempt has validation errors at agent-platform/test/skills/game-config-from-template.skill-spec.ts
- [x] T027 [US2] Implement test: should return clear validation error after retry exhaustion at agent-platform/test/skills/game-config-from-template.skill-spec.ts

### Implementation for User Story 2

- [x] T028 [US2] Verify LlmGenerationService retry logic is enabled via template config at agent-platform/src/skills/skill-runner/skill-runner.service.ts:264
- [x] T029 [US2] Update game_config_from_template output schema to match Spec 9 minimal schema (template_id, difficulty, level_params, spawn_rates, scoring, controls, assets) at agent-platform/src/skills/handlers/game-config-from-template.handler.ts
- [x] T030 [US2] Add diagnostic timing capture for retry_llm_call in game_config_from_template at agent-platform/src/skills/handlers/game-config-from-template.handler.ts
- [x] T031 [US2] Create test fixture for game config inputs at agent-platform/test/fixtures/game-config-input.json

**Checkpoint**: User Story 2 complete - Claude JSON generation works with retry logic

---

## Phase 5: User Story 3 - Generate Background Music Track (Priority: P2)

**Goal**: Generate background audio for campaigns using the stub provider.

**Independent Test**: Invoke generate_bgm_track skill and verify an audio file artifact is produced.

**Acceptance Criteria**:
- AC1: Placeholder audio file is created and registered as artifact
- AC2: Stub produces valid audio file of requested duration

### Integration Tests for User Story 3

- [x] T032 [P] [US3] Create skill test file at agent-platform/test/skills/generate-bgm-track.skill-spec.ts
- [x] T033 [US3] Implement test: should produce audio artifact with stub provider at agent-platform/test/skills/generate-bgm-track.skill-spec.ts
- [x] T034 [US3] Implement test: should generate audio file matching requested duration at agent-platform/test/skills/generate-bgm-track.skill-spec.ts

### Implementation for User Story 3

- [x] T035 [US3] Verify StubAudioProvider generates WAV file with correct header at common/src/providers/adapters/stub-audio.adapter.ts
- [x] T036 [US3] Add duration validation to ensure audio matches requested duration_sec at common/src/providers/adapters/stub-audio.adapter.ts
- [x] T037 [US3] Add metadata (providerId, durationSec, format, sampleRate, channels) to stub response at common/src/providers/adapters/stub-audio.adapter.ts
- [x] T038 [US3] Create test fixture for BGM generation inputs at agent-platform/test/fixtures/bgm-input.json

**Checkpoint**: User Story 3 complete - stub audio provider produces valid audio artifacts

---

## Phase 6: User Story 4 - Assemble Campaign Manifest (Priority: P2)

**Goal**: Assemble a campaign manifest from generated artifacts and configuration.

**Independent Test**: Provide artifact URIs and configuration, validate manifest structure.

**Acceptance Criteria**:
- AC1: Manifest JSON created referencing all provided URIs
- AC2: Manifest validates against campaign manifest schema

### Integration Tests for User Story 4

- [x] T039 [P] [US4] Create skill test file at agent-platform/test/skills/assemble-campaign-manifest.skill-spec.ts
- [x] T040 [US4] Implement test: should create manifest with all required URI references at agent-platform/test/skills/assemble-campaign-manifest.skill-spec.ts
- [x] T041 [US4] Implement test: should validate against manifest schema at agent-platform/test/skills/assemble-campaign-manifest.skill-spec.ts
- [x] T042 [US4] Implement test: should fail fast with clear error for missing required URIs at agent-platform/test/skills/assemble-campaign-manifest.skill-spec.ts

### Implementation for User Story 4

- [x] T043 [US4] Verify assemble-campaign-manifest.handler.ts validates required inputs before processing at agent-platform/src/skills/handlers/assemble-campaign-manifest.handler.ts
- [x] T044 [US4] Add input validation error messages with specific field names at agent-platform/src/skills/handlers/assemble-campaign-manifest.handler.ts
- [x] T045 [US4] Create test fixture for manifest assembly inputs at agent-platform/test/fixtures/manifest-input.json

**Checkpoint**: User Story 4 complete - deterministic manifest assembly produces valid manifests

---

## Phase 7: User Story 5 - Partial Rebuild with Cache Reuse (Priority: P3)

**Goal**: Update only audio in existing campaign while reusing cached steps.

**Independent Test**: Trigger audio update on completed run and verify only audio-dependent steps re-execute.

**Acceptance Criteria**:
- AC1: Only bgm, bundle_game, manifest steps re-run after audio update
- AC2: game_config step marked as skipped with cached output
- AC3: New run shows "skipped" status for reused steps, "completed" for re-executed

### Integration Tests for User Story 5

- [x] T046 [P] [US5] Create e2e test file at agent-platform/test/e2e/partial-rebuild-cache.e2e-spec.ts
- [x] T047 [US5] Implement test: should reuse game_config from cache on audio update at agent-platform/test/e2e/partial-rebuild-cache.e2e-spec.ts
- [x] T048 [US5] Implement test: should re-execute only bgm, bundle_game, manifest steps at agent-platform/test/e2e/partial-rebuild-cache.e2e-spec.ts
- [x] T049 [US5] Implement test: should show correct skipped/completed status per step at agent-platform/test/e2e/partial-rebuild-cache.e2e-spec.ts

### Implementation for User Story 5

- [x] T050 [US5] Verify StepCacheService correctly stores and retrieves artifacts by input hash at agent-platform/src/run-engine/services/step-cache.service.ts
- [x] T051 [US5] Verify campaign.update_audio.v1.yaml correctly references base_run for unchanged steps at agent-platform/workflows/campaign.update_audio.v1.yaml
- [x] T052 [US5] Add cache analysis endpoint to return step-by-step cache hit/miss report at api-center/src/workflows/workflows.controller.ts
- [x] T053 [US5] Create test fixture for audio update trigger at agent-platform/test/fixtures/audio-update-trigger.json

**Checkpoint**: User Story 5 complete - partial rebuilds work with correct cache reuse

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Final validation, observability, and cleanup

- [x] T054 [P] Verify FR-011 diagnostic data capture (input_hash, output_snapshot, duration, errors) in RunStep entity at dao/src/entities/run-step.entity.ts
- [x] T055 [P] Add structured logging for skill execution timings across all handlers at agent-platform/src/skills/handlers/
- [x] T056 Run all e2e tests and verify SC-001 through SC-005 success criteria
- [x] T057 Verify SC-004 execution time (full workflow under 30 seconds with stub providers)
- [x] T058 Run quickstart.md validation steps to confirm end-to-end functionality
- [x] T059 [P] Add workflow execution time metric to run status response at api-center/src/workflows/workflows.controller.ts
- [x] T060 Clean up any unused test fixtures and temporary files

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3-7)**: All depend on Foundational phase completion
  - US1 (P1): Must complete first as MVP - validates full workflow
  - US2, US3, US4 (P2): Can run in parallel after US1 validates integration
  - US5 (P3): Depends on US1 completion (needs completed run for cache test)
- **Polish (Phase 8)**: Depends on all user stories being complete

### User Story Dependencies

```
          ┌─────────────────────────────────────────┐
          │         Phase 2: Foundational           │
          │  (StubAudioProvider, MinimalWorkflow)   │
          └───────────────────┬─────────────────────┘
                              │
                              ▼
          ┌─────────────────────────────────────────┐
          │   US1: Full Workflow Execution (MVP)    │
          └───────────────────┬─────────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          │                   │                   │
          ▼                   ▼                   ▼
   ┌────────────┐     ┌────────────┐     ┌────────────┐
   │ US2: JSON  │     │ US3: Audio │     │ US4: Mani- │
   │ Generation │     │ Stub Prov. │     │ fest Assy. │
   └────────────┘     └────────────┘     └────────────┘
          │                   │                   │
          └───────────────────┼───────────────────┘
                              │
                              ▼
          ┌─────────────────────────────────────────┐
          │     US5: Partial Rebuild Cache          │
          │   (requires completed run from US1)     │
          └─────────────────────────────────────────┘
```

### Within Each User Story

- Tests MUST be written first and FAIL before implementation
- Foundation components before handlers
- Handlers before integration
- Story complete before moving to next priority

### Parallel Opportunities

**Phase 1 (Setup):**
- T002, T003, T004 can run in parallel (different fixture files)

**Phase 2 (Foundational):**
- T006-T010 must be sequential (provider depends on utility, registry depends on provider)
- T011-T013 can run in parallel with T006-T010 (workflow vs provider)

**Phase 3-6 (US2, US3, US4):**
- After US1 MVP completion, US2, US3, US4 can be implemented in parallel by different developers

**Phase 8 (Polish):**
- T054, T055, T059 can run in parallel (different files)

---

## Parallel Example: Foundational Phase

```bash
# Parallel track A: Provider implementation
Task: "Implement StubAudioProvider adapter at common/src/providers/adapters/stub-audio.adapter.ts"
Task: "Create AudioProviderRegistry at common/src/providers/registries/audio-provider.registry.ts"

# Parallel track B: Workflow definition (can run simultaneously)
Task: "Create minimal workflow YAML at agent-platform/workflows/campaign.build.v1.minimal.yaml"
Task: "Add campaign.build.minimal to workflow index at agent-platform/workflows/index.yaml"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (fixtures)
2. Complete Phase 2: Foundational (stub provider + minimal workflow)
3. Complete Phase 3: User Story 1 (full workflow execution)
4. **STOP and VALIDATE**: Run minimal workflow end-to-end, verify 4 artifacts
5. Deploy/demo if ready - this validates the entire platform pipeline

### Incremental Delivery

1. Setup + Foundational → Stub provider and workflow ready
2. Add User Story 1 → Test workflow → Demo MVP!
3. Add User Story 2 → Test JSON generation independently
4. Add User Story 3 → Test audio stub independently
5. Add User Story 4 → Test manifest assembly independently
6. Add User Story 5 → Test cache reuse → Complete reference implementation

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Developer A completes US1 (MVP validation)
3. Once US1 passes:
   - Developer A: User Story 5 (cache testing)
   - Developer B: User Story 2 (JSON generation)
   - Developer C: User Story 3 + 4 (audio + manifest)
4. Stories complete and integrate independently

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story is independently completable and testable
- Most handlers already exist - focus is on integration and stub implementation
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
