# Tasks: Prompt & Config Registry

**Input**: Design documents from `/specs/005-prompt-config-registry/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Not explicitly requested - test tasks omitted.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Monorepo**: `dto/src/`, `agent-platform/src/`, `agent-platform/prompts/`, `agent-platform/configs/`, `agent-platform/rubrics/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization, dependencies, and shared types

- [X] T001 Add mustache, gray-matter, and semver dependencies to agent-platform/package.json
- [X] T002 [P] Create template storage directories: agent-platform/prompts/, agent-platform/configs/, agent-platform/rubrics/
- [X] T003 [P] Create DTO interfaces in dto/src/prompt-registry/index.ts (export barrel)
- [X] T004 [P] Create PromptTemplate interface in dto/src/prompt-registry/prompt-template.interface.ts
- [X] T005 [P] Create ConfigTemplate interface in dto/src/prompt-registry/config-template.interface.ts
- [X] T006 [P] Create ReviewRubric interface in dto/src/prompt-registry/review-rubric.interface.ts
- [X] T007 [P] Create RegistryResult types in dto/src/prompt-registry/registry-result.interface.ts
- [X] T008 Export prompt-registry module from dto/src/index.ts

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T009 Create prompt-registry module structure in agent-platform/src/prompt-registry/
- [X] T010 [P] Create registry-types.ts with internal types in agent-platform/src/prompt-registry/interfaces/registry-types.ts
- [X] T011 Create TemplateLoaderService skeleton in agent-platform/src/prompt-registry/services/template-loader.service.ts
- [X] T012 Create TemplateRendererService skeleton in agent-platform/src/prompt-registry/services/template-renderer.service.ts
- [X] T013 Create PromptRegistryService skeleton in agent-platform/src/prompt-registry/services/prompt-registry.service.ts
- [X] T014 Create PromptRegistryModule with providers in agent-platform/src/prompt-registry/prompt-registry.module.ts
- [X] T015 Register PromptRegistryModule in agent-platform/src/app.module.ts

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 1 - Load Prompt Template (Priority: P1) 🎯 MVP

**Goal**: Enable skill developers to load versioned prompt templates by ID

**Independent Test**: Create a prompt template file and call getPrompt() to retrieve it with all metadata

### Implementation for User Story 1

- [X] T016 [US1] Implement YAML frontmatter parsing in TemplateLoaderService using gray-matter in agent-platform/src/prompt-registry/services/template-loader.service.ts
- [X] T017 [US1] Implement prompt template file discovery (scan agent-platform/prompts/**/*.md) in TemplateLoaderService
- [X] T018 [US1] Implement semver version sorting and latest version resolution in TemplateLoaderService
- [X] T019 [US1] Implement vars_schema validation using existing SchemaValidatorService in TemplateLoaderService
- [X] T020 [US1] Implement template variable extraction (parse {{variable}} tokens) in TemplateLoaderService
- [X] T021 [US1] Implement OnModuleInit to load all prompts at startup in PromptRegistryService
- [X] T022 [US1] Implement getPrompt(promptId, version?) method in PromptRegistryService
- [X] T023 [US1] Implement listPrompts() and listPromptVersions(promptId) methods in PromptRegistryService
- [X] T024 [US1] Add structured logging for template loading (success/failure counts) in PromptRegistryService
- [X] T025 [US1] Create example prompt template: agent-platform/prompts/campaign_plan/1.0.0.md

**Checkpoint**: User Story 1 complete - getPrompt() works with versioned templates

---

## Phase 4: User Story 2 - Render Prompt with Variables (Priority: P1) 🎯 MVP

**Goal**: Enable skill developers to render prompt templates with variable substitution

**Independent Test**: Load a template with variables, call renderPrompt() with values, verify substitution

### Implementation for User Story 2

- [X] T026 [US2] Implement Mustache template rendering in TemplateRendererService using mustache package in agent-platform/src/prompt-registry/services/template-renderer.service.ts
- [X] T027 [US2] Implement variable validation against vars_schema with defaults in TemplateRendererService
- [X] T028 [US2] Implement renderPrompt(promptId, version, vars) method in PromptRegistryService
- [X] T029 [US2] Return RenderedPrompt with content, modelDefaults, outputSchema, and varsApplied in PromptRegistryService
- [X] T030 [US2] Add validation error formatting (list missing/invalid fields) in PromptRegistryService
- [X] T031 [US2] Update example prompt template with variables: agent-platform/prompts/campaign_plan/1.0.0.md

**Checkpoint**: User Stories 1 AND 2 complete - full prompt loading and rendering works

---

## Phase 5: User Story 3 - Load Review Rubric (Priority: P2)

**Goal**: Enable skill developers to load versioned review rubrics for quality assessment

**Independent Test**: Create a rubric file, call getRubric() to retrieve criteria and output_schema

### Implementation for User Story 3

- [ ] T032 [US3] Implement rubric JSON file loading in TemplateLoaderService
- [ ] T033 [US3] Implement rubric schema validation (criteria array, weights, output_schema) in TemplateLoaderService
- [ ] T034 [US3] Add rubric loading to OnModuleInit in PromptRegistryService
- [ ] T035 [US3] Implement getRubric(rubricId, version?) method in PromptRegistryService
- [ ] T036 [US3] Implement listRubrics() and listRubricVersions(rubricId) methods in PromptRegistryService
- [ ] T037 [US3] Create example rubric: agent-platform/rubrics/asset_quality/1.0.0.json

**Checkpoint**: User Story 3 complete - rubric loading works independently

---

## Phase 6: User Story 4 - Load Config Template (Priority: P2)

**Goal**: Enable skill developers to load and render versioned config templates

