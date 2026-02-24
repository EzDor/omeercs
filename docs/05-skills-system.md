# Skills System

## Overview

The skills system is how the platform actually "does things." Every unit of work — generating an image, calling an LLM, bundling a game, validating a bundle — is a **skill**. Skills are defined as YAML descriptors in the catalog and executed by the Skill Runner.

**Location**: `agent-platform/src/skills/`

## Two Types of Skills

### 1. Handler-Based Skills

These are custom TypeScript classes that implement the `SkillHandler` interface. They have full control over execution — they can call external APIs, manipulate files, run LLM completions, etc.

**Example**: `generate_intro_image` — calls an image generation provider (Stability AI or Replicate), polls for completion, downloads the result, and stores it as an artifact.

**Implementation pattern**:
```typescript
// agent-platform/src/skills/handlers/generate-intro-image.handler.ts
export class GenerateIntroImageHandler implements SkillHandler {
  async execute(input: any, context: ExecutionContext): Promise<SkillResult> {
    // 1. Call image generation provider
    // 2. Poll for completion
    // 3. Download and store the image
    // 4. Return result with artifact references
  }
}
```

**YAML descriptor** (in `skills/catalog/generate_intro_image.yaml`):
```yaml
implementation:
  type: ts_function
  handler: "@skills/generate-intro-image/handler"   # Points to the handler class
```

### 2. Template-Based Skills (LLM Generation)

These are declarative skills that use LLM structured output. Instead of writing custom code, you define a prompt template and an output schema, and the system handles the LLM call, parsing, and validation automatically.

**Example**: `intelligence_plan` — sends a prompt to Gemini with the marketing brief, expects structured JSON output with theme, template recommendation, and prize tiers.

**YAML descriptor** (in `skills/catalog/intelligence_plan.yaml`):
```yaml
template_type: LLM_JSON_GENERATION           # Declares this as a template skill
template_config:
  prompt_id: intelligence_plan               # References a prompt in the Prompt Registry
  prompt_version: "1.0.0"
  model: gemini/gemini-2.0-flash             # LLM model to use
  temperature: 0.5
  retry_on_validation_failure: true          # Retry if output doesn't match schema

implementation:
  type: ts_function
  handler: null                              # No custom handler — uses LlmGenerationService
```

The `LlmGenerationService` handles the execution:
1. Fetches the prompt template from the Prompt Registry
2. Renders the template with the resolved inputs (f-string variable substitution)
3. Calls the LLM via LiteLLM with `response_format: json_schema`
4. Validates the response against the `output_schema`
5. If validation fails and `retry_on_validation_failure` is true, retries the call

## Skill Catalog

**Location**: `skills/catalog/`

The catalog is the registry of all available skills. Each skill has a YAML descriptor file and an entry in `skills/catalog/index.yaml`.

### Catalog Index

```yaml
# skills/catalog/index.yaml
version: "1.1.0"
skills:
  - skill_id: campaign_plan_from_brief
    version: "1.0.0"
    title: Campaign Plan from Brief
    tags: [planning, ai, campaign]
    status: active

  - skill_id: generate_intro_image
    version: "1.0.0"
    title: Generate Intro Image
    tags: [image, generation, ai, intro]
    status: active
  # ... 23 skills total
```

### Skill YAML Anatomy

Every skill descriptor has these sections:

```yaml
# Identification
skill_id: generate_intro_image         # Unique identifier, referenced by workflows
version: "1.0.0"                       # Semantic version
title: Generate Intro Image            # Human-readable name
description: |                         # Multi-line description
  Generates a base frame image...
tags: [image, generation, ai, intro]   # Searchable tags

# For template-based skills only
template_type: LLM_JSON_GENERATION     # Or LLM_REVIEW
template_config:
  prompt_id: intelligence_plan
  prompt_version: "1.0.0"
  model: gemini/gemini-2.0-flash
  temperature: 0.5
  retry_on_validation_failure: true

# Input/Output contracts (JSON Schema)
input_schema:
  type: object
  required: [prompt]
  properties:
    prompt:
      type: string
      minLength: 10

output_schema:
  type: object
  required: [image_uri, width, height]
  properties:
    image_uri:
      type: string
    width:
      type: number
    height:
      type: number

# Implementation
implementation:
  type: ts_function
  handler: "@skills/generate-intro-image/handler"  # null for template skills

# What this skill produces
produces_artifacts:
  - artifact_type: image/intro-frame
    description: Generated base frame image

# Security and resource policies
policy:
  max_runtime_sec: 180                 # Kill the skill after 3 minutes
  network: allowlist                   # Only allow specific network calls
  allowed_hosts:
    - "localhost:4000"                 # LiteLLM proxy
    - "api.stability.ai"              # Image generation provider
  fs:
    read_prefixes: ["/tmp/skills/"]
    write_prefixes: ["/tmp/skills/output/"]

# Observability
observability:
  log_level_default: info
  emit_metrics: true
```

