# Tasks: Game Template System

**Input**: Design documents from `/specs/011-game-templates/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

**Tests**: Not explicitly requested in the feature specification. Test tasks are omitted. Implementers can add test tasks per quickstart.md test file references.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US6)
- Include exact file paths in descriptions

## Path Conventions

- **Monorepo**: dto/src/, agent-platform/src/, skills/catalog/, templates/games/
- Build order: dto → common → dao → agent-platform

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Install new dependencies and create directory scaffolding

- [x] T001 Install new dependencies in agent-platform: `pnpm --filter agent-platform add @anthropic-ai/sdk ajv puppeteer js-yaml`
- [x] T002 Install ajv in dto package: `pnpm --filter @agentic-template/dto add ajv`
- [x] T003 Create directory structure: `dto/src/template-system/`, `agent-platform/src/template-system/services/`, `agent-platform/src/template-system/interfaces/`, `templates/games/{spin_wheel,quiz,scratch_card,memory_match}/`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared DTOs and interfaces that ALL user stories depend on

- [x] T004 [P] Create TemplateManifest, AssetSlotDefinition, and SceneConfig interfaces in `dto/src/template-system/template-manifest.interface.ts` per data-model.md TypeScript interfaces section (TemplateManifest with template_id, version, title, description, config_schema, asset_slots, scene_config, entry_point; AssetSlotDefinition with slot_id, type enum, formats, required, default, description, max_size_bytes; SceneConfig with camera, lighting, environment, post_processing sub-objects)
- [x] T005 [P] Create GenerateThreejsCodeInput and GenerateThreejsCodeOutput DTOs with class-validator decorators in `dto/src/skills/generate-threejs-code.dto.ts` per data-model.md (input: template_id, template_manifest, game_config, asset_mappings, scene_overrides, sealed_outcome_token; output: code_files array with filename/purpose/content/line_count, code_dir, total_lines; also define CodeFile interface with purpose enum: scene_setup, game_logic, asset_loader, interaction, animation, entry)
- [x] T006 [P] Add scene_overrides (camera_position, camera_fov, lighting_intensity, background_color, post_processing) and sealed_outcome_token fields to BundleGameTemplateInput in `dto/src/skills/bundle-game-template.dto.ts` per contracts/bundle-game-template-input.yaml. Add class-validator decorators (@IsOptional, @ValidateNested). Preserve all existing fields (template_id, game_config, audio_uri, assets, optimization, output, version)
- [x] T007 Build dto package: `pnpm --filter @agentic-template/dto build` and verify no compilation errors

**Checkpoint**: All shared types and DTOs ready for service implementation

---

## Phase 3: User Story 1 - Template System Framework (Priority: P1)

**Goal**: Standardized framework for loading YAML template manifests, validating game configs against JSON Schema, and managing template versioning

**Independent Test**: Load a template manifest YAML, validate a game config against its config_schema, verify asset slots resolve correctly. Test with: `pnpm --filter agent-platform test -- template-manifest-loader.service.spec.ts`

### Implementation for User Story 1

- [x] T008 [P] [US1] Create internal template types (TemplateLoadResult, TemplateValidationResult, LoadedManifestCache) in `agent-platform/src/template-system/interfaces/template-types.ts`. Include TemplateLoadResult with manifest and loaded_from fields; TemplateValidationResult with valid, errors, and config fields

- [x] T009 [US1] Implement TemplateManifestLoaderService in `agent-platform/src/template-system/services/template-manifest-loader.service.ts`. Requirements: (1) Load YAML manifests from `{GAME_TEMPLATES_DIR}/{template_id}/manifest.yaml` using js-yaml; (2) Cache loaded manifests in-memory Map keyed by `{template_id}@{version}`; (3) Validate manifest structure against the template-manifest JSON Schema from contracts/template-manifest-schema.yaml using Ajv; (4) Support loading specific versions or latest; (5) Expose methods: loadManifest(templateId, version?), getManifest(templateId, version?), listTemplates(), clearCache(); (6) Read GAME_TEMPLATES_DIR from ConfigService with default `{repo_root}/templates/games`; (7) Use NestJS Logger for structured logging

- [x] T010 [US1] Implement TemplateConfigValidatorService in `agent-platform/src/template-system/services/template-config-validator.service.ts`. Requirements: (1) Accept a TemplateManifest and a game_config object; (2) Use Ajv to compile the manifest's config_schema and validate the game_config against it; (3) Return structured validation result with valid boolean and array of error messages with JSON pointers; (4) Cache compiled Ajv validators per template_id+version to avoid recompilation; (5) Inject TemplateManifestLoaderService to optionally load manifest by ID

- [x] T011 [US1] Create TemplateSystemModule in `agent-platform/src/template-system/template-system.module.ts`. Register TemplateManifestLoaderService and TemplateConfigValidatorService as providers and exports. Import ConfigModule. Follow existing NestJS module patterns in the codebase

**Checkpoint**: Template manifest loading and config validation infrastructure complete

---

## Phase 4: User Story 6 - Code Generation Pipeline (Priority: P1)

**Goal**: Claude Agent SDK generates Three.js game code from template specs; headless validation ensures generated bundles work; enhanced bundle handler orchestrates the full pipeline

**Independent Test**: Provide a template spec, game config, and asset mappings to the pipeline; verify output contains valid index.html, generated scripts, and asset manifest. Test with: `pnpm --filter agent-platform test -- generate-threejs-code.handler.spec.ts`

**Dependencies**: Requires Phase 3 (US1) complete for manifest loading and config validation

### Implementation for User Story 6

- [x] T012 [P] [US6] Create Three.js system prompt in `agent-platform/src/prompt-registry/prompts/threejs-system.prompt.txt`. Content must define: (1) Three.js r170+ coding standards (ES modules, typed arrays, dispose patterns); (2) WebGL2 with WebGL1 fallback pattern; (3) Responsive viewport handling (320px-1920px resize listener); (4) Touch-first interaction with raycaster hit detection and mouse fallback; (5) WebGL context loss recovery handler; (6) Safe area insets for mobile; (7) PBR material patterns (metalness, roughness, emissive); (8) Post-processing effect composition (EffectComposer, bloom, DOF, FXAA); (9) Asset loading with GLTFLoader, TextureLoader, AudioLoader; (10) Output format specification: named code blocks with `// FILE: filename.js` headers for each generated file (scene-setup.js, game-logic.js, asset-loader.js, interaction.js, animation.js, main.js); (11) window.GAME_CONFIG access pattern; (12) gameReady and gameComplete event emission; (13) GSAP animation integration; (14) Spatial audio setup with AudioListener and PositionalAudio; (15) LOD switching for mobile performance

