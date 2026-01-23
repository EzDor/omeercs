# Tasks: Agent Layer Decision Rules

**Input**: Design documents from `/specs/006-agent-layer-rules/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Deferred (tests not required for this phase per plan.md)

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Monorepo**: `agent-platform/src/` for skill runner and services
- **Shared packages**: `common/`, `dto/` packages
- **Prompts/Rubrics**: `agent-platform/src/prompt-registry/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and type definitions

- [x] T001 Create interfaces directory at agent-platform/src/skills/skill-runner/interfaces/
- [x] T002 [P] Create template types enum in agent-platform/src/skills/skill-runner/interfaces/template-types.ts
- [x] T003 [P] Create GenerationResult interface in agent-platform/src/skills/skill-runner/interfaces/generation-result.interface.ts
- [x] T004 [P] Create ReviewResult interface in agent-platform/src/skills/skill-runner/interfaces/review-result.interface.ts
- [x] T005 [P] Create TemplateConfig interfaces in agent-platform/src/skills/skill-runner/interfaces/template-config.interface.ts
- [x] T006 Create interfaces barrel export in agent-platform/src/skills/skill-runner/interfaces/index.ts

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T007 Extend SkillDescriptor interface with template_type and template_config fields in dto/src/skills/skill-descriptor.interface.ts
- [x] T008 Update SkillDescriptor YAML schema validation to accept new template_type field in agent-platform/src/skills/services/skill-catalog.service.ts
- [x] T009 Add template type routing logic to SkillRunnerService.execute() in agent-platform/src/skills/skill-runner/skill-runner.service.ts
- [x] T010 Create services directory at agent-platform/src/skills/skill-runner/services/ (if not exists)

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 1 - JSON Generation Skill Template (Priority: P1) 🎯 MVP

**Goal**: Enable developers to create skills that use Claude Agent SDK to generate structured JSON output with schema validation

**Independent Test**: Create a skill that takes input parameters and produces validated JSON output matching a predefined schema

### Implementation for User Story 1

- [x] T011 [US1] Create LlmGenerationService class in agent-platform/src/skills/skill-runner/services/llm-generation.service.ts
- [x] T012 [US1] Implement generate() method with prompt rendering via PromptRegistryService in llm-generation.service.ts
- [x] T013 [US1] Implement structured output request building with response_format.json_schema in llm-generation.service.ts
- [x] T014 [US1] Implement LLM API call via LiteLLMHttpClient with exponential backoff (FR-011) in llm-generation.service.ts
- [x] T015 [US1] Implement schema validation with Ajv SchemaValidatorService in llm-generation.service.ts
- [x] T016 [US1] Implement auto-retry on validation failure with error injection (FR-010) in llm-generation.service.ts
- [x] T017 [US1] Implement supportsStructuredOutput() method for model capability detection in llm-generation.service.ts
- [x] T018 [US1] Register LlmGenerationService in SkillRunnerModule providers in agent-platform/src/skills/skill-runner/skill-runner.module.ts
- [x] T019 [US1] Create LLM_JSON_GENERATION template handler integration in skill-runner.service.ts
- [x] T020 [P] [US1] Create example prompt template for JSON generation skill in agent-platform/prompts/example_json_generation/1.0.0.md
- [x] T021 [US1] Create example skill descriptor using LLM_JSON_GENERATION template in skills/catalog/example_json_generation.yaml

**Checkpoint**: User Story 1 complete - developers can create JSON generation skills with schema validation

---

## Phase 4: User Story 2 - Review/Critique Skill Template (Priority: P2)

**Goal**: Enable developers to create skills that review and critique generated assets using rubric-based evaluation

**Independent Test**: Invoke a review skill with sample asset data and verify it returns structured feedback with pass/fail, issues list, and suggestions

### Implementation for User Story 2

- [ ] T022 [P] [US2] Create EvaluationCriterion interface in agent-platform/src/skills/skill-runner/interfaces/evaluation-criterion.interface.ts
- [ ] T023 [P] [US2] Create ReviewRubric interface in agent-platform/src/skills/skill-runner/interfaces/review-rubric.interface.ts
- [ ] T024 [US2] Create LlmReviewService class in agent-platform/src/skills/skill-runner/services/llm-review.service.ts
- [ ] T025 [US2] Implement getRubric() method to load rubric from registry in llm-review.service.ts
- [ ] T026 [US2] Implement listRubrics() method to enumerate available rubrics in llm-review.service.ts
- [ ] T027 [US2] Implement review() method with rubric loading in llm-review.service.ts
- [ ] T028 [US2] Implement per-criterion evaluation with chain-of-thought prompting in llm-review.service.ts
- [ ] T029 [US2] Implement indeterminate criteria detection (confidence < 50 threshold) in llm-review.service.ts
- [ ] T030 [US2] Implement verdict aggregation logic (binary and weighted scoring modes) in llm-review.service.ts
- [ ] T031 [US2] Register LlmReviewService in SkillRunnerModule providers in skill-runner.module.ts
- [ ] T032 [US2] Create LLM_REVIEW template handler integration in skill-runner.service.ts
- [ ] T033 [P] [US2] Create rubrics directory at agent-platform/src/prompt-registry/rubrics/
- [ ] T034 [P] [US2] Create example review rubric in agent-platform/src/prompt-registry/rubrics/example-quality-rubric.json
- [ ] T035 [US2] Create example skill descriptor using LLM_REVIEW template in agent-platform/src/skills/catalog/example-review.skill.yaml

