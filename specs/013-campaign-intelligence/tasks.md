# Tasks: Campaign Intelligence

**Input**: Design documents from `/specs/013-campaign-intelligence/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

**Tests**: Not explicitly requested. Tests omitted from task list.

**Organization**: Tasks grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **dto/**: `dto/src/intelligence/` — Shared DTOs and enums
- **common/**: `common/src/intelligence/` — Utilities (WCAG, compliance, presets)
- **dao/**: `dao/src/entities/` — AiGeneration entity
- **agent-platform/**: `agent-platform/src/intelligence/` — LLM services and internal endpoints
- **api-center/**: `api-center/src/intelligence/` — Public REST API
- **webapp/**: `webapp/src/` — Minimal test UI
- **prompts/**: `agent-platform/prompts/` — LLM prompt templates
- **skills/**: `skills/catalog/` — Skill descriptor YAML files

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Install dependencies, create shared enums, entity, and migration

- [x] T001 Create shared intelligence enums (CopyType, CopyTone, ThemeMood, GenerationType, GenerationStatus) in dto/src/intelligence/intelligence-enums.ts
- [x] T002 Install sharp dependency in agent-platform workspace: run `pnpm --filter agent-platform add sharp` and `pnpm --filter agent-platform add -D @types/sharp`
- [x] T003 Create AiGeneration entity extending BaseEntity with tenantId, campaignId, userId, generationType, status, accepted, inputParams (jsonb), output (jsonb), error (jsonb), durationMs, llmModel, attempts columns and indexes per data-model.md in dao/src/entities/ai-generation.entity.ts
- [x] T004 Create database migration for ai_generations table with CHECK constraints on generation_type and status, foreign key to campaigns(id) ON DELETE SET NULL, composite indexes on (tenant_id, campaign_id) and (tenant_id, generation_type) in dao/src/migrations/ using `pnpm migration:generate`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core utilities, DTOs, and module scaffolds that ALL user stories depend on

**CRITICAL**: No user story work can begin until this phase is complete

### Shared Utilities

- [x] T005 [P] Implement WCAG AA contrast ratio utility with relativeLuminance(), contrastRatio(), meetsAA(), and suggestAccessibleColor() functions in common/src/intelligence/wcag-contrast.util.ts
- [x] T006 [P] Implement copy compliance checker with flagged terms list (misleading: "guaranteed", "100%", "always win"; regulatory: "winner", "prize", "free"; financial: "no purchase necessary") returning ComplianceWarning[] in common/src/intelligence/copy-compliance.util.ts
- [x] T007 [P] Create static theme presets data for 6 industries (Retail, Food & Beverage, Finance, Seasonal, Luxury, Technology) with complete color palettes and mood classifications in common/src/intelligence/theme-presets.ts
- [x] T008 [P] Create character limits constant mapping CopyType to max character count per data-model.md (headline: 60, subheadline: 120, cta_button: 20, etc.) in common/src/intelligence/copy-character-limits.ts
- [x] T009 [P] Create template-specific default copy data for spin_wheel, scratch_card, quiz, memory_match with CTA, win, and lose defaults in common/src/intelligence/template-copy-defaults.ts
- [x] T010 Create NestJS module exporting all intelligence utilities in common/src/intelligence/intelligence.module.ts

### DTOs (all in dto/src/intelligence/)

- [x] T011 [P] Create plan generation request DTO (GeneratePlanRequest with brief, constraints) and response DTO (GeneratePlanResponse with plan, generation_id, duration_ms) with class-validator decorators per contracts/plan-generation.contract.md in dto/src/intelligence/plan-generation.dto.ts
- [x] T012 [P] Create AcceptPlanRequest and AcceptPlanResponse DTOs for plan acceptance endpoint in dto/src/intelligence/plan-generation.dto.ts (append to same file as T011)
- [x] T013 [P] Create copy generation request DTO (GenerateCopyRequest with campaign_context, copy_types, tone, variations_count, constraints) and response DTO (GenerateCopyResponse) with class-validator decorators per contracts/copy-generation.contract.md in dto/src/intelligence/copy-generation.dto.ts
- [x] T014 [P] Create theme extraction request DTOs (ExtractThemeFromBriefRequest, ValidateThemeRequest) and response DTOs (ExtractThemeResponse, ValidateThemeResponse) per contracts/theme-extraction.contract.md in dto/src/intelligence/theme-extraction.dto.ts
- [x] T015 [P] Create theme presets response DTO (ThemePresetsResponse, ThemePresetItem) and generation history DTOs (GenerationHistoryQuery, GenerationHistoryResponse) per contracts/theme-presets.contract.md in dto/src/intelligence/theme-presets.dto.ts
- [x] T016 [P] Create CopyDefaultsResponse DTO for template defaults endpoint in dto/src/intelligence/copy-generation.dto.ts (append to same file as T013)

### Module Scaffolds

- [x] T017 Create intelligence NestJS module in agent-platform importing PromptRegistryModule, LiteLLMModule, and TypeOrmModule.forFeature([]) in agent-platform/src/intelligence/intelligence.module.ts
- [x] T018 Create intelligence controller scaffold in agent-platform with empty route handlers for /internal/intelligence/* prefix in agent-platform/src/intelligence/intelligence.controller.ts
- [x] T019 Create intelligence NestJS module in api-center importing TypeOrmModule.forFeature([AiGeneration, Campaign]), ConfigModule, TenantClsModule in api-center/src/intelligence/intelligence.module.ts
- [x] T020 Create intelligence controller scaffold in api-center with empty route handlers for /intelligence/* prefix using @UseGuards(AuthGuard) and TenantContextInterceptor in api-center/src/intelligence/intelligence.controller.ts
- [x] T021 Create intelligence API service scaffold in api-center with axios HTTP client configured to call agent-platform at AGENT_PLATFORM_URL (default http://localhost:3002) in api-center/src/intelligence/intelligence-api.service.ts
- [x] T022 Register IntelligenceModule in agent-platform AppModule imports in agent-platform/src/app.module.ts
- [x] T023 Register IntelligenceModule in api-center AppModule imports in api-center/src/app.module.ts
- [x] T024 Run database migration, build dto and common packages, verify compilation: `pnpm --filter @agentic-template/dto build && pnpm --filter @agentic-template/common build && pnpm --filter dao build`

**Checkpoint**: Foundation ready — all utilities, DTOs, entities, and module scaffolds in place. User story implementation can begin.

---

## Phase 3: User Story 1 — AI Campaign Plan from Brief (Priority: P1) MVP

**Goal**: Marketer submits a text brief and receives a structured campaign plan with template recommendation, theme, prize tiers, and confidence scoring. Accepting the plan creates a campaign draft.

**Independent Test**: Submit a brief via POST /api/intelligence/plan, verify response contains valid template recommendation (confidence 0-1), theme with hex colors, prize tiers, engagement estimate. Then POST to /accept, verify a draft campaign is created with pre-filled config.

### Implementation for User Story 1

- [x] T025 [US1] Create intelligence_plan prompt template (1.0.0.md) with system prompt describing available game templates (spin_wheel, scratch_card, quiz, memory_match), their strengths, and output schema requirements including confidence scoring, prize tiers, and engagement estimates in agent-platform/prompts/intelligence_plan/1.0.0.md
- [x] T026 [P] [US1] Create intelligence_plan skill descriptor YAML with input_schema (brief, constraints), output_schema (plan structure with confidence, prizes, engagement), template_type LLM_JSON_GENERATION, and template_config referencing intelligence_plan prompt in skills/catalog/intelligence_plan.yaml
- [x] T027 [US1] Implement IntelligencePlanService that loads the intelligence_plan prompt via PromptRegistryService, renders variables (brief, constraints), calls LiteLLM with json_schema response format, validates output with Ajv, retries up to 2x on validation failure (FR-017), and returns structured plan in agent-platform/src/intelligence/services/intelligence-plan.service.ts
- [x] T028 [US1] Add POST /internal/intelligence/plan endpoint to agent-platform intelligence controller that accepts brief+constraints, calls IntelligencePlanService, returns plan JSON with duration_ms, model, attempts in agent-platform/src/intelligence/intelligence.controller.ts
- [x] T029 [US1] Implement generatePlan() in api-center IntelligenceApiService that calls agent-platform /internal/intelligence/plan via HTTP, persists AiGeneration record (type=plan) with input_params and output, returns enriched response with generation_id in api-center/src/intelligence/intelligence-api.service.ts
- [x] T030 [US1] Implement acceptPlan() in api-center IntelligenceApiService that loads the AiGeneration record, creates a new Campaign via existing CampaignApiService.create() with template, theme config, and name pre-filled from plan output, updates AiGeneration with accepted=true and campaign_id in api-center/src/intelligence/intelligence-api.service.ts
- [x] T031 [US1] Implement regeneratePlan() in api-center IntelligenceApiService that loads original generation input_params, calls agent-platform again with instruction to produce different output, creates new AiGeneration record in api-center/src/intelligence/intelligence-api.service.ts
- [x] T032 [US1] Add POST /intelligence/plan, POST /intelligence/plan/:generationId/accept, POST /intelligence/plan/:generationId/regenerate endpoints with request validation and error handling to api-center intelligence controller in api-center/src/intelligence/intelligence.controller.ts
- [x] T033 [US1] Add GET /intelligence/history and GET /intelligence/history/:generationId endpoints for querying generation history with tenant_id, campaign_id, type, and pagination filters in api-center/src/intelligence/intelligence.controller.ts
- [x] T034 [US1] Implement getHistory() and getGenerationById() methods in api-center IntelligenceApiService querying AiGeneration repository with tenant isolation in api-center/src/intelligence/intelligence-api.service.ts

**Checkpoint**: Plan generation, acceptance (campaign draft creation), regeneration, and history are fully functional. Test with curl per quickstart.md scenarios 1, 2, 8.

---

## Phase 4: User Story 2 — AI-Generated Marketing Copy (Priority: P1)

**Goal**: Marketer generates marketing copy (headlines, CTAs, win/lose messages) with tone selection, character limit enforcement, and compliance warnings. Template-specific defaults available as fallback.

**Independent Test**: POST /api/intelligence/copy with copy_types=["headline","cta_button"], tone="playful", verify 3 variations per type within character limits. Verify compliance warnings for "guaranteed" in output. GET /api/intelligence/copy/defaults/spin_wheel returns default copy.

### Implementation for User Story 2

- [x] T035 [US2] Create generate_copy prompt template (1.0.0.md) with marketing copywriter system prompt, template-specific context (spin_wheel→"Spin Now!", scratch_card→"Scratch to Reveal!"), tone instructions, character limit enforcement per copy type, and output schema requiring variations array with text, character_count, tone_match_score in agent-platform/prompts/generate_copy/1.0.0.md
- [x] T036 [P] [US2] Create generate_campaign_copy skill descriptor YAML with input_schema (campaign_context, copy_types, tone, variations_count, constraints), output_schema (copies array with variations), template_type LLM_JSON_GENERATION in skills/catalog/generate_campaign_copy.yaml
- [x] T037 [US2] Implement CopyGenerationService that loads generate_copy prompt, renders with campaign context and constraints, calls LiteLLM, validates character limits post-generation (truncate if exceeded), retries up to 2x on validation failure in agent-platform/src/intelligence/services/copy-generation.service.ts
- [x] T038 [US2] Add POST /internal/intelligence/copy endpoint to agent-platform intelligence controller that accepts copy generation params, calls CopyGenerationService, returns copies with duration_ms in agent-platform/src/intelligence/intelligence.controller.ts
- [x] T039 [US2] Implement generateCopy() in api-center IntelligenceApiService that calls agent-platform, runs compliance check (copy-compliance.util) on all generated variations, persists AiGeneration record (type=copy) with compliance_warnings in output, returns response in api-center/src/intelligence/intelligence-api.service.ts
- [x] T040 [US2] Implement getCopyDefaults() in api-center IntelligenceApiService that returns template-specific default copy from template-copy-defaults.ts for a given template type in api-center/src/intelligence/intelligence-api.service.ts
- [x] T041 [US2] Add POST /intelligence/copy and GET /intelligence/copy/defaults/:templateType endpoints with request validation to api-center intelligence controller in api-center/src/intelligence/intelligence.controller.ts

**Checkpoint**: Copy generation with tone, character limits, compliance warnings, and template defaults are functional. Test with curl per quickstart.md scenarios 3, 4, 9.

---

## Phase 5: User Story 3 — Theme Extraction from Brief (Priority: P2)

**Goal**: Marketer submits campaign brief and receives a color palette with mood classification. System validates WCAG AA contrast and warns about accessibility issues. Industry presets available for one-click application.

**Independent Test**: POST /api/intelligence/theme/from-brief with a "luxury brand" brief, verify response contains valid hex colors, mood="premium", contrast_ratio > 4.5. GET /api/intelligence/theme/presets?industry=retail returns preset list.

### Implementation for User Story 3

- [x] T042 [US3] Create extract_theme_brief prompt template (1.0.0.md) with brand design expert system prompt, mood-to-color mapping guidance, output schema requiring hex colors (#RRGGBB), mood classification, palette array, and confidence score in agent-platform/prompts/extract_theme_brief/1.0.0.md
- [x] T043 [P] [US3] Create extract_theme_from_brief skill descriptor YAML with input_schema (brief), output_schema (theme palette), template_type LLM_JSON_GENERATION in skills/catalog/extract_theme_from_brief.yaml
- [x] T044 [US3] Implement ThemeBriefService that loads extract_theme_brief prompt, renders with brief text, calls LiteLLM with json_schema mode, validates hex color format, retries up to 2x on validation failure in agent-platform/src/intelligence/services/theme-brief.service.ts
- [x] T045 [US3] Add POST /internal/intelligence/theme/from-brief endpoint to agent-platform intelligence controller that calls ThemeBriefService in agent-platform/src/intelligence/intelligence.controller.ts
- [x] T046 [US3] Implement extractThemeFromBrief() in api-center IntelligenceApiService that calls agent-platform, runs WCAG contrast validation (wcag-contrast.util) on text-on-background and accent-on-background pairs, adds accessibility_warnings with suggested adjusted colors, persists AiGeneration record (type=theme_brief) in api-center/src/intelligence/intelligence-api.service.ts
- [x] T047 [US3] Implement getThemePresets() in api-center IntelligenceApiService that returns filtered theme presets from theme-presets.ts by industry and/or mood query params in api-center/src/intelligence/intelligence-api.service.ts
- [x] T048 [US3] Implement validateTheme() in api-center IntelligenceApiService that accepts 5 hex colors and returns WCAG AA validation results using wcag-contrast.util in api-center/src/intelligence/intelligence-api.service.ts
- [x] T049 [US3] Add POST /intelligence/theme/from-brief, GET /intelligence/theme/presets, and POST /intelligence/theme/validate endpoints to api-center intelligence controller in api-center/src/intelligence/intelligence.controller.ts

**Checkpoint**: Theme extraction from brief with WCAG validation, presets browsing, and standalone validation are functional. Test with curl per quickstart.md scenarios 5, 7.

---

## Phase 6: User Story 4 — Theme Extraction from Image (Priority: P2)

**Goal**: Marketer uploads a brand logo or reference image. System extracts dominant colors via k-means clustering and constructs a cohesive palette with mood suggestion.

**Independent Test**: POST /api/intelligence/theme/from-image with a PNG file, verify 5 dominant colors extracted, palette roles assigned (primary, secondary, accent, background, text), complementary colors generated for missing slots.

### Implementation for User Story 4

- [x] T050 [P] [US4] Create extract_theme_from_image skill descriptor YAML with input_schema (image buffer metadata), output_schema (theme palette), implementation type handler in skills/catalog/extract_theme_from_image.yaml
- [x] T051 [US4] Implement ThemeImageService using sharp to load image, resize to 200x200 for performance, extract raw pixel data, run k-means clustering (k=5, max 20 iterations) to find dominant colors, sort by frequency, assign palette roles (primary=most frequent, accent=most saturated, background=lightest, text=darkest), generate complementary colors for gaps using HSL math, and classify mood based on hue/saturation analysis in agent-platform/src/intelligence/services/theme-image.service.ts
- [x] T052 [US4] Add POST /internal/intelligence/theme/from-image endpoint accepting multipart/form-data with image field (max 10MB, PNG/JPG/WEBP) to agent-platform intelligence controller, validate file type and size, call ThemeImageService in agent-platform/src/intelligence/intelligence.controller.ts
- [x] T053 [US4] Implement extractThemeFromImage() in api-center IntelligenceApiService that forwards multipart image to agent-platform /internal/intelligence/theme/from-image, runs WCAG contrast validation on returned palette, persists AiGeneration record (type=theme_image) with image metadata in input_params in api-center/src/intelligence/intelligence-api.service.ts
- [x] T054 [US4] Add POST /intelligence/theme/from-image endpoint accepting multipart/form-data to api-center intelligence controller with file size and type validation in api-center/src/intelligence/intelligence.controller.ts

**Checkpoint**: Image-based theme extraction with dominant color clustering, WCAG validation, and palette construction are functional. Test with curl per quickstart.md scenario 6.

---

## Phase 7: User Story 5 — Multiple Copy Variations with Tone Control (Priority: P3)

**Goal**: Marketer requests 1-5 copy variations and experiments with different tones for the same copy type. Each tone produces meaningfully different wording.

**Independent Test**: POST /api/intelligence/copy with variations_count=5, verify exactly 5 distinct variations. Generate same field with tone="playful" then tone="professional", verify word choice and style differ.

### Implementation for User Story 5

- [x] T055 [US5] Enhance generate_copy prompt template to include explicit instructions for generating exactly N distinct variations (where N is 1-5), ensuring no two variations share more than 50% of words, and producing tone-specific vocabulary lists (playful→casual/emoji, urgent→action/scarcity, professional→formal/trust, luxury→exclusive/premium, friendly→warm/approachable) in agent-platform/prompts/generate_copy/1.0.0.md
- [x] T056 [US5] Add variation distinctness validation in CopyGenerationService that checks word overlap between variations for the same copy type and regenerates if any pair shares >50% words in agent-platform/src/intelligence/services/copy-generation.service.ts
- [x] T057 [US5] Add tone metadata to GenerateCopyResponse variations to include the tone used for generation, enabling tone comparison across requests in dto/src/intelligence/copy-generation.dto.ts

**Checkpoint**: Copy generation supports configurable 1-5 variations with enforced distinctness and clear tone differentiation. Test by comparing playful vs professional outputs.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Minimal test UI and end-to-end validation

- [x] T058 Create intelligence HTTP service with methods for plan generation, plan acceptance, copy generation, copy defaults, theme from brief, theme from image, theme presets, and generation history in webapp/src/services/intelligence.service.ts
- [x] T059 Create IntelligenceTestPage.vue with 3 tabs (Plan, Copy, Theme): Plan tab has textarea for brief, optional constraint fields, Generate/Accept/Regenerate buttons, JSON result display; Copy tab has template type dropdown, tone selector, copy type checkboxes, variation count slider, Generate button, variations display; Theme tab has brief textarea OR file upload, Extract button, color swatches, preset browser in webapp/src/views/IntelligenceTestPage.vue
- [x] T060 Add /intelligence route to webapp router pointing to IntelligenceTestPage.vue and add navigation link in webapp/src/router/index.ts
- [x] T061 Register intelligence_plan, generate_campaign_copy, extract_theme_from_brief, and extract_theme_from_image skills in skills/catalog/index.yaml
- [x] T062 Validate all quickstart.md scenarios end-to-end: plan generation, plan acceptance, copy generation with compliance, theme from brief with WCAG, theme from image, presets, history

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories
- **User Stories (Phase 3-7)**: All depend on Foundational phase completion
  - US1 and US2 (both P1) can proceed in parallel
  - US3 and US4 (both P2) can proceed in parallel after US1/US2 or alongside them
  - US5 (P3) depends on US2 completion (extends copy generation)
- **Polish (Phase 8)**: Depends on all user stories being complete

### User Story Dependencies

- **US1 (Plan, P1)**: Can start after Foundational — No dependencies on other stories
- **US2 (Copy, P1)**: Can start after Foundational — No dependencies on other stories
- **US3 (Theme Brief, P2)**: Can start after Foundational — Independent of US1/US2
- **US4 (Theme Image, P2)**: Can start after Foundational — Independent of US1/US2/US3
- **US5 (Variations, P3)**: **Depends on US2** — extends copy generation service and prompt

### Within Each User Story

- Prompt templates before services (services load prompts)
- Skill descriptors can be parallel with prompts
- Agent-platform services before agent-platform controller endpoints
- Agent-platform endpoints before api-center service methods
- Api-center service methods before api-center controller endpoints

### Parallel Opportunities

- T005, T006, T007, T008, T009 (all utilities) can run in parallel
- T011, T013, T014, T015, T016 (all DTOs) can run in parallel
- T025 and T026 (US1 prompt + skill descriptor) can run in parallel
- T035 and T036 (US2 prompt + skill descriptor) can run in parallel
- T042 and T043 (US3 prompt + skill descriptor) can run in parallel
- US1 and US2 are fully independent and can run in parallel
- US3 and US4 are fully independent and can run in parallel

---

## Parallel Example: User Story 1

```bash
# Launch prompt and skill descriptor together:
Task: "Create intelligence_plan prompt template in agent-platform/prompts/intelligence_plan/1.0.0.md"
Task: "Create intelligence_plan skill descriptor in skills/catalog/intelligence_plan.yaml"