- [x] T013 [P] [US6] Create generate_threejs_code.yaml skill descriptor in `skills/catalog/generate_threejs_code.yaml`. Follow existing bundle_game_template.yaml structure. Include: skill_id (generate_threejs_code), version (1.0.0), input_schema matching GenerateThreejsCodeInput DTO, output_schema matching GenerateThreejsCodeOutput DTO, implementation.type (ts_function), implementation.handler (@skills/generate-threejs-code/handler), policy (max 120s runtime, network allowlist for api.anthropic.com)

- [x] T014 [P] [US6] Create validate_bundle.yaml skill descriptor in `skills/catalog/validate_bundle.yaml`. Include: skill_id (validate_bundle), version (1.0.0), input_schema (bundle_dir string, entry_point string, timeout_ms optional integer), output_schema matching ValidateBundleOutput from data-model.md, implementation.type (ts_function), implementation.handler (@skills/validate-bundle/handler), policy (max 30s runtime, fs read prefixes)

- [x] T015 [US6] Implement GenerateThreejsCodeHandler in `agent-platform/src/skills/handlers/generate-threejs-code.handler.ts`. Requirements: (1) Implement SkillHandler<GenerateThreejsCodeInput, GenerateThreejsCodeOutput>; (2) Import and use @anthropic-ai/sdk Anthropic client directly (not LiteLLM); (3) Build three-part prompt: load threejs-system.prompt.txt as system prompt, load template-specific prompt ({template_id}.prompt.txt) as context, construct user prompt with actual game_config JSON, asset_mappings, and scene_overrides; (4) Call Claude API with model from CODE_GEN_MODEL env var (default: claude-opus-4-6), max_tokens 16000; (5) Parse response to extract code files by splitting on `// FILE: ` headers; (6) Create CodeFile objects with filename, purpose detection (from filename pattern matching), content, line_count; (7) Write code files to a temporary directory under ASSET_STORAGE_DIR; (8) Implement retry logic: up to CODE_GEN_MAX_RETRIES (default 3) with exponential backoff (1s, 2s, 4s) on transient failures (timeout, rate limit, incomplete output); (9) On retry, include previous error in refinement prompt; (10) Return SkillResult with code_files, code_dir, total_lines; (11) Return skillFailure after exhausting retries with clear error message; (12) Read ANTHROPIC_API_KEY from ConfigService; (13) Include timings_ms in debug output

