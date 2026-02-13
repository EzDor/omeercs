# Implementation Plan: Core Media Integration

**Branch**: `010-core-media-integration` | **Date**: 2026-02-12 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/010-core-media-integration/spec.md`

## Summary

Implement local filesystem asset storage with HTTP serving, async media generation (video, audio SFX/BGM, 3D models, 2D images/textures) via external providers (Nano Banana, Suno, Meshy), and tenant-scoped access control. The approach extends existing provider adapter interfaces and registry patterns with concrete implementations, adds a reusable polling service backed by a new `GenerationJob` DB entity for crash recovery, and introduces a `StorageService` abstraction in `common/` that wraps local filesystem operations behind an interface designed for future S3 migration. A new tenant-scoped media endpoint is added to `api-center` alongside the existing public game bundle endpoint.

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode), Node.js 20+
**Primary Dependencies**: NestJS 10, TypeORM, BullMQ, class-validator, axios (HTTP downloads from providers)
**Storage**: PostgreSQL 17 (pgvector) for entities; local filesystem (`ASSET_STORAGE_DIR`) for binary assets
**Testing**: Jest (unit + integration), Supertest (HTTP endpoint tests)
**Target Platform**: Linux server (Docker), macOS local development
**Project Type**: Monorepo — pnpm workspaces with dto → common → dao → api-center / agent-platform
**Performance Goals**: Video generation < 5 min, SFX < 30s, BGM < 3 min, 3D < 10 min, 2D < 60s
**Constraints**: Per-tenant concurrency limits (video:2, SFX:2, BGM:2, 3D:2, 2D:5); unbounded queuing; no automatic asset cleanup
**Scale/Scope**: Single-worker deployment for Phase 1; DB-persisted generation jobs for crash recovery

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Reference: `.specify/memory/constitution.md` v1.0.0

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Spec-Driven Development | PASS | Spec files exist in `/specs/010-core-media-integration/` (spec.md, research.md, data-model.md, contracts/, quickstart.md) |
| II. Type Safety & Schema Validation | PASS | All provider adapters implement typed interfaces from `dto/`. `GenerationJob` entity uses TypeORM decorators. `StorageUploadParams`/`StorageUploadResult` are typed interfaces. No `any` types. |
| III. Multi-Tenant First | PASS | `GenerationJob` extends `BaseEntity` with `tenantId`. Storage paths include `tenantId`. Media serving endpoint validates tenant access. Concurrency limits are per-tenant. |
| IV. Monorepo Discipline | PASS | Follows dto → common → dao → api-center/agent-platform hierarchy. Provider interfaces in `dto/`, service implementations in `common/`, entity in `dao/`, controller extension in `api-center/`. |
| V. Error Handling & Observability | PASS | Polling service handles timeout/failure states with DB persistence. Provider adapters return `GenerationResult` with cost tracking. Failed jobs store `error_message`. Cost logged to run step debug output. |

**Post-design re-evaluation**: All principles PASS. No violations requiring justification.

## Project Structure

### Documentation (this feature)

```text
specs/010-core-media-integration/
├── plan.md              # This file
├── research.md          # Phase 0 output — 8 research decisions
├── data-model.md        # Phase 1 output — entity schemas and migration DDL
├── quickstart.md        # Phase 1 output — setup and verification guide
├── contracts/           # Phase 1 output — service interfaces
│   ├── storage.service.contract.ts
│   ├── polling.service.contract.ts
│   ├── concurrency-limiter.contract.ts
│   └── asset-serving.controller.contract.ts
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
dto/src/
├── campaign-context/
│   └── standard-artifact-types.enum.ts        # MODIFIED — add MODEL_3D, TEXTURE, ENVIRONMENT_MAP
└── providers/
    └── interfaces/                            # EXISTING — no changes needed
        ├── video-provider.interface.ts
        ├── audio-provider.interface.ts
        ├── image-provider.interface.ts
        └── asset3d-provider.interface.ts

common/src/
├── storage/
│   ├── storage.service.ts                     # NEW — local filesystem storage abstraction
│   └── storage.module.ts                      # NEW — NestJS module exporting StorageService
└── providers/
    ├── adapters/
    │   ├── nano-banana-video.adapter.ts        # NEW — video generation via Nano Banana API
    │   ├── nano-banana-sfx.adapter.ts          # NEW — SFX audio via Nano Banana API
    │   ├── suno-bgm.adapter.ts                 # NEW — BGM via Suno API
    │   ├── meshy-3d.adapter.ts                 # NEW — 3D models via Meshy API
    │   └── nano-banana-image.adapter.ts        # NEW — 2D images via Nano Banana API
    ├── registries/
    │   ├── video-provider.registry.ts          # NEW — video provider registry
    │   └── asset3d-provider.registry.ts        # NEW — 3D provider registry
    │   (audio-provider.registry.ts)            # MODIFIED — add type-based routing
    │   (image-provider.registry.ts)            # MODIFIED — register NanoBananaImageAdapter
    └── services/
        ├── polling.service.ts                  # NEW — async job polling lifecycle
        └── concurrency-limiter.service.ts      # NEW — per-tenant rate limiting

dao/src/
├── entities/
│   └── generation-job.entity.ts               # NEW — GenerationJob entity
└── migrations/
    └── XXXX-CreateGenerationJobTable.ts        # NEW — DB migration

api-center/src/
└── media/
    └── media.controller.ts                    # NEW — tenant-scoped asset serving endpoint
```

**Structure Decision**: Existing monorepo structure is maintained. New code is placed in the appropriate workspace following the dto → common → dao → service hierarchy. Storage abstraction and provider services go in `common/` (shared by both api-center and agent-platform). The tenant-scoped media endpoint is a new controller in `api-center/` rather than modifying the existing `AssetsController`, keeping public game bundle serving and authenticated media serving cleanly separated.

## Complexity Tracking

No constitution violations to justify. All design decisions follow existing patterns:
- Provider adapter interfaces reused from `dto/`
- Registry pattern extended from `common/src/providers/registries/`
- Entity pattern extended from `dao/src/entities/base.entity.ts`
- Controller pattern extended from `api-center/src/assets/assets.controller.ts`
