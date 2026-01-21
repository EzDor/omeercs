# Research: Prompt & Config Registry

**Date**: 2026-01-20
**Feature**: 005-prompt-config-registry

## Research Topics

### 1. Template Engine Selection

**Decision**: Mustache

**Rationale**:
- Logic-less templates align with prompt registry goals (data-driven, not logic-driven)
- Native `{{variable}}` syntax matches spec requirements
- Lightweight (~3KB) with no dependencies
- Well-documented specification with predictable behavior
- Widely used in prompt engineering (e.g., LangChain, Semantic Kernel)
- Supports nested object access via dot notation (`{{user.name}}`)

**Alternatives Considered**:

| Engine | Pros | Cons | Verdict |
|--------|------|------|---------|
| Handlebars | More features (helpers, partials), TypeScript support | Overkill for simple variable substitution, larger footprint | Rejected - unnecessary complexity |
| Nunjucks | Powerful, Jinja-like | Logic in templates (anti-pattern for prompts), larger | Rejected - encourages logic in prompts |
| Template literals | Native JS, simple | No schema validation, manual escaping | Rejected - lacks validation |
| Custom regex | Full control | Error-prone, maintenance burden | Rejected - reinventing wheel |

**Implementation Notes**:
- Use `mustache` npm package (official JS implementation)
- Mustache doesn't validate missing variables by default - need custom pre-validation against vars_schema
- Use `Mustache.parse()` to extract variable names before rendering for validation
- Mustache silently renders missing variables as empty strings - must validate before render

---

### 2. Template File Format (Prompt Templates)

**Decision**: Markdown with YAML frontmatter

**Rationale**:
- Markdown allows rich prompt formatting (headers, lists, code blocks)
- YAML frontmatter is standard for metadata (used by Jekyll, Hugo, Docusaurus)
- Clear separation between metadata and template content
- Easy to edit in any text editor
- Git-friendly for version control

**Format Structure**:
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
      description: The brand or product name
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
output_schema:
  type: object
  required:
    - plan_summary
    - tactics
  properties:
    plan_summary:
      type: string
    tactics:
      type: array
      items:
        type: object
---

# Campaign Planning Prompt

You are a marketing strategist for {{brand_name}}.

## Objective
Create a {{campaign_goal}} campaign with a {{tone}} tone.

## Output Format
Return a JSON object with plan_summary and tactics array.
```

**Alternatives Considered**:

| Format | Pros | Cons | Verdict |
|--------|------|------|---------|
| Pure JSON | Schema-native, strict typing | Hard to write multi-line prompts, no formatting | Rejected - poor DX |
| TOML + MD | Clean separation | Less common, another parser | Rejected - adds dependency |
| JS/TS files | Full typing, IDE support | Code in templates, security concerns | Rejected - violates separation |

**Implementation Notes**:
- Use `gray-matter` npm package for YAML frontmatter parsing
- Validate frontmatter against a meta-schema at load time
- Template content is everything after the `---` closing delimiter

---

### 3. Versioning Strategy

**Decision**: Semantic versioning (semver) with file-based storage

**Rationale**:
- Semver is industry standard and well-understood
- File structure `agent-platform/prompts/<id>/<version>.md` is simple and discoverable
- "Latest version" resolved by semver sorting, not timestamps
- Breaking changes to prompt structure = major version bump
- New variables = minor version bump
- Prompt text refinements = patch version bump

**Version Resolution**:
```typescript
// When version is omitted, return latest
getPrompt("campaign_plan") → returns 1.2.3 (highest semver)

// When version is specified, exact match
getPrompt("campaign_plan", "1.0.0") → returns 1.0.0 or error if not found
```

**Implementation Notes**:
- Use `semver` npm package for version comparison
- Cache sorted version list per prompt_id at startup
- Version string must be valid semver (validated at load time)

---

### 4. Variable Validation Strategy

**Decision**: Two-phase validation using existing SchemaValidatorService

**Rationale**:
- Reuse existing Ajv-based SchemaValidatorService (already in codebase)
- Load-time validation: vars_schema itself must be valid JSON Schema
- Render-time validation: provided variables must match vars_schema
- Fail fast before LLM call to prevent wasted API costs

**Validation Flow**:
```
1. Load template → validate vars_schema is valid JSON Schema
2. Call renderPrompt(id, version, vars)
   → validate vars against vars_schema
   → if invalid, return error with missing/invalid fields
   → if valid, render template with Mustache
