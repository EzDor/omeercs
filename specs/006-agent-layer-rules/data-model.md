# Data Model: Agent Layer Decision Rules

**Date**: 2026-01-22
**Branch**: `006-agent-layer-rules`

## Overview

This feature extends the existing skill infrastructure with template types for LLM operations. No new database entities are required - changes are to TypeScript interfaces and skill descriptor schemas.

---

## Entity: SkillDescriptor (Extended)

**Location**: `/skills/catalog/` (YAML files)
**Change Type**: Add optional `template_type` field

### New Field

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `template_type` | `'LLM_JSON_GENERATION' \| 'LLM_REVIEW' \| null` | No | Declares skill template pattern; null for custom handlers |

### Extended Schema

```yaml
# Existing fields remain unchanged
skill_id: string
version: string
title: string
description: string
tags: string[]
input_schema: JSONSchema
output_schema: JSONSchema
implementation:
  type: 'ts_function' | 'http_call' | 'cli_command'
  handler: string

# NEW: Template type declaration
template_type: 'LLM_JSON_GENERATION' | 'LLM_REVIEW' | null

# NEW: Template-specific configuration (when template_type is set)
template_config:
  # For LLM_JSON_GENERATION:
  prompt_id: string           # Reference to prompt in registry
  prompt_version?: string     # Optional version, defaults to latest
  model?: string              # Override default model
  temperature?: number        # Override default temperature
  retry_on_validation_failure?: boolean  # Default: true

  # For LLM_REVIEW:
  rubric_id: string           # Reference to rubric in registry
  rubric_version?: string     # Optional version, defaults to latest
  evaluation_model?: string   # Model for evaluation (separate from production)

# Existing fields continue...
produces_artifacts: [...]
policy: {...}
observability: {...}
```

---

## Entity: GenerationResult

**Location**: `/agent-platform/src/skills/skill-runner/interfaces/`
**Type**: New TypeScript interface

### Definition

```typescript
interface GenerationResult<T = unknown> {
  success: boolean;
  data?: T;
  rawResponse?: string;
  validationErrors?: SchemaValidationError[];
  attempts: number;
  timings_ms: {
    prompt_render: number;
    llm_call: number;
    validation: number;
    total: number;
  };
}
```

### Field Descriptions

| Field | Type | Description |
|-------|------|-------------|
| `success` | `boolean` | Whether generation produced valid output |
| `data` | `T` | Parsed, validated output (when success=true) |
| `rawResponse` | `string` | Raw LLM response text |
| `validationErrors` | `SchemaValidationError[]` | Ajv validation errors (when success=false) |
| `attempts` | `number` | Number of generation attempts (1-2) |
| `timings_ms` | `object` | Performance breakdown |

---

## Entity: ReviewResult

**Location**: `/agent-platform/src/skills/skill-runner/interfaces/`
**Type**: New TypeScript interface

### Definition

```typescript
interface ReviewResult {
  pass: boolean;
  issues: string[];
  suggested_fixes: string[];
  indeterminate: string[];
  criteria_results?: CriterionResult[];
  timings_ms: {
    evaluation: number;
    total: number;
  };
}

interface CriterionResult {
  criterion_id: string;
  criterion_name: string;
  verdict: 'pass' | 'fail' | 'indeterminate';
  reasoning: string;
  confidence: number;
  evidence?: string[];
}
```

### Field Descriptions

| Field | Type | Description |
|-------|------|-------------|
| `pass` | `boolean` | Overall review verdict |
| `issues` | `string[]` | Descriptions of failed criteria |
| `suggested_fixes` | `string[]` | Actionable fix recommendations |
| `indeterminate` | `string[]` | Criteria that couldn't be evaluated |
| `criteria_results` | `CriterionResult[]` | Detailed per-criterion breakdown (optional) |
| `timings_ms` | `object` | Performance breakdown |

---

## Entity: ReviewRubric (Extended)

**Location**: `/agent-platform/src/prompt-registry/rubrics/`
**Type**: Existing JSON files (add fields)

### Extended Schema

```json
{
  "rubric_id": "string",
  "version": "string (semver)",
  "description": "string",
  "scoring_mode": "binary | weighted",
  "pass_threshold": "number (for weighted mode)",
  "criteria": [
    {
      "id": "string",
      "name": "string",
      "description": "string",
      "pass_condition": "string",
      "fail_condition": "string",
      "weight": "number (default: 1)"
    }
  ],
  "output_schema": "JSONSchema (for structured review output)"
}
```

### New Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `scoring_mode` | `'binary' \| 'weighted'` | Yes | How to aggregate criterion results |
| `pass_threshold` | `number` | No | Score threshold for pass (weighted mode) |
| `criteria[].pass_condition` | `string` | Yes | What constitutes a pass |
| `criteria[].fail_condition` | `string` | Yes | What constitutes a fail |
| `criteria[].weight` | `number` | No | Weight for scoring (default: 1) |

---

## Entity: TemplateConfig

**Location**: `/agent-platform/src/skills/skill-runner/interfaces/`
**Type**: New TypeScript interfaces

### LLM_JSON_GENERATION Config

```typescript
interface LlmJsonGenerationConfig {
  prompt_id: string;
  prompt_version?: string;
  model?: string;
  temperature?: number;
  max_tokens?: number;
  retry_on_validation_failure?: boolean;
}
```

