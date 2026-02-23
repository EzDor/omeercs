# Data Model

## Overview

The data model is defined as TypeORM entities in the `dao` package (`dao/src/entities/`). All tables live in the PostgreSQL `app` schema. The database uses PostgreSQL 17 with the pgvector extension for vector search capabilities.

## Multi-Tenancy Pattern

Every tenant-aware entity extends `BaseEntity`, which provides three fields:

```typescript
// dao/src/entities/base.entity.ts
export abstract class BaseEntity {
  @Column({ name: 'tenant_id' })
  tenantId: string;      // Clerk organization ID

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
```

The `tenantId` is the Clerk organization ID, extracted from the JWT during authentication. It's indexed on every entity for efficient tenant-scoped queries. The `TenantContextInterceptor` also sets a PostgreSQL session variable (`app.current_tenant_id`) at the start of each transaction, enabling potential row-level security policies.

**Tenant-aware entities**: ChatSession, Run, RunStep, StepCache, Artifact, GenerationJob, Campaign, AiGeneration

**Not tenant-aware**: ChatMessage (scoped through its parent ChatSession), LangGraph checkpoint tables (internal)

## Entity Relationship Diagram

```
ChatSession ──┐
   (1:N)      │
ChatMessage ──┘

Campaign ──────────┐
   (1:N optional)  │
AiGeneration ──────┘

Run ────────────────┐          Run (self-reference)
   (1:N cascade)    │             ↑
RunStep ────────────┘          baseRunId (nullable)

GenerationJob ─── (N:1 optional) ──── Artifact

StepCache (standalone, indexed by workflow + step + inputHash)
```

## Entity Details

### ChatSession

**Table**: `chat_sessions`
**Purpose**: Represents a conversation thread between a user and the AI assistant.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID (PK) | Auto-generated unique identifier |
| tenantId | VARCHAR(255) | Organization ID for multi-tenant isolation |
| userId | VARCHAR(255) | Clerk user ID of the session owner |
| title | VARCHAR(500), nullable | User-visible session title (auto-generated from first message) |
| lastMessageAt | TIMESTAMP | Timestamp of the most recent message, used for sorting |
| createdAt | TIMESTAMP | When the session was created |
| updatedAt | TIMESTAMP | When the session was last modified |

**Relationships**: Has many `ChatMessage` entities (cascade delete — deleting a session deletes all its messages).

**Indexes**: Compound index on `(tenantId, userId)` for listing a user's sessions. Index on `lastMessageAt` for chronological sorting.

---

### ChatMessage

**Table**: `chat_messages`
**Purpose**: A single message within a chat session. Messages alternate between `user` and `assistant` roles.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID (PK) | Auto-generated unique identifier |
| sessionId | UUID (FK) | References the parent ChatSession |
| role | ENUM('user', 'assistant') | Who authored the message |
| content | TEXT | The message body |
| createdAt | TIMESTAMP | When the message was sent |

**Relationships**: Belongs to one `ChatSession` (ON DELETE CASCADE).

**Indexes**: Compound index on `(sessionId, createdAt)` for retrieving messages in chronological order.

**Note**: This entity does NOT extend BaseEntity and has no `tenantId`. Tenant isolation is achieved through the parent ChatSession — you can only access messages if you can access the session.

---

### Run

**Table**: `runs`
**Purpose**: Represents a complete workflow execution. When a campaign is generated, a Run is created to track the entire process.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID (PK) | Auto-generated unique identifier |
| tenantId | VARCHAR(255) | Organization ID |
| workflowName | VARCHAR(255) | Which workflow YAML to execute (e.g., `campaign.build`) |
| workflowVersion | VARCHAR(50) | Semantic version of the workflow |
| triggerType | VARCHAR(20) | `initial` for new runs, `update` for re-runs |
| triggerPayload | JSONB, nullable | The input data that triggered this run (brief, constraints, etc.) |
| status | VARCHAR(20) | `queued` → `running` → `completed` / `failed` / `cancelled` |
| baseRunId | UUID, nullable | For `update` trigger type — references the original run being updated |
| error | JSONB, nullable | Error details: `{code, message, failedStepId, timestamp}` |
| context | JSONB, nullable | Accumulated campaign context (artifact references, computed data) |
| startedAt | TIMESTAMP WITH TZ | When execution began |
| completedAt | TIMESTAMP WITH TZ | When execution finished |
| durationMs | INTEGER | Total execution time in milliseconds |
| createdAt | TIMESTAMP WITH TZ | Record creation time |
| updatedAt | TIMESTAMP WITH TZ | Last update time |