- [x] T016 [US6] Implement ValidateBundleHandler in `agent-platform/src/skills/handlers/validate-bundle.handler.ts`. Requirements: (1) Implement SkillHandler<ValidateBundleInput, ValidateBundleOutput>; (2) Launch Puppeteer headless browser with --no-sandbox, --disable-gpu flags; (3) Serve the bundle directory via a temporary local HTTP server (use http.createServer to serve static files from bundle_dir); (4) Navigate to entry_point; (5) Run 6 validation checks per research.md R4: HTML loads without parse errors, WebGL context created (check for canvas with webgl/webgl2 context), window.GAME_CONFIG accessible, no uncaught JS exceptions within 5s, gameReady event fires within timeout, total bundle size under 5MB; (6) Collect console errors and uncaught exceptions; (7) Calculate total_size_bytes by walking bundle directory; (8) Use BUNDLE_VALIDATION_TIMEOUT_MS env var (default 15000ms) for timeout; (9) Clean up: close browser, shut down HTTP server; (10) Return ValidateBundleOutput with valid, checks array, total_size_bytes, load_time_ms, errors

- [x] T017 [US6] Update bundle_game_template.yaml input schema in `skills/catalog/bundle_game_template.yaml` to add scene_overrides object (camera_position, camera_fov, lighting_intensity, background_color, post_processing) and sealed_outcome_token string per contracts/bundle-game-template-input.yaml. Preserve all existing schema fields

- [x] T018 [US6] Enhance BundleGameTemplateHandler in `agent-platform/src/skills/handlers/bundle-game-template.handler.ts`. Modifications: (1) Inject TemplateManifestLoaderService and TemplateConfigValidatorService via constructor (add constructor parameters, update SkillCatalogService handler creation); (2) At start of execute(): load template manifest via loader service, validate game_config against manifest's config_schema via validator service, return skillFailure on validation errors; (3) After validation: invoke GenerateThreejsCodeHandler (instantiate and call execute) with template_manifest, game_config, asset_mappings from input, scene_overrides, sealed_outcome_token; (4) On code gen success: write generated code files to bundle directory; (5) Inject Three.js runtime (three.min.js + required addons) into the bundle scripts/ directory; (6) Inject GSAP runtime into bundle; (7) Generate index.html that loads Three.js, GSAP, injects window.GAME_CONFIG from game_config + sealed_outcome_token, then loads generated scripts in correct order; (8) After bundle assembly: invoke ValidateBundleHandler with bundle_dir and entry_point; (9) If validation fails: return skillFailure with validation errors; (10) If validation passes: proceed with existing manifest generation and artifact storage; (11) Include validation results in output

- [x] T019 [US6] Register GenerateThreejsCodeHandler and ValidateBundleHandler in `agent-platform/src/skills/services/skill-catalog.service.ts`. Add entries to getHandlerDefinitions() array following existing pattern: `{ skillId: 'generate_threejs_code', create: () => new GenerateThreejsCodeHandler(this.configService) }` and `{ skillId: 'validate_bundle', create: () => new ValidateBundleHandler(this.configService) }`. Update BundleGameTemplateHandler creation to pass TemplateManifestLoaderService and TemplateConfigValidatorService instances. Add necessary imports

**Checkpoint**: Full code generation pipeline operational - can generate, bundle, and validate game code

---

## Phase 5: User Story 2 - Spin Wheel 3D Game (Priority: P1)

**Goal**: 3D spin wheel with physics-based deceleration, PBR materials, cinematic camera, and server-side outcome determination

**Independent Test**: Generate a spin wheel bundle with 6 segments, spin the wheel, verify it stops on the predetermined segment with correct visual/audio feedback

