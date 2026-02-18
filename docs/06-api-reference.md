# API Reference

## Overview

The API Center exposes a REST API at `http://localhost:3001/api`. All endpoints (except those marked as Public) require authentication via a Clerk JWT Bearer token.

**Global settings**:
- Base path: `/api`
- Rate limit: 100 requests per 60 seconds (global)
- Validation: Whitelist-based — unknown fields are rejected
- CORS: Enabled with configurable domain

## Authentication

All authenticated requests must include:
```
Authorization: Bearer <clerk-jwt-token>
```

The JWT must contain an `orgId` claim (Clerk organization). Endpoints marked with `@Public()` skip authentication.

---

## Chat Module

Manages AI chat sessions and messages with SSE streaming.

### Create Session
```
POST /api/chat/sessions
```
Creates a new chat session for the authenticated user.

**Response** (201):
```json
{
  "id": "uuid",
  "title": null,
  "createdAt": "2026-01-15T10:00:00Z",
  "updatedAt": "2026-01-15T10:00:00Z",
  "lastMessageAt": "2026-01-15T10:00:00Z"
}
```

### List Sessions
```
GET /api/chat/sessions?limit=20&offset=0
```
Returns the user's chat sessions, sorted by most recent message.

### Get Session
```
GET /api/chat/sessions/:id
```

### Delete Session
```
DELETE /api/chat/sessions/:id
```
Cascade-deletes all messages in the session.

### Send Message
```
POST /api/chat/sessions/:id/messages
```
**Body**:
```json
{
  "content": "Write a marketing brief for a summer shoe campaign"
}
```
Sends a user message and triggers an LLM response. The assistant's response is auto-saved.

### Get Messages
```
GET /api/chat/sessions/:id/messages
```
Returns all messages in chronological order.

