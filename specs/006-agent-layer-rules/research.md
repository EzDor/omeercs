# Research: Agent Layer Decision Rules

**Date**: 2026-01-22
**Branch**: `006-agent-layer-rules`

## Research Questions

1. Best practices for structured JSON output from LLMs (schema enforcement)
2. Retry strategies with error injection into prompts
3. Rubric-based LLM evaluation/review patterns
4. Integration with existing LiteLLM proxy setup

---

## Decision 1: Structured JSON Output Approach

### Decision
Use **provider-native structured output mechanisms** when available (Claude/OpenAI `response_format.json_schema` with `strict: true`), with **validation loop fallback** for unsupported models.

### Rationale
- Native constrained decoding provides 100% schema compliance at token generation level (vs. <40% with prompting)
- Eliminates JSON parsing failures entirely
- Reduces API costs by 50% through fewer retries
- LiteLLM already supports `response_format` parameter in `ChatCompletionRequest`

### Alternatives Considered

| Alternative | Why Rejected |
|-------------|--------------|
| Prompt-only enforcement | 40-60% compliance rate, unreliable |
| Post-hoc parsing with retries | Higher latency, 2-3x API costs |
| Tool/function calling for structure | More complex, not all models support |
| Client-side-only validation | No constrained decoding benefit |

### Implementation Pattern
```typescript
// For supported models (Claude Sonnet 4+, GPT-4o, Gemini 2.0+)
response_format: {
  type: 'json_schema',
  json_schema: {
    name: 'output_schema',
    schema: { /* JSON Schema */ },
    strict: true
  }
}

// Post-validation always required for numerical constraints (min/max)
const validation = schemaValidator.validateOutput(schema, parsed);
```

---

## Decision 2: Schema Validation Failure Handling

### Decision
Implement **single auto-retry with validation error injection** - inject specific Ajv validation errors into the retry prompt, reduce temperature, max 1 retry for schema failures.

### Rationale
- Aligns with spec clarification: "auto-retry once with validation error injected into prompt"
- Research shows 10-15% improvement with chain-of-thought retry
- Diminishing returns after 2-3 retries
- Temperature reduction (0.7 → 0.2) improves determinism on retry

### Implementation Pattern
```typescript
// On validation failure, build retry prompt:
const retryPrompt = `Your previous response failed validation with these errors:
${errors.map(e => `- ${e.field}: ${e.message}`).join('\n')}

Please correct the output to match the schema. Ensure all required fields are present with correct types.`;

// Append to messages and retry with lower temperature
messages.push({ role: 'assistant', content: previousResponse });
messages.push({ role: 'user', content: retryPrompt });
temperature = 0.2; // Reduced from original
```

---

## Decision 3: LLM API Failure Handling

### Decision
Implement **exponential backoff with max 3 attempts** for transient LLM API failures (timeout, rate limit, provider errors).

### Rationale
- Aligns with spec clarification: "Retry with exponential backoff (max 3 attempts)"
- Existing `RetryUtil.withBackoff` in common package provides this pattern
- Exponential delays: 2s, 4s, 8s (protects against rate limiting)
- Distinct from schema validation retry (API errors vs. content errors)

### Implementation Pattern
```typescript
// Use existing RetryUtil
await RetryUtil.withBackoff(
  () => this.litellmClient.chatCompletion(request),
  {
    maxRetries: 3,
    backoffMultiplier: 2,
    logger,
    operationName: 'llm_generation'
  }
);
// Delays: 2s, 4s, 8s
```

---

## Decision 4: Rubric-Based Review Structure

### Decision
Use **binary scoring per criterion** with structured review output containing `pass`, `issues`, `suggested_fixes`, and `indeterminate` arrays.

### Rationale
- Binary (Pass/Fail) scoring has 95%+ consistency vs. lower for multi-point scales
- Aligns with FR-004: structured format containing pass, issues, suggested_fixes, indeterminate
- Separate evaluation per criterion enables granular feedback
- Chain-of-thought reasoning before verdict improves quality

### Review Result Schema
```typescript
interface ReviewResult {
  pass: boolean;           // Overall verdict
  issues: string[];        // Failed criteria descriptions
  suggested_fixes: string[]; // Actionable recommendations
  indeterminate: string[]; // Criteria that couldn't be evaluated
  criteria_results?: CriterionResult[]; // Optional detailed breakdown
}

interface CriterionResult {
  criterion_id: string;
  verdict: 'pass' | 'fail' | 'indeterminate';
  reasoning: string;
  confidence: number; // 0-100
}
```