### LLM_REVIEW Config

```typescript
interface LlmReviewConfig {
  rubric_id: string;
  rubric_version?: string;
  evaluation_model?: string;
  include_criteria_details?: boolean;
}
```

---

## Relationships

```
┌─────────────────────────────────────────────────────────────────┐
│                      SkillDescriptor                            │
│  ┌───────────────┬────────────────┬────────────────────────┐   │
│  │ skill_id      │ template_type  │ template_config        │   │
│  │ version       │ (nullable)     │ (conditional)          │   │
│  │ input_schema  │                │                        │   │
│  │ output_schema │                │                        │   │
│  └───────────────┴───────┬────────┴─────────────┬──────────┘   │
└──────────────────────────┼──────────────────────┼──────────────┘
                           │                      │
           ┌───────────────┴───────┐    ┌────────┴──────────┐
           ▼                       ▼    ▼                    ▼
┌──────────────────────┐   ┌──────────────────────┐   ┌──────────────────┐
│   PromptTemplate     │   │    ReviewRubric      │   │   SkillHandler   │
│  (prompt_registry)   │   │  (prompt_registry)   │   │   (handlers/)    │
├──────────────────────┤   ├──────────────────────┤   ├──────────────────┤
│ prompt_id            │   │ rubric_id            │   │ (custom logic)   │
│ version              │   │ version              │   │                  │
│ vars_schema          │   │ criteria[]           │   │                  │
│ output_schema        │   │ scoring_mode         │   │                  │
│ template (Mustache)  │   │ pass_threshold       │   │                  │
└──────────────────────┘   └──────────────────────┘   └──────────────────┘
           │                          │
           │                          │
           ▼                          ▼
┌──────────────────────┐   ┌──────────────────────┐
│  GenerationResult    │   │    ReviewResult      │
├──────────────────────┤   ├──────────────────────┤
│ success              │   │ pass                 │
│ data                 │   │ issues[]             │
│ validationErrors[]   │   │ suggested_fixes[]    │
│ attempts             │   │ indeterminate[]      │
│ timings_ms           │   │ criteria_results[]   │
└──────────────────────┘   └──────────────────────┘
```

---

## State Transitions

### Generation Flow

```
Input Received
     │
     ▼
┌────────────────┐
│ VALIDATING     │ ← Validate input against input_schema
└───────┬────────┘
        │ valid
        ▼
┌────────────────┐
│ GENERATING     │ ← Call LLM with rendered prompt
└───────┬────────┘
        │
        ▼
┌────────────────┐    validation failed    ┌────────────────┐
│ VALIDATING_OUT │ ──────────────────────► │ RETRYING       │
└───────┬────────┘    (attempt < max)      └───────┬────────┘
        │ valid                                     │
        │                                           │ retry with errors
        ▼                                           ▼
┌────────────────┐                         ┌────────────────┐
│ COMPLETED      │                         │ GENERATING     │
│ (success=true) │                         │ (attempt 2)    │
└────────────────┘                         └───────┬────────┘
                                                   │
                                                   ▼
                                           ┌────────────────┐
                                           │ VALIDATING_OUT │
                                           └───────┬────────┘
                                                   │
                                    ┌──────────────┴──────────────┐
                                    │ valid                       │ invalid
                                    ▼                             ▼
                           ┌────────────────┐            ┌────────────────┐
                           │ COMPLETED      │            │ FAILED         │
                           │ (success=true) │            │ (success=false)│
                           └────────────────┘            └────────────────┘
```

### Review Flow

```
Asset Received
     │
     ▼
┌────────────────┐
│ LOADING_RUBRIC │ ← Load rubric from registry
└───────┬────────┘
        │
        ▼
┌────────────────┐
│ EVALUATING     │ ← Evaluate each criterion
└───────┬────────┘
        │
        ▼
┌────────────────┐
│ AGGREGATING    │ ← Combine criterion results
└───────┬────────┘
        │
        ▼
┌────────────────┐
│ COMPLETED      │ ← Return ReviewResult
└────────────────┘
```

---

## Validation Rules

### SkillDescriptor Validation

1. If `template_type` is set, `template_config` MUST be present
2. If `template_type === 'LLM_JSON_GENERATION'`:
   - `template_config.prompt_id` MUST exist in prompt registry
   - `output_schema` MUST be defined (for validation)
3. If `template_type === 'LLM_REVIEW'`:
   - `template_config.rubric_id` MUST exist in rubric registry
   - `output_schema` SHOULD match ReviewResult structure

### ReviewRubric Validation

1. `criteria` array MUST have at least one criterion
2. Each criterion MUST have unique `id`
3. If `scoring_mode === 'weighted'`, `pass_threshold` SHOULD be defined
4. `weight` values MUST be positive numbers

### GenerationResult Validation

1. If `success === true`, `data` MUST be present
2. If `success === false`, `validationErrors` SHOULD be present
3. `attempts` MUST be >= 1

### ReviewResult Validation

1. `issues` MUST be non-empty if `pass === false` (unless only indeterminate)
2. `indeterminate` items MUST NOT also appear in `issues`
3. If `criteria_results` present, length MUST match rubric criteria count
