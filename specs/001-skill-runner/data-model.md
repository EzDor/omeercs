# Data Model: Skill Runner

**Feature**: Skill Runner | **Date**: 2026-01-18

## Overview

This document defines the data entities, relationships, and validation rules for the Skill Runner system. The model supports skill execution tracking, artifact registration, and execution auditing.

---

## Entity Relationship Diagram

```
┌─────────────────┐         ┌─────────────────────┐
│  SkillDescriptor│         │   SkillExecution    │
│  (YAML/Catalog) │         │   (Optional/Future) │
├─────────────────┤         ├─────────────────────┤
│ skill_id (PK)   │◄────────│ skill_id (FK)       │
│ version         │         │ run_id (PK)         │
│ title           │         │ tenant_id           │
│ input_schema    │         │ status              │
│ output_schema   │         │ started_at          │
│ policy          │         │ completed_at        │
│ implementation  │         │ input_hash          │
│ produces_artifacts│        │ output_data         │
└─────────────────┘         │ error_info          │
                            └─────────┬───────────┘
                                      │ 1
                                      │
                                      │ *
                            ┌─────────▼───────────┐
                            │     Artifact        │
                            ├─────────────────────┤
                            │ id (PK)             │
                            │ tenant_id           │
                            │ run_id (FK)         │
                            │ type                │
                            │ uri                 │
                            │ content_hash        │
                            │ size_bytes          │
                            │ metadata            │
                            │ created_at          │
                            └─────────────────────┘
```

---

## Entities

### 1. SkillDescriptor (YAML Configuration - Not in Database)

Loaded from YAML files in the skill catalog. Not persisted in database.

| Field | Type | Description | Validation |
|-------|------|-------------|------------|
| skill_id | string | Unique identifier | Required, alphanumeric + underscore, max 64 chars |
| version | string | Semantic version | Required, semver format (x.y.z) |
| title | string | Human-readable name | Required, max 100 chars |
| description | string | Detailed description | Optional, max 1000 chars |
| input_schema | JSON Schema | Input validation schema | Required, valid JSON Schema draft-07 |
| output_schema | JSON Schema | Output validation schema | Required, valid JSON Schema draft-07 |
| implementation | object | Handler configuration | Required |
| implementation.type | enum | Handler type | Required, one of: ts_function, http_call, cli_command |
| implementation.handler | string | Handler path/URL | Required |
| produces_artifacts | string[] | Artifact types produced | Optional |
| policy | object | Execution constraints | Optional |
| policy.timeout_ms | number | Execution timeout | Optional, default 60000, min 1000, max 600000 |
| policy.max_retries | number | Retry limit | Optional, default 0 |
| policy.allowed_providers | string[] | Provider whitelist | Optional |
| observability | object | Logging/metrics config | Optional |
| observability.log_level | enum | Log verbosity | Optional, one of: debug, info, warn, error |
| observability.metrics_emit | boolean | Emit metrics | Optional, default true |

**Example YAML**:
```yaml
skill_id: generate_bgm_track
version: "1.0.0"
title: Generate Background Music Track
description: |
  Generates a background music track based on mood, genre, and duration parameters.
  Uses AI audio generation models to create royalty-free music.

input_schema:
  type: object
  required: [mood, genre, duration_seconds]
  properties:
    mood:
      type: string
      enum: [happy, sad, energetic, calm, mysterious, epic]
    genre:
      type: string
      enum: [electronic, orchestral, ambient, pop, rock]
    duration_seconds:
      type: integer
      minimum: 10
      maximum: 300
    bpm:
      type: integer
      minimum: 60
      maximum: 180
      default: 120

output_schema:
  type: object
  required: [track_uri, format, duration_ms]
  properties:
    track_uri:
      type: string
      format: uri
    format:
      type: string
      enum: [wav, mp3, ogg]
    duration_ms:
      type: integer
    metadata:
      type: object

implementation:
  type: ts_function
  handler: handlers/generate-bgm-track.handler

produces_artifacts:
  - audio/wav
  - audio/mp3

policy:
  timeout_ms: 120000
  allowed_providers: [suno, udio]

observability:
  log_level: info
  metrics_emit: true
```

---

### 2. Artifact (Database Entity)

Persisted artifact metadata for tracking and retrieval.

| Field | Type | Description | Validation |
|-------|------|-------------|------------|
| id | UUID | Primary key | Auto-generated |
| tenant_id | string | Tenant identifier | Required, from CLS context |
| run_id | string | Execution run identifier | Required, UUID format |
| skill_id | string | Source skill identifier | Required |
| type | string | MIME type or artifact type | Required, max 100 chars |
| uri | string | Storage location | Required, valid URI, max 2048 chars |
| content_hash | string | SHA-256 hash of content | Required, 64 hex chars |
| size_bytes | bigint | File size in bytes | Required, >= 0 |
| filename | string | Original filename | Optional, max 255 chars |
| metadata | jsonb | Additional metadata | Optional |
| created_at | timestamp | Creation time | Auto-set |
| updated_at | timestamp | Last update time | Auto-set |

**TypeORM Entity**:
```typescript
@Entity({ name: 'artifacts', schema: 'app' })
export class ArtifactEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  @Index()
  tenantId: string;

  @Column({ name: 'run_id' })
  @Index()
  runId: string;

  @Column({ name: 'skill_id' })
  @Index()
  skillId: string;

  @Column()
  type: string;

  @Column({ length: 2048 })
  uri: string;

  @Column({ name: 'content_hash', length: 64 })
  contentHash: string;

  @Column({ name: 'size_bytes', type: 'bigint' })
  sizeBytes: number;

  @Column({ nullable: true })
  filename?: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
```

