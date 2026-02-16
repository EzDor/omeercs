# API Contract: Copy Generation

**Feature**: 013-campaign-intelligence
**Base Path**: `/api/intelligence/copy`

---

## POST /api/intelligence/copy

Generate marketing copy variations for campaign fields.

**Auth**: Required (Clerk JWT)
**Tenant**: Extracted from auth context

### Request

```typescript
// Content-Type: application/json
interface GenerateCopyRequest {
  campaign_id?: string;                       // UUID, link to campaign for history
  campaign_context: {
    template_type: string;                    // Required: spin_wheel, scratch_card, quiz, memory_match
    brand_name?: string;                      // Max 100 chars
    product_name?: string;                    // Max 100 chars
    campaign_goal?: string;                   // Max 200 chars
    target_audience?: string;                 // Max 200 chars
  };
  copy_types: CopyType[];                    // At least 1, max 8
  tone: CopyTone;                            // Required
  variations_count?: number;                  // 1-5, default 3
  constraints?: {
    avoid_words?: string[];                   // Max 20 words
    required_words?: string[];                // Max 10 words
  };
}

type CopyType = "headline" | "subheadline" | "cta_button" | "prize_description" |
                "win_message" | "lose_message" | "instructions" | "terms_summary";

type CopyTone = "playful" | "urgent" | "professional" | "luxury" | "friendly";
```

### Response (200 OK)

```typescript
interface GenerateCopyResponse {
  generation_id: string;                      // UUID
  copies: Array<{
    copy_type: CopyType;
    variations: Array<{
      text: string;
      character_count: number;
      tone_match_score: number;               // 0-1
      notes?: string;
    }>;
  }>;
  compliance_warnings: Array<{
    copy_type: CopyType;
    variation_index: number;
    term: string;
    category: "misleading" | "regulatory" | "financial";
    severity: "warning" | "info";
    suggestion: string;
  }>;
  duration_ms: number;
}
```

### Character Limits (enforced in output)

| Copy Type | Max Characters |
|-----------|---------------|
| headline | 60 |
| subheadline | 120 |
| cta_button | 20 |
| prize_description | 100 |
| win_message | 80 |
| lose_message | 80 |
| instructions | 200 |
| terms_summary | 300 |

### Error Responses

| Status | Code | Description |
|--------|------|-------------|
| 400 | VALIDATION_ERROR | Invalid copy types, tone, or variation count |
| 401 | UNAUTHORIZED | Missing or invalid auth token |
| 500 | GENERATION_FAILED | All LLM retry attempts exhausted |

---

## GET /api/intelligence/copy/defaults/:templateType

Get template-specific default copy (fallback when AI unavailable).

**Auth**: Required
**Tenant**: Extracted from auth context

### Request

Path parameter: `templateType` (spin_wheel, scratch_card, quiz, memory_match)

### Response (200 OK)

```typescript
interface CopyDefaultsResponse {
  template_type: string;
  defaults: {
    cta_button: string[];
    win_message: string[];
    lose_message: string[];
  };
}
```

### Error Responses

| Status | Code | Description |
|--------|------|-------------|
| 404 | TEMPLATE_NOT_FOUND | Unknown template type |

---

## Internal Endpoint (agent-platform)

### POST /internal/intelligence/copy

Called by api-center. No auth (internal network only).

```typescript
// Request: same fields as GenerateCopyRequest (excluding campaign_id)
// Response:
interface InternalCopyResponse {
  copies: GenerateCopyResponse["copies"];
  duration_ms: number;
  model: string;
  attempts: number;
}
```

Note: Compliance checking happens in api-center after receiving the LLM response, using the shared `copy-compliance.util.ts` from common/.
