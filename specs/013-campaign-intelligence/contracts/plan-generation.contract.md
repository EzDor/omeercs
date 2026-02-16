# API Contract: Plan Generation

**Feature**: 013-campaign-intelligence
**Base Path**: `/api/intelligence/plan`

---

## POST /api/intelligence/plan

Generate a campaign plan from a natural language brief.

**Auth**: Required (Clerk JWT)
**Tenant**: Extracted from auth context

### Request

```typescript
// Content-Type: application/json
interface GeneratePlanRequest {
  brief: string;                              // 10-2000 characters, required
  constraints?: {
    template_preference?: string;             // e.g., "spin_wheel", "scratch_card"
    budget_range?: {
      min: number;                            // Minimum budget (>= 0)
      max: number;                            // Maximum budget (>= min)
    };
    target_audience?: string;                 // Free text, max 200 chars
  };
  campaign_id?: string;                       // UUID, link generation to existing campaign
}
```

### Response (200 OK)

```typescript
interface GeneratePlanResponse {
  generation_id: string;                      // UUID of the AiGeneration record
  plan: {
    summary: string;
    recommended_template: {
      template_id: string;                    // One of: spin_wheel, scratch_card, quiz, memory_match
      template_name: string;
      reasoning: string;
      confidence: number;                     // 0-1
    };
    theme: {
      primary_color: string;                  // Hex (#RRGGBB)
      secondary_color: string;
      accent_color: string;
      background_color: string;
      text_color: string;
      mood: string;                           // playful, premium, urgent, professional, natural, festive, minimal
    };
    prize_tiers: Array<{
      tier: "grand" | "secondary" | "consolation";
      suggestion: string;
      probability: number;                    // 0-1
      estimated_cost?: string;
    }>;
    estimated_engagement: "high" | "medium" | "low";
    asset_requirements: Array<{
      type: string;                           // image, audio, video
      purpose: string;
      generation_prompt?: string;
    }>;
    warnings?: string[];
  };
  duration_ms: number;
}
```

### Error Responses

| Status | Code | Description |
|--------|------|-------------|
| 400 | VALIDATION_ERROR | Brief too short/long, invalid constraints |
| 401 | UNAUTHORIZED | Missing or invalid auth token |
| 500 | GENERATION_FAILED | All LLM retry attempts exhausted |
| 504 | GENERATION_TIMEOUT | Generation exceeded 30s timeout |

---

## POST /api/intelligence/plan/:generationId/accept

Accept a generated plan and create a campaign draft.

**Auth**: Required
**Tenant**: Extracted from auth context

### Request

```typescript
// Path: generationId (UUID)
// Content-Type: application/json
interface AcceptPlanRequest {
  campaign_name?: string;                     // Optional, max 255 chars. Defaults to plan summary.
}
```

### Response (201 Created)

```typescript
interface AcceptPlanResponse {
  campaign_id: string;                        // UUID of the newly created campaign
  campaign_name: string;
  status: "draft";
  template_id: string;
  config: CampaignConfig;                     // Pre-filled from plan
}
```

### Error Responses

| Status | Code | Description |
|--------|------|-------------|
| 400 | ALREADY_ACCEPTED | This generation was already accepted |
| 404 | GENERATION_NOT_FOUND | Generation ID not found or belongs to different tenant |
| 404 | NOT_A_PLAN | Generation exists but is not a plan type |

---

## POST /api/intelligence/plan/:generationId/regenerate

Regenerate a plan with the same input but different output.

**Auth**: Required
**Tenant**: Extracted from auth context

### Request

No body required. Uses the same input_params from the original generation.

### Response (200 OK)

Same as `GeneratePlanResponse` but with a new `generation_id`.

### Behavior

- Creates a new AiGeneration record with the same input_params
- Adds `previous_generation_id` to context to encourage different output
- The LLM prompt includes instruction to produce meaningfully different recommendations

---

## Internal Endpoint (agent-platform)

### POST /internal/intelligence/plan

Called by api-center. No auth (internal network only).

```typescript
// Request: same as GeneratePlanRequest
// Response:
interface InternalPlanResponse {
  plan: GeneratePlanResponse["plan"];
  duration_ms: number;
  model: string;
  attempts: number;
}
```
