# Data Model: Reference Implementations

**Feature**: 009-reference-impl
**Date**: 2026-02-03

## Entity Overview

This feature primarily validates existing entities from Specs 1-8. No new database tables are required. The following documents the relevant entities and their relationships for the reference implementation.

## Existing Entities (Leveraged)

### Run

**Source**: `dao/src/entities/run.entity.ts`
**Purpose**: Represents a complete workflow execution

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| tenantId | string | Multi-tenant isolation |
| workflowName | string | e.g., "campaign.build" |
| workflowVersion | string | e.g., "1.0.0" |
| status | RunStatus | queued/running/completed/failed/cancelled |
| trigger | JSONB | Trigger payload (campaign_id, template_id, etc.) |
| context | JSONB | CampaignContext with refs, artifacts, computed data |
| error | string? | Error message if failed |
| startedAt | timestamp? | Execution start time |
| completedAt | timestamp? | Execution end time |
| createdAt | timestamp | Record creation |
| updatedAt | timestamp | Last update |

**Relationships**:
- One-to-Many: Run → RunStep (steps)
- One-to-Many: Run → Artifact (artifacts)

---

### RunStep

**Source**: `dao/src/entities/run-step.entity.ts`
**Purpose**: Represents individual step execution within a workflow

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| runId | UUID | FK to Run |
| tenantId | string | Multi-tenant isolation |
| stepId | string | Step identifier (e.g., "game_config") |
| skillId | string | Skill being executed (e.g., "game_config_from_template") |
| status | RunStepStatus | pending/running/completed/failed/skipped |
| inputHash | string | Hash of inputs for cache key |
| outputArtifactIds | UUID[] | References to produced artifacts |
| cacheHit | boolean | Whether result was from cache |
| durationMs | number? | Execution duration |
| error | string? | Error details if failed |
| attempt | number | Current attempt number (for retries) |
| createdAt | timestamp | Record creation |
| updatedAt | timestamp | Last update |

**Relationships**:
- Many-to-One: RunStep → Run (run)

---

### Artifact

**Source**: `dao/src/entities/artifact.entity.ts`
**Purpose**: Represents a produced artifact (file, config, etc.)

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| runId | UUID | FK to Run |
| tenantId | string | Multi-tenant isolation |
| skillId | string | Skill that produced this artifact |
| type | string | Artifact type (e.g., "json/game-config", "audio/bgm") |
| uri | string | Location (local path or URL) |
| contentHash | string | sha256:... hash for verification |
| sizeBytes | number? | File size |
| filename | string? | Original filename |
| metadata | JSONB | Additional metadata |
| createdAt | timestamp | Record creation |
| updatedAt | timestamp | Last update |

**Relationships**:
- Many-to-One: Artifact → Run (run)

---

### StepCache

**Source**: `dao/src/entities/step-cache.entity.ts`
**Purpose**: Caches step results for reuse across runs

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| cacheKey | string | Unique identifier (input hash) |
| workflowName | string | Workflow this cache belongs to |
| stepId | string | Step identifier |
| inputHash | string | Hash of step inputs |
| artifactIds | UUID[] | Cached output artifact IDs |
| scope | CacheScope | global/run_only |
| createdAt | timestamp | Record creation |
| expiresAt | timestamp? | TTL expiration |

**Relationships**:
- None (standalone cache entries)

---

## Reference Skill Data Structures

### GameConfig (Spec 9 Minimal Schema)

**Source**: `dto/src/skills/game-config.dto.ts`
**Purpose**: Generated game configuration from Claude JSON skill

```typescript
interface GameConfig {
  template_id: string;           // e.g., "spin_wheel_v1"
  version: string;               // e.g., "1.0.0"
  settings: {
    duration_sec: number;        // Game duration
    difficulty: {
      level: 'easy' | 'medium' | 'hard';
      win_probability: number;   // 0.0-1.0
      parameters: Record<string, number>;  // level_params
    };
    locale: string;              // e.g., "en-US"
  };
  visuals: {
    theme: string;               // e.g., "neon_arcade"
    colors: {
      primary: string;
      secondary: string;
      accent: string;
      background: string;
    };
    assets: Record<string, string>;  // Asset mappings
    animations: Record<string, unknown>;
  };
  audio: {
    bgm: {
      enabled: boolean;
      volume: number;            // 0.0-1.0
      loop: boolean;
    };
    sfx: Record<string, { volume: number; }>;
  };
  mechanics: Record<string, unknown>;  // Template-specific (spawn_rates, scoring)
  copy: {
    title: string;
    instructions: string;
    win_message: string;
    lose_message: string;
  };
}
```

**Validation Rules**:
- `template_id`: Required, non-empty string
- `difficulty.level`: Must be one of 'easy', 'medium', 'hard'
- `difficulty.win_probability`: Number between 0 and 1
- `settings.duration_sec`: Positive number
- All color values: Valid CSS color format

---

### CampaignManifest

**Source**: `dto/src/skills/assemble-campaign-manifest.dto.ts`
**Purpose**: Final campaign package referencing all components

