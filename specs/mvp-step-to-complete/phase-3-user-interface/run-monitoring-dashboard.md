# Run Monitoring Dashboard

## Purpose
A real-time dashboard for monitoring workflow run status, viewing step progress, debugging failures, and managing retries. Provides visibility into the campaign generation process.

## User Stories

### P1 (Critical)
- US1: As a marketer, I want to see if my campaign generation is in progress, completed, or failed so that I know its status
- US2: As a marketer, I want to see which step is currently running so that I understand progress
- US3: As a developer, I want to see error details when a run fails so that I can debug issues

### P2 (Important)
- US4: As a marketer, I want to retry a failed run so that I don't have to start over
- US5: As a developer, I want to see step timing details so that I can identify slow steps
- US6: As an operator, I want to view all runs across tenants (admin mode) so that I can monitor system health

### P3 (Nice to Have)
- US7: As a developer, I want to download step artifacts for debugging so that I can inspect intermediate outputs
- US8: As a marketer, I want notifications when my run completes so that I don't have to watch the dashboard

## Requirements

### Run List View
- REQ1: List all runs for the current tenant (paginated)
- REQ2: Filter by: status (queued, running, completed, failed), date range, workflow name
- REQ3: Sort by: created date, status, duration
- REQ4: Quick status indicators (color-coded badges)
- REQ5: Search by run ID or campaign name

### Run Detail View
- REQ6: Run metadata: ID, workflow name, status, created/started/completed timestamps
- REQ7: Step list with status, duration, cache hit indicator
- REQ8: Visual progress indicator (steps completed / total)
- REQ9: Error details with stack trace for failed runs
- REQ10: Input payload display (trigger data)

### Step Details
- REQ11: Step ID, skill ID, status, duration
- REQ12: Input/output data (JSON viewer)
- REQ13: Artifact links (clickable to view/download)
- REQ14: Cache hit/miss indicator
- REQ15: Retry attempt count

### Real-time Updates
- REQ16: Auto-refresh run status every 5 seconds while running
- REQ17: WebSocket or SSE for live step updates (optional)
- REQ18: Toast notification when run completes

### Retry & Recovery
- REQ19: Retry button for failed runs (re-queue from beginning)
- REQ20: Partial retry: restart from failed step (if supported)
- REQ21: Cancel button for queued/running runs
- REQ22: Confirmation modal for destructive actions

### Admin Features
- REQ23: View runs across all tenants (super admin only)
- REQ24: Aggregate statistics: runs/day, failure rate, avg duration
- REQ25: Queue depth indicator

## API Integration

### Existing Endpoints (from run-engine.controller.ts)
```typescript
// List runs
GET /api/runs?status=running&limit=20&offset=0

// Get run detail
GET /api/runs/{runId}
Response: {
  id, tenantId, workflowName, status,
  triggerPayload, context, error,
  startedAt, completedAt, durationMs
}

// Get run steps
GET /api/runs/{runId}/steps
Response: RunStep[]

// Retry run
POST /api/runs/{runId}/retry
Response: { newRunId }

// Cancel run
DELETE /api/runs/{runId}
```

### New Endpoints Needed
```typescript
// Get step artifacts
GET /api/runs/{runId}/steps/{stepId}/artifacts
Response: Artifact[]

// Get run statistics (admin)
GET /api/admin/runs/stats?period=24h
Response: { total, completed, failed, avgDurationMs }
```

## UI Components

### Vue Component Structure
```
/webapp/src/views/runs/
├── RunListView.vue
├── RunDetailView.vue
├── components/
│   ├── RunTable.vue            # Sortable, filterable table
│   ├── RunFilters.vue          # Status, date range filters
│   ├── RunStatusBadge.vue      # Color-coded status indicator
│   ├── StepTimeline.vue        # Visual step progress
│   ├── StepDetailPanel.vue     # Step input/output/artifacts
│   ├── ErrorDisplay.vue        # Formatted error with stack trace
│   ├── JsonViewer.vue          # Collapsible JSON tree
│   ├── RetryConfirmModal.vue
│   └── CancelConfirmModal.vue
```

### Pinia Store
```typescript
// stores/runs.ts
interface RunsState {
  runs: Run[];
  currentRun: Run | null;
  currentRunSteps: RunStep[];
  filters: RunFilters;
  pagination: { offset: number, limit: number, total: number };
  isLoading: boolean;
  error: string | null;
}
```

## Visual Design

### Run Status Colors
| Status | Color | Icon |
|--------|-------|------|
| queued | gray | clock |
| running | blue | spinner |
| completed | green | checkmark |
| failed | red | x-circle |

### Step Progress Timeline
```
[✓ game_config] → [✓ bgm_track] → [● bundle_game] → [○ manifest]
   1.2s              3.5s            running           pending
```

## Dependencies
- Depends on: Run Engine API, WebSocket service (optional)
- Required by: Campaign Builder (shows run status after generate)

## Success Criteria
- [ ] Run list loads and filters correctly
- [ ] Run detail shows all steps with accurate status
- [ ] Real-time updates work while run is in progress
- [ ] Error details are helpful for debugging
- [ ] Retry triggers new run successfully
- [ ] Cancel stops running workflows
- [ ] Pagination works for large run lists
