# Feature Specification: Game Template System

**Feature Branch**: `011-game-templates`
**Created**: 2026-02-13
**Status**: Draft
**Input**: User description: "Game template system with 4 3D game types (spin wheel, quiz, scratch card, memory match) using Three.js and Claude Agent SDK code generation"

## Clarifications

### Session 2026-02-13

- Q: Where and when is the winning outcome determined (server-side vs client-side)? → A: Server-side pre-determined. The outcome is decided before the bundle loads; client-side animation is cosmetic only. Players cannot discover results by inspecting game config.
- Q: How should the system handle Claude Agent SDK code generation failures? → A: Retry up to 3 times with exponential backoff, then fail the bundle job with a clear error reported to the campaign creator.
- Q: What is explicitly out of scope for this feature? → A: Template editor UI, campaign CRUD, analytics dashboard, multiplayer modes, and leaderboards are all out of scope. This feature covers only the template framework, 4 game types, and the code generation pipeline.
- Q: What level of accessibility (WCAG, keyboard nav, screen readers) is required? → A: No accessibility requirements for this phase; deferred to a future feature.
- Q: How is generated bundle code validated before deployment? → A: Automated validation via headless render check. The pipeline loads the bundle, verifies WebGL context creation, and confirms the game initializes correctly before storing.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Template System Framework (Priority: P1)

As a template developer, I want a standardized framework for defining 3D game templates with manifest files, configuration schemas, asset slot declarations, and scene specifications so that new game types can be added without modifying core platform code.

**Why this priority**: The template system is the foundation that all four game types depend on. Without the manifest schema, config injection mechanism, and asset slot system, no game template can function.

**Independent Test**: Can be tested by creating a minimal template manifest, injecting a game config via `window.GAME_CONFIG`, validating it against the config schema, and verifying asset slots resolve correctly in a generated bundle.

**Acceptance Scenarios**:

1. **Given** a template manifest YAML file with id, version, config schema, and asset slots, **When** the system loads the manifest, **Then** the template is registered and available for bundle generation
2. **Given** a game config object and a template config schema, **When** the config is validated, **Then** invalid configs are rejected with clear error messages before bundle generation begins
3. **Given** a set of asset mappings (images, audio, 3D models, textures), **When** assets are injected into a template bundle, **Then** each asset is placed in the correct directory and an asset manifest is generated mapping slot IDs to file paths
4. **Given** a generated bundle, **When** the bundle loads in a browser, **Then** `window.GAME_CONFIG` is available to the game script before execution and the bundle works offline with no external runtime dependencies
5. **Given** a template at version 1.0.0, **When** the template is updated to version 1.1.0, **Then** existing campaign bundles generated with version 1.0.0 continue to work without modification

---

### User Story 2 - Spin Wheel 3D Game (Priority: P1)

As a campaign player, I want to spin a 3D prize wheel with realistic physics-based deceleration, PBR materials, and cinematic camera animations so that I can discover my prize in an exciting, immersive experience.

**Why this priority**: The spin wheel is the most recognizable and widely-used promotional game type. It exercises the full template pipeline end-to-end: 3D scene rendering, physics animation, audio, post-processing, and outcome handling.

**Independent Test**: Can be tested by generating a spin wheel bundle with 6 segments, spinning the wheel, and verifying the wheel stops on the predetermined segment with correct visual and audio feedback.

**Acceptance Scenarios**:

1. **Given** a spin wheel config with 4-12 segments, **When** the 3D scene renders, **Then** all segments display with correct labels, colors, and PBR materials on a wheel geometry
2. **Given** the player taps/clicks the wheel or a spin button, **When** the spin begins, **Then** the wheel rotates with physics-based angular deceleration, completing at least 3 full rotations before stopping
3. **Given** a set of segment probabilities, **When** 1000 spins are simulated, **Then** the winning segment distribution matches the configured probabilities within 5% tolerance
4. **Given** the wheel stops on a winning segment, **When** the result is revealed, **Then** a confetti particle system fires, bloom post-processing activates on the winning segment, and the camera zooms in on the result
5. **Given** the wheel stops on a losing segment, **When** the result is revealed, **Then** depth-of-field blur activates, lighting shifts to a muted tone, and a consolation message displays
6. **Given** a mobile device in portrait orientation, **When** the wheel renders, **Then** the camera FOV and position adjust to keep the wheel fully visible and touch interaction works via raycasting

---

### User Story 3 - Quiz 3D Game (Priority: P1)

As a campaign player, I want to answer trivia questions displayed on 3D panels in an immersive game-show environment so that I can test my knowledge and win prizes based on my score.

