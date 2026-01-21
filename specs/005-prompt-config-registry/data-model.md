# Data Model: Prompt & Config Registry

**Date**: 2026-01-20
**Feature**: 005-prompt-config-registry

## Overview

The Prompt Registry uses a file-based storage model with in-memory caching at startup. No database entities are created for template storage. Debug data is stored in existing `run_steps` entity via JSONB fields.

## File-Based Entities

### 1. PromptTemplate (File: `agent-platform/prompts/<id>/<version>.md`)

A versioned prompt template with metadata and variable schema.

**File Structure**: Markdown with YAML frontmatter

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| prompt_id | string | Yes | Unique identifier (matches directory name) |
| version | string (semver) | Yes | Semantic version (matches filename) |
| description | string | Yes | Human-readable purpose |
| vars_schema | JSON Schema | Yes | Schema for template variables |
| model_defaults | object | No | Preferred LLM settings |
| model_defaults.model | string | No | Model identifier (e.g., "gemini/gemini-2.0-flash") |
| model_defaults.temperature | number | No | Temperature (0-2) |
| model_defaults.max_tokens | number | No | Maximum output tokens |
| output_schema | JSON Schema | No | Expected output structure for validation |
| template | string (body) | Yes | Mustache template content (after frontmatter) |

**Validation Rules**:
- prompt_id must match `/^[a-z][a-z0-9_]*$/` (lowercase, underscores, start with letter)
- version must be valid semver
- vars_schema must be valid JSON Schema (draft-07)
- All `{{variable}}` tokens must have corresponding vars_schema properties
- output_schema (if present) must be valid JSON Schema

**Example File** (`agent-platform/prompts/campaign_plan/1.0.0.md`):
```markdown
---
prompt_id: campaign_plan
version: 1.0.0
description: Generate a marketing campaign plan from a brief
vars_schema:
  type: object
  required:
    - brand_name
    - campaign_goal
  properties:
    brand_name:
      type: string
    campaign_goal:
      type: string
      enum: [awareness, engagement, conversion]
    tone:
      type: string
      default: professional
model_defaults:
  model: gemini/gemini-2.0-flash
  temperature: 0.7
  max_tokens: 2000
---

You are a marketing strategist for {{brand_name}}.

Create a {{campaign_goal}} campaign with a {{tone}} tone.

Return your plan as a JSON object.
```

---

### 2. ConfigTemplate (File: `agent-platform/configs/<id>/<version>.json`)

A versioned configuration template with variable substitution.

**File Structure**: JSON

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| config_id | string | Yes | Unique identifier (matches directory name) |
| version | string (semver) | Yes | Semantic version (matches filename) |
| description | string | Yes | Human-readable purpose |
| vars_schema | JSON Schema | Yes | Schema for template variables |
| template | object | Yes | Configuration object with `{{variable}}` placeholders |

**Validation Rules**:
- config_id must match `/^[a-z][a-z0-9_]*$/`
- version must be valid semver
- vars_schema must be valid JSON Schema
- Template object values may contain `{{variable}}` syntax

**Example File** (`agent-platform/configs/game_settings/1.0.0.json`):
```json
{
  "config_id": "game_settings",
  "version": "1.0.0",
  "description": "Game difficulty configuration",
  "vars_schema": {
    "type": "object",
    "required": ["difficulty"],
    "properties": {
      "difficulty": {
        "type": "string",
        "enum": ["easy", "medium", "hard"]
      },
      "player_count": {
        "type": "integer",
        "default": 1
      }
    }
  },
  "template": {
    "difficulty": "{{difficulty}}",
    "max_players": "{{player_count}}",
    "time_limit_seconds": 300,
    "settings": {
      "hints_enabled": true,
      "mode": "{{difficulty}}_mode"
    }
  }
}
```

---

### 3. ReviewRubric (File: `agent-platform/rubrics/<id>/<version>.json`)

A versioned quality review rubric with scoring criteria.

**File Structure**: JSON

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| rubric_id | string | Yes | Unique identifier (matches directory name) |
| version | string (semver) | Yes | Semantic version (matches filename) |
| description | string | Yes | Human-readable purpose |
| criteria | array | Yes | List of evaluation criteria |
| criteria[].name | string | Yes | Criterion identifier |
| criteria[].description | string | Yes | What is being evaluated |
| criteria[].scoring_guidance | string | Yes | How to score (e.g., "1=poor, 5=excellent") |
| criteria[].weight | number | No | Relative importance (0-1), defaults to equal weight |
| output_schema | JSON Schema | Yes | Expected critique output structure |

**Validation Rules**:
- rubric_id must match `/^[a-z][a-z0-9_]*$/`
- version must be valid semver
- criteria array must have at least one item
- If weights provided, sum should equal 1.0
- output_schema must be valid JSON Schema

