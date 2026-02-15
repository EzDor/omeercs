# Research: Game Template System

**Feature**: 011-game-templates
**Date**: 2026-02-13

## R1: Claude Agent SDK for Three.js Code Generation

**Decision**: Use `@anthropic-ai/sdk` directly in agent-platform for code generation, invoked via a dedicated `generate_threejs_code` skill handler.

**Rationale**: Direct SDK integration provides full control over prompting, streaming, and error handling. The existing `LiteLLMHttpClient` supports chat completions but lacks the fine-grained control needed for large code generation tasks (e.g., extended thinking, streaming partial code blocks). A dedicated handler wrapping the Anthropic SDK enables template-specific prompt engineering and output parsing.

**Alternatives considered**:
- LiteLLM proxy `chatCompletion` with structured JSON output: Rejected because code generation outputs are too large for JSON Schema constraints and the proxy adds unnecessary latency for single-provider calls.
- Pre-built static templates with config interpolation: Rejected because it eliminates the ability to generate scene-specific code (camera transitions, particle effects, shader customizations) and requires maintaining 4 separate codebases.

---

## R2: Template Manifest Schema and Validation

**Decision**: Use YAML for template manifests with JSON Schema for config validation via Ajv at bundle time.

**Rationale**: YAML is human-readable and already used extensively in the codebase (skill descriptors, workflow definitions). Ajv provides standards-compliant JSON Schema validation with excellent error messages. The existing `SkillCatalogService` already loads YAML descriptors and validates input schemas, establishing a proven pattern.

**Alternatives considered**:
- TypeScript-only type definitions: Rejected because they don't provide runtime validation and aren't accessible to the Claude Agent SDK prompt.
- Database-stored manifests: Rejected because templates are system-level configuration, not tenant data. Filesystem storage enables version control and developer-friendly editing.

---

## R3: Server-Side Outcome Determination Architecture

**Decision**: Outcomes are determined during the `bundle_game` workflow step. The game config injected into the bundle contains a sealed outcome token (opaque to the client). On `gameComplete`, the client sends the token to the server for verification and prize fulfillment.

**Rationale**: Per clarification, all outcomes are pre-determined server-side. The outcome token pattern prevents client-side manipulation while keeping the bundle self-contained. For quiz games specifically, the client config includes question/answer content but correct answers are verified server-side upon submission.

**Implementation**:
- Spin wheel: `GAME_CONFIG.sealed_outcome_token` contains an encrypted reference to the winning segment index. Client animation targets the encoded segment.
- Quiz: `GAME_CONFIG.questions` include answer text but no correctness flags. On `gameComplete`, the server validates the player's answers against the sealed answer key.
- Scratch card: `GAME_CONFIG.sealed_outcome_token` contains the encrypted prize result. Client reveal animation shows the pre-determined prize.
- Memory match: Outcome is based on player performance (moves/time), calculated client-side but verified server-side against the sealed win conditions.

**Alternatives considered**:
- Real-time server verification per interaction: Rejected because it breaks the offline requirement and adds latency.
- Client-side randomness with server audit: Rejected because it doesn't prevent result inspection via developer tools.

---

## R4: Headless Bundle Validation Approach

**Decision**: Use Puppeteer in a dedicated `validate_bundle` skill handler to perform headless WebGL validation of generated bundles.

**Rationale**: Puppeteer provides headless Chromium with full WebGL support, enabling validation of Three.js scene initialization, asset loading, and runtime error detection. The validation runs as a workflow step after bundle assembly, before the bundle is stored as a deployable artifact.

**Validation checks**:
1. HTML loads without parse errors
2. WebGL context is created (WebGL2 or WebGL1 fallback)
3. `window.GAME_CONFIG` is accessible
4. No uncaught JavaScript exceptions within 5 seconds of load
5. Game initialization event fires (custom `gameReady` event)
6. Bundle total size is under 5MB

**Alternatives considered**:
- Static analysis (ESLint/TypeScript) of generated code: Rejected as insufficient - doesn't catch runtime WebGL errors or Three.js API misuse.
- Playwright: Viable alternative but Puppeteer has better headless WebGL support and smaller footprint for server-side use.
- Visual regression testing: Deferred to future phase per spec (out of scope for MVP).

---

## R5: Three.js Runtime Bundling Strategy

**Decision**: Include a minified Three.js build (core + required addons) in each generated bundle. The Claude Agent SDK generates game-specific code that imports from the bundled Three.js.

**Rationale**: The spec requires bundles to work offline with no external dependencies. Including Three.js in the bundle (core ~600KB minified + addons ~100KB) fits within the 5MB limit while ensuring offline capability.

**Bundle composition budget**:
| Component | Estimated Size |
|-----------|---------------|
| Three.js core (minified) | ~600KB |
| Three.js addons (GLTFLoader, EffectComposer, etc.) | ~100KB |
| GSAP (minified) | ~50KB |
| Generated game code | ~50-100KB |
| index.html + CSS | ~5KB |
| Audio assets (compressed) | ~500KB-1MB |
| 3D models (GLB, Draco-compressed) | ~1-2MB |
| Textures (KTX2/compressed) | ~500KB-1MB |
| **Total estimate** | ~2.8-4.9MB |

**Alternatives considered**:
- CDN-hosted Three.js with `importmap`: Rejected because it breaks the offline requirement.
- Custom Three.js tree-shaking per template: Deferred - can optimize later if bundles regularly exceed 5MB.

---

## R6: Prompt Engineering for Code Generation Quality

**Decision**: Use a two-tier prompt architecture: a shared system prompt establishing Three.js coding standards, plus template-specific user prompts containing manifest details, game config, and asset mappings.

**Rationale**: Template-specific prompts ensure the generated code matches each game type's unique mechanics (physics spin, raycaster quiz selection, shader scratch, card flip). The shared system prompt enforces consistent patterns across all templates (WebGL fallback, responsive resize, event emission, audio handling).

**Prompt structure**:
1. **System prompt** (`threejs-system.prompt.txt`): Three.js coding standards, WebGL patterns, output format (named code blocks)
2. **Template prompt** (e.g., `spin-wheel.prompt.txt`): Game-specific mechanics, scene setup, interaction patterns, animation requirements
3. **User prompt** (dynamic): Actual game config, asset mappings, scene overrides for this specific bundle

**Quality assurance**:
- Generated code is parsed for expected file outputs (game.js, scene-setup.js, etc.)
- Code blocks without proper filename headers trigger a retry
- Retry uses a refinement prompt including the error from the previous attempt

---

## R7: Existing Codebase Integration Points

**Decision**: Enhance the existing `BundleGameTemplateHandler` rather than replacing it, and add two new skill handlers alongside it.

**Rationale**: The existing handler already handles asset injection, manifest generation, and directory assembly. Enhancement avoids duplicating working code and maintains backward compatibility with existing workflow definitions.

**Integration points**:
| Existing Component | Integration |
|-------------------|-------------|
| `BundleGameTemplateHandler` | Add manifest loading, code gen invocation, Three.js injection |
| `SkillCatalogService` | Register `GenerateThreejsCodeHandler` and `ValidateBundleHandler` |
| `StorageService` | Store generated bundles with artifact type `bundle/game` |
| `BundleGameTemplateInput` DTO | Add `scene_overrides` field |
| `GameConfig` DTOs | Already have per-template mechanics - reuse as-is |
| `campaign.build` workflow | Add `generate_code` step before `bundle_game`, add `validate_bundle` after |
| `PromptRegistryService` | Load template-specific prompts from `prompts/` directory |
