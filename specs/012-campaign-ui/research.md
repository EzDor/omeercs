# Research: Campaign UI Backend

**Branch**: `012-campaign-ui` | **Date**: 2026-02-15

## R1: Campaign Entity vs Virtual Campaign

**Decision**: Create a first-class Campaign entity in the DAO layer.

**Rationale**: The codebase already has `CampaignContext` embedded as JSONB in the Run entity (`context.campaignId`), but this only tracks campaign references during workflow execution. A dedicated Campaign entity is needed to:
- Store campaign metadata (name, status, config) independently of runs
- Support draft campaigns that have never been generated (no runs yet)
- Enable filtering, sorting, and pagination on campaign-specific fields
- Track the campaign lifecycle (draft → generating → live → failed → archived)
- Support the deletion cascade rules (bundles deleted immediately, runs retained 30 days)

**Alternatives considered**:
- Virtual campaign (grouping runs by `context.campaignId`): Rejected because drafts without runs would be invisible, and querying JSONB paths for listing/filtering is slow and awkward.

## R2: Campaign Status Transition Mechanism

**Decision**: Campaign status is updated by the API Center when triggering generation and by the Agent Platform's run processor upon run completion/failure.

**Rationale**: The API Center owns the campaign CRUD lifecycle. When a user clicks "Generate", the API Center:
1. Updates campaign status to `generating`
2. Creates a Run via the existing run engine
3. Enqueues the run for processing

The Agent Platform's run processor already handles run completion. After a run finishes, it updates the campaign status:
- Run completed → campaign status = `live`, set `bundleUrl`
- Run failed → campaign status = `failed`

This follows the existing pattern where the run engine processor updates Run entities upon completion.

**Alternatives considered**:
- Webhook callback from agent-platform to api-center: Rejected because both services share the same database; direct entity update in the processor is simpler and already the established pattern.
- Polling from api-center: Rejected because the run processor already knows when runs complete.

## R3: Public Player Endpoint Architecture

**Decision**: The public player endpoint will be a `@Public()` decorated controller in api-center that serves campaign metadata and bundle URL. The actual game bundle is served from the filesystem via the existing media/storage service pattern.

**Rationale**: The codebase already has `@Public()` decorator support in the auth guard and a media controller that serves files from `ASSET_STORAGE_DIR`. The public player endpoint returns campaign config and bundle URL; the frontend loads the game bundle from the storage URL.

**Alternatives considered**:
- Separate public-facing microservice: Over-engineered for current scale.
- CDN with signed URLs: Good for production but premature; filesystem serving matches existing patterns.

## R4: Concurrent Edit Detection

**Decision**: Use a `version` column (integer, auto-incremented on update) on the Campaign entity. The PATCH endpoint accepts `expectedVersion`; if it doesn't match the current DB version, return 409 Conflict.

**Rationale**: This is the simplest optimistic concurrency control. No new infrastructure needed. The frontend sends the version it loaded; the backend rejects stale updates. This aligns with the spec clarification: "last save wins with warning."

**Alternatives considered**:
- `updatedAt` timestamp comparison: Less reliable due to clock precision.
- Pessimistic locking (SELECT FOR UPDATE): Adds complexity and doesn't help with the "two tabs" scenario where both sessions are long-lived.

## R5: Run History Retention and Cleanup

**Decision**: Soft-delete campaign records (set `deletedAt` timestamp). A scheduled job (NestJS `@Cron`) cleans up orphaned runs 30 days after the campaign's `deletedAt`.

**Rationale**: Using `deletedAt` instead of immediate hard delete lets us:
- Immediately hide campaigns from the UI (WHERE deletedAt IS NULL)
- Keep run history accessible for 30 days
- Clean up with a simple cron job that checks `deletedAt < NOW() - 30 days`

**Alternatives considered**:
- Immediate cascade delete with a separate archive table: More complex, duplicates data.
- Queue-based cleanup job: Overkill for a periodic task; NestJS @Cron is simpler.

## R6: Minimal UI Approach

**Decision**: Build a simple single-page campaign management view with basic CRUD operations, a simple wizard form (no live preview), and an iframe-based game preview. Reuse existing PrimeVue components and patterns from the chat/game-creation pages.

**Rationale**: The user explicitly stated: "build only the backend and the AI platform, not focus on the UI at all, just be able to check it from some simple stupid UI." The minimal UI serves as a test harness for the backend APIs.

**Alternatives considered**:
- No UI at all (API-only with Postman/curl): Doesn't meet the "be able to check it" requirement.
- Full-featured UI per spec: Explicitly out of scope per user direction.

## R7: IP-Based Rate Limiting for Public Endpoints

**Decision**: Use the existing `@nestjs/throttler` module (already configured globally in app.module) with a custom decorator to apply stricter limits on public player endpoints.

**Rationale**: The app already uses ThrottlerModule globally (60 req/min). Public player endpoints need separate, potentially more restrictive limits. NestJS Throttler supports per-route overrides via `@Throttle()` decorator.

**Alternatives considered**:
- Nginx/reverse proxy rate limiting: Better for production but not available in dev setup.
- Custom middleware: Unnecessary when Throttler already exists.
