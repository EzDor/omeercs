# Feature Specification: Campaign Intelligence - AI-Powered Campaign Planning, Copy & Theme

**Feature Branch**: `013-campaign-intelligence`
**Created**: 2026-02-15
**Status**: Draft
**Input**: User description: "Phase 4 Intelligence: LLM campaign planning, copy generation, and theme extraction for AI-powered campaign creation"

## User Scenarios & Testing

### User Story 1 - AI Campaign Plan from Brief (Priority: P1)

A marketer chooses "Start with AI" on the campaign creation page and describes their campaign idea in plain English (e.g., "Summer sale for our clothing brand targeting millennials, $500 prize budget"). The system uses AI to generate a structured campaign plan including a recommended game template, theme colors, prize tiers, and asset requirements. The marketer reviews the plan, optionally edits it, then accepts it — which creates a new campaign draft pre-filled with the plan and takes them into the campaign builder.

**Why this priority**: This is the highest-value capability — it transforms a blank-page problem into a one-click starting point. Without AI planning, marketers must manually configure every field. This story alone delivers a viable AI-assisted campaign creation experience.

**Independent Test**: Can be fully tested by submitting a text brief and verifying the returned plan contains a valid template recommendation, theme, prize suggestions, and that accepting the plan populates the campaign builder form fields.

**Acceptance Scenarios**:

1. **Given** a marketer is on the campaign creation page, **When** they choose "Start with AI" and enter a free-form brief up to 2000 characters, **Then** the system returns a structured campaign plan with a recommended template, theme, prize tiers, and estimated engagement level.
2. **Given** a generated campaign plan is displayed, **When** the marketer clicks "Accept Plan", **Then** a new campaign is created in draft status with all plan fields pre-filled (template selection, theme colors, prizes) and the marketer is taken to the campaign builder to continue editing.
3. **Given** the marketer provides optional constraints (template preference, budget range, target audience), **When** the plan is generated, **Then** the recommendations respect those constraints (e.g., prizes within budget, preferred template selected).
4. **Given** the marketer is unsatisfied with the generated plan, **When** they click "Regenerate", **Then** a new plan is generated that differs meaningfully from the previous one.

---

### User Story 2 - AI-Generated Marketing Copy (Priority: P1)

A marketer needs compelling text for their campaign — headlines, button labels, prize descriptions, win/lose messages. From the campaign builder's configuration step, they click "Generate" next to any copy field. The system produces multiple variations matching the campaign's tone and context. The marketer picks their favorite or edits a variation.

**Why this priority**: Copy is required for every campaign and is time-consuming to write from scratch. This delivers immediate, tangible value by eliminating writer's block and ensuring on-brand messaging. It works independently of campaign planning.

**Independent Test**: Can be fully tested by requesting copy generation for specific copy types (headline, CTA, win message) with a given tone and verifying multiple distinct variations are returned within character limits.

**Acceptance Scenarios**:

1. **Given** a marketer is configuring a campaign, **When** they click "Generate" next to a copy field (e.g., headline), **Then** the system returns 3 distinct variations that match the campaign's tone and respect character limits.
2. **Given** copy is generated with a "playful" tone, **When** the marketer switches the tone to "professional", **Then** regenerated copy reflects the new tone without needing other input changes.
3. **Given** the campaign is a spin wheel type, **When** CTA button copy is generated, **Then** the variations are contextually appropriate (e.g., "Spin Now!", "Try Your Luck!") and fit within the 20-character button limit.
4. **Given** the marketer has specified constraint words to avoid (e.g., "guaranteed"), **When** copy is generated, **Then** none of the variations contain the avoided words, and any potentially misleading claims are flagged with warnings.

---

### User Story 3 - Theme Extraction from Brief (Priority: P2)

A marketer wants the campaign's visual theme to match their brand and campaign mood. From the campaign builder's theme step, they click "Extract from Brief" and the system analyzes the campaign brief to suggest a color palette (primary, secondary, accent, background, text colors) with a mood classification. The marketer can adjust individual colors before applying.

**Why this priority**: Visual theming is important for brand consistency but is lower priority than planning and copy because default themes are functional. This adds polish and reduces design effort.

**Independent Test**: Can be fully tested by submitting a brief text and verifying a color palette is returned with valid hex colors, a mood classification, and a passing contrast ratio.

**Acceptance Scenarios**:

1. **Given** a marketer has entered a campaign brief, **When** they click "Extract from Brief" on the theme step, **Then** the system returns a complete color palette (primary, secondary, accent, background, text) with a mood classification.
2. **Given** an extracted theme has a text-to-background contrast ratio below WCAG AA (4.5:1), **When** the theme is presented, **Then** the system warns the marketer and suggests adjusted colors that meet accessibility standards.
3. **Given** the marketer is in a specific industry (e.g., retail), **When** they browse theme presets, **Then** they see industry-relevant preset themes they can apply with one click.

