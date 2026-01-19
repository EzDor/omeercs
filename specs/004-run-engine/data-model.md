# Data Model: Run Engine (Workflow Orchestrator + Partial Rebuild)

**Feature**: 004-run-engine
**Date**: 2026-01-19
**Status**: Design Complete

## Entity Relationship Diagram

```
┌──────────────────────────────────────────────────────────────────────┐
│                           Workflow Registry                           │
│                         (In-Memory/Config)                            │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │ WorkflowSpec                                                     │ │
│  │ - workflowName: string                                           │ │
│  │ - version: string                                                │ │
│  │ - steps: StepSpec[]                                              │ │
│  └─────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ defines
                                    ▼
┌──────────────────────────────────────────────────────────────────────┐
│                              Database                                 │
│                                                                       │
│  ┌─────────────────┐     1:N     ┌─────────────────────────────────┐ │
│  │      runs       │ ─────────▶  │          run_steps              │ │
│  │                 │             │                                 │ │
│  │ - id            │             │ - id                            │ │
│  │ - tenant_id     │             │ - run_id (FK)                   │ │
│  │ - workflow_name │             │ - tenant_id                     │ │
│  │ - trigger_type  │             │ - step_id                       │ │
│  │ - trigger_payload│            │ - status                        │ │
│  │ - status        │             │ - input_hash                    │ │
│  │ - base_run_id   │             │ - attempt                       │ │
│  │ - timestamps    │             │ - output_artifact_ids           │ │
│  └─────────────────┘             │ - error                         │ │
│                                  │ - timestamps                    │ │
│                                  └─────────────────────────────────┘ │
│                                              │                        │
│                                              │ produces               │
│                                              ▼                        │
│                                  ┌─────────────────────────────────┐ │
│                                  │         artifacts               │ │
│                                  │         (existing)              │ │
│                                  │                                 │ │
│                                  │ - id                            │ │
│                                  │ - tenant_id                     │ │
│                                  │ - run_id                        │ │
│                                  │ - skill_id                      │ │
│                                  │ - type, uri, content_hash       │ │
│                                  └─────────────────────────────────┘ │
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │                         step_cache                               │ │
│  │                                                                  │ │
│  │ - cache_key (unique)                                             │ │
│  │ - workflow_name                                                  │ │
│  │ - step_id                                                        │ │
│  │ - input_hash                                                     │ │
│  │ - artifact_ids                                                   │ │
│  │ - tenant_id                                                      │ │
│  └─────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────┘
```

## Entities

### Run

Represents one execution instance of a workflow.

**Table**: `runs`
**Extends**: `BaseEntity` (tenantId, createdAt, updatedAt)

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK, generated | Unique run identifier |
| tenantId | VARCHAR(255) | NOT NULL, indexed | Tenant isolation |
| workflowName | VARCHAR(255) | NOT NULL, indexed | Name of workflow being executed |
| workflowVersion | VARCHAR(50) | NOT NULL | Version of workflow definition |
| triggerType | ENUM | NOT NULL | `initial`, `update` |
| triggerPayload | JSONB | NULL | Request payload that triggered run |
| status | ENUM | NOT NULL, indexed | `queued`, `running`, `completed`, `failed`, `cancelled` |
| baseRunId | UUID | NULL, FK(runs.id) | For update runs, references the initial run |
| error | JSONB | NULL | Error details if run failed |
| startedAt | TIMESTAMPTZ | NULL | When run started executing |
| completedAt | TIMESTAMPTZ | NULL | When run finished (success or failure) |
| createdAt | TIMESTAMPTZ | NOT NULL, auto | Record creation time |
| updatedAt | TIMESTAMPTZ | NOT NULL, auto | Record update time |

**Indexes**:
- `idx_runs_tenant_status` on (tenantId, status)
- `idx_runs_tenant_workflow` on (tenantId, workflowName)
- `idx_runs_base_run` on (baseRunId) WHERE baseRunId IS NOT NULL