**Example File** (`agent-platform/rubrics/asset_quality/1.0.0.json`):
```json
{
  "rubric_id": "asset_quality",
  "version": "1.0.0",
  "description": "Quality assessment rubric for generated assets",
  "criteria": [
    {
      "name": "visual_clarity",
      "description": "Image is clear and well-composed",
      "scoring_guidance": "1=blurry/unclear, 3=acceptable, 5=crisp/professional",
      "weight": 0.3
    },
    {
      "name": "brand_alignment",
      "description": "Asset matches brand guidelines",
      "scoring_guidance": "1=off-brand, 3=neutral, 5=on-brand",
      "weight": 0.4
    },
    {
      "name": "creativity",
      "description": "Asset shows creative execution",
      "scoring_guidance": "1=generic, 3=adequate, 5=innovative",
      "weight": 0.3
    }
  ],
  "output_schema": {
    "type": "object",
    "required": ["scores", "overall_score", "feedback"],
    "properties": {
      "scores": {
        "type": "object",
        "additionalProperties": {
          "type": "number",
          "minimum": 1,
          "maximum": 5
        }
      },
      "overall_score": {
        "type": "number",
        "minimum": 1,
        "maximum": 5
      },
      "feedback": {
        "type": "string"
      }
    }
  }
}
```

---

## In-Memory Data Structures

### PromptRegistry (Service State)

```typescript
interface PromptRegistryState {
  prompts: Map<string, Map<string, LoadedPromptTemplate>>;  // prompt_id → version → template
  configs: Map<string, Map<string, LoadedConfigTemplate>>;  // config_id → version → template
  rubrics: Map<string, Map<string, LoadedReviewRubric>>;    // rubric_id → version → rubric

  promptVersions: Map<string, string[]>;  // prompt_id → sorted versions (descending)
  configVersions: Map<string, string[]>;  // config_id → sorted versions (descending)
  rubricVersions: Map<string, string[]>;  // rubric_id → sorted versions (descending)
}

interface LoadedPromptTemplate {
  promptId: string;
  version: string;
  description: string;
  template: string;
  varsSchema: JSONSchema;
  modelDefaults?: ModelDefaults;
  outputSchema?: JSONSchema;
  compiledVarsValidator: ValidateFunction;  // Ajv compiled validator
  extractedVariables: string[];  // Variables found in template
}

interface LoadedConfigTemplate {
  configId: string;
  version: string;
  description: string;
  template: Record<string, unknown>;
  varsSchema: JSONSchema;
  compiledVarsValidator: ValidateFunction;
}

interface LoadedReviewRubric {
  rubricId: string;
  version: string;
  description: string;
  criteria: RubricCriterion[];
  outputSchema: JSONSchema;
  compiledOutputValidator: ValidateFunction;
}
```

---

## Integration with Existing Entities

### RunStep.debug Enhancement

The existing `run_steps` entity has a JSONB `debug` field. We extend the debug data structure to include resolved prompt information.

**Existing Entity**: `dao/src/entities/run-step.entity.ts`

**Enhanced Debug Structure** (no schema change needed - JSONB is flexible):

```typescript
interface RunStepDebugData {
  // Existing fields (from SkillDebugInfo)
  logs_uri?: string;
  timings_ms: Record<string, number>;
  provider_calls?: ProviderCallDebug[];
}

interface ProviderCallDebug {
  provider: string;
  model: string;
  prompt_tokens?: number;
  completion_tokens?: number;
  latency_ms?: number;

  // New fields for prompt registry integration
  registry_prompt?: {
    prompt_id: string;
    prompt_version: string;
    vars_provided: Record<string, unknown>;
    resolved_prompt: string;  // Full text if <10KB, otherwise hash
    resolved_prompt_hash?: string;  // SHA-256 if full text omitted
  };
}
```

---

## State Transitions

### Template Loading (Startup)

```
[File System] → [Validate] → [Compile Schema] → [Cache in Memory]
      ↓              ↓
   on error      log error
                 skip file
                 (continue loading others)
```

### Prompt Rendering (Runtime)

```
[Request] → [Lookup Template] → [Validate Vars] → [Render] → [Return Result]
                   ↓                   ↓              ↓
               not found           invalid        success
                   ↓                   ↓              ↓
               RegistryError    ValidationError   ResolvedPrompt
```

---

## Relationships

```
┌─────────────────────────────────────────────────────────────┐
│              File System (agent-platform/)                   │
├─────────────────────────────────────────────────────────────┤
│  prompts/          configs/           rubrics/              │
│     └── id/           └── id/            └── id/            │
│         └── ver.md        └── ver.json       └── ver.json   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼ (load at startup)
┌─────────────────────────────────────────────────────────────┐
│                 PromptRegistryService                        │
├─────────────────────────────────────────────────────────────┤
│  prompts: Map<id, Map<version, LoadedPromptTemplate>>       │
│  configs: Map<id, Map<version, LoadedConfigTemplate>>       │
│  rubrics: Map<id, Map<version, LoadedReviewRubric>>         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼ (inject into)
┌─────────────────────────────────────────────────────────────┐
│                 ExecutionContext                             │
├─────────────────────────────────────────────────────────────┤
│  promptRegistry: PromptRegistryService                       │
│  workspace: Workspace                                        │
│  logger: Logger                                              │
│  secrets: SecretsService                                     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼ (used by skills, recorded in)
┌─────────────────────────────────────────────────────────────┐
│                 RunStep (existing entity)                    │
├─────────────────────────────────────────────────────────────┤
│  debug: JSONB {                                              │
│    provider_calls: [{ registry_prompt: {...} }]             │
│  }                                                           │
└─────────────────────────────────────────────────────────────┘
```
