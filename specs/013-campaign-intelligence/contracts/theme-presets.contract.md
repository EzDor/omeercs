# API Contract: Theme Presets & Generation History

**Feature**: 013-campaign-intelligence

---

## GET /api/intelligence/theme/presets

Browse industry-specific theme presets.

**Auth**: Required (Clerk JWT)
**Tenant**: Extracted from auth context

### Request

Query parameters:
- `industry` (optional): Filter by industry name (case-insensitive)
- `mood` (optional): Filter by mood classification

### Response (200 OK)

```typescript
interface ThemePresetsResponse {
  presets: Array<{
    id: string;                               // e.g., "retail_sale"
    name: string;                             // e.g., "Retail Sale"
    industry: string;                         // e.g., "Retail"
    mood: ThemeMood;
    theme: {
      primary_color: string;
      secondary_color: string;
      accent_color: string;
      background_color: string;
      text_color: string;
    };
  }>;
}
```

---

## GET /api/intelligence/history

Query generation history for a tenant, optionally filtered by campaign and type.

**Auth**: Required (Clerk JWT)
**Tenant**: Extracted from auth context

### Request

Query parameters:
- `campaign_id` (optional): UUID, filter by campaign
- `type` (optional): Filter by generation type (`plan`, `copy`, `theme_brief`, `theme_image`)
- `status` (optional): Filter by status (`pending`, `completed`, `failed`)
- `limit` (optional): 1-100, default 20
- `offset` (optional): >= 0, default 0

### Response (200 OK)

```typescript
interface GenerationHistoryResponse {
  generations: Array<{
    id: string;
    campaign_id: string | null;
    generation_type: GenerationType;
    status: GenerationStatus;
    accepted: boolean;
    input_params: Record<string, unknown>;    // Summary of input (brief truncated to 200 chars)
    output: Record<string, unknown> | null;   // Full output if completed
    error: Record<string, unknown> | null;
    duration_ms: number | null;
    llm_model: string | null;
    attempts: number;
    created_at: string;                       // ISO 8601
  }>;
  total: number;
  limit: number;
  offset: number;
}
```

---

## GET /api/intelligence/history/:generationId

Get a single generation record with full details.

**Auth**: Required
**Tenant**: Extracted from auth context

### Response (200 OK)

Single generation object (same shape as items in `GenerationHistoryResponse.generations`).

### Error Responses

| Status | Code | Description |
|--------|------|-------------|
| 404 | NOT_FOUND | Generation not found or belongs to different tenant |
