# Quickstart: Game Template System

**Feature**: 011-game-templates
**Date**: 2026-02-13

## Prerequisites

1. Docker running (`docker compose up -d` for PostgreSQL, Valkey, LiteLLM)
2. `pnpm install` completed
3. `ANTHROPIC_API_KEY` environment variable set (for Claude Agent SDK code generation)
4. `ASSET_STORAGE_DIR` environment variable set (defaults to `/tmp/skills/assets`)

## Build Order

```bash
pnpm --filter @agentic-template/dto build
pnpm --filter @agentic-template/common build
pnpm --filter dao build
pnpm --filter agent-platform build
```

## New Dependencies

```bash
pnpm --filter agent-platform add @anthropic-ai/sdk ajv puppeteer
pnpm --filter @agentic-template/dto add ajv
```

## Key Files to Implement (in order)

### Phase 1: Template Manifest System

1. **`dto/src/template-system/template-manifest.interface.ts`**
   - `TemplateManifest`, `AssetSlotDefinition`, `SceneConfig` interfaces
   - No class-validator needed (these are loaded from YAML, validated via JSON Schema)

2. **`agent-platform/src/template-system/services/template-manifest-loader.service.ts`**
   - Loads YAML manifests from `templates/games/{template_id}/manifest.yaml`
   - Caches in-memory Map keyed by `{template_id}@{version}`
   - Validates manifest structure against `contracts/template-manifest-schema.yaml`

3. **`agent-platform/src/template-system/services/template-config-validator.service.ts`**
   - Uses Ajv to validate game configs against the manifest's `config_schema`
   - Returns structured validation errors

4. **`agent-platform/src/template-system/template-system.module.ts`**
   - NestJS module exporting both services

5. **`templates/games/{spin_wheel,quiz,scratch_card,memory_match}/manifest.yaml`**
   - 4 template manifest files (reference spec files in `specs/mvp-step-to-complete/phase-2-game-templates/`)

### Phase 2: Code Generation

6. **`dto/src/skills/generate-threejs-code.dto.ts`**
   - `GenerateThreejsCodeInput`, `GenerateThreejsCodeOutput` with class-validator decorators

7. **`agent-platform/src/skills/handlers/generate-threejs-code.handler.ts`**
   - Implements `SkillHandler<GenerateThreejsCodeInput, GenerateThreejsCodeOutput>`
   - Builds system + template-specific + user prompts
   - Calls Claude Agent SDK (`@anthropic-ai/sdk`)
   - Parses generated code blocks into files
   - Returns `SkillResult` with code file artifacts

8. **`agent-platform/src/prompt-registry/prompts/threejs-system.prompt.txt`**
   - System prompt: Three.js coding standards, WebGL patterns, output format

9. **`agent-platform/src/prompt-registry/prompts/{spin-wheel,quiz,scratch-card,memory-match}.prompt.txt`**
   - Template-specific prompts with game mechanics, interaction patterns, animation requirements

10. **`skills/catalog/generate_threejs_code.yaml`**
    - Skill descriptor with input/output schemas

### Phase 3: Bundle Enhancement

11. **`agent-platform/src/skills/handlers/bundle-game-template.handler.ts`** (MODIFY)
    - Inject `TemplateManifestLoaderService` and `TemplateConfigValidatorService`
    - Load manifest, validate config, invoke code generation, inject Three.js runtime
    - Assemble final bundle with generated code + assets

12. **`skills/catalog/bundle_game_template.yaml`** (MODIFY)
    - Update input schema with `scene_overrides` and `sealed_outcome_token`

### Phase 4: Bundle Validation

13. **`agent-platform/src/skills/handlers/validate-bundle.handler.ts`**
    - Puppeteer-based headless WebGL validation
    - Checks: HTML loads, WebGL context created, no JS errors, gameReady event fires, size under 5MB

14. **`skills/catalog/validate_bundle.yaml`**
    - Skill descriptor for validation

15. **`agent-platform/src/skills/services/skill-catalog.service.ts`** (MODIFY)
    - Register `GenerateThreejsCodeHandler` and `ValidateBundleHandler`

## Running Tests

```bash
pnpm --filter agent-platform test -- template-manifest-loader.service.spec.ts
pnpm --filter agent-platform test -- template-config-validator.service.spec.ts
pnpm --filter agent-platform test -- generate-threejs-code.handler.spec.ts
pnpm --filter agent-platform test -- bundle-game-template.handler.spec.ts
pnpm --filter agent-platform test -- validate-bundle.handler.spec.ts
```

## Verifying a Template End-to-End

```bash
# 1. Start infrastructure
docker compose up -d

# 2. Start agent-platform
pnpm --filter agent-platform dev

# 3. Trigger bundle generation via the run engine (example for spin wheel)
# The workflow step will:
#   a. Load spin_wheel manifest
#   b. Validate game_config
#   c. Generate Three.js code via Claude
#   d. Assemble bundle with assets
#   e. Validate bundle via headless render
#   f. Store bundle artifact

# 4. Check output
ls $ASSET_STORAGE_DIR/{tenantId}/{runId}/bundle/game/
# Should contain: index.html, scripts/, models/, textures/, audio/, bundle_manifest.json
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | Yes | - | Claude API key for code generation |
| `ASSET_STORAGE_DIR` | No | `/tmp/skills/assets` | Base directory for asset storage |
| `GAME_TEMPLATES_DIR` | No | `{repo_root}/templates/games` | Directory containing template manifests |
| `BUNDLE_VALIDATION_TIMEOUT_MS` | No | `15000` | Timeout for headless render validation |
| `CODE_GEN_MAX_RETRIES` | No | `3` | Max retry attempts for code generation |
| `CODE_GEN_MODEL` | No | `claude-opus-4-6` | Claude model for code generation |