**Dependencies**: Requires Phase 3 (US1) for manifest loading and Phase 4 (US6) for code generation pipeline

### Implementation for User Story 2

- [x] T020 [P] [US2] Create spin_wheel template manifest in `templates/games/spin_wheel/manifest.yaml`. Per contracts/template-manifest-schema.yaml: template_id: spin_wheel, version: 1.0.0, title: "Spin Wheel", config_schema defining: segments array (4-12 items, each with label string, color hex, weight number 0-1), spin_duration_ms (2000-10000), min_rotations (integer 3-10), respin_enabled (boolean), prize_tiers array; asset_slots: wheel_model (model_3d, required, formats: [glb]), wheel_texture (texture, optional, formats: [png, jpg, ktx2]), pointer_model (model_3d, optional), win_sound (audio, required, formats: [mp3, ogg]), lose_sound (audio, required), tick_sound (audio, required), background_music (audio, optional), environment_map (environment_map, optional, formats: [hdr, exr]); scene_config with perspective camera at [0, 3, 6] looking at [0, 0, 0] fov 50, ambient light #ffffff 0.3, directional light from [5, 10, 5] with shadows, bloom enabled strength 0.6 threshold 0.8, DOF disabled, FXAA enabled; entry_point: index.html

- [x] T021 [P] [US2] Create spin-wheel template prompt in `agent-platform/src/prompt-registry/prompts/spin-wheel.prompt.txt`. Content must instruct Claude to generate code implementing: (1) 3D wheel geometry with N configurable segments using CylinderGeometry + custom UV mapping; (2) PBR materials per segment from config colors with metalness 0.3, roughness 0.5; (3) Segment labels via canvas-to-texture on each segment face; (4) Physics-based spin animation using GSAP with angular velocity, friction coefficient, and target angle from sealed outcome; (5) Minimum 3 full rotations before deceleration; (6) Pointer/flapper mesh at wheel edge; (7) Spatial tick audio triggered per segment pass (calculate from angular position); (8) Win animation: confetti particle system (ParticleSystem with 200+ particles, gravity, random velocity), bloom activation on winning segment via emissive material boost, camera smooth zoom to winning segment via GSAP timeline; (9) Lose animation: DOF blur activation, ambient light intensity reduction, muted color grading; (10) Optional respin logic when respin_enabled is true; (11) gameComplete event emission with SpinWheelResult (landed_segment_index); (12) Responsive camera adjustment for portrait/landscape; (13) Touch interaction: tap wheel or spin button to initiate spin, prevent double-spin

**Checkpoint**: Spin wheel template can be generated and rendered end-to-end

---

## Phase 6: User Story 3 - Quiz 3D Game (Priority: P1)

**Goal**: 3D quiz game with questions on panels, raycaster answer selection, score tracking, and prize tier assignment

**Independent Test**: Generate a quiz bundle with 5 questions, answer them, verify correct/incorrect feedback, score calculation, and prize tier assignment

**Dependencies**: Requires Phase 3 (US1) and Phase 4 (US6)

### Implementation for User Story 3

- [x] T022 [P] [US3] Create quiz template manifest in `templates/games/quiz/manifest.yaml`. Per contracts/template-manifest-schema.yaml: template_id: quiz, version: 1.0.0, title: "Quiz", config_schema defining: questions array (1-20 items, each with text string, answers array of 2-4 strings, timer_seconds optional 10-60), randomize_questions (boolean), randomize_answers (boolean), prize_tiers array (min_score, max_score, prize_id), show_correct_answer (boolean); asset_slots: stage_model (model_3d, optional, formats: [glb]), correct_sound (audio, required), incorrect_sound (audio, required), timer_sound (audio, optional), background_music (audio, optional), question_panel_texture (texture, optional), environment_map (environment_map, optional); scene_config with perspective camera at [0, 2, 5] looking at [0, 1, 0] fov 60, ambient light 0.4, directional from [3, 8, 5], bloom disabled, FXAA enabled; entry_point: index.html