**Checkpoint**: User Story 2 complete - developers can create review skills with rubric-based evaluation

---

## Phase 5: User Story 3 - Generate-Review-Retry Pattern (Priority: P3)

**Goal**: Implement a simple retry pattern where content is generated, reviewed, and if it fails review, regenerated once with critique suggestions

**Independent Test**: Trigger a generation that intentionally fails review, then verify the system retries with critique suggestions incorporated

### Implementation for User Story 3

- [ ] T036 [US3] Create GenerateReviewRetryService class in agent-platform/src/skills/skill-runner/services/generate-review-retry.service.ts
- [ ] T037 [US3] Implement generateWithReview() method composing LlmGenerationService and LlmReviewService
- [ ] T038 [US3] Implement defaultBuildRetryInput() function for critique injection in generate-review-retry.service.ts
- [ ] T039 [US3] Implement timing aggregation across generation and review steps in generate-review-retry.service.ts
- [ ] T040 [US3] Implement retryOnce flag handling with single retry maximum in generate-review-retry.service.ts
- [ ] T041 [US3] Register GenerateReviewRetryService in SkillRunnerModule providers in skill-runner.module.ts
- [ ] T042 [US3] Update interfaces/index.ts to export GenerateWithReviewConfig and GenerateWithReviewResult

**Checkpoint**: User Story 3 complete - developers can use generate-review-retry pattern without LangGraph

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Documentation and final integration

- [ ] T043 [P] Create Agent Usage Policy document in agent-platform/docs/agent-usage-policy.md (FR-008)
- [ ] T044 [P] Update interfaces/index.ts with complete barrel exports for all new interfaces
- [ ] T045 Validate all skill descriptors load correctly via SkillCatalogService
- [ ] T046 Run quickstart.md validation scenarios manually

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3+)**: All depend on Foundational phase completion
  - User Story 1 (P1): JSON Generation - standalone
  - User Story 2 (P2): Review - standalone (can parallelize with US1)
  - User Story 3 (P3): Generate-Review-Retry - depends on both US1 and US2 completion
- **Polish (Phase 6)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 2 (P2)**: Can start after Foundational (Phase 2) - No dependencies on other stories (can run parallel with US1)
- **User Story 3 (P3)**: Depends on BOTH US1 and US2 completion (composes both services)

### Within Each User Story

- Service implementation before module registration
- Module registration before template handler integration
- Template handler before example skill descriptors
- Core implementation before examples

### Parallel Opportunities

**Phase 1 (Setup)**:
```bash
# Launch all interface creation together:
Task: T002 - Create template types enum
Task: T003 - Create GenerationResult interface
Task: T004 - Create ReviewResult interface
Task: T005 - Create TemplateConfig interfaces
```

**Phase 3 & 4 (User Stories 1 & 2)**:
```bash
# Can run User Story 1 and User Story 2 in parallel since they are independent:
# Team Member A: T011-T021 (User Story 1)
# Team Member B: T022-T035 (User Story 2)
```

**Within User Story 2**:
```bash
# Launch interface creation together:
Task: T022 - Create EvaluationCriterion interface
Task: T023 - Create ReviewRubric interface
Task: T033 - Create rubrics directory
Task: T034 - Create example review rubric
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001-T006)
2. Complete Phase 2: Foundational (T007-T010)
3. Complete Phase 3: User Story 1 (T011-T021)
4. **STOP and VALIDATE**: Test JSON generation skill independently
5. Deploy/demo if ready

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Test independently → Deploy/Demo (MVP!)
3. Add User Story 2 → Test independently → Deploy/Demo
4. Add User Story 3 (requires US1 + US2) → Test full pattern → Deploy/Demo
5. Each story adds value without breaking previous stories

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1 (JSON Generation)
   - Developer B: User Story 2 (Review)
3. Once US1 + US2 complete:
   - Any developer: User Story 3 (Generate-Review-Retry)
4. Stories complete and integrate independently

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable (except US3 which composes US1+US2)
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Tests are deferred per plan.md - focus on implementation quality