**Independent Test**: Create a config template, call getConfig() and renderConfig() to verify

### Implementation for User Story 4

- [ ] T038 [US4] Implement config JSON file loading in TemplateLoaderService
- [ ] T039 [US4] Implement config schema validation in TemplateLoaderService
- [ ] T040 [US4] Implement recursive object rendering for config templates in TemplateRendererService
- [ ] T041 [US4] Add config loading to OnModuleInit in PromptRegistryService
- [ ] T042 [US4] Implement getConfig(configId, version?) method in PromptRegistryService
- [ ] T043 [US4] Implement renderConfig(configId, version, vars) method in PromptRegistryService
- [ ] T044 [US4] Implement listConfigs() and listConfigVersions(configId) methods in PromptRegistryService
- [ ] T045 [US4] Create example config: agent-platform/configs/game_settings/1.0.0.json

**Checkpoint**: User Story 4 complete - config loading and rendering works

---

## Phase 7: User Story 5 - Record Resolved Prompts (Priority: P3)

**Goal**: Enable system operators to audit/debug resolved prompts in run_steps.debug

**Independent Test**: Execute a skill using a registry prompt, verify resolved prompt appears in run_steps.debug

### Implementation for User Story 5

- [ ] T046 [US5] Add RegistryPromptDebug interface to dto/src/prompt-registry/registry-prompt-debug.interface.ts
- [ ] T047 [US5] Extend SkillProviderCall interface in dto to include registryPrompt field
- [ ] T048 [US5] Inject PromptRegistryService into ExecutionContextService in agent-platform/src/skills/skill-runner/services/execution-context.service.ts
- [ ] T049 [US5] Add promptRegistry property to ExecutionContext interface in agent-platform/src/skills/skill-runner/interfaces/execution-context.interface.ts
- [ ] T050 [US5] Create wrapper method that captures resolved prompts for debug recording in ExecutionContextService
- [ ] T051 [US5] Implement hash generation for large prompts (>10KB) using crypto.createHash in ExecutionContextService
- [ ] T052 [US5] Update SkillRunnerService to include registry_prompt in debug.provider_calls in agent-platform/src/skills/skill-runner/skill-runner.service.ts

**Checkpoint**: User Story 5 complete - resolved prompts recorded in run_steps.debug

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [ ] T053 [P] Create second example prompt: agent-platform/prompts/game_config/1.0.0.md
- [ ] T054 [P] Create third example prompt: agent-platform/prompts/review_asset/1.0.0.md
- [ ] T055 Add startup validation summary log (X prompts, Y configs, Z rubrics loaded)
- [ ] T056 Add error handling for malformed template files (skip and log, don't crash)
- [ ] T057 Verify all example templates work with quickstart.md scenarios
- [ ] T058 Update SkillRunnerModule to import PromptRegistryModule in agent-platform/src/skills/skill-runner/skill-runner.module.ts

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3-7)**: All depend on Foundational phase completion
  - US1 and US2 can run in parallel (both P1 priority, different functionality)
  - US3 and US4 can run in parallel (both P2 priority)
  - US5 depends on US1+US2 being complete (needs working registry to integrate)
- **Polish (Phase 8)**: Depends on all user stories being complete

### User Story Dependencies

| Story | Priority | Dependencies | Can Parallelize With |
|-------|----------|--------------|---------------------|
| US1 (Load Prompt) | P1 | Foundational | US2 |
| US2 (Render Prompt) | P1 | Foundational | US1 |
| US3 (Load Rubric) | P2 | Foundational | US4 |
| US4 (Load Config) | P2 | Foundational | US3 |
| US5 (Debug Recording) | P3 | US1, US2 | None |

### Within Each User Story

- File loading before retrieval methods
- Retrieval methods before rendering methods
- Core implementation before logging/error handling

### Parallel Opportunities

**Phase 1 (Setup)**:
```
T002 || T003 || T004 || T005 || T006 || T007
```

**Phase 3+4 (US1 + US2 can run in parallel)**:
```
[US1: T016-T025] || [US2: T026-T031]
```

**Phase 5+6 (US3 + US4 can run in parallel)**:
```
[US3: T032-T037] || [US4: T038-T045]
```

---

## Parallel Example: Phase 1 Setup

```bash
# Launch all DTO interface tasks together:
Task: "Create PromptTemplate interface in dto/src/prompt-registry/prompt-template.interface.ts"
Task: "Create ConfigTemplate interface in dto/src/prompt-registry/config-template.interface.ts"
Task: "Create ReviewRubric interface in dto/src/prompt-registry/review-rubric.interface.ts"
Task: "Create RegistryResult types in dto/src/prompt-registry/registry-result.interface.ts"
```

---

## Implementation Strategy

### MVP First (User Stories 1 + 2)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1 (Load Prompt)
4. Complete Phase 4: User Story 2 (Render Prompt)
5. **STOP and VALIDATE**: Test loading and rendering prompts
6. Deploy/demo if ready - this is a functional MVP

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. US1 + US2 → Test independently → Deploy/Demo (MVP!)
3. US3 (Rubrics) → Test independently → Deploy/Demo
4. US4 (Configs) → Test independently → Deploy/Demo
5. US5 (Debug) → Test independently → Deploy/Demo
6. Polish → Final delivery

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: US1 (Load Prompt)
   - Developer B: US2 (Render Prompt)
3. After US1+US2:
   - Developer A: US3 (Rubrics)
   - Developer B: US4 (Configs)
4. Developer A or B: US5 (Debug Recording)
5. Both: Polish

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- US1 and US2 together form the MVP - both are P1 priority
- US5 (Debug Recording) requires US1+US2 since it integrates with the working registry