**Why this priority**: Quiz games are the most versatile promotional game type, supporting educational content, product knowledge, and entertainment. They exercise unique template capabilities: multi-step state management, dynamic text rendering, and per-question scene transitions.

**Independent Test**: Can be tested by generating a quiz bundle with 5 questions, answering them, and verifying correct/incorrect feedback, score calculation, and prize tier assignment.

**Acceptance Scenarios**:

1. **Given** a quiz config with questions and answers, **When** the 3D scene renders, **Then** the current question displays on a 3D panel via canvas-to-texture and answer options render as separate 3D button meshes
2. **Given** the player taps a correct answer panel, **When** the answer is submitted via raycaster hit detection, **Then** the panel glows green (emissive material), a particle celebration fires, and the camera zooms in before transitioning to the next question
3. **Given** the player taps an incorrect answer panel, **When** the answer is submitted, **Then** the panel flashes red, a camera shake effect triggers, and the correct answer is highlighted
4. **Given** a timer is enabled, **When** the timer expires on a question, **Then** the question is marked as incorrect and the game advances to the next question
5. **Given** the player completes all questions, **When** the final score is calculated, **Then** the correct prize tier is assigned based on score ranges and a results screen displays with score, time, and prize
6. **Given** question randomization is enabled, **When** the quiz starts, **Then** questions appear in a different order each time

---

### User Story 4 - Scratch Card 3D Game (Priority: P2)

As a campaign player, I want to scratch a realistic metallic 3D card surface to reveal a hidden prize underneath so that I can experience the tactile excitement of a physical scratch card in a digital format.

**Why this priority**: Scratch cards are a popular instant-win game type. They introduce unique rendering challenges (shader-based scratch layer, UV-mapped touch interaction, render-to-texture percentage calculation) but are less complex in game logic than quiz or spin wheel.

**Independent Test**: Can be tested by generating a scratch card bundle, scratching 60% of the surface, and verifying the auto-reveal triggers with the correct prize.

**Acceptance Scenarios**:

1. **Given** a scratch card config with a metallic scratch layer, **When** the 3D scene renders, **Then** a card mesh displays with a PBR metallic top layer and a hidden reveal layer underneath
2. **Given** the player touches/drags on the card surface, **When** the input is mapped via raycaster to UV coordinates, **Then** the scratch layer erases along the touch path with a configurable brush size using a custom fragment shader
3. **Given** the player has scratched 60% of the card (configurable threshold), **When** the auto-reveal triggers, **Then** the camera zooms in, lighting shifts dramatically, and the full prize is revealed
4. **Given** the player is scratching, **When** the scratch layer erases, **Then** metallic flake particles fall from the scratch path with gravity simulation
5. **Given** the prize is a winning outcome, **When** the reveal animation completes, **Then** confetti particles fire, bloom post-processing activates on the prize, and a CTA button appears
6. **Given** a mobile device, **When** the player scratches with their finger, **Then** the scratch interaction is smooth at 60fps with no lag in UV mapping

---

### User Story 5 - Memory Match 3D Game (Priority: P2)

As a campaign player, I want to flip 3D cards to find matching pairs in an immersive scene so that I can test my memory and win prizes based on my performance.

**Why this priority**: Memory match is a familiar, engaging game type that appeals to all ages. It introduces grid layout management, pair-matching logic, and multiple win condition modes but shares the same 3D rendering foundation as other templates.

**Independent Test**: Can be tested by generating a memory match bundle with a 3x4 grid, flipping cards to find all pairs, and verifying match detection, move counting, and prize tier assignment.

**Acceptance Scenarios**:

1. **Given** a memory match config with a 3x4 grid size and 6 card pairs, **When** the 3D scene renders, **Then** 12 face-down card meshes display in a grid layout on a 3D table surface with PBR materials
2. **Given** the player taps a face-down card, **When** the tap is detected via raycaster, **Then** the card performs a 3D Y-axis flip animation with physics-based bounce easing to reveal the face image
3. **Given** two flipped cards show matching images, **When** the match is confirmed, **Then** both cards stay revealed with an emissive glow effect, a particle burst fires, and the camera briefly zooms toward the pair
4. **Given** two flipped cards do not match, **When** the mismatch is confirmed after a configurable delay, **Then** both cards flip back face-down
5. **Given** the player has matched all pairs, **When** the game ends, **Then** a results screen shows moves taken, time elapsed, and the prize tier based on the win condition
6. **Given** a move limit win condition, **When** the player exceeds the configured move limit, **Then** the game ends as a loss with remaining unmatched cards revealed

