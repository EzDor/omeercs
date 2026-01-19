# Quickstart: Run Engine (Workflow Orchestrator + Partial Rebuild)

**Feature**: 004-run-engine
**Date**: 2026-01-19

## Overview

The Run Engine orchestrates workflow execution by managing DAG-based step execution, caching, and partial rebuilds. It integrates with the existing SkillRunner service to execute individual steps.

## Prerequisites

- PostgreSQL running with schema migrations applied
- Valkey/Redis running for step caching
- SkillRunner service available (from Spec 001)
- BullMQ configured (existing infrastructure)

## Installation

```bash
# Install new dependencies
pnpm --filter agent-platform add fast-json-stable-stringify typescript-graph
pnpm --filter agent-platform add -D @types/fast-json-stable-stringify

# Run database migrations
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/agentic_template pnpm migration:run
```

## Quick API Usage

### 1. Trigger an Initial Build

```bash
curl -X POST http://localhost:3001/api/v1/runs \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "workflowName": "campaign.build.v1",
    "triggerPayload": {
      "campaignId": "123e4567-e89b-12d3-a456-426614174000",
      "brief": {
        "title": "Summer Sale Campaign",
        "style": "energetic"
      }
    }
  }'
```

Response:
```json
{
  "runId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "queued",
  "message": "Run queued for execution"
}
```

### 2. Check Run Status

```bash
curl http://localhost:3001/api/v1/runs/550e8400-e29b-41d4-a716-446655440000 \
  -H "Authorization: Bearer $TOKEN"
```

Response:
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "workflowName": "campaign.build.v1",
  "status": "running",
  "triggerType": "initial",
  "stepsSummary": {
    "total": 13,
    "pending": 5,
    "running": 2,
    "completed": 6,
    "skipped": 0,
    "failed": 0
  },
  "startedAt": "2026-01-19T10:00:00Z"
}
```

### 3. Trigger a Partial Rebuild (Update)

```bash
curl -X POST http://localhost:3001/api/v1/runs/550e8400-e29b-41d4-a716-446655440000/update \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "changeRequest": {
      "type": "audio.update",
      "payload": {
        "audioStyle": "epic",
        "volumeBoost": 1.2
      }
    }
  }'
```

Response:
```json
{
  "runId": "660e8400-e29b-41d4-a716-446655440001",
  "status": "queued",
  "message": "Update run queued - 4 steps will be re-executed"
}
```

### 4. Get Run Artifacts

```bash
curl http://localhost:3001/api/v1/runs/550e8400-e29b-41d4-a716-446655440000/artifacts \
  -H "Authorization: Bearer $TOKEN"
```

### 5. Cancel a Running Workflow

```bash
curl -X POST http://localhost:3001/api/v1/runs/550e8400-e29b-41d4-a716-446655440000/cancel \
  -H "Authorization: Bearer $TOKEN"
```

## Service Integration

### Programmatic Usage (NestJS)

```typescript
import { Injectable } from '@nestjs/common';
import { RunEngineService } from './run-engine/services/run-engine.service';

@Injectable()
export class CampaignService {
  constructor(private readonly runEngine: RunEngineService) {}

  async buildCampaign(campaignId: string, brief: CampaignBrief): Promise<string> {
    // Trigger initial build
    const runId = await this.runEngine.trigger('campaign.build.v1', {
      campaignId,
      brief,
    });

    return runId;
  }

  async updateCampaignAudio(baseRunId: string, audioConfig: AudioConfig): Promise<string> {
    // Trigger partial rebuild
    const updateRunId = await this.runEngine.triggerUpdate(baseRunId, {
      type: 'audio.update',
      payload: audioConfig,
    });

    return updateRunId;
  }

  async getCampaignStatus(runId: string): Promise<RunStatus> {
    const run = await this.runEngine.getRun(runId);
    return run;
  }
}
```

## Workflow Definition Example

```typescript
// workflows/campaign-build.workflow.ts
import { WorkflowSpec, StepSpec } from '../interfaces/workflow-spec.interface';