**Validation Rules**:
- `baseRunId` must be NULL when `triggerType` = 'initial'
- `baseRunId` must be NOT NULL when `triggerType` = 'update'
- Status transitions: queued → running → (completed | failed | cancelled)

---

### RunStep

Represents one step's execution within a run.

**Table**: `run_steps`
**Extends**: `BaseEntity` (tenantId, createdAt, updatedAt)

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK, generated | Unique step execution identifier |
| runId | UUID | NOT NULL, FK(runs.id), indexed | Parent run |
| tenantId | VARCHAR(255) | NOT NULL, indexed | Tenant isolation |
| stepId | VARCHAR(255) | NOT NULL | Step identifier from workflow definition |
| skillId | VARCHAR(255) | NOT NULL | Skill used for execution |
| status | ENUM | NOT NULL, indexed | `pending`, `running`, `skipped`, `completed`, `failed` |
| inputHash | VARCHAR(64) | NOT NULL | SHA-256 hash of canonical input JSON |
| attempt | INTEGER | NOT NULL, default 1 | Current retry attempt (1-based) |
| outputArtifactIds | JSONB | NULL | Array of artifact UUIDs produced |
| error | JSONB | NULL | Error details if step failed |
| startedAt | TIMESTAMPTZ | NULL | When step started executing |
| endedAt | TIMESTAMPTZ | NULL | When step finished |
| durationMs | INTEGER | NULL | Execution duration in milliseconds |
| cacheHit | BOOLEAN | NOT NULL, default false | Whether result was from cache |
| createdAt | TIMESTAMPTZ | NOT NULL, auto | Record creation time |
| updatedAt | TIMESTAMPTZ | NOT NULL, auto | Record update time |

**Indexes**:
- `idx_run_steps_run_status` on (runId, status)
- `idx_run_steps_tenant_run` on (tenantId, runId)
- `idx_run_steps_input_hash` on (stepId, inputHash) - for cache lookups

**Constraints**:
- UNIQUE (runId, stepId) - one step per run

**Validation Rules**:
- `outputArtifactIds` must be set when `status` = 'completed'
- `error` must be set when `status` = 'failed'
- `cacheHit` = true implies `status` = 'skipped'
- Status transitions: pending → running → (completed | failed | skipped)

---

### StepCache

Mapping from cache key to artifact references for step output reuse.

**Table**: `step_cache`
**Extends**: `BaseEntity` (tenantId, createdAt, updatedAt)

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK, generated | Unique cache entry identifier |
| cacheKey | VARCHAR(512) | NOT NULL, UNIQUE | Format: `{workflowName}:{stepId}:{inputHash}` |
| tenantId | VARCHAR(255) | NOT NULL, indexed | Tenant isolation |
| workflowName | VARCHAR(255) | NOT NULL | Workflow name |
| stepId | VARCHAR(255) | NOT NULL | Step identifier |
| inputHash | VARCHAR(64) | NOT NULL | SHA-256 hash of input |
| artifactIds | JSONB | NOT NULL | Array of artifact UUIDs |
| scope | ENUM | NOT NULL, default 'global' | `global`, `run_only` |
| createdAt | TIMESTAMPTZ | NOT NULL, auto | Record creation time |
| updatedAt | TIMESTAMPTZ | NOT NULL, auto | Record update time |

**Indexes**:
- `idx_step_cache_lookup` on (workflowName, stepId, inputHash)
- `idx_step_cache_tenant` on (tenantId)

**Notes**:
- Redis is used as hot cache with TTL; this table is cold/durable cache
- Cache key format ensures uniqueness across workflows and inputs
- `scope` = 'run_only' entries should be cleaned up after run completion

---

### Artifact (Existing)

Output produced by a step. **Already exists** at `dao/src/entities/artifact.entity.ts`.

