# Research: Campaign Intelligence

**Feature**: 013-campaign-intelligence
**Date**: 2026-02-16

## R1: LLM-Based Structured Output for Intelligence Features

**Decision**: Use the existing `PromptRegistryService` + `TemplateRendererService` + `LiteLLMHttpClient` pipeline with `json_schema` response format for all LLM-based intelligence features (plan, copy, theme from brief).

**Rationale**: The agent-platform already has a production-tested pipeline for structured LLM output. The `LlmGenerationService` handles prompt loading, rendering, LLM calls with `json_schema` mode, Ajv validation, and retry on validation failure. Reusing this avoids duplicating retry/validation logic.

**Alternatives considered**:
- Direct LLM calls without prompt registry: Rejected because prompt versioning and schema validation are already solved by the existing infrastructure.
- Template-based skills via `SkillRunnerService`: Considered but intelligence calls need synchronous HTTP responses, not async workflow execution. Services can call the same underlying components (`PromptRegistryService`, `LiteLLMHttpClient`) directly without the skill runner overhead.

## R2: Service Communication Pattern (api-center ↔ agent-platform)

**Decision**: Synchronous HTTP calls from api-center to agent-platform internal endpoints.

**Rationale**: Intelligence features are request-response with <10s latency targets. BullMQ async queues add unnecessary complexity (callback handling, SSE streaming) for what is fundamentally a synchronous operation. The agent-platform already runs an HTTP server on port 3002.

**Alternatives considered**:
- BullMQ with reply pattern: Rejected due to complexity. Requires setting up a response queue, correlation IDs, and timeout handling for simple request-response.
- LLM calls directly in api-center: Rejected because it violates monorepo discipline (Principle IV). All AI/LLM infrastructure lives in agent-platform. Moving LLM logic to api-center would create a parallel LLM integration path.
- Shared NestJS module in common/: Rejected because common/ is for utilities, not business logic with service dependencies (prompt registry, LLM client).

## R3: Image-Based Color Extraction

**Decision**: Use `sharp` library for image loading and pixel data extraction, with a custom k-means clustering implementation for dominant color identification.

**Rationale**: `sharp` is the standard Node.js image processing library (libvips-based, fast, low memory). K-means clustering with k=5 identifies the 5 dominant colors. No external API dependency needed for color extraction.

**Alternatives considered**:
- Google Vision API / Imagga: Rejected to avoid external API dependency and cost. Color extraction is algorithmically straightforward.
- `jimp` library: Rejected because `sharp` is significantly faster (native C++ vs pure JS) and already used in Node.js ecosystems.
- Canvas-based extraction: Rejected because it requires a browser environment or `node-canvas` which has complex native dependencies.

**Implementation notes**:
- Resize image to max 200x200 before clustering (performance)
- Use k-means with k=5, max 20 iterations
- Sort extracted colors by pixel frequency
- Map dominant colors to palette roles (primary=most frequent, secondary=2nd, accent=most saturated, background=lightest, text=darkest)
- Generate complementary colors for missing slots using HSL color math

## R4: WCAG Contrast Validation

**Decision**: Pure TypeScript implementation of WCAG 2.1 AA contrast ratio calculation with automatic color adjustment suggestions.

**Rationale**: The algorithm (relative luminance + contrast ratio) is well-specified in WCAG 2.1 and trivial to implement. No library needed.

**Implementation**:
- Convert hex to RGB, then to relative luminance per WCAG formula
- Calculate contrast ratio: `(L1 + 0.05) / (L2 + 0.05)` where L1 > L2
- AA threshold: 4.5:1 for normal text, 3:1 for large text
- Adjustment algorithm: If contrast fails, darken or lighten the text color iteratively (step by 5% luminance) until ratio passes

## R5: Copy Compliance Checking

**Decision**: Keyword-based compliance checker using a curated list of regulatory and misleading terms, implemented as a pure utility function.

**Rationale**: The spec requires advisory warnings only (not blocking). A regex-based approach is fast, deterministic, and sufficient for flagging common terms. It avoids LLM overhead for what is essentially pattern matching.

**Implementation**:
- Maintain a list of flagged terms with categories: `misleading` ("guaranteed", "100%", "always win"), `regulatory` ("winner", "prize", "free"), `financial` ("no purchase necessary", "void where prohibited")
- Each term has: `term`, `category`, `severity` (warning/info), `suggestion` (alternative wording or required context)
- Case-insensitive matching with word boundary detection
- Returns array of `ComplianceWarning` objects

## R6: Generation History Persistence

**Decision**: Single `ai_generations` table for all generation types (plan, copy, theme) using JSONB for flexible input/output storage.

**Rationale**: A single polymorphic table is simpler than separate tables per generation type. The input/output schemas vary by type but JSONB handles this cleanly. Indexed by `[tenantId, campaignId]` and `[tenantId, generationType]` for efficient queries.

**Alternatives considered**:
- Separate tables per type: Rejected because it triples migration/entity/repository overhead for minimal query benefit. All generations share the same lifecycle (create → complete/fail → accept/reject).
- Store in campaign.config JSONB: Rejected because it doesn't support generation history (multiple generations per campaign) and would bloat the campaign entity.

## R7: Theme Presets

**Decision**: Static TypeScript data file in `common/src/intelligence/theme-presets.ts`, not database-stored.

**Rationale**: The spec states "curated as a static set initially, with dynamic expansion deferred." A TypeScript file is the simplest approach — type-safe, no migration needed, easy to update, importable from any package.

**Presets coverage**: 6 industries (Retail, Food & Beverage, Finance, Seasonal/Holiday, Luxury, Technology) × 1-2 moods each = ~10 presets.

## R8: Prompt Design Strategy

**Decision**: Three new prompt templates in the prompt registry, each with strict output schemas.

**Prompts**:
1. `intelligence_plan` (1.0.0): System prompt describes available templates and their strengths. User prompt includes brief + constraints. Output schema enforces confidence scores, prize tiers, theme, and engagement estimate.
2. `generate_copy` (1.0.0): System prompt is a marketing copywriter persona with template-specific context. User prompt includes campaign context, copy types, tone, and constraints. Output schema enforces character limits and variation count.
3. `extract_theme_brief` (1.0.0): System prompt is a brand design expert. User prompt includes the brief text. Output schema enforces hex color format, mood classification, and contrast-aware palette.

**Model selection**: Use `gemini-2.0-flash` for all intelligence prompts (fast, good at structured output, cost-effective for the volume of calls expected).

## R9: Minimal Test UI Approach

**Decision**: Single Vue page (`IntelligenceTestPage.vue`) with tabbed sections for Plan, Copy, and Theme. No design polish — raw forms with JSON result display.

**Rationale**: User explicitly requested "simple stupid UI" for testing backend functionality. A single page with tabs avoids route complexity.

**Implementation**:
- Tab 1 (Plan): Textarea for brief, optional fields for constraints, "Generate Plan" button, JSON result display, "Accept Plan" button
- Tab 2 (Copy): Dropdown for copy type, tone selector, variation count slider, "Generate" button, variations display
- Tab 3 (Theme): Textarea for brief OR file upload for image, "Extract Theme" button, color swatches + JSON, preset browser
- All results displayed as formatted JSON with syntax highlighting (or `<pre>` tag)