- [x] T023 [P] [US3] Create quiz template prompt in `agent-platform/src/prompt-registry/prompts/quiz.prompt.txt`. Content must instruct Claude to generate code implementing: (1) 3D question panel using PlaneGeometry with canvas-to-texture for dynamic text rendering; (2) 2-4 answer option meshes as separate 3D buttons (BoxGeometry with rounded edges via ExtrudeGeometry); (3) Raycaster-based tap/click detection on answer panels; (4) Correct answer feedback: green emissive glow on selected panel, particle celebration burst, camera zoom to panel, correct_sound playback; (5) Incorrect answer feedback: red emissive flash, camera shake via GSAP (random x/y offset oscillation), highlight correct answer with green outline, incorrect_sound playback; (6) Optional per-question countdown timer rendered as 3D ring geometry that depletes; (7) Question/answer randomization when enabled; (8) Smooth camera fly-through transition between questions using GSAP timeline; (9) Score tracking: accumulate correct answers, calculate percentage; (10) Prize tier determination from score ranges in config; (11) Results screen: 3D podium or stage with score display, prize tier, time taken; (12) gameComplete event emission with QuizResult (answers array, score, total_questions); (13) State machine: LOADING → QUESTION → ANSWER_FEEDBACK → TRANSITION → RESULTS

**Checkpoint**: Quiz template can be generated and rendered end-to-end

---

## Phase 7: User Story 4 - Scratch Card 3D Game (Priority: P2)

**Goal**: 3D scratch card with shader-based scratch layer, UV-mapped touch interaction, and percentage-based auto-reveal

**Independent Test**: Generate a scratch card bundle, scratch 60% of the surface, verify auto-reveal triggers with correct prize

**Dependencies**: Requires Phase 3 (US1) and Phase 4 (US6)

### Implementation for User Story 4

- [x] T024 [P] [US4] Create scratch_card template manifest in `templates/games/scratch_card/manifest.yaml`. Per contracts/template-manifest-schema.yaml: template_id: scratch_card, version: 1.0.0, title: "Scratch Card", config_schema defining: scratch_threshold_percent (number 30-90, default 60), brush_size (number 10-50, default 25), reveal_animation_duration_ms (1000-5000), prize_display (object with text, image_slot optional); asset_slots: card_model (model_3d, optional, formats: [glb]), scratch_texture (texture, required, formats: [png, jpg]), reveal_texture (texture, required), scratch_sound (audio, required), reveal_sound (audio, required), win_sound (audio, optional), background_music (audio, optional), environment_map (environment_map, optional); scene_config with perspective camera at [0, 0, 3] looking at [0, 0, 0] fov 45, ambient light 0.5, two directional lights for dramatic reveal, bloom enabled strength 0.4, FXAA enabled; entry_point: index.html

- [x] T025 [P] [US4] Create scratch-card template prompt in `agent-platform/src/prompt-registry/prompts/scratch-card.prompt.txt`. Content must instruct Claude to generate code implementing: (1) 3D card mesh (PlaneGeometry or BoxGeometry) with two layers: metallic PBR scratch layer on top (metalness 0.8, roughness 0.2) and reveal layer underneath; (2) Custom fragment shader for scratch erasure: render-to-texture alpha mask updated by touch path, brush_size from config controls erasure radius; (3) Raycaster-based touch mapping to UV coordinates on card surface; (4) Scratch percentage calculation via render target pixel sampling (count transparent pixels / total pixels); (5) Auto-reveal trigger when scratch_threshold_percent reached; (6) Metallic scratch debris particles: PointsMaterial particles falling from scratch path with gravity (velocity.y -= 9.8 * dt), random initial velocity spread; (7) Reveal animation: camera zoom to card center, directional light intensity ramp, bloom strength increase, full scratch layer dissolve; (8) Win celebration: confetti particles, emissive pulse on prize area; (9) Scratch sound loop during active scratching (start/stop with touch events); (10) gameComplete event with ScratchCardResult (percent_scratched); (11) 60fps touch tracking with requestAnimationFrame throttling

**Checkpoint**: Scratch card template can be generated and rendered end-to-end

---

## Phase 8: User Story 5 - Memory Match 3D Game (Priority: P2)

**Goal**: 3D card-flipping memory game with grid layout, pair matching, and configurable win conditions

**Independent Test**: Generate a memory match bundle with 3x4 grid, flip cards to find all pairs, verify match detection, move counting, and prize tier assignment

**Dependencies**: Requires Phase 3 (US1) and Phase 4 (US6)

### Implementation for User Story 5

