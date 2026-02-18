# Shared Packages (Common and DTO)

## Common Package

**Location**: `common/src/`
**Package name**: `@agentic-template/common`

The common package contains utilities shared between `api-center` and `agent-platform`. It is never used by the frontend.

### Authentication (`common/src/auth/`)

#### AuthGuard

**File**: `common/src/auth/auth.guard.ts`

A NestJS guard that validates every incoming request (unless marked `@Public()`). It:

1. Extracts the JWT from the `Authorization: Bearer <token>` header (or `?token=` query parameter)
2. Validates the JWT using the Clerk SDK
3. Extracts `userId` and `orgId` from the token claims
4. Rejects the request (401) if the token is invalid or missing an `orgId`

The `orgId` from Clerk is the organization the user belongs to — this becomes the `tenantId` for all data isolation.

#### @Public() Decorator

**File**: `common/src/auth/public.decorator.ts`

Marks an endpoint as public, skipping the `AuthGuard`. Used for health checks, asset serving, and the public campaign player.

```typescript
@Public()
@Get('health')
healthCheck() { ... }
```

### Tenant Context (`common/src/tenant/`)

The tenant context system ensures that all database operations are automatically scoped to the current user's organization. It uses **CLS (Context-Local Storage)** — similar to thread-local storage but for Node.js async contexts.

#### TenantClsService

**File**: `common/src/tenant/tenant-cls.service.ts`

Provides context-local storage for tenant and user information. Any code running within the same request can access the tenant without it being passed explicitly.

```typescript
// Set by the interceptor at the start of each request:
tenantClsService.setTenantId('org_abc123');
tenantClsService.setUserId('user_xyz789');

// Read by any service downstream:
const tenantId = tenantClsService.getTenantId();
```

Also manages the database entity manager per request, enabling transactional operations.

#### TenantContextInterceptor

**File**: `common/src/tenant/tenant-context.interceptor.ts`

A NestJS interceptor that runs on every authenticated request. It:

1. Extracts `tenantId` and `userId` from the request's auth claims
2. Stores them in the CLS context
3. Opens a database transaction
4. Sets a PostgreSQL session variable: `SET app.current_tenant_id = '<tenantId>'`
5. On success → commits the transaction
6. On error → rolls back the transaction

This means every database query within a request automatically runs inside a tenant-scoped transaction.

#### TenantClsModule

**File**: `common/src/tenant/tenant-cls.module.ts`

Global NestJS module that registers the CLS middleware. Because it's global, any module in the application can inject `TenantClsService` without importing the module explicitly.

### LLM Integration (`common/src/llm/`)

#### LiteLLM HTTP Client

**File**: `common/src/llm/litellm-http.client.ts`

HTTP client that communicates with the LiteLLM proxy. All LLM calls go through this proxy, which normalizes the interface across providers.

**Features**:
- `chatCompletion(request)` — Synchronous LLM completion (non-streaming)
- Model name normalization (strips provider prefix like `gemini/` from model names)
- Bearer token authentication via `LITELLM_MASTER_KEY`
- Image, video, audio, and 3D model generation methods
- File management (upload, check existence, delete)

**Base URL**: Configurable via `LITELLM_BASE_URL`, defaults to `http://litellm-proxy:4000`

#### Chat Completion Request

**File**: `common/src/llm/interfaces/chat-completion-request.interface.ts`

Supports:
- Text messages (system, user, assistant roles)
- Multimodal content (images, files embedded in messages)
- Response format options: `text`, `json_object`, `json_schema` (for structured output)
- Temperature, max tokens, and other standard LLM parameters

#### Prompt Template Service

**File**: `common/src/llm/services/prompt-template.service.ts`

Simple f-string variable interpolation for prompt templates. Replaces `{variable_name}` with provided values.

### Storage (`common/src/storage/`)

#### StorageService

**File**: `common/src/storage/storage.service.ts`