### Input and Output Schemas

Schemas use JSON Schema format and are validated by Ajv at runtime:

- **Before execution**: The resolved inputs are validated against `input_schema`. If validation fails, a `SkillInputValidationException` is thrown and the step fails immediately.
- **After execution**: The skill's output is validated against `output_schema`. If validation fails, a `SkillOutputValidationException` is thrown.

This ensures that skills always receive well-formed inputs and produce well-formed outputs, regardless of what upstream steps return.

## All Skills by Category

### A) Campaign Planning & Configuration (3 skills)

| Skill ID | Type | Description |
|----------|------|-------------|
| `campaign_plan_from_brief` | Handler | Takes a marketing brief, calls LLM to generate a full campaign plan (theme, colors, game template, difficulty, video prompts, audio specs, copy) |
| `game_config_from_template` | Handler | Generates game configuration from a selected template and plan |
| `review_asset_quality` | Handler | AI-powered quality review of generated assets |

### B) Intro Video Pipeline (3 skills)

| Skill ID | Type | Description |
|----------|------|-------------|
| `generate_intro_image` | Handler | Generates the base frame image for the intro video using AI image generation (Stability AI / Replicate) |
| `segment_start_button` | Handler | Detects and segments the "Start" button in the intro image for interactive overlay |
| `generate_intro_video_loop` | Handler | Animates the intro image into a seamless looping video |

### C) Outcome Video Pipeline (2 skills)

| Skill ID | Type | Description |
|----------|------|-------------|
| `generate_outcome_video_win` | Handler | Generates the "You Win!" outcome video |
| `generate_outcome_video_lose` | Handler | Generates the "Try Again" outcome video |

### D) Audio Pipeline (3 skills)

| Skill ID | Type | Description |
|----------|------|-------------|
| `generate_bgm_track` | Handler | Generates background music track (Suno) |
| `generate_sfx_pack` | Handler | Generates sound effects pack (click, spin, win, lose sounds) |
| `mix_audio_for_game` | Handler | Mixes and normalizes all audio tracks with loudness targets (LUFS) |

### E) 3D Asset Pipeline (2 skills)

| Skill ID | Type | Description |
|----------|------|-------------|
| `generate_3d_asset` | Handler | Generates 3D models for the game scene (Meshy) |
| `optimize_3d_asset` | Handler | Optimizes 3D assets for web (compression, LOD, format conversion) |

### F) Game Bundling & Packaging (2 skills)

| Skill ID | Type | Description |
|----------|------|-------------|
| `bundle_game_template` | Handler | Packages the game template code with all generated assets into a playable bundle |
| `validate_game_bundle` | Handler | Validates the bundle structure, manifest, assets, and configuration |

### G) Code Generation & Validation (2 skills)

| Skill ID | Type | Description |
|----------|------|-------------|
| `generate_threejs_code` | Handler | Generates Three.js game code using Claude AI agent |
| `validate_bundle` | Handler | Headless validation of game bundles using Puppeteer |

### H) Campaign Manifest (1 skill)

| Skill ID | Type | Description |
|----------|------|-------------|
| `assemble_campaign_manifest` | Handler | Assembles the final campaign manifest referencing all generated assets, videos, audio, and game bundle. This is the last production step. |

### I) Intelligence Features (4 skills)

| Skill ID | Type | Description |
|----------|------|-------------|
| `intelligence_plan` | Template (LLM_JSON_GENERATION) | Generates campaign plan with template recommendation, theme, and prizes |
| `generate_campaign_copy` | Template (LLM_JSON_GENERATION) | Generates marketing copy variations (headlines, CTAs, win/lose messages) |
| `extract_theme_from_brief` | Template (LLM_JSON_GENERATION) | Extracts a color theme from the brief text |
| `extract_theme_from_image` | Handler | Extracts a color theme from a generated image |

## Skill Execution Flow