- [x] T026 [P] [US5] Create memory_match template manifest in `templates/games/memory_match/manifest.yaml`. Per contracts/template-manifest-schema.yaml: template_id: memory_match, version: 1.0.0, title: "Memory Match", config_schema defining: grid_size enum (2x3, 3x4, 4x4, 4x5), card_pairs array (each with pair_id string, image_slot string), flip_delay_ms (500-3000, default 1000), win_condition enum (all_pairs, move_limit, time_limit), move_limit (optional integer), time_limit_seconds (optional integer), prize_tiers array (max_moves or max_time, prize_id); asset_slots: card_back_texture (texture, required, formats: [png, jpg]), card_face_textures (texture, required, description: "used for all card pair faces"), table_model (model_3d, optional), match_sound (audio, required), mismatch_sound (audio, optional), flip_sound (audio, required), win_sound (audio, required), background_music (audio, optional), environment_map (environment_map, optional); scene_config with perspective camera at [0, 5, 4] looking at [0, 0, 0] fov 55, ambient light 0.5, directional from above, point lights at table edges, FXAA enabled; entry_point: index.html

- [x] T027 [P] [US5] Create memory-match template prompt in `agent-platform/src/prompt-registry/prompts/memory-match.prompt.txt`. Content must instruct Claude to generate code implementing: (1) Grid layout system: compute card positions from grid_size config on a 3D table surface (PlaneGeometry with wood PBR material); (2) Card meshes: BoxGeometry with card_back_texture on back face, card_face_texture on front, PBR material; (3) Card flip animation: Y-axis 180-degree rotation using GSAP with physics-based bounce easing (back.out or elastic.out); (4) Raycaster-based tap detection on face-down cards only; (5) Two-card flip limit: maintain flipped[] array, prevent flipping more than 2 simultaneously; (6) Match detection: compare pair_ids of two flipped cards after flip animation completes; (7) Match confirmed: both cards stay revealed, emissive glow effect (emissive color pulse), particle burst at match position, camera zoom toward pair, match_sound playback; (8) Mismatch: configurable delay (flip_delay_ms) then both cards flip back, mismatch_sound playback; (9) Move counter: increment on each pair flip attempt; (10) Timer: optional countdown display as 3D text or HUD overlay; (11) Win conditions: all_pairs (all matched), move_limit (moves exceeded = loss), time_limit (time exceeded = loss); (12) Results screen with moves, time, pairs_matched, prize tier; (13) gameComplete event with MemoryMatchResult (moves, time_ms, pairs_matched, total_pairs); (14) Subtle camera zoom toward the pair being checked

**Checkpoint**: Memory match template can be generated and rendered end-to-end

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Build verification, integration validation, and cleanup

- [x] T028 Build all packages in dependency order: `pnpm --filter @agentic-template/dto build && pnpm --filter @agentic-template/common build && pnpm --filter dao build && pnpm --filter agent-platform build` and verify zero compilation errors
- [x] T029 Verify all 4 template manifests load successfully by running the TemplateManifestLoaderService against each manifest YAML in templates/games/
- [x] T030 Run quickstart.md end-to-end validation: start infrastructure, start agent-platform, trigger a spin_wheel bundle generation, verify output contains index.html, scripts/, models/, textures/, audio/, and bundle_manifest.json

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 (dependencies installed)
- **US1 - Template System (Phase 3)**: Depends on Phase 2 (DTOs/interfaces built)
- **US6 - Code Generation Pipeline (Phase 4)**: Depends on Phase 3 (needs manifest loader and config validator)
- **US2 - Spin Wheel (Phase 5)**: Depends on Phase 4 (needs code gen pipeline) - can run in parallel with US3
- **US3 - Quiz (Phase 6)**: Depends on Phase 4 - can run in parallel with US2
- **US4 - Scratch Card (Phase 7)**: Depends on Phase 4 - can run in parallel with US5
- **US5 - Memory Match (Phase 8)**: Depends on Phase 4 - can run in parallel with US4
- **Polish (Phase 9)**: Depends on all previous phases

### User Story Dependencies