---

## Decision 5: Indeterminate Criteria Handling

### Decision
Mark criteria as **"indeterminate"** when LLM cannot confidently evaluate, continue with evaluable criteria, include in result.

### Rationale
- Aligns with spec clarification: "Mark those specific criteria as 'indeterminate' in the result"
- Provides transparency about evaluation limitations
- Allows downstream consumers to decide if human review needed
- Doesn't block workflow for uncertainty

### Detection Pattern
```typescript
// Criteria marked indeterminate when:
// 1. LLM explicitly states uncertainty (confidence < 50)
// 2. Criterion requires external data not available
// 3. Criterion requires human judgment (subjective)

// In aggregate verdict logic:
if (results.some(r => r.verdict === 'indeterminate')) {
  // Only fail overall if pass criteria also fail
  // Indeterminate alone doesn't cause overall failure
}
```

---

## Decision 6: Skill Template Type Architecture

### Decision
Create **service classes** (`LlmGenerationService`, `LlmReviewService`) that encapsulate template-specific logic, invoked by existing SkillRunnerService based on `template_type` field in skill descriptor.

### Rationale
- Preserves existing SkillRunnerService orchestration pattern
- New services are injectable, testable, composable
- Skill descriptors gain `template_type` field to declare pattern
- Handlers become thin wrappers that delegate to template services

### Architecture
```
SkillDescriptor (YAML)
  └── template_type: 'LLM_JSON_GENERATION' | 'LLM_REVIEW' | null

SkillRunnerService.execute()
  ├── (existing logic: resolve, validate, context)
  ├── if template_type === 'LLM_JSON_GENERATION'
  │     └── delegate to LlmGenerationService
  ├── if template_type === 'LLM_REVIEW'
  │     └── delegate to LlmReviewService
  └── else: use handler directly (backward compatible)
```

---

## Decision 7: Generate-Review-Retry Pattern

### Decision
Implement **utility function** for generate-review-retry pattern that composes LlmGenerationService and LlmReviewService with `retry_once` option.

### Rationale
- MVP substitute for LangGraph loops (per spec)
- Simple code pattern, no complex orchestration framework
- `retry_once=true` triggers one regeneration with critique suggestions
- Reusable across skills that need quality gates

### Implementation Pattern
```typescript
async function generateWithReview<T>(
  input: GenerationInput,
  schema: JSONSchema,
  rubric: ReviewRubric,
  options: { retryOnce?: boolean } = {}
): Promise<GenerationResult<T>> {

  // Step 1: Generate
  let result = await llmGenerationService.generate(input, schema);
  if (!result.success) return result;

  // Step 2: Review
  const review = await llmReviewService.review(result.data, rubric);
  if (review.pass) return { ...result, review };

  // Step 3: Retry (if enabled and review failed)
  if (options.retryOnce && !review.pass) {
    const retryInput = {
      ...input,
      critique: {
        issues: review.issues,
        suggestions: review.suggested_fixes
      }
    };
    result = await llmGenerationService.generate(retryInput, schema);
    const retryReview = await llmReviewService.review(result.data, rubric);
    return { ...result, review: retryReview, retried: true };
  }

  return { ...result, review };
}
```

---

## Model Capabilities Matrix

| Model | Structured Output | Recommended Use |
|-------|------------------|-----------------|
| Claude Sonnet 4.5 | Native (strict: true) | Primary generation model |
| Claude Opus 4 | Native (strict: true) | High-quality review/evaluation |
| GPT-4o | Native (strict: true) | Alternative generation |
| GPT-4o-mini | Native (strict: true) | High-volume, cost-sensitive |
| Gemini 2.0+ | Native (responseJsonSchema) | Google ecosystem |
| Gemini 1.5 | Validation loop only | Legacy support |

---

## Performance Targets

| Metric | Target | Measurement |
|--------|--------|-------------|
| Schema compliance | >98% | Validation pass rate |
| Retry frequency | <5% | Retries / total requests |
| Review consistency | >95% | Same input → same verdict |
| Schema validation latency | <100ms | P95 validation time |
| Total skill execution | <60s | Within existing timeout |

---

## References

- Claude Structured Outputs: https://platform.claude.com/docs/en/build-with-claude/structured-outputs
- OpenAI Structured Outputs: https://platform.openai.com/docs/guides/structured-outputs
- LLM-as-a-Judge Best Practices: https://towardsdatascience.com/llm-as-a-judge-a-practical-guide/
- Existing Codebase: `/agent-platform/src/skills/skill-runner/`, `/common/src/llm/`