**Relationships**:
- Has many `RunStep` entities (cascade delete)
- Optional self-reference via `baseRunId` (for update runs that build on a previous run)

**Status Lifecycle**:
```
queued  →  running  →  completed
                   →  failed
                   →  cancelled
```

---

### RunStep

**Table**: `run_steps`
**Purpose**: Represents a single skill execution within a workflow run. Each step in the workflow YAML becomes a RunStep record.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID (PK) | Auto-generated unique identifier |
| runId | UUID (FK) | References the parent Run |
| tenantId | VARCHAR(255) | Organization ID |
| stepId | VARCHAR(255) | The step identifier from the workflow YAML (e.g., `intro_image`) |
| skillId | VARCHAR(255) | Which skill to execute (e.g., `generate_intro_image`) |
| status | VARCHAR(20) | `pending` → `running` → `completed` / `skipped` / `failed` |
| inputHash | VARCHAR(64) | SHA256 hash of the resolved inputs, used for cache lookups |
| attempt | INTEGER | Current retry attempt number (starts at 1) |
| outputArtifactIds | JSONB, nullable | Array of artifact UUIDs produced by this step |
| error | JSONB, nullable | Error details: `{code, message, attempt, timestamp, details}` |
| startedAt | TIMESTAMP WITH TZ | When step execution began |
| endedAt | TIMESTAMP WITH TZ | When step execution finished |
| durationMs | INTEGER | Step execution time in milliseconds |
| cacheHit | BOOLEAN | Whether this step's result was served from cache |
| createdAt | TIMESTAMP WITH TZ | Record creation time |
| updatedAt | TIMESTAMP WITH TZ | Last update time |

**Relationships**: Belongs to one `Run` (ON DELETE CASCADE).

**Unique Constraint**: `(runId, stepId)` — only one execution per step per run.

**Status Lifecycle**:
```
pending  →  running  →  completed
                    →  skipped    (if dependencies failed or step is optional)
                    →  failed
```

---

### StepCache

**Table**: `step_cache`
**Purpose**: Input-based caching for step executions. If the same step receives the same inputs, the cached result is returned instead of re-executing the skill.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID (PK) | Auto-generated unique identifier |
| cacheKey | VARCHAR(512), unique | Composite cache key combining workflow, step, and input hash |
| tenantId | VARCHAR(255) | Organization ID |
| workflowName | VARCHAR(255) | Which workflow this cache entry belongs to |
| stepId | VARCHAR(255) | Which step this cache entry is for |
| inputHash | VARCHAR(64) | SHA256 of the step's resolved inputs |
| artifactIds | JSONB | Array of artifact UUIDs from the cached execution |
| data | JSONB, nullable | Cached step output data (non-artifact results) |
| scope | VARCHAR(20) | `global` (reusable across runs) or `run_only` (single run) |
| createdAt | TIMESTAMP WITH TZ | When the cache entry was created |
| updatedAt | TIMESTAMP WITH TZ | When the cache entry was last updated |

**Cache Key Formula**: `hash(workflowName + stepId + inputHash)`

**Scopes**:
- `global`: The cached result can be reused by any run that has the same inputs for the same step. Useful for deterministic operations like image generation with the same prompt.
- `run_only`: The cached result is only valid within the same run. Used when outputs depend on run-specific context.

---

### Artifact