```typescript
interface CampaignManifest {
  manifest_version: string;      // "1.0.0"
  campaign_id: string;
  campaign_name: string;
  created_at: string;            // ISO timestamp
  updated_at: string;
  version: string;

  assets: {
    intro_video: ManifestAssetRef;
    win_video: ManifestAssetRef;
    lose_video: ManifestAssetRef;
    game_bundle: ManifestAssetRef;
    additional: ManifestAssetRef[];
  };

  interaction: {
    button: {
      bounds: { x: number; y: number; width: number; height: number; };
      mask_polygon?: number[][];
      hover_effect?: string;
      click_sound_uri?: string;
    };
    game_container: {
      entry_point: string;       // "index.html"
      config_path: string;       // "game_config.json"
    };
  };

  flow: {
    sequence: string[];          // ['intro', 'game', 'outcome']
    intro_to_game_trigger: string;
    game_to_outcome_trigger: string;
    outcome_redirect?: {
      win_url?: string;
      lose_url?: string;
      delay_ms: number;
    };
  };

  rules: {
    active: boolean;
    start_date?: string;
    end_date?: string;
    max_plays_per_user?: number;
    global_win_rate?: number;
    require_login: boolean;
    allowed_regions?: string[];
    excluded_regions?: string[];
    rate_limiting?: Record<string, unknown>;
  };

  analytics: {
    enabled: boolean;
    tracking_id?: string;
    events: string[];
  };

  branding?: {
    brand_name: string;
    logo_uri?: string;
    colors: { primary?: string; secondary?: string; };
    font_family?: string;
  };

  metadata: Record<string, unknown>;
  checksum: string;              // SHA256 of manifest
}

interface ManifestAssetRef {
  uri: string;
  type: 'video' | 'audio' | 'image' | 'bundle';
  size_bytes?: number;
  checksum?: string;
  required: boolean;
}
```

---

### AudioGenerationResult

**Source**: `dto/src/providers/interfaces/audio-provider.interface.ts`
**Purpose**: Result from audio provider (or stub)

```typescript
interface AudioGenerationResult {
  uri: string;                   // Path to generated audio file
  metadata: {
    providerId: string;          // "stub" for test, "litellm" for real
    model?: string;
    durationSec: number;
    format: string;              // "wav" or "mp3"
    sampleRate: number;          // 44100
    channels: number;            // 2 (stereo)
  };
}
```

---

### BundleManifest

**Source**: `dto/src/skills/bundle-game-template.dto.ts`
**Purpose**: Metadata for bundled game template

```typescript
interface BundleManifest {
  bundle_id: string;
  template_id: string;
  version: string;
  created_at: string;
  files: BundledFileInfo[];
  entry_point: string;           // "index.html"
  assets: {
    images: string[];
    audio: string[];
    video: string[];
    models: string[];
    configs: string[];
  };
  checksum: string;
  metadata: {
    total_size_bytes: number;
    file_count: number;
    optimizations_applied: string[];
  };
}

interface BundledFileInfo {
  path: string;                  // Relative path in bundle
  size_bytes: number;
  content_type: string;          // MIME type
  checksum: string;              // First 16 chars of SHA256
}
```

---

## Entity Relationships Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                           Run                                        │
│  id, tenantId, workflowName, status, trigger, context, error        │
└─────────────────────────────────────────────────────────────────────┘
         │                           │
         │ 1:N                       │ 1:N
         ▼                           ▼
┌─────────────────────┐    ┌─────────────────────┐
│      RunStep        │    │      Artifact       │
│  stepId, skillId,   │    │  type, uri,         │
│  inputHash, status, │    │  contentHash,       │
│  outputArtifactIds  │───▶│  metadata           │
│  cacheHit, durationMs│    │                     │
└─────────────────────┘    └─────────────────────┘
                                    │
         ┌──────────────────────────┤
         │                          │
         ▼                          ▼
┌─────────────────────┐    ┌─────────────────────┐
│ json/game-config    │    │ audio/bgm           │
│ (GameConfig)        │    │ (WAV/MP3 file)      │
└─────────────────────┘    └─────────────────────┘
         │
         └──────────────┬───────────────────────┐
                        │                       │
                        ▼                       ▼
              ┌─────────────────────┐  ┌─────────────────────┐
              │ bundle/game         │  │ json/campaign-      │
              │ (BundleManifest)    │  │ manifest            │
              └─────────────────────┘  │ (CampaignManifest)  │
                                       └─────────────────────┘
```

---

## State Transitions

### RunStatus

```
[created] → queued → running → completed
                  ↘         ↗ failed
                   cancelled
```

### RunStepStatus

```
[created] → pending → running → completed
                   ↘         ↗ failed
                    skipped (cache hit or blocked by upstream)
```

---

## Validation Rules Summary

| Entity/Field | Rule | Error Code |
|--------------|------|------------|
| GameConfig.template_id | Non-empty string | VALIDATION_ERROR |
| GameConfig.difficulty.level | One of: easy, medium, hard | VALIDATION_ERROR |
| GameConfig.difficulty.win_probability | Number 0-1 | VALIDATION_ERROR |
| CampaignManifest.assets.* | Valid URI (file exists or HTTP URL) | MISSING_ASSET |
| Artifact.contentHash | Format: sha256:[64 hex chars] | INVALID_HASH |
| RunStep.inputHash | Non-empty string | VALIDATION_ERROR |

---

## No New Entities Required

This reference implementation validates existing infrastructure. All required entities are already implemented:

- **Run**: Workflow execution tracking ✅
- **RunStep**: Step execution with cache support ✅
- **Artifact**: Content-addressed artifact storage ✅
- **StepCache**: Input-hash-based caching ✅

The focus is on integration testing and demonstrating the full pipeline, not new data structures.