---

### User Story 4 - Theme Extraction from Image (Priority: P2)

A marketer uploads their brand logo or a reference image. The system extracts dominant colors, builds a cohesive palette, and suggests a mood. This ensures the campaign visually matches existing brand assets without manual color picking.

**Why this priority**: Image-based extraction provides a higher-fidelity brand match than text-based extraction and is a natural complement. It is P2 because the text-based approach already provides a viable starting point.

**Independent Test**: Can be fully tested by uploading an image file and verifying dominant colors are extracted, a palette is constructed, and complementary colors are generated for any missing slots.

**Acceptance Scenarios**:

1. **Given** a marketer uploads a logo image, **When** the system processes it, **Then** the top 5 dominant colors are extracted and organized into a palette with primary, secondary, accent, background, and text color assignments.
2. **Given** an uploaded image has limited color variety, **When** the palette is generated, **Then** the system generates complementary colors for missing slots to create a complete, cohesive palette.

---

### User Story 5 - Multiple Copy Variations with Tone Control (Priority: P3)

A marketer wants to A/B test different messaging approaches. They request copy generation with a specific number of variations (1-5) and can select different tones (playful, urgent, professional, luxury, friendly) for each generation. This supports data-driven optimization of campaign messaging.

**Why this priority**: A/B testing is a growth optimization feature. The core copy generation (P1) already provides multiple variations. This story adds finer control over variation count and tone experimentation.

**Independent Test**: Can be fully tested by requesting different variation counts and tones, then verifying the correct number of distinct variations is returned with appropriate tone matching.

**Acceptance Scenarios**:

1. **Given** a marketer requests 5 copy variations, **When** generation completes, **Then** exactly 5 distinct variations are returned, each with meaningfully different wording.
2. **Given** a marketer generates copy for the same field in two different tones, **When** comparing the results, **Then** the variations clearly reflect the different tones in word choice and style.

---

### Edge Cases

- What happens when the AI generates copy that exceeds character limits? The system must truncate or regenerate, with clear indication to the user.
- What happens when the brief is too vague (e.g., "make a campaign")? The system should still produce a reasonable default plan with lower confidence scores and surface guidance to the marketer to provide more detail.
- What happens when an uploaded image is corrupted or in an unsupported format? The system should return a clear error message and not crash.
- What happens when the LLM service is temporarily unavailable? The system should show a user-friendly error with a retry option, and template-specific default copy should still be accessible.
- What happens when the marketer submits a brief in a non-English language? The system should still attempt extraction and generation, defaulting to English output unless a language is specified.
- What happens when theme extraction produces colors that fail accessibility contrast checks? The system automatically suggests adjusted alternatives.
- What happens when the LLM returns malformed output (invalid JSON, missing fields)? The system silently retries up to 2 times; an error is shown only if all attempts fail.

## Clarifications

### Session 2026-02-16

- Q: Are AI-generated outputs (plans, copy, themes) persisted or ephemeral? → A: Persisted — all generations saved to DB, linked to the campaign, with full history.
- Q: Should AI generation endpoints be rate-limited per tenant to control LLM costs? → A: No application-level rate limiting; rely on existing infrastructure-level protections (LiteLLM proxy, etc.).
- Q: When a marketer accepts an AI-generated plan, does it create a new campaign or populate an open builder? → A: Creates a new campaign in draft status, pre-filled from the plan.
- Q: How should the system handle malformed LLM output (invalid JSON, missing fields)? → A: Auto-retry silently up to 2 times; show error to user only if all attempts fail.
- Q: Where does "Generate Plan from Brief" live in the campaign creation UX? → A: Dedicated pre-builder step — a "Start with AI" option on the campaign creation page, before entering the builder wizard.

## Requirements

### Functional Requirements