# Then sequentially:
Task: "Implement IntelligencePlanService in agent-platform/src/intelligence/services/"
Task: "Add plan endpoint to agent-platform controller"
Task: "Implement plan generation in api-center IntelligenceApiService"
Task: "Add plan endpoints to api-center controller"
```

## Parallel Example: US1 + US2 (both P1)

```bash
# After foundational phase completes, launch in parallel:
# Stream A (US1): T025 → T027 → T028 → T029 → T030 → T031 → T032 → T033 → T034
# Stream B (US2): T035 → T037 → T038 → T039 → T040 → T041
# Both can execute simultaneously since they touch different files
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001-T004)
2. Complete Phase 2: Foundational (T005-T024)
3. Complete Phase 3: User Story 1 — Plan Generation (T025-T034)
4. **STOP and VALIDATE**: Test plan generation, acceptance, regeneration via curl
5. Deploy/demo if ready — marketer can already go from brief to campaign draft

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. Add US1 (Plan) → Test → Deploy (MVP: brief → plan → campaign draft)
3. Add US2 (Copy) → Test → Deploy (adds copy generation with compliance)
4. Add US3 (Theme Brief) → Test → Deploy (adds theme extraction + presets)
5. Add US4 (Theme Image) → Test → Deploy (adds image-based theming)
6. Add US5 (Variations) → Test → Deploy (enhances copy with variation control)
7. Polish → Test UI + end-to-end validation

### Parallel Team Strategy

With 2 developers:
1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: US1 (Plan) → US3 (Theme Brief)
   - Developer B: US2 (Copy) → US4 (Theme Image)
3. US5 (Variations) after US2 is merged
4. Polish together

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks
- [Story] label maps task to specific user story for traceability
- Each user story is independently completable and testable via curl
- api-center intelligence endpoints require both api-center AND agent-platform running
- LiteLLM proxy must be running for LLM-based features (plan, copy, theme from brief)
- Theme from image (US4) does NOT require LLM — uses sharp only
- Commit after each completed phase or logical group of tasks
- Stop at any checkpoint to validate story independently
