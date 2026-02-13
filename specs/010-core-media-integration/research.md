# Research: Core Media Integration

**Branch**: `010-core-media-integration` | **Date**: 2026-02-12

## R-001: Storage Abstraction for Local Filesystem

**Decision**: Create a `StorageService` abstraction in `common/` that wraps filesystem operations and returns HTTP URLs. The service interface will be designed so a future S3 implementation can be swapped without changing consumers.

**Rationale**: The existing skill handlers write directly to `SKILLS_OUTPUT_DIR` via `fs.writeFileSync`. Centralizing storage behind an interface enables deduplication (SHA256 content hashing), tenant-scoped directory organization, and future S3 migration with zero skill handler changes.

**Alternatives considered**:
- Direct filesystem writes in each skill handler (current approach) — rejected because it duplicates path logic and prevents deduplication
- NestJS `ServeStaticModule` — rejected because it lacks tenant-scoped access control and dynamic path configuration

## R-002: Generation Job Persistence

**Decision**: Create a `GenerationJob` entity in `dao/` extending `BaseEntity`. Track provider job ID, status, polling interval, timeout, and associated run step. On worker restart, query for incomplete jobs and resume polling.

**Rationale**: Long-running jobs (3D: up to 10 minutes, video: up to 5 minutes) must survive worker restarts. The existing `RunStep` entity tracks step-level status but not provider-level job state.

**Alternatives considered**:
- Store job state in Redis (BullMQ job data) — rejected because Redis data can be lost; DB persistence matches existing entity patterns
- In-memory tracking only — rejected per clarification decision

## R-003: Provider Adapter Implementations

**Decision**: Implement concrete adapters for each provider using the existing adapter interfaces in `dto/src/providers/interfaces/`:
- `NanoBananaVideoAdapter` implements `VideoProviderAdapter`
- `NanoBananaSfxAdapter` implements `AudioProviderAdapter`
- `SunoBgmAdapter` implements `AudioProviderAdapter`
- `MeshyAsset3dAdapter` implements `Asset3DProviderAdapter`
- `NanoBananaImageAdapter` implements `ImageProviderAdapter`

**Rationale**: All interfaces already exist with `GenerationParams` → `GenerationResult` contracts. The registry pattern (`AudioProviderRegistry`, `ImageProviderRegistry`) already supports multiple providers with default selection. Only stub implementations exist today.

**Alternatives considered**:
- Direct API calls in skill handlers — rejected because it breaks the adapter pattern and prevents provider swapping
- Single generic adapter for all media types — rejected because each provider has distinct APIs and parameters

## R-004: Async Polling Pattern

**Decision**: Create a reusable `PollingService` in `common/` that handles the submit → poll → download → store cycle. It persists `GenerationJob` records, implements configurable poll intervals and timeouts per provider, and handles retry/timeout logic.

**Rationale**: All providers (video, audio, 3D, image) follow the same async pattern: submit job → receive job ID → poll until complete → download result. Centralizing this eliminates code duplication across 5+ provider adapters.

**Alternatives considered**:
- Each adapter implements its own polling loop — rejected because it duplicates timeout/retry/persistence logic
- BullMQ delayed jobs for polling — viable but adds queue complexity; simple in-process polling with DB persistence is simpler for Phase 1

## R-005: Audio Provider Routing

**Decision**: Extend `AudioProviderRegistry` to support type-based routing: SFX requests route to the Nano Banana adapter, BGM requests route to the Suno adapter. Add a `routeByAudioType(type: 'sfx' | 'bgm')` method.

**Rationale**: The existing registry supports `getProvider(providerId)` but not automatic routing by audio type. The spec requires automatic routing without skill handler changes.

**Alternatives considered**:
- Two separate registries (SfxProviderRegistry, BgmProviderRegistry) — rejected because it breaks the single-adapter-interface pattern
- Routing logic in skill handlers — rejected because skill handlers should not know about provider selection

## R-006: Concurrency Limiting

**Decision**: Use in-memory semaphores per tenant per provider type in the `PollingService`. The BullMQ queue already handles job ordering; add a `ConcurrencyLimiter` utility that tracks active jobs per tenant/provider and queues excess requests in-memory with unbounded queue size.

**Rationale**: Per-tenant concurrency limits prevent API budget exhaustion. The unbounded queue (per clarification) means excess requests wait rather than fail.

**Alternatives considered**:
- BullMQ rate limiter — rejected because BullMQ limits are per-queue, not per-tenant
- Database-backed semaphore — overkill for Phase 1 single-worker deployment

## R-007: Extending Asset Serving for Tenant Isolation

**Decision**: Extend the existing `AssetsController` in `api-center/src/assets/` to add a tenant-scoped endpoint alongside the existing public endpoint. The new endpoint validates the authenticated tenant's access to the requested asset path.

**Rationale**: The current controller serves all assets publicly via `@Public()`. For tenant isolation, a new endpoint validates `tenantId` from the auth context against the asset path structure `{baseDir}/{tenantId}/{runId}/...`.

**Alternatives considered**:
- Separate controller for tenant-scoped assets — viable but adds unnecessary module; extending existing controller is simpler
- Middleware-based tenant validation — rejected because it would apply globally and break the existing public endpoint needed for game bundles

## R-008: Content-Hash Deduplication

**Decision**: Before saving any asset, compute SHA256 hash of the file content. Check if a file with that hash already exists in the Artifact table. If so, return the existing URI. Otherwise, save with hash-based filename: `{hash}.{ext}`.

**Rationale**: Campaigns often share assets (same intro image across runs). Hash-based dedup reduces disk usage by 20%+ (per spec SC-007).

**Alternatives considered**:
- Filename-based dedup — rejected because different files can have same name
- No dedup (save everything) — rejected per spec requirement FR-004
