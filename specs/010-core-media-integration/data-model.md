# Data Model: Core Media Integration

**Branch**: `010-core-media-integration` | **Date**: 2026-02-12

## Existing Entities (Modified)

### Artifact (existing — `dao/src/entities/artifact.entity.ts`)

No schema changes required. The existing entity already has all needed fields:

| Column | Type | Notes |
|--------|------|-------|
| id | uuid (PK) | Auto-generated |
| tenant_id | varchar(255) | Indexed |
| run_id | uuid | Indexed |
| skill_id | varchar(64) | Indexed |
| type | varchar(100) | Artifact type (e.g., `intro_video`, `bgm`, `sfx`) |
| uri | varchar(2048) | **Updated to store local HTTP URL** (was local filesystem path) |
| content_hash | char(64) | SHA256 — used for deduplication |
| size_bytes | bigint | File size |
| filename | varchar(255) | Optional original filename |
| metadata | jsonb | Provider metadata, generation params, cost_usd |
| created_at | timestamptz | Auto |
| updated_at | timestamptz | Auto |

**Usage change**: The `uri` field will store HTTP URLs (e.g., `/api/assets/{tenantId}/{runId}/{type}/{hash}.mp4`) instead of raw filesystem paths. The `metadata` JSONB column stores provider-specific data (provider_id, model, cost_usd, duration_sec, resolution, etc.).

### StandardArtifactTypes (existing — `dto/src/campaign-context/standard-artifact-types.enum.ts`)

**Extend** the existing const object with new media types:

| New Type | Value | Description |
|----------|-------|-------------|
| MODEL_3D | `model_3d` | GLB/GLTF 3D model |
| TEXTURE | `texture` | 2D texture for materials |
| ENVIRONMENT_MAP | `environment_map` | HDRI environment map |
| OUTCOME_WIN_VIDEO | `outcome_win_video` | Already exists |
| OUTCOME_LOSE_VIDEO | `outcome_lose_video` | Already exists |

---

## New Entities

### GenerationJob (`dao/src/entities/generation-job.entity.ts`)

Tracks async media generation jobs from external providers. Persisted to DB for crash recovery.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | uuid (PK) | Auto-generated | Internal ID |
| tenant_id | varchar(255) | NOT NULL, indexed | From BaseEntity |
| run_id | uuid | NOT NULL, indexed | Associated run |
| run_step_id | uuid | NOT NULL, indexed | Associated run step |
| provider_id | varchar(100) | NOT NULL | Provider adapter ID (e.g., `nano-banana-video`, `suno`, `meshy`) |
| provider_job_id | varchar(255) | NOT NULL | External provider's job ID |
| media_type | varchar(50) | NOT NULL | `video`, `audio_sfx`, `audio_bgm`, `model_3d`, `image`, `texture`, `environment_map` |
| status | varchar(20) | NOT NULL, default `pending` | `pending`, `processing`, `completed`, `failed`, `timed_out` |
| poll_interval_ms | integer | NOT NULL | Provider-specific poll interval |
| timeout_ms | integer | NOT NULL | Provider-specific timeout |
| attempts | integer | NOT NULL, default 0 | Number of poll attempts |
| input_params | jsonb | NOT NULL | Generation parameters (prompt, duration, resolution, etc.) |
| result_uri | varchar(2048) | nullable | Provider's temporary result URL |
| artifact_id | uuid | nullable | FK to Artifact after download+store |
| error_message | text | nullable | Error details on failure |
| cost_usd | decimal(10,4) | nullable | Estimated generation cost |
| started_at | timestamptz | nullable | When processing began |
| completed_at | timestamptz | nullable | When job finished |
| created_at | timestamptz | Auto | From BaseEntity |
| updated_at | timestamptz | Auto | From BaseEntity |

**Indexes**:
- `(tenant_id, status)` — recover incomplete jobs per tenant on restart
- `(provider_id, status)` — concurrency counting per provider
- `(run_step_id)` — find jobs for a step

**State Transitions**:
```
pending → processing → completed → (artifact created)
pending → processing → failed
pending → processing → timed_out
pending → failed (submit error)
```

**Recovery**: On worker start, query `WHERE status IN ('pending', 'processing') AND created_at > NOW() - timeout_ms`. Resume polling for each.

---

## Entity Relationships

```
Run (1) ──── (*) RunStep (1) ──── (*) GenerationJob
                    │
                    └──── (*) Artifact
                              │
GenerationJob (1) ──── (0..1) Artifact (via artifact_id FK)
```

- A Run has many RunSteps
- A RunStep can trigger multiple GenerationJobs (e.g., fallback)
- A completed GenerationJob links to one Artifact
- Artifacts are associated to runs and tenants

---

## Migration: `CreateGenerationJobTable`

```sql
CREATE TABLE IF NOT EXISTS app.generation_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL,
  run_id UUID NOT NULL,
  run_step_id UUID NOT NULL,
  provider_id VARCHAR(100) NOT NULL,
  provider_job_id VARCHAR(255) NOT NULL,
  media_type VARCHAR(50) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  poll_interval_ms INTEGER NOT NULL,
  timeout_ms INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  input_params JSONB NOT NULL,
  result_uri VARCHAR(2048),
  artifact_id UUID REFERENCES app.artifacts(id),
  error_message TEXT,
  cost_usd DECIMAL(10,4),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_generation_jobs_tenant_status ON app.generation_jobs (tenant_id, status);
CREATE INDEX idx_generation_jobs_provider_status ON app.generation_jobs (provider_id, status);
CREATE INDEX idx_generation_jobs_run_step ON app.generation_jobs (run_step_id);
```
