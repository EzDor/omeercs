# API Contracts: Run Monitoring Extensions

**Base path**: `/runs` (extends existing run engine endpoints)
**Auth**: Clerk JWT required

The existing run engine already provides:
- `POST /runs` — trigger a run
- `GET /runs/:runId` — get run detail
- `GET /runs/:runId/steps` — get run steps
- `POST /runs/:runId/retry` — retry a failed run
- `DELETE /runs/:runId` — cancel a run

The following additions support campaign-scoped run queries and campaign status updates.

---

## GET /campaigns/:campaignId/runs

List all runs for a specific campaign.

**Path Parameters**:
- `campaignId`: uuid

**Query Parameters**:
```typescript
{
  status?: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  limit?: number;   // default: 20
  offset?: number;  // default: 0
}
```

**Response** (200 OK):
```typescript
{
  runs: RunResponse[];
  total: number;
  limit: number;
  offset: number;
}
```

**Notes**:
- Queries runs where `context->>'campaignId' = :campaignId`
- Filtered by tenant context automatically
- Sorted by createdAt descending (most recent first)

---

## Existing RunResponse (reference)

```typescript
interface RunResponse {
  id: string;
  workflowName: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  triggerPayload: Record<string, unknown> | null;
  context: CampaignContext | null;
  error: RunError | null;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  createdAt: string;
  updatedAt: string;
}

interface RunStepResponse {
  id: string;
  stepId: string;
  skillId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  cacheHit: boolean;
  durationMs: number | null;
  attempt: number;
  error: StepError | null;
  outputArtifactIds: string[] | null;
  createdAt: string;
  updatedAt: string;
}
```

---

## Campaign Status Callback (Internal)

Not an HTTP endpoint — this is an internal service call within agent-platform.

When a run completes or fails, the run processor updates the campaign:

```typescript
// In LangGraphRunProcessor.process():
// After run completes:
await campaignService.updateStatusFromRun(campaignId, {
  status: runStatus === 'completed' ? 'live' : 'failed',
  bundleUrl: runStatus === 'completed' ? bundleArtifactUrl : undefined,
  latestRunId: runId,
});
```

This is not a queue job or HTTP call — it's a direct service call within the same agent-platform process, following the existing pattern where the run processor updates Run entities.
