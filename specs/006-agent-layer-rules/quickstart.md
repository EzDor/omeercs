# Quickstart: Agent Layer Decision Rules

**Branch**: `006-agent-layer-rules`
**Date**: 2026-01-22

## Overview

This guide helps you get started with the LLM skill templates for schema-validated JSON generation and rubric-based review.

---

## Prerequisites

- Node.js 20.x
- pnpm installed
- Docker running (for PostgreSQL, Redis, LiteLLM)
- LiteLLM configured with at least one provider (Anthropic, OpenAI, or Gemini)

---

## Quick Start

### 1. Start Infrastructure

```bash
docker compose up -d
```

### 2. Install Dependencies

```bash
pnpm install
pnpm -r build  # Build all packages
```

### 3. Start Agent Platform

```bash
pnpm --filter agent-platform dev
```

---

## Using LLM_JSON_GENERATION Template

### Step 1: Create a Prompt Template

Create a prompt in `agent-platform/src/prompt-registry/prompts/`:

```markdown
---
prompt_id: my_json_generator
version: 1.0.0
description: Generate structured JSON from input
vars_schema:
  type: object
  properties:
    input_data:
      type: string
  required:
    - input_data
model_defaults:
  temperature: 0.7
  max_tokens: 2000
output_schema:
  type: object
  properties:
    result:
      type: string
    items:
      type: array
      items:
        type: string
  required:
    - result
    - items
---
Generate a JSON response based on the following input:

{{input_data}}

Respond with valid JSON matching the expected schema.
```

### Step 2: Create a Skill Descriptor

Create a skill in `agent-platform/src/skills/catalog/`:

```yaml
skill_id: my_json_skill
version: 1.0.0
title: My JSON Generator Skill
description: Generates structured JSON using LLM
tags:
  - generation
  - json

template_type: LLM_JSON_GENERATION
template_config:
  prompt_id: my_json_generator
  prompt_version: 1.0.0
  retry_on_validation_failure: true

input_schema:
  type: object
  properties:
    input_data:
      type: string
  required:
    - input_data

output_schema:
  type: object
  properties:
    result:
      type: string
    items:
      type: array
      items:
        type: string
  required:
    - result
    - items

implementation:
  type: ts_function
  handler: null  # Template handles execution

policy:
  max_runtime_sec: 60
  network: allowlist
  allowed_hosts:
    - localhost:4000  # LiteLLM proxy
```

### Step 3: Invoke the Skill

```typescript
const result = await skillRunnerService.execute('my_json_skill', {
  input_data: 'List three programming languages',
});

if (result.ok) {
  console.log(result.data);
  // { result: "Here are three languages", items: ["Python", "TypeScript", "Rust"] }
} else {
  console.error(result.error, result.error_code);
}
```

---

## Using LLM_REVIEW Template

### Step 1: Create a Review Rubric

Create a rubric in `agent-platform/src/prompt-registry/rubrics/`:

```json
{
  "rubric_id": "my_quality_rubric",
  "version": "1.0.0",
  "description": "Evaluates content quality",
  "scoring_mode": "binary",
  "criteria": [
    {
      "id": "has_items",
      "name": "Contains Items",
      "description": "Output must contain at least one item",
      "pass_condition": "The items array has at least one element",
      "fail_condition": "The items array is empty",
      "weight": 1
    },
    {
      "id": "relevant_content",
      "name": "Content Relevance",
      "description": "Items must be relevant to the request",
      "pass_condition": "All items are relevant to the input request",
      "fail_condition": "Items are unrelated or nonsensical",
      "weight": 2
    }
  ]
}
```

### Step 2: Create a Review Skill Descriptor

```yaml
skill_id: my_review_skill
version: 1.0.0
title: My Review Skill
description: Reviews generated content against quality rubric
tags:
  - review
  - quality

template_type: LLM_REVIEW
template_config:
  rubric_id: my_quality_rubric
  rubric_version: 1.0.0
  include_criteria_details: true

input_schema:
  type: object
  properties:
    asset:
      type: object
      description: The content to review
  required:
    - asset

output_schema:
  type: object
  properties:
    pass:
      type: boolean
    issues:
      type: array
      items:
        type: string
    suggested_fixes:
      type: array
      items:
        type: string
    indeterminate:
      type: array
      items:
        type: string
  required:
    - pass
    - issues
    - suggested_fixes
    - indeterminate

implementation:
  type: ts_function
  handler: null  # Template handles execution

policy:
  max_runtime_sec: 30
  network: allowlist
  allowed_hosts:
    - localhost:4000
```

### Step 3: Invoke the Review Skill

```typescript
const reviewResult = await skillRunnerService.execute('my_review_skill', {
  asset: {
    result: 'Here are three languages',
    items: ['Python', 'TypeScript', 'Rust'],
  },
});

if (reviewResult.ok) {
  const { pass, issues, suggested_fixes, indeterminate } = reviewResult.data;
  if (pass) {
    console.log('Content passed review!');
  } else {
    console.log('Issues found:', issues);
    console.log('Suggested fixes:', suggested_fixes);
  }
}
```

---

## Generate-Review-Retry Pattern

### Using the Utility Function

```typescript
import { generateWithReview } from './services/generate-review-retry.service';

const result = await generateWithReview(
  { variables: { input_data: 'List programming languages' } },
  {
    generation: {
      promptId: 'my_json_generator',
      outputSchema: myOutputSchema,
    },
    review: {
      rubricId: 'my_quality_rubric',
    },
    retryOnce: true, // Enable retry if review fails
  }
);

if (result.success) {
  console.log('Final output:', result.data);
  console.log('Retried:', result.retried);
} else {
  console.log('Failed review issues:', result.reviewResult.issues);
}
```

---

## Agent Usage Policy Summary

### Use Claude Agent SDK (via LLM templates) for:

| Use Case | Template Type | Example |
|----------|---------------|---------|
| Structured config/code generation | `LLM_JSON_GENERATION` | Campaign plan, game config |
| Review/critique | `LLM_REVIEW` | Asset quality check |

### Do NOT use Claude for:

- Global workflow orchestration (use Run Engine DAG)
- Multi-step reasoning loops (defer to LangGraph later)

### Decision Heuristic

| Pattern | Solution |
|---------|----------|
| DAG + invalidation + partial rebuild | Run Engine |
| Bounded generation/critique within a step | Claude Agent SDK (LLM templates) |
| Repeated reasoning loops / branching | LangGraph (future) |

---

## Troubleshooting

### Schema Validation Fails

1. Check output schema matches prompt's expected output
2. Ensure `additionalProperties: false` if using strict mode
3. Review validation errors in result for specific field issues

### Review Returns Indeterminate

1. Criterion may require information not available in context
2. Add more context via `context.schema` or `context.originalInput`
3. Consider if criterion is evaluable by LLM

### Retry Not Improving Results

1. Check if issues are actionable (vague issues = vague fixes)
2. Ensure prompt template handles `critique` variable
3. Consider if the task is suitable for single-retry pattern

---

## Next Steps

1. Read the full [Agent Usage Policy](../agent-platform/docs/agent-usage-policy.md)
2. Review example skills in `skills/catalog/`
3. Create custom rubrics for your domain