---

### User Story 6 - Code Generation Pipeline (Priority: P1)

As the bundle_game_template skill handler, I want to invoke the Claude Agent SDK with a template specification, game configuration, and asset mappings so that a complete, self-contained game bundle is generated dynamically for each campaign.

**Why this priority**: The code generation pipeline is the core mechanism that transforms template specifications into runnable game bundles. All game templates depend on it to produce their final output.

**Independent Test**: Can be tested by providing a template spec, game config, and asset mappings to the pipeline and verifying the output contains a valid index.html, generated scripts, and an asset manifest with all files bundled correctly.

**Acceptance Scenarios**:

1. **Given** a template manifest, game config, and asset mappings, **When** the code generation pipeline executes, **Then** the system produces a complete application including scene setup, asset loading, game logic, animation loops, and interaction handlers
2. **Given** the generated code and all assets, **When** the bundle is assembled, **Then** an index.html entry point, all generated scripts, 3D models, textures, and audio files are packaged into a self-contained directory under 5MB uncompressed
3. **Given** 3D model assets in GLB/GLTF format, **When** assets are integrated, **Then** models are placed in the `models/` directory, textures in `textures/`, and other assets in `assets/`, with an asset manifest mapping slot IDs to bundled paths
4. **Given** the generated bundle, **When** loaded in a browser, **Then** it renders a functional 3D game with no external runtime dependencies
5. **Given** scene overrides (camera position, lighting intensity, background color, post-processing), **When** passed to the pipeline, **Then** the generated scene code reflects the overrides

---

### Edge Cases

- What happens when WebGL context is lost during gameplay? The game recovers automatically without losing player progress.
- What happens when a required asset slot (e.g., win_sound) has no asset mapped? Bundle generation fails with a clear error identifying the missing required asset.
- What happens when a player's device does not support WebGL2? The game falls back to WebGL1 rendering with degraded visual quality.
- What happens when a quiz has zero questions configured? Config validation rejects the config before bundle generation.
- What happens when a spin wheel has fewer than 4 or more than 12 segments? Config validation enforces segment count bounds.
- What happens when the generated bundle exceeds 5MB? The pipeline reports the size violation and prevents deployment.
- What happens when a player loses network connectivity mid-load? The game shows a loading error; fully loaded bundles continue to work offline.
- What happens when two scratch card touch events fire simultaneously? The shader processes both inputs sequentially without visual artifacts.
- What happens when a memory match grid size doesn't divide evenly into pairs? Config validation rejects invalid grid/pair combinations (e.g., odd number of cards).
- What happens on a low-end mobile device? LOD switching activates to reduce geometry complexity, lower texture resolution, and disable post-processing effects.
- What happens when code generation fails (SDK timeout, invalid output, rate limit)? The system retries up to 3 times with exponential backoff. After 3 failures, the bundle job fails with a clear error reported to the campaign creator.
- What happens when generated code is syntactically valid but functionally broken? Automated headless render validation catches initialization failures before the bundle is stored. Failed bundles are not deployed.

## Requirements *(mandatory)*

### Functional Requirements

**Template System**

- **FR-001**: System MUST support a template manifest schema (YAML) defining template id, version, title, description, config schema (JSON Schema), asset slots, scene configuration, and entry point
- **FR-002**: System MUST validate game configuration against the template's config schema at bundle time and reject invalid configs with descriptive error messages
- **FR-003**: System MUST inject game configuration into the generated bundle via `window.GAME_CONFIG` before game script execution. The config MUST NOT contain the pre-determined outcome or prize codes in a player-accessible form; outcomes are resolved server-side and sealed before delivery
- **FR-004**: System MUST support named asset slots with type constraints (image, audio, model_3d, texture, environment_map), format restrictions, and required/optional designation
- **FR-005**: System MUST generate an asset manifest listing all injected assets with their slot IDs, file paths, and types
- **FR-006**: System MUST produce self-contained bundles that work offline after initial load with no external runtime dependencies
- **FR-007**: System MUST enforce a 5MB uncompressed bundle size limit
- **FR-008**: System MUST support template versioning so existing bundles continue working when templates are updated

**Code Generation Pipeline**

