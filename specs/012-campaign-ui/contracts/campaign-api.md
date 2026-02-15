# API Contracts: Campaign Management

**Base path**: `/campaigns`
**Auth**: All endpoints require Clerk JWT (except those marked @Public)

---

## POST /campaigns

Create a new campaign draft.

**Request**:
```typescript
{
  name: string;            // required, max 255 chars
  templateId: string;      // required, valid template ID
  config?: CampaignConfig; // optional, partial config for draft
}
```

**Response** (201 Created):
```typescript
{
  id: string;              // uuid
  tenantId: string;
  userId: string;
  name: string;
  templateId: string;
  status: 'draft';
  config: CampaignConfig | null;
  bundleUrl: null;
  thumbnailUrl: null;
  latestRunId: null;
  version: 1;
  createdAt: string;       // ISO 8601
  updatedAt: string;       // ISO 8601
}
```

**Errors**:
- 400: Invalid templateId or validation failure
- 401: Missing/invalid auth token
- 403: No active organization

---

## GET /campaigns

List campaigns for current tenant.

**Query Parameters**:
```typescript
{
  status?: 'draft' | 'generating' | 'live' | 'failed' | 'archived'; // filter by status
  templateId?: string;     // filter by template type
  search?: string;         // search by name (case-insensitive, partial match)
  sortBy?: 'name' | 'createdAt' | 'updatedAt'; // default: 'updatedAt'
  sortOrder?: 'asc' | 'desc';                   // default: 'desc'
  limit?: number;          // default: 20, max: 100
  offset?: number;         // default: 0
}
```

**Response** (200 OK):
```typescript
{
  campaigns: CampaignResponse[];
  total: number;           // total matching count (for pagination)
  limit: number;
  offset: number;
}
```

**Errors**:
- 400: Invalid query parameters
- 401/403: Auth errors

---

## GET /campaigns/:campaignId

Get campaign details.

**Path Parameters**:
- `campaignId`: uuid

**Response** (200 OK):
```typescript
CampaignResponse
```

**Errors**:
- 404: Campaign not found (or belongs to different tenant)

---

## PATCH /campaigns/:campaignId

Update campaign draft. Supports optimistic concurrency via `expectedVersion`.

**Path Parameters**:
- `campaignId`: uuid

**Request**:
```typescript
{
  name?: string;
  config?: Partial<CampaignConfig>;
  expectedVersion?: number; // if provided, rejects with 409 if stale
}
```

**Response** (200 OK):
```typescript
CampaignResponse  // includes updated version number
```

**Errors**:
- 400: Validation failure
- 404: Campaign not found
- 409: Version conflict (campaign was modified by another session)
- 422: Campaign is not in an editable state (not draft or failed)

---

## DELETE /campaigns/:campaignId

Soft-delete a campaign. Only allowed for draft, failed, or archived campaigns.

**Path Parameters**:
- `campaignId`: uuid

**Response** (204 No Content)

**Errors**:
- 404: Campaign not found
- 422: Campaign is in a non-deletable state (generating or live — must archive first)

**Side effects**:
- Sets `deletedAt` timestamp
- Deletes bundle files from storage immediately (if any)
- Runs retained for 30 days before cleanup

---

## POST /campaigns/:campaignId/duplicate

Create a copy of a campaign as a new draft.

**Path Parameters**:
- `campaignId`: uuid

**Request**:
```typescript
{
  name?: string; // optional new name; defaults to "{original name} (Copy)"
}
```

**Response** (201 Created):
```typescript
CampaignResponse  // new campaign with status 'draft', new id
```

**Errors**:
- 404: Source campaign not found

---

## POST /campaigns/:campaignId/generate

Trigger campaign generation. Creates a workflow run.

**Path Parameters**:
- `campaignId`: uuid

**Response** (202 Accepted):
```typescript
{
  campaignId: string;
  runId: string;
  status: 'generating';
}
```

**Errors**:
- 404: Campaign not found
- 422: Campaign config is incomplete or invalid against template schema
- 422: Campaign is already generating

**Side effects**:
- Campaign status → `generating`
- Creates a Run entity with `context.campaignId`
- Enqueues run on `RUN_ORCHESTRATION` queue

---

## POST /campaigns/:campaignId/archive

Archive a live campaign.

**Path Parameters**:
- `campaignId`: uuid

**Response** (200 OK):
```typescript
CampaignResponse  // status = 'archived'
```

**Errors**:
- 404: Campaign not found
- 422: Campaign is not in 'live' state

---

## POST /campaigns/:campaignId/restore

Restore an archived campaign to live.

**Path Parameters**:
- `campaignId`: uuid

**Response** (200 OK):
```typescript
CampaignResponse  // status = 'live'
```

**Errors**:
- 404: Campaign not found
- 422: Campaign is not in 'archived' state

---

## POST /campaigns/bulk-archive

Archive multiple campaigns.

**Request**:
```typescript
{
  campaignIds: string[]; // max 50
}
```

**Response** (200 OK):
```typescript
{
  archived: number;      // count of successfully archived
  skipped: number;       // count skipped (wrong status)
  errors: { id: string; reason: string }[];
}
```

---

## POST /campaigns/bulk-delete

Soft-delete multiple campaigns.

**Request**:
```typescript
{
  campaignIds: string[]; // max 50
}
```

**Response** (200 OK):
```typescript
{
  deleted: number;
  skipped: number;
  errors: { id: string; reason: string }[];
}
```

---

## Common Response Type

```typescript
interface CampaignResponse {
  id: string;
  tenantId: string;
  userId: string;
  name: string;
  templateId: string;
  status: 'draft' | 'generating' | 'live' | 'failed' | 'archived';
  config: CampaignConfig | null;
  bundleUrl: string | null;
  thumbnailUrl: string | null;
  latestRunId: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}
```