**Table**: `artifacts`

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | PK |
| tenantId | VARCHAR(255) | Tenant isolation |
| runId | UUID | Parent run |
| skillId | VARCHAR(64) | Skill that produced artifact |
| type | VARCHAR(100) | MIME type (e.g., 'video/mp4') |
| uri | VARCHAR(2048) | Storage location |
| contentHash | CHAR(64) | SHA-256 for deduplication |
| sizeBytes | BIGINT | File size |
| filename | VARCHAR(255) | Optional filename |
| metadata | JSONB | Additional context |
| createdAt | TIMESTAMPTZ | Created timestamp |
| updatedAt | TIMESTAMPTZ | Updated timestamp |

**No changes needed** - Run Engine will use existing artifact entity.

---

## Type Definitions (TypeScript Interfaces)

### WorkflowSpec

```typescript
interface WorkflowSpec {
  workflowName: string;        // e.g., "campaign.build.v1"
  version: string;             // e.g., "1.0.0"
  steps: StepSpec[];           // Ordered by definition (not execution order)
}
```

### StepSpec

```typescript
interface StepSpec {
  stepId: string;              // e.g., "generate_bgm_track"
  skillId: string;             // Skill to execute
  dependsOn: string[];         // Step IDs this step depends on
  inputSelector: (ctx: RunContext) => Record<string, unknown>;
  cachePolicy: {
    enabled: boolean;
    scope: 'global' | 'run_only';
  };
  retryPolicy: {
    maxAttempts: number;       // 1-5
    backoffMs: number;         // Initial backoff (exponential)
  };
}
```

### RunContext

```typescript
interface RunContext {
  runId: string;
  tenantId: string;
  workflowName: string;
  triggerPayload: Record<string, unknown>;
  stepOutputs: Map<string, StepOutput>;  // stepId → output
  artifacts: Map<string, string[]>;       // stepId → artifactIds
}
```

### StepOutput

```typescript
interface StepOutput {
  stepId: string;
  status: 'completed' | 'skipped' | 'failed';
  outputArtifactIds: string[];
  data?: Record<string, unknown>;  // Optional step-specific data
}
```

### ChangeRequest

```typescript
interface ChangeRequest {
  type: ChangeRequestType;
  payload: Record<string, unknown>;
}

type ChangeRequestType =
  | 'audio.update'
  | 'intro.update'
  | 'outcome.update'
  | 'game_config.update'
  | 'asset3d.replace'
  | 'full_rebuild';
```

---

## State Transitions

### Run Status

```
           ┌───────────────────┐
           │      queued       │
           └─────────┬─────────┘
                     │ orchestrator picks up
                     ▼
           ┌───────────────────┐
           │      running      │
           └─────────┬─────────┘
                     │
     ┌───────────────┼───────────────┐
     │               │               │
     ▼               ▼               ▼
┌─────────┐   ┌───────────┐   ┌───────────┐
│completed│   │   failed  │   │ cancelled │
└─────────┘   └───────────┘   └───────────┘
```

### Step Status

```
           ┌───────────────────┐
           │      pending      │
           └─────────┬─────────┘
                     │ dependencies met
                     ▼
     ┌───────────────┴───────────────┐
     │ cache hit?                    │
     │                               │
     ▼                               ▼
┌─────────┐                 ┌───────────────────┐
│ skipped │                 │      running      │
└─────────┘                 └─────────┬─────────┘
                                      │
                     ┌────────────────┴────────────────┐
                     │                                 │
                     ▼                                 ▼
              ┌───────────┐                     ┌───────────┐
              │ completed │                     │   failed  │
              └───────────┘                     └───────────┘
                                                      │
                                                      │ retry?
                                                      ▼
                                               back to running
```

---

## Migration Script