**Indexes**:
- `tenant_id` - For tenant isolation queries
- `run_id` - For retrieving all artifacts from an execution
- `skill_id` - For analytics and skill-specific queries
- Composite: `(tenant_id, run_id)` - Common query pattern

---

### 3. SkillExecution (Future - Not in MVP)

Optional entity for execution history and auditing. Deferred to future iteration.

| Field | Type | Description |
|-------|------|-------------|
| run_id | UUID | Primary key |
| tenant_id | string | Tenant identifier |
| skill_id | string | Executed skill |
| version | string | Skill version used |
| status | enum | pending, running, completed, failed, timeout |
| input_hash | string | Hash of input for deduplication |
| output_data | jsonb | Execution output (if success) |
| error_info | jsonb | Error details (if failed) |
| started_at | timestamp | Execution start |
| completed_at | timestamp | Execution end |
| duration_ms | integer | Total execution time |

---

## Value Objects (Interfaces)

### SkillResult

Standard execution result envelope.

```typescript
interface SkillResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
  error_code?: SkillErrorCode;
  artifacts: ArtifactRef[];
  debug: SkillDebugInfo;
}

interface ArtifactRef {
  id: string;
  type: string;
  uri: string;
  contentHash: string;
  sizeBytes: number;
  filename?: string;
  metadata?: Record<string, unknown>;
}

interface SkillDebugInfo {
  run_id: string;
  skill_id: string;
  version: string;
  duration_ms: number;
  timing: {
    input_validation_ms: number;
    execution_ms: number;
    output_validation_ms: number;
    artifact_registration_ms: number;
  };
  provider?: string;
  model?: string;
}

type SkillErrorCode =
  | 'INPUT_VALIDATION_FAILED'
  | 'OUTPUT_VALIDATION_FAILED'
  | 'EXECUTION_ERROR'
  | 'POLICY_VIOLATION'
  | 'TIMEOUT'
  | 'SKILL_NOT_FOUND'
  | 'VERSION_NOT_FOUND';
```

### ExecutionContext

Enhanced context provided to skill handlers.

```typescript
interface EnhancedSkillExecutionContext {
  // Existing fields
  tenantId: string;
  executionId: string;
  skillId: string;
  provider?: string;

  // New fields
  runId: string;
  workspaceDir: string;
  artifactBaseUri: string;
  logger: Logger;
  secrets: SecretsAccessor;
  policy: SkillPolicy;
  signal?: AbortSignal;
}

interface SecretsAccessor {
  get(key: string): string | undefined;
  has(key: string): boolean;
  keys(): string[];
}

interface SkillPolicy {
  timeout_ms: number;
  max_retries: number;
  allowed_providers?: string[];
  network_access?: boolean;
  filesystem_access?: 'workspace' | 'readonly' | 'none';
}
```

---

## State Transitions

### Skill Execution Lifecycle

```
[Start]
    │
    ▼
┌─────────────────┐
│  VALIDATING_INPUT │ ──────► [INPUT_VALIDATION_ERROR]
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   EXECUTING     │ ──────► [EXECUTION_ERROR]
└────────┬────────┘          [TIMEOUT_ERROR]
         │                   [POLICY_VIOLATION]
         ▼
┌─────────────────┐
│ VALIDATING_OUTPUT│ ──────► [OUTPUT_VALIDATION_ERROR]
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ REGISTERING_ARTIFACTS │
└────────┬────────┘
         │
         ▼
    [SUCCESS]
```

---

## Validation Rules Summary

| Entity | Field | Rule |
|--------|-------|------|
| SkillDescriptor | skill_id | `/^[a-z][a-z0-9_]*$/`, max 64 chars |
| SkillDescriptor | version | Valid semver (x.y.z) |
| SkillDescriptor | timeout_ms | 1000-600000 (1s-10min) |
| Artifact | uri | Valid URI (file://, s3://, gs://, https://) |
| Artifact | content_hash | 64 hex characters (SHA-256) |
| Artifact | size_bytes | >= 0 |
| SkillResult | ok | true if data present, false if error |

---

## Migration Script

```sql
-- Migration: CreateArtifactTable
CREATE TABLE IF NOT EXISTS app.artifacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(255) NOT NULL,
    run_id UUID NOT NULL,
    skill_id VARCHAR(64) NOT NULL,
    type VARCHAR(100) NOT NULL,
    uri VARCHAR(2048) NOT NULL,
    content_hash CHAR(64) NOT NULL,
    size_bytes BIGINT NOT NULL CHECK (size_bytes >= 0),
    filename VARCHAR(255),
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_artifacts_tenant_id ON app.artifacts(tenant_id);
CREATE INDEX idx_artifacts_run_id ON app.artifacts(run_id);
CREATE INDEX idx_artifacts_skill_id ON app.artifacts(skill_id);
CREATE INDEX idx_artifacts_tenant_run ON app.artifacts(tenant_id, run_id);

-- Row Level Security (if enabled)
ALTER TABLE app.artifacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY artifacts_tenant_isolation ON app.artifacts
    USING (tenant_id = current_setting('app.current_tenant_id', true));
```