export const campaignBuildWorkflow: WorkflowSpec = {
  workflowName: 'campaign.build.v1',
  version: '1.0.0',
  steps: [
    {
      stepId: 'campaign_plan_from_brief',
      skillId: 'planning.generate_campaign_plan',
      dependsOn: [],
      inputSelector: (ctx) => ({ brief: ctx.triggerPayload.brief }),
      cachePolicy: { enabled: true, scope: 'global' },
      retryPolicy: { maxAttempts: 3, backoffMs: 3000 },
    },
    {
      stepId: 'generate_intro_image',
      skillId: 'image.generate_intro',
      dependsOn: ['campaign_plan_from_brief'],
      inputSelector: (ctx) => ({
        plan: ctx.stepOutputs.get('campaign_plan_from_brief'),
      }),
      cachePolicy: { enabled: true, scope: 'global' },
      retryPolicy: { maxAttempts: 3, backoffMs: 3000 },
    },
    {
      stepId: 'generate_bgm_track',
      skillId: 'audio.generate_bgm',
      dependsOn: ['campaign_plan_from_brief'],
      inputSelector: (ctx) => ({
        plan: ctx.stepOutputs.get('campaign_plan_from_brief'),
        style: ctx.triggerPayload.brief.style,
      }),
      cachePolicy: { enabled: true, scope: 'global' },
      retryPolicy: { maxAttempts: 3, backoffMs: 5000 },
    },
    // ... additional steps
  ],
};
```

## Change Request Mappings

| Change Type | Impacted Seed Steps | Example Use Case |
|-------------|---------------------|------------------|
| `audio.update` | generate_bgm_track, generate_sfx_pack, mix_audio_for_game | Change background music style |
| `intro.update` | generate_intro_image, segment_start_button, generate_intro_video_loop | Update intro visuals |
| `outcome.update` | generate_outcome_video_win, generate_outcome_video_lose | Change win/lose screens |
| `game_config.update` | game_config_from_template | Modify game parameters |
| `asset3d.replace` | generate_3d_asset, optimize_3d_asset | Replace 3D models |
| `full_rebuild` | All steps | Complete rebuild |

## Cache Behavior

### Cache Key Format
```
{workflowName}:{stepId}:{inputHash}

Example: campaign.build.v1:generate_bgm_track:a3f2c1e4b5d6789...
```

### Cache Lookup Order
1. **Redis (hot cache)** - ~1ms lookup, 24-48h TTL
2. **PostgreSQL (cold cache)** - ~5-10ms lookup, no TTL
3. **Cache miss** - Execute step, store result in both caches

### Cache Hit Logging
```
[RunEngine] Cache hit (Redis): campaign.build.v1:generate_bgm:a3f2c1...
[RunEngine] Cache hit (DB): campaign.build.v1:generate_bgm:a3f2c1...
[RunEngine] Cache miss: campaign.build.v1:generate_bgm:b4e3d2...
```

## Monitoring

### Key Log Events
```
[RunEngine] Run started: runId=550e8400-..., workflow=campaign.build.v1
[RunEngine] Step started: runId=550e8400-..., stepId=generate_bgm_track
[RunEngine] Step completed: runId=550e8400-..., stepId=generate_bgm_track, durationMs=5234
[RunEngine] Step skipped (cache hit): runId=550e8400-..., stepId=generate_intro_image
[RunEngine] Step failed: runId=550e8400-..., stepId=mix_audio, error=SKILL_TIMEOUT, attempt=2
[RunEngine] Run completed: runId=550e8400-..., totalDurationMs=45678
[RunEngine] Run failed: runId=550e8400-..., failedStep=mix_audio, error=MAX_RETRIES_EXCEEDED
```

### Health Checks

```bash
# Check queue depth
curl http://localhost:3002/health/queues

# Check cache hit rate (via metrics endpoint)
curl http://localhost:3002/metrics | grep run_engine_cache_hit_rate
```

## Troubleshooting

### Run Stuck in "queued" Status
1. Check worker is running: `pnpm --filter agent-platform dev`
2. Check BullMQ queue: Access Bull Board at http://localhost:3002/bull-board
3. Check Redis connection: `redis-cli ping`

### Cache Not Working
1. Verify Redis is accessible
2. Check cache policy is enabled for step
3. Compare input hashes - any input change creates new cache key

### Step Fails Repeatedly
1. Check step error in run details: `GET /api/v1/runs/{runId}/steps`
2. Review SkillRunner logs for execution errors
3. Verify retry policy is configured correctly

## File Locations

| Component | Path |
|-----------|------|
| Run Engine Module | `agent-platform/src/run-engine/run-engine.module.ts` |
| Run Engine Service | `agent-platform/src/run-engine/services/run-engine.service.ts` |
| Workflow Registry | `agent-platform/src/run-engine/services/workflow-registry.service.ts` |
| Step Cache Service | `agent-platform/src/run-engine/services/step-cache.service.ts` |
| API Controller | `api-center/src/run-engine/run-engine.controller.ts` |
| Run Entity | `dao/src/entities/run.entity.ts` |
| RunStep Entity | `dao/src/entities/run-step.entity.ts` |
| DTOs | `dto/src/run-engine/` |
