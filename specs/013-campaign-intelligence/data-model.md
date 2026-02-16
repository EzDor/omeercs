# Data Model: Campaign Intelligence

**Feature**: 013-campaign-intelligence
**Date**: 2026-02-16

## New Entities

### AiGeneration

Tracks all AI-generated outputs (plans, copy, themes) with full history. Linked to campaigns when applicable.

**Table**: `app.ai_generations`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | uuid | NO | uuid_generate_v4() | Primary key |
| tenant_id | varchar(255) | NO | — | Tenant isolation (Clerk org ID) |
| campaign_id | uuid | YES | NULL | Associated campaign (nullable for standalone generations) |
| user_id | varchar(255) | NO | — | Requesting user |
| generation_type | varchar(30) | NO | — | `plan`, `copy`, `theme_brief`, `theme_image` |
| status | varchar(20) | NO | `completed` | `pending`, `completed`, `failed` |
| accepted | boolean | NO | false | Whether the marketer accepted this generation |
| input_params | jsonb | NO | — | Request parameters (brief, tone, constraints, etc.) |
| output | jsonb | YES | NULL | Generated result (plan, copy variations, theme palette) |
| error | jsonb | YES | NULL | Error details if generation failed |
| duration_ms | integer | YES | NULL | Total generation time in milliseconds |
| llm_model | varchar(100) | YES | NULL | LLM model used (e.g., `gemini-2.0-flash`) |
| attempts | integer | NO | 1 | Number of LLM attempts (1 = first try, up to 3 with retries) |
| created_at | timestamp | NO | now() | Creation timestamp |
| updated_at | timestamp | NO | now() | Last update timestamp |

**Indexes**:
- `IDX_ai_generations_tenant_id` on `(tenant_id)`
- `IDX_ai_generations_tenant_campaign` on `(tenant_id, campaign_id)` WHERE `campaign_id IS NOT NULL`
- `IDX_ai_generations_tenant_type` on `(tenant_id, generation_type)`
- `IDX_ai_generations_tenant_created` on `(tenant_id, created_at DESC)`

**Constraints**:
- `CHK_ai_generations_type` CHECK `(generation_type IN ('plan', 'copy', 'theme_brief', 'theme_image'))`
- `CHK_ai_generations_status` CHECK `(status IN ('pending', 'completed', 'failed'))`

**Relationships**:
- `campaign_id` → `app.campaigns(id)` ON DELETE SET NULL (generation history preserved even if campaign deleted)

## JSONB Column Schemas

### input_params by generation_type

**plan**:
```typescript
{
  brief: string;                          // Up to 2000 chars
  constraints?: {
    template_preference?: string;         // e.g., "spin_wheel"
    budget_range?: { min: number; max: number };
    target_audience?: string;
  };
}
```

**copy**:
```typescript
{
  campaign_context: {
    template_type: string;
    brand_name?: string;
    campaign_goal?: string;
    target_audience?: string;
  };
  copy_types: CopyType[];                // e.g., ["headline", "cta_button", "win_message"]
  tone: CopyTone;                        // "playful" | "urgent" | "professional" | "luxury" | "friendly"
  variations_count: number;              // 1-5
  constraints?: {
    avoid_words?: string[];
    required_words?: string[];
  };
}
```

**theme_brief**:
```typescript
{
  brief: string;
}
```

**theme_image**:
```typescript
{
  image_filename: string;
  image_size_bytes: number;
  image_mime_type: string;
}
```

### output by generation_type

**plan**:
```typescript
{
  summary: string;
  recommended_template: {
    template_id: string;
    template_name: string;
    reasoning: string;
    confidence: number;                   // 0-1
  };
  theme: {
    primary_color: string;                // Hex
    secondary_color: string;
    accent_color: string;
    background_color: string;
    text_color: string;
    mood: string;
  };
  prize_tiers: Array<{
    tier: "grand" | "secondary" | "consolation";
    suggestion: string;
    probability: number;
    estimated_cost?: string;
  }>;
  estimated_engagement: "high" | "medium" | "low";
  asset_requirements: Array<{
    type: string;
    purpose: string;
    generation_prompt?: string;
  }>;
  warnings?: string[];
}
```

**copy**:
```typescript
{
  copies: Array<{
    copy_type: CopyType;
    variations: Array<{
      text: string;
      character_count: number;
      tone_match_score: number;           // 0-1
      notes?: string;
    }>;
  }>;
  compliance_warnings?: Array<{
    copy_type: CopyType;
    variation_index: number;
    term: string;
    category: string;
    severity: "warning" | "info";
    suggestion: string;
  }>;
}
```

**theme_brief** and **theme_image**:
```typescript
{
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  background_color: string;
  text_color: string;
  mood: ThemeMood;
  confidence: number;                     // 0-1
  palette: string[];                      // Full extracted palette (up to 8 colors)
  source: "brief" | "image";
  contrast_ratio: number;                 // Text-to-background
  contrast_passes_aa: boolean;
  accessibility_warnings?: Array<{
    pair: string;                          // e.g., "text-on-background"
    ratio: number;
    required: number;
    suggestion: string;                    // Adjusted color suggestion
  }>;
}
```

### error schema (all types)
```typescript
{
  code: string;                           // e.g., "LLM_VALIDATION_FAILED", "LLM_TIMEOUT"
  message: string;
  attempts: number;
  last_attempt_error?: string;
}
```

## Modified Entities

### Campaign (existing)

No schema changes. When a plan is accepted (FR-012), a new campaign is created via the existing `CampaignApiService.create()` method with config pre-filled from the plan output:

- `name`: Derived from plan summary
- `templateId`: From `recommended_template.template_id`
- `config.theme`: Mapped from plan theme colors
- `config.game`: Empty (to be configured in builder)
- `config.assets`: Empty (to be populated later)
- `status`: `draft`

The `AiGeneration` record is updated with `accepted: true` and linked via `campaign_id`.

## Enums (shared via dto/)

```typescript
type CopyType = "headline" | "subheadline" | "cta_button" | "prize_description" |
                "win_message" | "lose_message" | "instructions" | "terms_summary";

type CopyTone = "playful" | "urgent" | "professional" | "luxury" | "friendly";

type ThemeMood = "playful" | "premium" | "urgent" | "professional" |
                 "natural" | "festive" | "minimal";

type GenerationType = "plan" | "copy" | "theme_brief" | "theme_image";

type GenerationStatus = "pending" | "completed" | "failed";
```

## Character Limits (static config)

```typescript
const COPY_CHARACTER_LIMITS: Record<CopyType, number> = {
  headline: 60,
  subheadline: 120,
  cta_button: 20,
  prize_description: 100,
  win_message: 80,
  lose_message: 80,
  instructions: 200,
  terms_summary: 300,
};
```

## Entity Relationship Diagram

```text
┌─────────────────────────┐
│       Campaign          │
│  (existing, no change)  │
│  ─────────────────────  │
│  id (uuid PK)           │
│  tenant_id              │
│  name                   │
│  template_id            │
│  config (jsonb)         │
│  status                 │
└────────────┬────────────┘
             │ 1
             │
             │ 0..*
┌────────────┴────────────┐
│     AiGeneration        │
│  (new)                  │
│  ─────────────────────  │
│  id (uuid PK)           │
│  tenant_id              │
│  campaign_id (FK, null) │
│  user_id                │
│  generation_type        │
│  status                 │
│  accepted               │
│  input_params (jsonb)   │
│  output (jsonb)         │
│  error (jsonb)          │
│  duration_ms            │
│  llm_model              │
│  attempts               │
│  created_at             │
│  updated_at             │
└─────────────────────────┘
```