### Stream Response (SSE)
```
GET /api/chat/sessions/:id/stream?token=<jwt>
```
Server-Sent Events stream for real-time assistant responses. The token can be passed as a query parameter (needed for EventSource which doesn't support headers).

### Health Check (Public)
```
GET /api/chat/health
```

---

## Campaign Module

Full CRUD for campaigns with generation, archiving, and bulk operations.

### Create Campaign
```
POST /api/campaigns
```
**Body**:
```json
{
  "name": "Summer Beach Campaign",
  "templateId": "spin_wheel",
  "config": {
    "theme": { "primaryColor": "#FF6B35", "secondaryColor": "#004E89" },
    "game": {},
    "assets": []
  }
}
```

### List Campaigns
```
GET /api/campaigns?status=draft&search=summer&sortBy=createdAt&sortOrder=desc&limit=20&offset=0
```
**Query Parameters**:
- `status` — Filter by status: `draft`, `generating`, `live`, `failed`, `archived`
- `templateId` — Filter by game template
- `search` — Search by campaign name
- `sortBy` — Sort field: `createdAt`, `updatedAt`, `name`
- `sortOrder` — `asc` or `desc`
- `limit`, `offset` — Pagination

### Get Campaign
```
GET /api/campaigns/:campaignId
```

### Update Campaign
```
PATCH /api/campaigns/:campaignId
```
**Body**:
```json
{
  "name": "Updated Name",
  "config": { "theme": { "primaryColor": "#00AA55" } },
  "expectedVersion": 1
}
```
Only `draft` and `failed` campaigns can be updated. The `expectedVersion` field provides optimistic concurrency control — if the campaign has been modified since you last read it, the update is rejected.

### Delete Campaign (Soft)
```
DELETE /api/campaigns/:campaignId
```
Sets `deletedAt` — the campaign is not permanently removed.

### Duplicate Campaign
```
POST /api/campaigns/:campaignId/duplicate
```
Creates a copy with status `draft` and `(Copy)` appended to the name.

### Generate Campaign
```
POST /api/campaigns/:campaignId/generate
```
Triggers the campaign build workflow. The campaign must be in `draft` or `failed` status. Changes status to `generating` and enqueues a run.

**Response** (202):
```json
{
  "campaignId": "uuid",
  "runId": "uuid",
  "status": "generating"
}
```

### Archive Campaign
```
POST /api/campaigns/:campaignId/archive
```
Changes status from `live` to `archived`.

### Restore Campaign
```
POST /api/campaigns/:campaignId/restore
```
Changes status from `archived` back to `live`.

### Bulk Archive (Throttled: 5/60s)
```
POST /api/campaigns/bulk-archive
```
**Body**:
```json
{
  "campaignIds": ["uuid1", "uuid2", "uuid3"]
}
```
**Response**: `{ archived: 2, skipped: 1, errors: [...] }`

### Bulk Delete (Throttled: 5/60s)
```
POST /api/campaigns/bulk-delete
```
Same body format. Soft-deletes all specified campaigns.

### Get Campaign Runs
```
GET /api/campaigns/:campaignId/runs
```
Returns the run history for a campaign.

### Public: Get Campaign for Player
```
GET /api/play/:campaignId
```
**Public** — No authentication required. Returns minimal campaign data for the game player. Cached for 300 seconds.

### Public: Get Embeddable Campaign
```
GET /api/play/:campaignId/embed
```
**Public** — Returns campaign data with permissive CSP headers for iframe embedding.

---

## Intelligence Module

AI-powered generation of campaign plans, copy, and themes. All generation results are tracked in the `ai_generations` table.

### Generate Plan (Throttled: 10/60s)
```
POST /api/intelligence/plan
```
**Body**:
```json
{
  "brief": "Create a summer beach campaign for a shoe brand targeting millennials...",
  "constraints": { "excluded_templates": ["quiz"] },
  "campaign_id": "uuid (optional)"
}
```
**Response**:
```json
{
  "generation_id": "uuid",
  "plan": {
    "summary": "...",
    "recommended_template": { "template_id": "spin_wheel", "reasoning": "..." },
    "theme": { "primary_color": "#FF6B35", "mood": "playful" },
    "prize_tiers": [...],
    "asset_requirements": [...]
  },
  "duration_ms": 2500
}
```

### Accept Plan
```
POST /api/intelligence/plan/:generationId/accept
```
**Body**:
```json
{
  "campaign_name": "Summer Shoes Spin (optional)"
}
```
Accepts the generated plan and creates (or updates) a campaign with the plan's configuration.

### Regenerate Plan
```
POST /api/intelligence/plan/:generationId/regenerate
```
Generates a new plan based on the same inputs as the specified generation.

### Generate Copy (Throttled: 10/60s)
```
POST /api/intelligence/copy
```
**Body**:
```json
{
  "campaign_context": { "theme": "summer beach", "template": "spin_wheel" },
  "copy_types": ["headline", "subheadline", "cta_button", "win_message", "lose_message"],
  "tone": "playful",
  "variations_count": 3,
  "constraints": { "avoid_words": ["free", "guaranteed"] }
}
```

### Get Copy Defaults
```
GET /api/intelligence/copy/defaults/:templateType
```
Returns default copy text for a given game template.

### Extract Theme from Brief (Throttled: 10/60s)
```
POST /api/intelligence/theme/from-brief
```
**Body**:
```json
{
  "brief": "A premium luxury watch brand targeting professionals..."
}
```
Uses LLM to extract a color theme (5 colors + mood) from the brief text.

### Extract Theme from Image (Throttled: 10/60s)
```
POST /api/intelligence/theme/from-image
```
**Body**: Multipart form data with an image file upload.

Extracts colors from the uploaded image using vision analysis.

### Validate Theme
```
POST /api/intelligence/theme/validate
```
**Body**:
```json
{
  "primary_color": "#FF6B35",
  "secondary_color": "#004E89",
  "accent_color": "#FFC857",
  "background_color": "#FFFFFF",
  "text_color": "#1A1A2E"
}
```
Validates WCAG contrast ratios between color pairs and returns accessibility warnings.

### Get Theme Presets
```
GET /api/intelligence/theme/presets?industry=retail&mood=playful
```
Returns pre-defined color themes by industry and mood.

### Get Generation History
```
GET /api/intelligence/history?type=plan&limit=10
```

### Get Specific Generation
```
GET /api/intelligence/history/:generationId
```

---

## Run Engine Module

Monitor and query workflow run execution.

### Trigger Run
```
POST /api/runs
```
**Body**:
```json
{
  "workflowName": "campaign.build",
  "workflowVersion": "1.0.0",
  "triggerPayload": {
    "brief": "...",
    "campaign_id": "uuid",
    "campaign_name": "Summer Shoes"
  }
}
```
Returns immediately with `queued` status. The run executes asynchronously.

### Get Run Status
```
GET /api/runs/:runId
```
**Response**:
```json
{
  "id": "uuid",
  "workflowName": "campaign.build",
  "status": "running",
  "summary": {
    "total": 18,
    "pending": 5,
    "running": 2,
    "completed": 10,
    "skipped": 0,
    "failed": 1
  },
  "startedAt": "2026-01-15T10:00:00Z",
  "durationMs": 45000
}
```

### Get Run Steps
```
GET /api/runs/:runId/steps?status=completed
```
Returns all steps in the run, optionally filtered by status.

### Get Run Artifacts
```
GET /api/runs/:runId/artifacts
```
Returns all artifacts generated by the run, grouped by step.

### Get Cache Analysis
```
GET /api/runs/:runId/cache-analysis
```
Returns cache hit/miss statistics for each step in the run.

---

## Asset Serving (Public)

### Serve Game Bundle
```
GET /api/assets/:runId/*
```
**Public** — Serves generated game bundle files (HTML, JS, CSS, images, audio) from the `SKILLS_OUTPUT_DIR`. Includes path traversal protection and content-type detection.

---

## Media Serving

### Serve Media File
```
GET /api/media/:tenantId/:runId/:artifactType/:filename
```
Serves media files from `ASSET_STORAGE_DIR` with tenant isolation. Returns immutable caching headers (1 year max-age).

---

## Health Module (Public)

### Full Health Check
```
GET /api/health
```
Checks database, Valkey, and LLM proxy connectivity.

### Liveness Probe
```
GET /api/health/liveness
```
Simple ping — returns 200 if the service is running.