Here's what happens inside the `SkillRunnerService` when a step calls a skill:

```
SkillRunnerService.execute(skillId, input, runContext)
       │
       ▼
1. Look up skill descriptor from SkillCatalogService
       │
       ▼
2. Validate input against input_schema (Ajv)
   └── Fails? → SkillInputValidationException
       │
       ▼
3. Create ExecutionContext
   - Provides: tenantId, runId, stepId, storageService, llmClient
       │
       ▼
4. Set up timeout (from policy.max_runtime_sec)
       │
       ▼
5. Route to execution method:
   ├── Handler-based? → handler.execute(input, context)
   └── Template-based? → LlmGenerationService.generate(descriptor, input, context)
       │
       ▼
6. Validate output against output_schema (Ajv)
   └── Fails? → SkillOutputValidationException
       │
       ▼
7. Store artifacts via StorageService
       │
       ▼
8. Return SkillResult { data, artifactIds }
```

## Prompt Registry

**Location**: `agent-platform/src/prompt-registry/`

The Prompt Registry stores versioned prompt templates that template-based skills use. Prompts are loaded from markdown files on disk.

**Prompt files location**: `agent-platform/prompts/`

```
agent-platform/prompts/
├── intelligence_plan/
│   └── 1.0.0.md           # Prompt template for intelligence_plan skill
├── generate_copy/
│   └── 1.0.0.md           # Prompt template for copy generation
└── extract_theme_brief/
    └── 1.0.0.md           # Prompt template for theme extraction
```

### How Prompts Are Rendered

Prompts use **f-string variable interpolation**. Variables in the prompt template are wrapped in `{curly_braces}` and replaced with values from the skill's resolved inputs.

Example prompt template:
```
You are a campaign planning assistant.

Given the following marketing brief:
{brief}

Generate a campaign intelligence plan...
```

When the skill runs, `{brief}` is replaced with the actual brief text from the step's inputs.

### Services

- **PromptRegistryService** — In-memory registry. Stores prompts, configs, and rubrics indexed by `(id, version)`.
- **TemplateLoaderService** — Loads prompt files from the filesystem at module initialization.
- **TemplateRendererService** — Performs f-string substitution to render prompts with actual values.

## Template System

**Location**: `agent-platform/src/template-system/`

The Template System manages game template manifests — YAML files that describe the structure of a playable game template (e.g., spin wheel, scratch card).

### What a Game Template Manifest Contains

```yaml
template_id: spin_wheel
version: "1.0.0"
title: Spinning Wheel
description: Interactive spinning wheel game

config_schema: { ... }        # JSON Schema for game configuration
asset_slots:                   # Required media assets
  - slot_id: background_image
    type: image
    required: true
  - slot_id: bgm_track
    type: audio
    required: true

scene_config:                  # Three.js scene setup
  camera: { ... }
  lighting: { ... }
  environment: { ... }

entry_point: game.js           # Main JavaScript file in the bundle
```

### Services

- **TemplateManifestLoaderService** — Loads and caches game template manifests from YAML files in the `templates/` directory.
- **TemplateConfigValidatorService** — Validates game configuration against the template's `config_schema`.

## SkillCatalogService

**File**: `agent-platform/src/skills/services/skill-catalog.service.ts`

This service is the central registry that connects everything. At startup, it:

1. Loads `skills/catalog/index.yaml` to discover all available skills
2. Loads each skill's individual YAML descriptor
3. Registers handler-based skills by mapping their handler path to the actual TypeScript class
4. Makes skills available for lookup by `skillId` and `version`

The `SkillNodeService` in the campaign workflows calls `SkillRunnerService.execute(skillId, input)`, which internally uses `SkillCatalogService.getSkill(skillId)` to get the descriptor for validation and handler lookup.

## Adding a New Skill

To add a new skill to the system:

1. **Create the YAML descriptor** in `skills/catalog/your_skill.yaml` with input/output schemas
2. **Add it to** `skills/catalog/index.yaml`
3. **For handler-based skills**: Create a handler class in `agent-platform/src/skills/handlers/your-skill.handler.ts` implementing the `SkillHandler` interface
4. **For template-based skills**: Create a prompt template in `agent-platform/prompts/your_skill/1.0.0.md`
5. **Register** the handler in `SkillCatalogService` (if handler-based)
6. **Add the step** as a node in the appropriate workflow class in `agent-platform/src/workflows/campaign/`
