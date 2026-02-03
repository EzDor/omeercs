# Data Model: Campaign Context Model

**Feature**: 008-campaign-context
**Date**: 2026-02-03

## Overview

The CampaignContext model represents the runtime contract passed between workflow steps. It is stored as a JSONB column in the existing Run entity, maintaining all artifact references, step outputs, and computed data needed for workflow execution.

## Entity Modifications

### Run Entity (Modification)

The existing Run entity will be extended with a `context` JSONB column.

```typescript
// dao/src/entities/run.entity.ts

@Entity('runs', { schema: 'app' })
export class Run extends BaseEntity {
  // ... existing fields ...

  @Column({ type: 'jsonb', nullable: true })
  context: CampaignContextJson | null;
}
```

**Migration Required**: Add nullable JSONB column `context` to `runs` table.

---

## Core Interfaces

### CampaignContext

The root context structure containing all workflow execution state.

| Field | Type | Description | Validation |
|-------|------|-------------|------------|
| campaignId | string | Unique identifier for the campaign | Required, UUID format |
| runId | string | Current workflow run identifier | Required, UUID format |
| workflowName | string | Name of the executing workflow | Required, max 255 chars |
| trigger | TriggerInfo | Information about workflow initiation | Required |
| refs | ArtifactReferences | Logical name → artifact ID mapping | Required (may be empty) |
| artifacts | ArtifactMap | artifact ID → artifact data mapping | Required (may be empty) |
| computed | ComputedData | Scratch area for hashes and checks | Optional |

```typescript
// dto/src/campaign-context/campaign-context.interface.ts

interface CampaignContext {
  campaignId: string;
  runId: string;
  workflowName: string;
  trigger: TriggerInfo;
  refs: ArtifactReferences;
  artifacts: ArtifactMap;
  computed?: ComputedData;
}
```

---

### TriggerInfo

Information about what initiated the workflow.

| Field | Type | Description | Validation |
|-------|------|-------------|------------|
| type | TriggerType | Enum: 'manual', 'scheduled', 'api' | Required |
| payload | Record<string, unknown> | Trigger-specific data | Optional |
| timestamp | string | ISO 8601 timestamp | Required |
| initiatedBy | string | User ID or system identifier | Optional |

```typescript
type TriggerType = 'manual' | 'scheduled' | 'api';

interface TriggerInfo {
  type: TriggerType;
  payload?: Record<string, unknown>;
  timestamp: string;
  initiatedBy?: string;
}
```

---

### ArtifactReferences

Logical reference names mapped to artifact IDs. All fields are optional since they are populated as steps complete.

| Field | Type | Description |
|-------|------|-------------|
| planArtifactId | string? | Plan step output |
| introImageArtifactId | string? | Intro image generation output |
| introVideoArtifactId | string? | Intro video generation output |
| buttonSegmentationArtifactId | string? | Button segmentation output |
| bgmArtifactId | string? | Background music output |
| sfxArtifactId | string? | Sound effects output |
| audioManifestArtifactId | string? | Audio manifest output |
| gameConfigArtifactId | string? | Game configuration output |
| gameBundleArtifactId | string? | Game bundle output |
| outcomeWinVideoArtifactId | string? | Win outcome video output |
| outcomeLoseVideoArtifactId | string? | Lose outcome video output |
| campaignManifestArtifactId | string? | Final campaign manifest output |
| [customRef: string] | string? | Custom reference types (extensible) |

```typescript
interface ArtifactReferences {
  planArtifactId?: string;
  introImageArtifactId?: string;
  introVideoArtifactId?: string;
  buttonSegmentationArtifactId?: string;
  bgmArtifactId?: string;
  sfxArtifactId?: string;
  audioManifestArtifactId?: string;
  gameConfigArtifactId?: string;
  gameBundleArtifactId?: string;
  outcomeWinVideoArtifactId?: string;
  outcomeLoseVideoArtifactId?: string;
  campaignManifestArtifactId?: string;
  [customRef: string]: string | undefined;
}
```

---

### ArtifactMap

Map of artifact IDs to their data. Key is artifact UUID.

```typescript
type ArtifactMap = Record<string, ArtifactData>;
```

---

### ArtifactData

Metadata for a single artifact stored in the context.

| Field | Type | Description | Validation |
|-------|------|-------------|------------|
| type | string | Artifact type (e.g., 'plan', 'game_bundle') | Required, registered type |
| uri | string | Storage location reference | Required, max 2048 chars |
| hash | string | Content hash for integrity | Required, 64 char hex |
| metadata | Record<string, unknown> | Additional artifact data | Optional |
| createdAt | string | ISO 8601 timestamp | Required |
| stepId | string | Step that produced this artifact | Required |

```typescript
interface ArtifactData {
  type: string;
  uri: string;
  hash: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  stepId: string;
}
```

---

### ComputedData

Scratch area for runtime-computed values.

| Field | Type | Description |
|-------|------|-------------|
| inputHashesByStep | Record<string, string> | stepId → input hash for caching |
| qualityChecks | QualityCheckResult[] | Quality validation results |

```typescript
interface ComputedData {
  inputHashesByStep: Record<string, string>;
  qualityChecks: QualityCheckResult[];
}
```

---

### QualityCheckResult

Result of a quality check on an artifact.