```
Phase 1 (Setup)
    │
    ▼
Phase 2 (Foundational DTOs)
    │
    ▼
Phase 3 (US1: Template System) ──── 🎯 MVP checkpoint
    │
    ▼
Phase 4 (US6: Code Gen Pipeline) ── 🎯 Pipeline checkpoint
    │
    ├──────────────┬──────────────┐
    ▼              ▼              ▼
Phase 5 (US2)  Phase 6 (US3)  Phase 7 (US4)  Phase 8 (US5)
Spin Wheel     Quiz           Scratch Card   Memory Match
[P1]           [P1]           [P2]           [P2]
    │              │              │              │
    └──────────────┴──────────────┴──────────────┘
                        │
                        ▼
                Phase 9 (Polish)
```

### Within Each User Story

- Interfaces/DTOs before services
- Services before handlers
- Manifests and prompts can be created in parallel (different files)
- Skill descriptors before handler registration
- Handler registration after handler implementation

### Parallel Opportunities

**Phase 2 (Foundational)**: T004, T005, T006 can all run in parallel (different files in dto/)

**Phase 4 (US6)**: T012, T013, T014 can run in parallel (prompt file, two skill descriptors). T015 and T016 are sequential (handler depends on logic). T018 depends on T015 and T016

**Phases 5-8 (Game Templates)**: All four game template phases can run in parallel once Phase 4 is complete. Within each phase, manifest (T020/T022/T024/T026) and prompt (T021/T023/T025/T027) can run in parallel

---

## Parallel Example: Game Templates (Phases 5-8)

```bash
# After Phase 4 (US6) is complete, launch all 4 template phases in parallel:

# Spin Wheel (US2):
Task: "Create spin_wheel manifest in templates/games/spin_wheel/manifest.yaml"
Task: "Create spin-wheel prompt in agent-platform/src/prompt-registry/prompts/spin-wheel.prompt.txt"

# Quiz (US3):
Task: "Create quiz manifest in templates/games/quiz/manifest.yaml"
Task: "Create quiz prompt in agent-platform/src/prompt-registry/prompts/quiz.prompt.txt"

# Scratch Card (US4):
Task: "Create scratch_card manifest in templates/games/scratch_card/manifest.yaml"
Task: "Create scratch-card prompt in agent-platform/src/prompt-registry/prompts/scratch-card.prompt.txt"

# Memory Match (US5):
Task: "Create memory_match manifest in templates/games/memory_match/manifest.yaml"
Task: "Create memory-match prompt in agent-platform/src/prompt-registry/prompts/memory-match.prompt.txt"
```

---

## Implementation Strategy

### MVP First (US1 + US6 + US2)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational DTOs
3. Complete Phase 3: US1 - Template System Framework
4. **STOP and VALIDATE**: Template loading and config validation work
5. Complete Phase 4: US6 - Code Generation Pipeline
6. **STOP and VALIDATE**: Can generate and validate a bundle
7. Complete Phase 5: US2 - Spin Wheel (first complete template)
8. **STOP and VALIDATE**: Full end-to-end spin wheel generation works
9. Deploy/demo if ready

### Incremental Delivery

1. Setup + Foundational → DTOs ready
2. US1 → Template system operational
3. US6 → Code gen pipeline operational (MVP infrastructure!)
4. US2 (Spin Wheel) → First game template working (MVP complete!)
5. US3 (Quiz) → Second game template
6. US4 (Scratch Card) → Third game template
7. US5 (Memory Match) → Fourth game template
8. Polish → Build verification, integration validation

### Parallel Team Strategy

With multiple developers after Phase 4 is complete:

- Developer A: US2 (Spin Wheel) + US3 (Quiz) - P1 templates
- Developer B: US4 (Scratch Card) + US5 (Memory Match) - P2 templates
- Templates are fully independent: different manifest files, different prompt files

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks
- [Story] label maps task to specific user story for traceability
- All file paths are relative to repository root
- The existing prompt registry uses .md files with YAML frontmatter for LLM generation prompts. The new .prompt.txt files are raw text prompts for Claude Agent SDK code generation (different system - read directly by GenerateThreejsCodeHandler)
- The existing BundleGameTemplateHandler has constructor injection via ConfigService. Enhancement (T018) adds TemplateManifestLoaderService and TemplateConfigValidatorService, requiring updated handler creation in SkillCatalogService (T019)
- Template manifests are system-level configuration (not tenant-specific, no tenantId). Generated bundles ARE tenant-scoped via StorageService