- **FR-009**: System MUST invoke the Claude Agent SDK with template specifications, game configurations, and asset mappings to generate complete application code
- **FR-010**: Generated code MUST include scene setup, asset loading (3D models, textures, audio), game logic, animation loops, responsive viewport handling, and user interaction handlers
- **FR-011**: System MUST assemble final bundles with an index.html entry point, generated scripts, 3D models in `models/`, textures in `textures/`, and other assets in `assets/`
- **FR-012**: System MUST support scene overrides (camera position, lighting, background, post-processing) passed at bundle time
- **FR-012a**: System MUST retry code generation up to 3 times with exponential backoff on transient failures (timeout, rate limit, invalid output). After 3 failed attempts, the bundle job MUST fail with a clear error message surfaced to the campaign creator
- **FR-012b**: System MUST validate generated bundles via automated headless render check before storing. Validation MUST confirm WebGL context creation, game script initialization, and absence of runtime errors. Bundles that fail validation MUST NOT be deployed

**3D Rendering (All Templates)**

- **FR-013**: All templates MUST render 3D scenes with WebGL2 support and WebGL1 fallback
- **FR-014**: All templates MUST support viewports from 320px to 1920px width with automatic renderer resize
- **FR-015**: All templates MUST use touch-first interaction with raycaster-based 3D hit detection and mouse fallback
- **FR-016**: All templates MUST handle safe area insets for mobile notches and buttons
- **FR-017**: All templates MUST handle WebGL context loss with automatic recovery
- **FR-018**: All templates MUST support PBR materials (metalness, roughness, emissive properties)
- **FR-019**: All templates MUST support post-processing effects (bloom, depth-of-field, anti-aliasing) via an effect composition pipeline
- **FR-020**: All templates MUST support environment maps (HDR/EXR) for reflections and image-based lighting
- **FR-021**: All templates MUST support spatial audio

**Spin Wheel Template**

- **FR-022**: Spin wheel MUST display 4-12 segments with configurable labels, colors, and PBR material properties on a 3D wheel geometry
- **FR-023**: Spin MUST use physics-based angular deceleration with at least 3 full rotations before stopping
- **FR-024**: Final segment MUST be pre-determined server-side using weighted random selection matching configured probabilities; the client animation lands on the pre-determined segment
- **FR-025**: Win animation MUST include 3D confetti particles, bloom on winning segment, and cinematic camera zoom
- **FR-026**: Lose animation MUST include depth-of-field blur and muted lighting shift
- **FR-027**: Spatial tick audio MUST play as each segment passes the pointer during spin
- **FR-028**: Spin wheel MUST support optional respin for non-winning outcomes

**Quiz Template**

- **FR-029**: Quiz MUST display questions on 3D panels via canvas-to-texture rendering with 2-4 answer options as separate 3D button meshes
- **FR-030**: Answer selection MUST use raycaster-based tap/click detection on 3D answer panels
- **FR-031**: Correct answer feedback MUST include green emissive glow, particle celebration, and camera zoom
- **FR-032**: Incorrect answer feedback MUST include red flash, camera shake, and correct answer highlight
- **FR-033**: Quiz MUST support an optional per-question timer (configurable 10-60 seconds) rendered as a 3D countdown element
- **FR-034**: Quiz MUST support question and answer randomization
- **FR-035**: Quiz MUST calculate final score and assign prize tiers based on configurable score ranges
- **FR-036**: Camera MUST perform smooth fly-through transitions between questions

**Scratch Card Template**

- **FR-037**: Scratch card MUST render a 3D card mesh with a metallic PBR scratch layer on top and a reveal layer underneath
- **FR-038**: Touch/mouse interaction MUST map to UV coordinates on the card surface via raycaster for shader-based scratch erasure
- **FR-039**: A custom fragment shader MUST erase the scratch layer based on touch path using a render-to-texture alpha mask
- **FR-040**: Auto-reveal MUST trigger when the configured percentage threshold of the scratch area is reached (default: 60%)
- **FR-041**: Scratch percentage MUST be calculated via render target pixel sampling
- **FR-042**: Metallic scratch debris particles MUST fall from the scratch path with gravity simulation
- **FR-043**: Reveal animation MUST include camera zoom, dramatic lighting change, and celebration effects for winning outcomes

**Memory Match Template**

- **FR-044**: Memory match MUST display a grid of face-down 3D card meshes in configurable grid sizes (2x3, 3x4, 4x4, 4x5)
- **FR-045**: Card flip MUST perform real 3D Y-axis rotation with physics-based bounce easing
- **FR-046**: Matching pairs MUST stay revealed with emissive glow and trigger a particle burst effect
- **FR-047**: Non-matching pairs MUST flip back face-down after a configurable delay
- **FR-048**: System MUST prevent flipping more than 2 cards simultaneously
- **FR-049**: Memory match MUST support three win condition modes: move limit, time limit, and free play
- **FR-050**: Camera MUST perform a subtle zoom toward the pair being checked