**Table**: `artifacts`
**Purpose**: Persists generated media assets (images, videos, audio, JSON, game bundles) with content-addressable storage.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID (PK) | Auto-generated unique identifier |
| tenantId | VARCHAR(255) | Organization ID |
| runId | UUID | Which run produced this artifact |
| skillId | VARCHAR(64) | Which skill generated it (e.g., `generate_intro_image`) |
| type | VARCHAR(100) | MIME-like type: `image/png`, `video/mp4`, `audio/mp3`, `text/json` |
| uri | VARCHAR(2048) | Storage URI — local filesystem path or CDN URL |
| contentHash | CHAR(64) | SHA256 of the file content, used for deduplication |
| sizeBytes | BIGINT | File size in bytes |
| filename | VARCHAR(255), nullable | Original filename |
| metadata | JSONB, nullable | Type-specific metadata (image dimensions, video duration, etc.) |
| createdAt | TIMESTAMP WITH TZ | Creation timestamp |
| updatedAt | TIMESTAMP WITH TZ | Update timestamp |

**Content-Addressable Storage**: The `contentHash` enables deduplication. If two steps produce identical output, only one copy is stored on disk. The `StorageService` checks for existing content before writing.

---

### GenerationJob

**Table**: `generation_jobs`
**Purpose**: Tracks asynchronous media generation jobs from external providers (Stability AI, Replicate, Suno, etc.). These providers return a job ID and require polling for completion.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID (PK) | Auto-generated unique identifier |
| tenantId | VARCHAR(255) | Organization ID |
| runId | UUID | Which run this job belongs to |
| runStepId | UUID | Which step initiated this job |
| providerId | VARCHAR(100) | Provider name (e.g., `replicate`, `stability`, `suno`) |
| providerJobId | VARCHAR(255) | The job ID returned by the external provider |
| mediaType | VARCHAR(50) | What's being generated: `image`, `video`, `audio` |
| status | VARCHAR(20) | `pending` → `processing` → `completed` / `failed` / `timed_out` |
| pollIntervalMs | INTEGER | How often to check the provider for completion |
| timeoutMs | INTEGER | Maximum time to wait before marking as timed_out |
| attempts | INTEGER | Number of poll attempts made |
| inputParams | JSONB | The generation parameters sent to the provider |
| resultUri | VARCHAR(2048), nullable | URL to the generated asset on the provider's servers |
| artifactId | UUID (FK), nullable | Links to the persisted Artifact once downloaded and stored |
| errorMessage | TEXT, nullable | Error description if the job failed |
| costUsd | DECIMAL(10,4), nullable | Billed cost from the provider |
| startedAt | TIMESTAMP WITH TZ | When the provider started processing |
| completedAt | TIMESTAMP WITH TZ | When the provider finished |
| createdAt | TIMESTAMP WITH TZ | Record creation time |
| updatedAt | TIMESTAMP WITH TZ | Last update time |

**Relationships**: Optional reference to `Artifact` (SET NULL on delete). The artifact is created after the job completes and the result is downloaded.

**Status Lifecycle**:
```
pending  →  processing  →  completed
                        →  failed
                        →  timed_out
```

---

### Campaign

**Table**: `campaigns`
**Purpose**: The top-level entity representing a marketing campaign. Contains configuration, references to generated assets, and the playable game bundle URL.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID (PK) | Auto-generated unique identifier |
| tenantId | VARCHAR(255) | Organization ID |
| userId | VARCHAR(255) | Clerk user ID of the creator |
| name | VARCHAR(255) | Campaign display name |
| templateId | VARCHAR(100) | Game template reference (e.g., `spin_wheel`) |
| status | VARCHAR(20) | `draft` → `generating` → `live` / `failed` / `archived` |
| config | JSONB, nullable | Campaign configuration: theme colors, game settings, asset slots |
| bundleUrl | VARCHAR(2048), nullable | URL to the playable game bundle (set when generation completes) |
| thumbnailUrl | VARCHAR(2048), nullable | Campaign thumbnail image URL |
| latestRunId | UUID, nullable | Most recent build run ID |
| version | INTEGER | Incremental version number, bumped on each rebuild |
| deletedAt | TIMESTAMP, nullable | Soft-delete timestamp (campaigns are never hard-deleted) |
| createdAt | TIMESTAMP | Creation timestamp |
| updatedAt | TIMESTAMP | Last update timestamp |