```sql
-- Migration: CreateRunEngineSchema
-- Description: Create tables for Run Engine feature

-- Enum types
CREATE TYPE run_status AS ENUM ('queued', 'running', 'completed', 'failed', 'cancelled');
CREATE TYPE run_trigger_type AS ENUM ('initial', 'update');
CREATE TYPE step_status AS ENUM ('pending', 'running', 'skipped', 'completed', 'failed');
CREATE TYPE cache_scope AS ENUM ('global', 'run_only');

-- Runs table
CREATE TABLE runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL,
  workflow_name VARCHAR(255) NOT NULL,
  workflow_version VARCHAR(50) NOT NULL,
  trigger_type run_trigger_type NOT NULL,
  trigger_payload JSONB,
  status run_status NOT NULL DEFAULT 'queued',
  base_run_id UUID REFERENCES runs(id) ON DELETE SET NULL,
  error JSONB,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT chk_base_run_id_initial CHECK (
    trigger_type = 'initial' AND base_run_id IS NULL OR
    trigger_type = 'update' AND base_run_id IS NOT NULL
  )
);

CREATE INDEX idx_runs_tenant_id ON runs(tenant_id);
CREATE INDEX idx_runs_tenant_status ON runs(tenant_id, status);
CREATE INDEX idx_runs_tenant_workflow ON runs(tenant_id, workflow_name);
CREATE INDEX idx_runs_base_run ON runs(base_run_id) WHERE base_run_id IS NOT NULL;

-- Run steps table
CREATE TABLE run_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  tenant_id VARCHAR(255) NOT NULL,
  step_id VARCHAR(255) NOT NULL,
  skill_id VARCHAR(255) NOT NULL,
  status step_status NOT NULL DEFAULT 'pending',
  input_hash VARCHAR(64) NOT NULL,
  attempt INTEGER NOT NULL DEFAULT 1,
  output_artifact_ids JSONB,
  error JSONB,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  duration_ms INTEGER,
  cache_hit BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT uq_run_step UNIQUE (run_id, step_id)
);

CREATE INDEX idx_run_steps_tenant_id ON run_steps(tenant_id);
CREATE INDEX idx_run_steps_run_status ON run_steps(run_id, status);
CREATE INDEX idx_run_steps_tenant_run ON run_steps(tenant_id, run_id);
CREATE INDEX idx_run_steps_input_hash ON run_steps(step_id, input_hash);

-- Step cache table
CREATE TABLE step_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key VARCHAR(512) NOT NULL UNIQUE,
  tenant_id VARCHAR(255) NOT NULL,
  workflow_name VARCHAR(255) NOT NULL,
  step_id VARCHAR(255) NOT NULL,
  input_hash VARCHAR(64) NOT NULL,
  artifact_ids JSONB NOT NULL,
  scope cache_scope NOT NULL DEFAULT 'global',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_step_cache_tenant ON step_cache(tenant_id);
CREATE INDEX idx_step_cache_lookup ON step_cache(workflow_name, step_id, input_hash);

-- Update trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_runs_updated_at
  BEFORE UPDATE ON runs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_run_steps_updated_at
  BEFORE UPDATE ON run_steps
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_step_cache_updated_at
  BEFORE UPDATE ON step_cache
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

---

## Query Patterns

### Get Run with Steps

```sql
SELECT r.*,
  (SELECT json_agg(rs.*) FROM run_steps rs WHERE rs.run_id = r.id) as steps
FROM runs r
WHERE r.tenant_id = $1 AND r.id = $2;
```

### Get Ready Steps (dependencies completed)

```sql
SELECT rs.*
FROM run_steps rs
JOIN runs r ON rs.run_id = r.id
WHERE r.id = $1
  AND rs.status = 'pending'
  AND NOT EXISTS (
    SELECT 1 FROM run_steps dep
    WHERE dep.run_id = rs.run_id
      AND dep.step_id = ANY(SELECT jsonb_array_elements_text($2->rs.step_id->'depends_on'))
      AND dep.status NOT IN ('completed', 'skipped')
  );
```

### Cache Lookup

```sql
SELECT artifact_ids
FROM step_cache
WHERE workflow_name = $1
  AND step_id = $2
  AND input_hash = $3
  AND tenant_id = $4;
```

### Update Run Status

```sql
UPDATE runs
SET status = $2,
    completed_at = CASE WHEN $2 IN ('completed', 'failed', 'cancelled') THEN NOW() ELSE NULL END,
    error = $3
WHERE id = $1 AND tenant_id = $4
RETURNING *;
```
