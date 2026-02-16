# API Contract: Theme Extraction

**Feature**: 013-campaign-intelligence
**Base Path**: `/api/intelligence/theme`

---

## POST /api/intelligence/theme/from-brief

Extract a color theme from a text brief using LLM mood analysis.

**Auth**: Required (Clerk JWT)
**Tenant**: Extracted from auth context

### Request

```typescript
// Content-Type: application/json
interface ExtractThemeFromBriefRequest {
  brief: string;                              // 10-2000 characters, required
  campaign_id?: string;                       // UUID, link to campaign for history
}
```

### Response (200 OK)

```typescript
interface ExtractThemeResponse {
  generation_id: string;                      // UUID
  theme: {
    primary_color: string;                    // Hex (#RRGGBB)
    secondary_color: string;
    accent_color: string;
    background_color: string;
    text_color: string;
    mood: ThemeMood;
    confidence: number;                       // 0-1
    palette: string[];                        // Full palette (5-8 hex colors)
    source: "brief" | "image";
    contrast_ratio: number;                   // Text-on-background ratio
    contrast_passes_aa: boolean;              // Meets WCAG AA 4.5:1
    accessibility_warnings: AccessibilityWarning[];
  };
  duration_ms: number;
}

type ThemeMood = "playful" | "premium" | "urgent" | "professional" |
                 "natural" | "festive" | "minimal";

interface AccessibilityWarning {
  pair: string;                               // e.g., "text-on-background", "accent-on-background"
  ratio: number;                              // Actual contrast ratio
  required: number;                           // Required ratio (4.5 for normal, 3.0 for large)
  suggestion: string;                         // Adjusted color hex that would pass
}
```

### Error Responses

| Status | Code | Description |
|--------|------|-------------|
| 400 | VALIDATION_ERROR | Brief too short/long |
| 401 | UNAUTHORIZED | Missing or invalid auth token |
| 500 | GENERATION_FAILED | All LLM retry attempts exhausted |

---

## POST /api/intelligence/theme/from-image

Extract a color theme from an uploaded image using dominant color analysis.

**Auth**: Required (Clerk JWT)
**Tenant**: Extracted from auth context

### Request

```typescript
// Content-Type: multipart/form-data
// Field: image (file, required) - PNG, JPG, WEBP, max 10MB
// Field: campaign_id (string, optional) - UUID
```

### Response (200 OK)

Same `ExtractThemeResponse` as from-brief, with `source: "image"`.

### Error Responses

| Status | Code | Description |
|--------|------|-------------|
| 400 | INVALID_IMAGE | Unsupported format, corrupted, or exceeds 10MB |
| 400 | VALIDATION_ERROR | Missing image field |
| 401 | UNAUTHORIZED | Missing or invalid auth token |
| 500 | EXTRACTION_FAILED | Image processing failed |

---

## POST /api/intelligence/theme/validate

Validate a theme's accessibility (WCAG AA contrast checks).

**Auth**: Required
**Tenant**: Extracted from auth context

### Request

```typescript
// Content-Type: application/json
interface ValidateThemeRequest {
  primary_color: string;                      // Hex
  secondary_color: string;
  accent_color: string;
  background_color: string;
  text_color: string;
}
```

### Response (200 OK)

```typescript
interface ValidateThemeResponse {
  valid: boolean;                             // All pairs pass WCAG AA
  issues: AccessibilityWarning[];             // Empty if valid
}
```

---

## Internal Endpoints (agent-platform)

### POST /internal/intelligence/theme/from-brief

Called by api-center. No auth.

```typescript
// Request: { brief: string }
// Response:
interface InternalThemeResponse {
  theme: Omit<ExtractThemeResponse["theme"], "contrast_ratio" | "contrast_passes_aa" | "accessibility_warnings">;
  duration_ms: number;
  model: string;
  attempts: number;
}
```

Note: WCAG validation happens in api-center using `wcag-contrast.util.ts` after receiving the raw theme.

### POST /internal/intelligence/theme/from-image

Called by api-center. Accepts multipart/form-data with image.

```typescript
// Request: multipart/form-data with "image" file field
// Response: same InternalThemeResponse (no LLM model/attempts since no LLM used)
```