**Soft Delete**: Campaigns use `@DeleteDateColumn` — the `DELETE` endpoint sets `deletedAt` instead of removing the row. This allows restoration.

**Status Lifecycle**:
```
draft  →  generating  →  live
                     →  failed  →  generating (retry)
live  →  archived  →  live (restore)
```

**Version Control**: The `version` field increments on each rebuild. Update requests include `expectedVersion` to detect concurrent modification conflicts.

---

### AiGeneration

**Table**: `ai_generations`
**Purpose**: Tracks individual AI generation requests (plan generation, copy generation, theme extraction) from the Intelligence system. Each generation can be accepted or rejected by the user.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID (PK) | Auto-generated unique identifier |
| tenantId | VARCHAR(255) | Organization ID |
| campaignId | UUID (FK), nullable | Optional link to a Campaign |
| userId | VARCHAR(255) | Clerk user ID who requested the generation |
| generationType | VARCHAR(30) | `plan`, `copy`, `theme_brief`, or `theme_image` |
| status | VARCHAR(20) | `pending` → `completed` / `failed` |
| accepted | BOOLEAN | Whether the user accepted this generation's output |
| inputParams | JSONB | The input parameters sent to the LLM |
| output | JSONB, nullable | The generated output (plan, copy, theme data, etc.) |
| error | JSONB, nullable | Error details if generation failed |
| durationMs | INTEGER, nullable | How long the generation took |
| llmModel | VARCHAR(100), nullable | Which LLM model was used |
| attempts | INTEGER | Number of generation attempts |
| createdAt | TIMESTAMP | Record creation time |
| updatedAt | TIMESTAMP | Last update time |

**Relationships**: Optional reference to `Campaign` (SET NULL on delete).

**Acceptance Flow**: When a user generates a plan, the output is stored with `accepted: false`. If the user clicks "Accept", the plan is applied to the campaign and `accepted` is set to `true`.

---

## LangGraph Checkpoint Tables

These tables are NOT TypeORM entities — they're created directly via a migration (`CreateCheckpointTables`) for the LangGraph workflow engine:

| Table | Purpose |
|-------|---------|
| `checkpoint_migrations` | Tracks checkpoint schema versions |
| `checkpoints` | Stores thread state snapshots with parent tracking |
| `checkpoint_blobs` | Binary channel data for workflow state |
| `checkpoint_writes` | Task write history for replay |

These enable the Workflow Orchestration system to pause and resume workflows from any checkpoint.

## Migration Timeline

Migrations are in `dao/src/migrations/` and run in order by their timestamp prefix:

| Migration | What It Creates |
|-----------|----------------|
| `1767170393521-InitialSchema` | ChatSession + ChatMessage tables |
| `1737234567890-CreateArtifactTable` | Artifact table |
| `1737312000000-CreateRunEngineSchema` | Run, RunStep, StepCache tables + triggers |
| `1770118781389-AddContextColumnToRuns` | Adds `context` JSONB to Run |
| `1770791355439-AddDurationMsToRuns` | Adds duration tracking to Run |
| `1770791400000-CreateCheckpointTables` | LangGraph checkpoint tables |
| `1770791500000-AddDataToStepCache` | Adds `data` field to StepCache |
| `1770900000000-CreateGenerationJobTable` | GenerationJob table |
| `1771169410721-CreateCampaignTable` | Campaign table |
| `1771218568471-CreateAiGenerationTable` | AiGeneration table |

### Running Migrations

```bash
# Run all pending migrations
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/agentic_template pnpm migration:run

# Check migration status
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/agentic_template pnpm migration:show

# Revert the last migration
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/agentic_template pnpm migration:revert

# Generate a new migration from entity changes
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/agentic_template pnpm migration:generate dao/src/migrations/MigrationName
```