3. Return rendered prompt
```

**Implementation Notes**:
- SchemaValidatorService already handles human-readable error messages
- Add `useDefaults: true` to Ajv config to apply default values from schema
- Validate that all `{{variable}}` tokens in template have corresponding schema properties

---

### 5. Integration with SkillRunner

**Decision**: Inject PromptRegistryService into SkillRunner execution context

**Rationale**:
- Skills need access to prompts during execution
- ExecutionContext already provides workspace, logger, secrets
- Add `promptRegistry` to ExecutionContext interface
- SkillRunner records resolved prompts in result.debug.provider_calls

**Integration Pattern**:
```typescript
// In skill handler
async execute(input: Input, ctx: ExecutionContext): Promise<Output> {
  const prompt = await ctx.promptRegistry.renderPrompt(
    "campaign_plan",
    "1.0.0",
    { brand_name: input.brand, campaign_goal: input.goal }
  );

  const response = await ctx.llm.chat({ messages: [{ role: "user", content: prompt.content }] });

  // Resolved prompt automatically recorded via ctx wrapper
  return { plan: response.content };
}
```

**Implementation Notes**:
- PromptRegistryService injected into ExecutionContextService
- Wrap renderPrompt to capture resolved prompt in debug data
- Store in `SkillProviderCall` structure (already exists in SkillDebugInfo)

---

### 6. Debug Recording Strategy

**Decision**: Store resolved prompts in existing SkillDebugInfo.provider_calls

**Rationale**:
- Existing structure `SkillProviderCall` captures model, prompt, response
- No schema changes needed - just populate existing fields
- Debug info flows from SkillResult → run_steps via RunEngineService

**Data Structure** (existing, to be populated):
```typescript
interface SkillProviderCall {
  provider: string;      // "litellm"
  model: string;         // "gemini/gemini-2.0-flash"
  prompt_tokens?: number;
  completion_tokens?: number;
  latency_ms?: number;
  // Add: resolved_prompt for debugging
  metadata?: {
    prompt_id?: string;
    prompt_version?: string;
    resolved_prompt?: string; // or hash if too large
    vars_used?: Record<string, unknown>;
  };
}
```

**Implementation Notes**:
- If resolved prompt > 10KB, store hash + vars instead of full text
- Provider calls array can have multiple entries per skill step
- Logged to run_steps.debug via existing flow

---

### 7. Config Template Format

**Decision**: JSON with embedded vars_schema

**Rationale**:
- Config templates produce JSON output, so JSON format is natural
- Same variable syntax `{{variable}}` for consistency
- vars_schema inline for self-contained files

**Format Structure**:
```json
{
  "config_id": "game_settings",
  "version": "1.0.0",
  "description": "Game difficulty configuration",
  "vars_schema": {
    "type": "object",
    "required": ["difficulty"],
    "properties": {
      "difficulty": { "type": "string", "enum": ["easy", "medium", "hard"] }
    }
  },
  "template": {
    "difficulty": "{{difficulty}}",
    "enemy_count": "{{#if_hard}}50{{/if_hard}}{{^if_hard}}20{{/if_hard}}",
    "time_limit": 300
  }
}
```

**Implementation Notes**:
- Render template object recursively, substituting variables in string values
- Non-string values (numbers, booleans) pass through unchanged
- Mustache sections can provide conditional logic for config values

---

### 8. Rubric Format

**Decision**: JSON with criteria array and output_schema

**Rationale**:
- Rubrics are structured data (criteria list with scoring guidance)
- output_schema defines expected critique format
- No variable substitution needed (rubrics are static definitions)

**Format Structure**:
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
    }
  ],
  "output_schema": {
    "type": "object",
    "required": ["scores", "overall_score", "feedback"],
    "properties": {
      "scores": {
        "type": "object",
        "additionalProperties": { "type": "number", "minimum": 1, "maximum": 5 }
      },
      "overall_score": { "type": "number" },
      "feedback": { "type": "string" }
    }
  }
}
```

---

## Dependencies to Add

| Package | Version | Purpose |
|---------|---------|---------|
| mustache | ^4.2.0 | Template rendering |
| gray-matter | ^4.0.3 | YAML frontmatter parsing |
| semver | ^7.6.0 | Version comparison |

Note: `ajv` and `ajv-formats` already present via SchemaValidatorService.

---

## Open Questions (Resolved)

1. **Multi-tenancy**: Resolved in spec clarification → Global (shared across all tenants)
2. **Hot reload**: Deferred to future enhancement → Startup-load only for MVP
3. **Template inheritance**: Not needed for MVP → Single-level templates only
4. **Template storage location**: Colocated within `agent-platform/` (prompts/, configs/, rubrics/) since agent-platform is the only service that uses them