| Field | Type | Description | Validation |
|-------|------|-------------|------------|
| artifactId | string | Artifact that was checked | Required, UUID |
| checkType | string | Type of check performed | Required |
| status | QualityStatus | 'passed', 'failed', 'warning' | Required |
| message | string | Human-readable result | Optional |
| timestamp | string | ISO 8601 when check ran | Required |
| details | Record<string, unknown> | Check-specific data | Optional |

```typescript
type QualityStatus = 'passed' | 'failed' | 'warning';

interface QualityCheckResult {
  artifactId: string;
  checkType: string;
  status: QualityStatus;
  message?: string;
  timestamp: string;
  details?: Record<string, unknown>;
}
```

---

## Reference Type Registry

### Standard Types (Enum)

```typescript
enum StandardArtifactType {
  PLAN = 'plan',
  INTRO_IMAGE = 'intro_image',
  INTRO_VIDEO = 'intro_video',
  BUTTON_SEGMENTATION = 'button_segmentation',
  BGM = 'bgm',
  SFX = 'sfx',
  AUDIO_MANIFEST = 'audio_manifest',
  GAME_CONFIG = 'game_config',
  GAME_BUNDLE = 'game_bundle',
  OUTCOME_WIN_VIDEO = 'outcome_win_video',
  OUTCOME_LOSE_VIDEO = 'outcome_lose_video',
  CAMPAIGN_MANIFEST = 'campaign_manifest',
}
```

### Custom Type Configuration

Custom reference types are registered via JSON configuration validated at startup.

```json
// config/artifact-types.json
{
  "$schema": "./artifact-types.schema.json",
  "customTypes": [
    {
      "name": "custom_asset",
      "description": "Custom asset type for specific workflows"
    }
  ]
}
```

---

## Service Interfaces

### CampaignContextService

Main service for context management.

```typescript
interface CampaignContextService {
  // Create new context for workflow run
  create(params: CreateContextParams): CampaignContext;

  // Load context from previous run (for update workflows)
  loadFromRun(baseRunId: string, tenantId: string): Promise<CampaignContext>;

  // Attach step results and update refs
  attachStepResult(
    context: CampaignContext,
    stepId: string,
    artifacts: StepArtifact[]
  ): CampaignContext;

  // Persist context to database
  persist(context: CampaignContext): Promise<void>;
}
```

### ContextResolverService

Service for resolving artifact references.

```typescript
interface ContextResolverService {
  // Get artifact by logical reference name
  getRef(context: CampaignContext, refName: string): ArtifactData | undefined;

  // Get artifact by direct ID
  getArtifact(context: CampaignContext, artifactId: string): ArtifactData | undefined;

  // List all available refs
  listRefs(context: CampaignContext): string[];

  // Check if ref exists and is populated
  hasRef(context: CampaignContext, refName: string): boolean;
}
```

### ReferenceTypeRegistryService

Service for managing reference type validation.

```typescript
interface ReferenceTypeRegistryService {
  // Check if artifact type is valid (standard or custom)
  isValidType(type: string): boolean;

  // Get reference name for artifact type
  getRefName(artifactType: string): string;

  // List all registered types
  listTypes(): string[];
}
```

---

## State Transitions

### Context Lifecycle

```
┌─────────────┐     create()      ┌─────────────┐
│   (none)    │ ─────────────────▶│   EMPTY     │
└─────────────┘                   └──────┬──────┘
                                         │
                          attachStepResult() (per step)
                                         │
                                         ▼
                                  ┌──────────────┐
                                  │  POPULATING  │ ◀─┐
                                  └──────┬───────┘   │
                                         │           │
                                         │     attachStepResult()
                                         │           │
                                         └───────────┘
                                         │
                          workflow completes
                                         │
                                         ▼
                                  ┌──────────────┐
                                  │  COMPLETE    │
                                  └──────────────┘
```

### Update Workflow Flow

```
┌─────────────────┐    loadFromRun()    ┌────────────────┐
│  Previous Run   │ ────────────────────▶│  New Context   │
│  (completed)    │                      │  (pre-loaded)  │
└─────────────────┘                      └───────┬────────┘
                                                 │
                              selective steps re-execute
                                                 │
                                                 ▼
                                         ┌──────────────┐
                                         │  UPDATED     │
                                         └──────────────┘
```

---

## Constraints and Validations

| Constraint | Enforcement | Error |
|------------|-------------|-------|
| Artifact ID uniqueness | In-memory check before add | DuplicateArtifactIdError |
| Valid artifact type | Registry check on attach | InvalidArtifactTypeError |
| Max 50 artifacts | Count check on attach | ContextCapacityExceededError |
| Required artifact fields | class-validator | ValidationError |
| Base run exists for load | Database query | BaseRunNotFoundError |
| Tenant isolation | TenantClsService check | UnauthorizedError |

---

## Database Migration

```sql
-- Migration: AddContextColumnToRuns

ALTER TABLE app.runs
ADD COLUMN context JSONB;

COMMENT ON COLUMN app.runs.context IS 'CampaignContext JSONB containing artifact refs, artifacts map, and computed data';

-- Optional: Index for context queries (if needed for analytics)
-- CREATE INDEX idx_runs_context_workflow ON app.runs USING gin ((context->'workflowName'));
```