- **FR-001**: System MUST accept a free-form text brief (up to 2000 characters) and generate a structured campaign plan including template recommendation, theme, prize tiers, and asset requirements.
- **FR-002**: System MUST generate marketing copy for the following types: headlines, subheadlines, CTA buttons, prize descriptions, win messages, lose messages, instructions, and terms summaries.
- **FR-003**: System MUST produce multiple copy variations (default 3, configurable 1-5) for each requested copy type.
- **FR-004**: System MUST respect character limits for each copy type (headline: 60, subheadline: 120, CTA button: 20, prize description: 100, win/lose message: 80, instructions: 200).
- **FR-005**: System MUST support tone selection for copy generation: playful, urgent, professional, luxury, and friendly.
- **FR-006**: System MUST extract a color palette from a text brief by analyzing mood and context, producing primary, secondary, accent, background, and text colors.
- **FR-007**: System MUST extract dominant colors from an uploaded image and construct a cohesive palette.
- **FR-008**: System MUST validate color palette contrast ratios against WCAG AA standards (4.5:1 for text) and warn users of accessibility issues with suggested fixes.
- **FR-009**: System MUST provide industry-specific theme presets that users can browse and apply.
- **FR-010**: System MUST include a confidence score (0-1) with template recommendations and theme extractions to indicate reliability.
- **FR-011**: System MUST flag potentially misleading claims in generated copy (e.g., "guaranteed", "free" without context) and warn about regulatory words.
- **FR-012**: Accepting a generated campaign plan MUST create a new campaign in draft status with all plan fields pre-filled, then redirect the marketer to the campaign builder for that draft.
- **FR-013**: System MUST allow marketers to accept, edit, or regenerate any AI-generated output (plans, copy, themes).
- **FR-014**: System MUST provide template-specific default copy (e.g., spin wheel defaults like "Spin Now!") as fallbacks when AI generation is unavailable.
- **FR-015**: System MUST support optional constraints for campaign planning: template preference, budget range, and target audience.
- **FR-016**: System MUST persist all AI-generated outputs (plans, copy variations, extracted themes) to the database, linked to the campaign, with full generation history including input parameters, timestamps, and whether the output was accepted or rejected.
- **FR-017**: System MUST automatically retry LLM calls up to 2 times when the response fails schema validation (malformed JSON, missing required fields). The user sees a single loading state; an error is surfaced only if all retry attempts are exhausted.

### Key Entities

- **Campaign Plan**: A structured AI-generated recommendation including template selection, theme, prize tiers, estimated engagement, and asset requirements. Created from a marketer's brief.
- **Generated Copy**: A set of text variations for a specific copy type (headline, CTA, etc.), associated with a campaign, tone, and character constraints. Multiple variations per type.
- **Extracted Theme**: A color palette with mood classification, derived from a brief, image, or preset. Includes primary, secondary, accent, background, and text colors with contrast validation.
- **Theme Preset**: A predefined theme tied to an industry or mood category, available for one-click application.
- **Copy Constraint**: Rules governing copy generation including character limits, required words, avoided words, and tone.
- **Generation History**: A persisted record of every AI generation (plan, copy, theme) linked to a campaign, including input parameters, output, and timestamp. Enables reviewing past generations and reusing previous results without re-calling the LLM.

## Success Criteria

### Measurable Outcomes

- **SC-001**: Marketers can go from a text brief to a complete campaign plan in under 30 seconds (including review time), compared to manual configuration.
- **SC-002**: AI-generated campaign plans are accepted (with or without minor edits) by marketers at least 70% of the time without full regeneration.
- **SC-003**: All generated copy respects specified character limits 100% of the time.
- **SC-004**: Theme extraction from briefs produces color palettes that pass WCAG AA contrast checks at least 90% of the time without manual adjustment.
- **SC-005**: Copy generation returns results within 5 seconds for a full set of copy types.
- **SC-006**: Campaign plan generation returns results within 10 seconds.
- **SC-007**: Image-based theme extraction processes and returns results within 5 seconds.
- **SC-008**: Generated copy variations are meaningfully distinct — no two variations for the same copy type share more than 50% of their words.
- **SC-009**: Compliance warnings correctly flag at least 95% of potentially misleading terms in generated copy.
- **SC-010**: Marketers using AI-assisted campaign creation complete the full campaign setup flow at least 40% faster than manual configuration.

## Assumptions

- The existing LiteLLM proxy and prompt registry infrastructure is available and operational for LLM calls.
- The campaign builder UI exists and has identifiable form fields that can be programmatically populated from a generated plan.
- Image uploads are supported through the existing media infrastructure (from the core media integration feature).
- Template metadata (types, capabilities, configurations) is accessible from the existing game template system.
- The system will use English as the default language for all AI generation; multi-language support is deferred.
- Theme presets will be curated as a static set initially, with dynamic expansion deferred to a future iteration.
- Copy compliance checks are advisory warnings only — they do not block campaign publishing.
- No application-level rate limiting is applied to AI generation endpoints; cost control is delegated to existing infrastructure (LiteLLM proxy limits, cloud provider quotas).

## Scope Boundaries

**In Scope**:
- AI campaign plan generation from text briefs
- Marketing copy generation with tone and constraint controls
- Theme extraction from text briefs and uploaded images
- Theme presets by industry/mood
- WCAG AA contrast validation
- Copy compliance flagging
- Integration with existing campaign builder

**Out of Scope**:
- Multi-language copy generation and translation
- Conversational plan refinement (iterative AI chat)
- Learning from previous campaigns to improve suggestions
- Copy profanity filtering
- Theme extraction from URLs
- Video or audio asset generation
- Real-time collaborative editing of AI outputs
