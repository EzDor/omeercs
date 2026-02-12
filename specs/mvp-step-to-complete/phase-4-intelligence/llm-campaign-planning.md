# LLM Campaign Planning

## Purpose
Use LLM to generate campaign plans from natural language briefs. Given a marketing brief (product, audience, goals), the system generates a structured campaign plan including template recommendation, theme, prizes, and asset requirements.

## User Stories

### P1 (Critical)
- US1: As a marketer, I want to describe my campaign in plain English so that I don't need to configure everything manually
- US2: As a marketer, I want AI-recommended template types so that I pick the best game for my goals
- US3: As a marketer, I want a generated campaign plan I can review and edit so that I stay in control

### P2 (Important)
- US4: As a marketer, I want the plan to include prize suggestions based on my budget so that I have realistic options
- US5: As a marketer, I want multiple plan variations so that I can compare approaches
- US6: As a developer, I want the plan output to be structured JSON so that it can feed directly into the campaign builder

### P3 (Nice to Have)
- US7: As a marketer, I want to refine the plan through conversation so that I can iterate on the AI's suggestions
- US8: As a marketer, I want the AI to learn from my previous campaigns so that suggestions improve over time

## Requirements

### Brief Input
- REQ1: Accept free-form text brief (up to 2000 characters)
- REQ2: Optional structured fields: product name, target audience, campaign goal, budget range
- REQ3: Optional constraints: template type preference, date range, brand guidelines

### Plan Generation
- REQ4: Use LLM (via existing prompt registry) to generate campaign plan
- REQ5: Output structured JSON matching CampaignPlanSchema
- REQ6: Include confidence scores for recommendations
- REQ7: Generation time < 10 seconds

### Campaign Plan Schema
```typescript
interface CampaignPlan {
  summary: string;                    // 1-2 sentence overview
  recommended_template: {
    template_id: string;              // "spin_wheel", "scratch_card", etc.
    reasoning: string;                // Why this template
    confidence: number;               // 0-1
  };
  theme: ThemeRecommendation;
  game_config: TemplateConfig;        // Template-specific config
  prizes: PrizeRecommendation[];
  assets_needed: AssetRequirement[];
  estimated_engagement: string;       // "High", "Medium", "Low"
  warnings?: string[];                // Potential issues
}

interface ThemeRecommendation {
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  mood: string;                       // "Playful", "Premium", "Urgent"
  font_suggestion: string;
  background_style: string;
}

interface PrizeRecommendation {
  tier: 'grand' | 'secondary' | 'consolation';
  suggestion: string;
  probability: number;
  estimated_cost?: string;
}

interface AssetRequirement {
  type: 'image' | 'audio' | 'video';
  purpose: string;                    // "Background", "Logo", "BGM"
  generation_prompt?: string;         // Suggested prompt for AI generation
}
```

### Prompt Engineering
- REQ8: System prompt includes template descriptions and capabilities
- REQ9: Include few-shot examples of good campaign plans
- REQ10: Output format enforced via JSON mode or structured output
- REQ11: Prompt version tracked in prompt registry (005-prompt-config-registry)

### Integration Points
- REQ12: Called from Campaign Builder wizard (optional "AI Assist" button)
- REQ13: Plan can be accepted, modified, or regenerated
- REQ14: Accepted plan populates builder form fields

## Prompt Template (Example)

```markdown
---
prompt_id: campaign_plan_from_brief
version: 1.0.0
vars_schema:
  type: object
  properties:
    brief: { type: string }
    constraints: { type: object }
model_defaults:
  model: gemini-2.5-flash
  temperature: 0.7
output_schema:
  $ref: "#/definitions/CampaignPlan"
---

You are a marketing campaign expert. Generate a game campaign plan based on the brief.

## Available Game Templates
- spin_wheel: Prize wheel with configurable segments. Best for: instant-win promotions, high engagement
- scratch_card: Digital scratch to reveal. Best for: coupons, discount reveals
- quiz: Trivia questions with scoring. Best for: educational campaigns, brand awareness
- memory_match: Card matching game. Best for: longer engagement, brand recall

## Brief
{brief}

## Constraints
{constraints}

Generate a complete campaign plan as JSON matching the schema.
```

## API Integration

### Endpoint
```typescript
// Generate campaign plan
POST /api/campaigns/plan
Body: {
  brief: string;
  constraints?: {
    template_preference?: string;
    budget_range?: { min: number, max: number };
    target_audience?: string;
  }
}
Response: {
  plan: CampaignPlan;
  alternatives?: CampaignPlan[];  // If multiple variations requested
}
```

### Skill Implementation
```yaml
skill_id: campaign_plan_from_brief
version: "1.0.0"
title: "Generate Campaign Plan from Brief"
tags: [planning, llm, ai]
status: active

input_schema:
  type: object
  properties:
    brief: { type: string, maxLength: 2000 }
    constraints: { type: object }
  required: [brief]

output_schema:
  $ref: "#/definitions/CampaignPlan"

implementation:
  type: llm_call
  prompt_id: campaign_plan_from_brief
  prompt_version: "1.0.0"
```

## Dependencies
- Depends on: Prompt Registry (005), LiteLLM client, Template System (template metadata)
- Required by: Campaign Builder (AI assist feature)

## Success Criteria
- [ ] Brief input generates valid campaign plan
- [ ] Template recommendation is reasonable for the brief
- [ ] Theme colors are cohesive and appropriate
- [ ] Prize suggestions are within any specified budget
- [ ] Output JSON matches schema without errors
- [ ] Generation completes in < 10 seconds
- [ ] Plan can be directly imported into campaign builder