Persists generated artifacts to disk using **content-addressable storage** (SHA256 hashing). Files are stored in `ASSET_STORAGE_DIR` organized by `tenantId/runId/artifactType/`.

**Features**:
- **Deduplication**: Before writing, checks if a file with the same content hash already exists. If so, returns the existing URI without writing again.
- **Path traversal protection**: Validates all paths to prevent directory traversal attacks.
- **Size validation**: Enforces maximum file size (default 500MB).
- **MIME type detection**: Automatically detects content type from file contents.
- **Artifact tracking**: Creates an `Artifact` database record for each stored file.

**Methods**:
- `upload(params)` — Store a file and return `{ uri, httpUrl, contentHash, sizeBytes }`
- `exists(contentHash)` — Check if content already exists (deduplication)

### Exception Filters (`common/src/filters/`)

#### GlobalHttpExceptionFilter

**File**: `common/src/filters/global-http-exception.filter.ts`

Catches all `HttpException` errors and returns a standardized response:

```json
{
  "statusCode": 400,
  "message": "Validation failed",
  "error": "Bad Request",
  "timestamp": "2026-01-15T10:00:00Z",
  "path": "/api/campaigns"
}
```

#### UnhandledExceptionFilter

**File**: `common/src/filters/unhandled-exception.filter.ts`

Catches any exception that isn't an `HttpException` (unexpected errors). Logs the full stack trace and returns a generic 500 response.

### Media Providers (`common/src/providers/`)

The providers system abstracts external media generation services behind a registry pattern. Each media type (image, audio, video, 3D) has a registry that maps provider names to adapter implementations.

#### Provider Registries

| Registry | File | Adapters |
|----------|------|----------|
| Image | `image-provider.registry.ts` | Stability AI, NanoBanana, Stub |
| Audio | `audio-provider.registry.ts` | Suno BGM, NanoBanana SFX, Stub |
| Video | `video-provider.registry.ts` | NanoBanana |
| 3D | (via Meshy adapter) | Meshy |

Each registry provides a `getProvider(name)` method that returns the appropriate adapter. Skill handlers call the registry to get a provider, then use the adapter to generate media.

#### Stub Adapters

For development and testing, stub adapters return pre-generated placeholder assets instead of calling external APIs. Enabled via environment variables:

```bash
IMAGE_PROVIDER_STUB=true
VIDEO_PROVIDER_STUB=true
AUDIO_PROVIDER_STUB=true
```

#### Supporting Services

- **ConcurrencyLimiterService** — Limits concurrent calls to external providers (prevents rate limiting)
- **PollingService** — Polls external providers for async job completion

### Intelligence Utilities (`common/src/intelligence/`)

| File | Purpose |
|------|---------|
| `wcag-contrast.util.ts` | Calculates WCAG 2.1 contrast ratios between color pairs. Used by theme validation. |
| `copy-compliance.util.ts` | Checks generated copy for compliance (avoid words, required words). |
| `theme-presets.ts` | Pre-defined color themes organized by industry and mood. |
| `template-copy-defaults.ts` | Default copy text per game template type. |
| `copy-character-limits.ts` | Maximum character counts per copy type (headline, CTA, etc.). |

### Queue Configuration (`common/src/queues/`)

**Queue Names** (`queue-names.ts`):

| Constant | Value | Used By |
|----------|-------|---------|
| `WORKFLOW_ORCHESTRATION` | `'workflow-orchestration'` | Workflow Orchestration system |
| `RUN_ORCHESTRATION` | `'run-orchestration'` | Run Engine (campaign builds) |
| `RUN_STEPS` | `'run-steps'` | Individual step execution |

**Configuration** (`bull.config.ts`): BullMQ connection settings using Valkey (Redis-compatible).

### Constants (`common/src/constants/`)

