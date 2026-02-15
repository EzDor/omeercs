# Data Model: Campaign UI

**Branch**: `012-campaign-ui` | **Date**: 2026-02-15

## New Entities

### Campaign

Represents a game campaign created by a marketer. Tracks the full lifecycle from draft to archived.

| Field | Type | Constraints | Description |
| ----- | ---- | ----------- | ----------- |
| id | uuid | PK, auto-generated | Unique campaign identifier |
| tenantId | varchar(255) | NOT NULL, indexed | Organization/tenant scope |
| userId | varchar(255) | NOT NULL, indexed | Creator's Clerk user ID |
| name | varchar(255) | NOT NULL | Campaign display name |
| templateId | varchar(100) | NOT NULL | Reference to game template (spin-wheel, scratch-card, quiz, memory-match) |
| status | varchar(20) | NOT NULL, default 'draft' | Lifecycle state |
| config | jsonb | nullable | Full campaign configuration (theme, game settings, asset slots) |
| bundleUrl | varchar(2048) | nullable | URL to generated game bundle (set when status = live) |
| thumbnailUrl | varchar(2048) | nullable | Preview image URL |
| latestRunId | uuid | nullable, FK → runs.id | Most recent generation run |
| version | integer | NOT NULL, default 1 | Optimistic concurrency version (incremented on every update) |
| deletedAt | timestamp | nullable | Soft-delete timestamp; null = active |
| createdAt | timestamp | NOT NULL, auto | Creation timestamp |
| updatedAt | timestamp | NOT NULL, auto | Last modification timestamp |

**Indexes**:
- `IDX_campaigns_tenant_id` on (tenantId)
- `IDX_campaigns_tenant_status` on (tenantId, status) — for filtered listing
- `IDX_campaigns_tenant_user` on (tenantId, userId) — for user-scoped queries
- `IDX_campaigns_deleted_at` on (deletedAt) — for cleanup job

**Check constraints**:
- `CHK_campaigns_status`: status IN ('draft', 'generating', 'live', 'failed', 'archived')

### State Transitions

```
draft ──────→ generating ──────→ live
  │               │                │
  │               ▼                ▼
  │            failed          archived
  │               │                │
  │               ▼                ▼
  ▼           (retry →         (restore →
delete        generating)        live)

archived ────→ delete (hard delete with cascade)
```

**Allowed transitions**:

| From | To | Trigger |
| ---- | -- | ------- |
| draft | generating | User clicks "Generate" |
| draft | (deleted) | User deletes draft |
| generating | live | Run completes successfully |
| generating | failed | Run fails |
| generating | (cancelled) → draft | User cancels generation |
| live | archived | User archives campaign |
| live | generating | User triggers regeneration |
| failed | generating | User retries generation |
| failed | draft | User edits failed campaign |
| failed | (deleted) | User deletes failed campaign |
| archived | live | User restores campaign |
| archived | (deleted) | User hard-deletes archived campaign |

## Modified Entities

### Run (existing)

No schema changes. The existing `context` JSONB column already contains `campaignId`. The campaign → run relationship is tracked via:
- `Campaign.latestRunId` → points to the most recent run
- `Run.context.campaignId` → points back to the campaign (already exists in CampaignContext interface)

Queries for "all runs for a campaign" use: `WHERE context->>'campaignId' = :campaignId AND tenantId = :tenantId`

## Relationships

```
Campaign (1) ──── (0..N) Run
    │                      │
    │ latestRunId (FK)     │ context.campaignId (JSONB)
    │                      │
    └──────────────────────┘

Run (1) ──── (1..N) RunStep (existing, unchanged)
```

## Deletion Cascade Rules

When a campaign is **soft-deleted** (deletedAt set):
1. Campaign disappears from list queries (WHERE deletedAt IS NULL)
2. Bundle files are deleted from storage immediately (via StorageService)
3. Associated runs and run steps remain accessible for 30 days

When a campaign is **hard-deleted** (30-day cleanup cron):
1. Campaign row is deleted from the database
2. Orphaned runs (where context.campaignId matches) are deleted
3. Orphaned run steps are cascade-deleted with their runs
4. Any remaining artifacts are cleaned up

## JSONB Schema: Campaign Config

```typescript
interface CampaignConfig {
  theme: {
    primaryColor: string;       // hex color
    secondaryColor: string;     // hex color
    accentColor: string;        // hex color
    fontFamily: string;         // preset font name
    background: {
      type: 'solid' | 'gradient' | 'image';
      value: string;            // color, gradient CSS, or image URL
    };
    logoUrl?: string;
  };
  game: Record<string, unknown>; // template-specific config validated by template schema
  assets: {
    slotId: string;
    artifactId?: string;        // reference to Artifact entity
    url?: string;               // resolved URL
  }[];
}
```