**Outcome Handling (All Templates)**

- **FR-051**: All templates MUST emit a `gameComplete` event with game-specific result payload when the game ends
- **FR-052**: All templates MUST display a results screen as an HTML overlay on the 3D scene with outcome details and CTA buttons
- **FR-053**: All game outcomes (spin wheel result, scratch card prize, quiz correct answers) MUST be pre-determined server-side and sealed before the game bundle is delivered to the player. Client-side animations are cosmetic and converge on the pre-determined result
- **FR-054**: The `window.GAME_CONFIG` delivered to the client MUST NOT expose winning outcomes, correct answers, or prize codes in plaintext. Quiz answer correctness MUST be verified server-side upon `gameComplete`

### Key Entities

- **Template Manifest**: Defines a game type's identity (id, version, title), configuration schema, asset slot declarations, scene configuration (camera, lighting, environment, post-processing), and entry point
- **Game Configuration**: Runtime parameters injected into a generated bundle that control game behavior (segments, questions, grid size, win conditions, prizes, timing)
- **Asset Slot**: A named placeholder in a template that accepts a specific media type (image, audio, model_3d, texture, environment_map) with format constraints and required/optional designation
- **Asset Mapping**: Links an asset slot to a source URI with type and format metadata for injection into the generated bundle
- **Generated Bundle**: A self-contained directory containing index.html, generated scripts, 3D models, textures, audio, and an asset manifest - deployable with no external dependencies
- **Prize Tier**: A score/performance range mapped to a specific prize outcome, used by quiz, memory match, and spin wheel templates
- **Scene Configuration**: Camera type/position, lighting setup (ambient, directional, point, spot), environment map settings, and post-processing pipeline parameters

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All four game templates (spin wheel, quiz, scratch card, memory match) render functional 3D scenes that players can interact with to completion
- **SC-002**: Generated bundles load and become interactive within 3 seconds on a 4G mobile connection
- **SC-003**: All templates maintain a minimum of 30fps on mid-range mobile devices during gameplay, with 60fps target on desktop
- **SC-004**: Generated bundles remain under 5MB uncompressed including all 3D assets, textures, and audio
- **SC-005**: Spin wheel probability distribution matches configured weights within 5% tolerance over 1000 simulated spins
- **SC-006**: Quiz score calculation and prize tier assignment produce correct results for all configured question/answer combinations
- **SC-007**: Scratch card auto-reveal triggers within 2% accuracy of the configured scratch percentage threshold
- **SC-008**: Memory match correctly detects all matching pairs and enforces win conditions (move limit, time limit) accurately
- **SC-009**: All templates work offline after initial load with no failed network requests
- **SC-010**: All templates render correctly on desktop (Chrome, Safari, Firefox) and mobile (iOS Safari, Android Chrome) with WebGL2, falling back to WebGL1 when needed
- **SC-011**: Touch interaction (raycaster-based 3D hit detection) works reliably on mobile devices for all interactive elements across all templates
- **SC-012**: Campaign creators can configure and generate a complete game bundle using any of the four templates without writing code
- **SC-013**: WebGL context loss recovery restores the game scene without losing player progress
- **SC-014**: Template versioning allows updating a template without breaking bundles generated with the previous version

### Out of Scope

- Template editor UI or visual template builder for non-developers
- Campaign CRUD management (creation, editing, listing, deletion of campaigns)
- Analytics dashboard or reporting UI for game performance metrics
- Multiplayer or real-time competitive game modes
- Leaderboard systems or cross-player score tracking
- Prize fulfillment or redemption workflows (downstream of `gameComplete` event)
- Template marketplace or sharing between tenants
- Accessibility features (keyboard navigation, screen reader support, WCAG compliance) - deferred to a future phase

### Assumptions

- The 3D rendering engine is included in all generated bundles as a runtime dependency
- An AI code generation agent is available to produce valid application code from template specifications
- Animation/tweening capabilities are available for complex camera and animation transitions
- Asset storage infrastructure (from the existing core media integration) is available for storing and serving 3D models, textures, and audio files
- Compressed texture tooling is available for GPU-optimized texture delivery
- GLB/GLTF is the standard 3D model format; HDR/EXR for environment maps
- The `bundle_game_template` skill handler in the agent-platform already exists or will be created as part of this feature
- Mid-range mobile device baseline: devices from the last 3 years with WebGL2 support
- The existing run engine and workflow orchestration systems handle skill invocation and bundle storage
