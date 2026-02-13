# Quickstart: Core Media Integration

**Branch**: `010-core-media-integration` | **Date**: 2026-02-12

## Prerequisites

1. Running infrastructure: `docker compose up -d` (PostgreSQL, Valkey, LiteLLM)
2. Dependencies installed: `pnpm install`
3. Provider API keys configured in `.env`:
   ```
   NANO_BANANA_API_KEY=nb-...
   SUNO_API_KEY=sk-...
   MESHY_API_KEY=msy-...
   ASSET_STORAGE_DIR=/tmp/skills/assets
   ```

## Build Order

```bash
pnpm --filter @agentic-template/dto build
pnpm --filter @agentic-template/common build
pnpm --filter @agentic-template/dao build
```

## Run Migration

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/agentic_template pnpm migration:run
```

## Start Services

```bash
pnpm --filter api-center dev        # Port 3001
pnpm --filter agent-platform dev    # Port 3002
```

## Verify

1. **Storage**: Upload a test file via the storage service and verify HTTP serving:
   ```
   GET http://localhost:3001/api/media/{tenantId}/{runId}/image/{hash}.png
   ```

2. **Provider**: Trigger a video generation skill via the run engine and verify:
   - GenerationJob created in DB with status `pending` → `processing` → `completed`
   - Artifact stored on disk at `{ASSET_STORAGE_DIR}/{tenantId}/{runId}/video/{hash}.mp4`
   - Artifact entity URI points to the HTTP serving URL

3. **Tenant isolation**: Attempt to access tenant A's asset while authenticated as tenant B — expect 403.

## Key Files (New)

| File | Purpose |
|------|---------|
| `common/src/storage/storage.service.ts` | Local filesystem storage abstraction |
| `common/src/storage/storage.module.ts` | Storage module |
| `common/src/providers/services/polling.service.ts` | Async job polling lifecycle |
| `common/src/providers/services/concurrency-limiter.service.ts` | Per-tenant rate limiting |
| `common/src/providers/adapters/nano-banana-video.adapter.ts` | Video provider |
| `common/src/providers/adapters/nano-banana-sfx.adapter.ts` | SFX audio provider |
| `common/src/providers/adapters/suno-bgm.adapter.ts` | BGM audio provider |
| `common/src/providers/adapters/meshy-3d.adapter.ts` | 3D model provider |
| `common/src/providers/adapters/nano-banana-image.adapter.ts` | 2D image provider |
| `common/src/providers/registries/video-provider.registry.ts` | Video provider registry |
| `common/src/providers/registries/asset3d-provider.registry.ts` | 3D provider registry |
| `dao/src/entities/generation-job.entity.ts` | Generation job entity |
| `dao/src/migrations/XXXX-CreateGenerationJobTable.ts` | DB migration |
| `api-center/src/media/media.controller.ts` | Tenant-scoped asset serving |