| Constant | Value | Purpose |
|----------|-------|---------|
| `DEFAULT_TEMPERATURE` | `0.3` | Default LLM temperature for deterministic output |
| `DEFAULT_CHAT_MODEL` | `'gemini-2.0-flash-lite'` | Default model for chat completions |

---

## DTO Package

**Location**: `dto/src/`
**Package name**: `@agentic-template/dto`

The DTO (Data Transfer Object) package defines the contracts between services. Every request body, response body, and inter-service message is defined here with `class-validator` decorators for runtime validation.

### Why a Separate Package?

Both `api-center` and `agent-platform` need to agree on data formats. Instead of duplicating types, they share the `dto` package. When you change a DTO, both services see the change immediately.

### Organization

DTOs are organized by domain:

```
dto/src/
├── auth/
│   └── auth-request.dto.ts          # AuthenticatedRequest interface
├── campaign/
│   ├── campaign.dto.ts              # Create, Update, Response, Bulk DTOs
│   ├── campaign-config.interface.ts # CampaignConfig (theme, game, assets)
│   └── campaign-list-query.dto.ts   # List query parameters
├── chat/
│   ├── send-message.dto.ts          # SendMessageDto (content, max 10k chars)
│   ├── chat-message-response.dto.ts # ChatMessageResponse
│   ├── chat-session-response.dto.ts # ChatSessionResponse
│   ├── create-chat-session.dto.ts   # CreateChatSessionDto
│   └── list-sessions-query.dto.ts   # ListSessionsQuery (pagination)
├── intelligence/
│   ├── plan-generation.dto.ts       # Plan request, response, output schema
│   ├── copy-generation.dto.ts       # Copy request, response, compliance
│   ├── theme-extraction.dto.ts      # Theme request, response, validation
│   ├── theme-presets.dto.ts         # Theme preset queries
│   └── intelligence-enums.ts        # GenerationType enum
├── run-engine/
│   ├── run.dto.ts                   # TriggerRun, RunResponse, StepsSummary
│   └── run-step.dto.ts             # RunStepResponse
├── skills/
│   └── assemble-campaign-manifest.dto.ts  # Manifest assembly DTOs
├── campaign-context/
│   └── (context interfaces)
├── providers/
│   └── interfaces/                  # Provider-specific interfaces
├── template-system/
│   └── (template manifest interface)
├── prompt-registry/
│   └── (prompt template interfaces)
└── error/
    └── (error response interface)
```

### Validation Pattern

DTOs use `class-validator` decorators for runtime validation. The API Center's global `ValidationPipe` automatically validates incoming requests:

```typescript
// Example: Campaign creation validation
class CreateCampaignRequest {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @IsString()
  @IsNotEmpty()
  templateId: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => CampaignConfigDto)
  config?: CampaignConfigDto;
}
```

If validation fails, the API returns a 400 with details about which fields are invalid.

### Key DTOs

#### CampaignConfig Interface

```typescript
interface CampaignConfig {
  theme: ThemeConfig;          // Colors, font, background
  game: Record<string, unknown>; // Game-specific settings
  assets: CampaignAssetSlot[]; // References to media assets
}
```

#### ThemeConfigDto

Validates color fields as hex (`#RRGGBB`) or RGB format, plus font and background configuration.

#### PlanOutput

The structured output from intelligence plan generation:
```typescript
interface PlanOutput {
  summary: string;
  recommended_template: { template_id, template_name, reasoning, confidence };
  theme: { primary_color, secondary_color, accent_color, background_color, text_color, mood };
  prize_tiers: [{ tier, suggestion, probability, estimated_cost }];
  estimated_engagement: 'high' | 'medium' | 'low';
  asset_requirements: [{ type, purpose, generation_prompt }];
  warnings: string[];
}
```

#### StepsSummary

Progress tracking for a running workflow:
```typescript
interface StepsSummary {
  total: number;
  pending: number;
  running: number;
  completed: number;
  skipped: number;
  failed: number;
}
```
