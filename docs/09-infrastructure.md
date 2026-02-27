# Infrastructure and Configuration

## Docker Compose Services

The project uses Docker Compose to run all infrastructure dependencies locally. The configuration is in `docker-compose.yml`.

### Service Map

| Service | Image | Port | Purpose |
|---------|-------|------|---------|
| **center-db** | `pgvector/pgvector:pg17` | 5432 | PostgreSQL 17 with vector search extension |
| **valkey** | `valkey/valkey:8.0` | 6379 | Redis-compatible cache and queue backend |
| **litellm-proxy** | `ghcr.io/berriai/litellm` | 4000 | Multi-provider LLM gateway |
| **api-center** | Built from source | 3001 (debug: 9229) | REST API server |
| **agent-platform** | Built from source | 3002 (debug: 9230) | Worker service |
| **webapp** | Built from source | 5173 | Frontend dev server |

### Starting Infrastructure Only

For local development, you typically run infrastructure in Docker and the application services natively:

```bash
# Start only infrastructure (DB, Redis, LLM proxy)
docker compose up -d center-db valkey litellm-proxy

# Run application services natively with hot-reload
pnpm -r --parallel dev
```

### Starting Everything in Docker

```bash
docker compose up -d
```

## PostgreSQL Configuration

### Connection Details

| Parameter | Default Value |
|-----------|--------------|
| Host | `localhost` |
| Port | `5432` |
| Database | `agentic_template` |
| Username | `postgres` |
| Password | `postgres` |
| Schema | `app` |

### Schema Design

All application tables are in the `app` schema, not the default `public` schema. This is configured in `dao/src/datasource.ts`:

```typescript
const AppDataSource = new DataSource({
  type: 'postgres',
  schema: process.env.APP_SCHEMA || 'app',
  // ...
});
```

### pgvector Extension

The database uses the pgvector extension for potential vector similarity search operations. The `pgvector/pgvector:pg17` Docker image comes with the extension pre-installed.

### Database URL

The connection can be configured either as a single URL or individual parameters:

```bash
# Single URL (preferred)
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/agentic_template

# Or individual parameters
DB_HOST=localhost
DB_PORT=5432
DB_NAME=agentic_template
DB_USER=postgres
DB_PASSWORD=postgres
```

### SSL Configuration

For production, SSL can be configured via:
```bash
DB_SSL_REJECT_UNAUTHORIZED=false  # Accept self-signed certificates
```

## Valkey (Redis-Compatible)

### Connection Details

| Parameter | Default Value |
|-----------|--------------|
| Host | `localhost` (or `valkey` in Docker) |
| Port | `6379` |
| Password | Set via `REDIS_PASSWORD` env var |

### What It's Used For

1. **BullMQ job queues** — The RUN_ORCHESTRATION and WORKFLOW_ORCHESTRATION queues store their jobs in Valkey
2. **Job state tracking** — BullMQ stores job status, progress, and results
3. **No application-level caching** — Step caching uses PostgreSQL, not Redis

### Why Valkey Instead of Redis?

Valkey is a fork of Redis that's fully API-compatible. It's used because it's open-source with no license restrictions.

## LiteLLM Proxy

### What It Does

LiteLLM is a proxy that sits between the application and LLM providers (Gemini, OpenAI, Anthropic). It:

1. Exposes a unified OpenAI-compatible API
2. Handles authentication to different providers
3. Provides model aliasing and routing
4. Offers a UI dashboard at `http://localhost:4000/ui`

### Configuration

**File**: `litellm/litellm_config.yaml`

This file defines which models are available and how they map to providers:

```yaml
model_list:
  - model_name: gemini-2.0-flash
    litellm_params:
      model: gemini/gemini-2.0-flash
      api_key: os.environ/GEMINI_API_KEY

  - model_name: gpt-4o
    litellm_params:
      model: openai/gpt-4o
      api_key: os.environ/OPENAI_API_KEY

  - model_name: claude-opus-4-6
    litellm_params:
      model: anthropic/claude-opus-4-6
      api_key: os.environ/ANTHROPIC_API_KEY
```

### Connection

| Parameter | Default Value |
|-----------|--------------|
| Base URL | `http://litellm-proxy:4000` (Docker) or `http://localhost:4000` (local) |
| Auth | Bearer token via `LITELLM_MASTER_KEY` |

## Environment Variables

### Required

| Variable | Description | Used By |
|----------|-------------|---------|
| `CLERK_PUBLISHABLE_KEY` | Clerk public key (starts with `pk_`) | api-center, webapp |
| `CLERK_SECRET_KEY` | Clerk secret key (starts with `sk_`) | api-center |
| `LITELLM_MASTER_KEY` | LiteLLM proxy authentication key | api-center, agent-platform |
| At least one LLM key: | | |
| `GEMINI_API_KEY` | Google Gemini API key | litellm-proxy |
| `OPENAI_API_KEY` | OpenAI API key | litellm-proxy |
| `ANTHROPIC_API_KEY` | Anthropic API key | litellm-proxy |

### Optional

| Variable | Default | Description |
|----------|---------|-------------|
| **Ports** | | |
| `API_CENTER_PORT` | `3001` | API server port |
| `AGENT_PLATFORM_PORT` | `3002` | Worker service port |
| **Database** | | |
| `DATABASE_URL` | — | Full PostgreSQL connection string |
| `DB_HOST` | `localhost` | PostgreSQL host |
| `DB_PORT` | `5432` | PostgreSQL port |
| `DB_NAME` | `agentic_template` | Database name |
| `DB_USER` | `postgres` | Database user |
| `DB_PASSWORD` | `postgres` | Database password |
| `APP_SCHEMA` | `app` | PostgreSQL schema name |
| `DB_SSL_REJECT_UNAUTHORIZED` | — | SSL certificate verification |
| **Redis** | | |
| `REDIS_HOST` | `localhost` | Valkey host |
| `REDIS_PORT` | `6379` | Valkey port |
| `REDIS_PASSWORD` | — | Valkey password |
| **LLM** | | |
| `LITELLM_BASE_URL` | `http://litellm-proxy:4000` | LiteLLM proxy URL |
| **Storage** | | |
| `ASSET_STORAGE_DIR` | — | Directory for generated media assets |
| `SKILLS_OUTPUT_DIR` | — | Directory for skill execution output (game bundles) |
| **Workflow** | | |
| `WORKFLOW_RECURSION_LIMIT` | — | Max LangGraph recursion depth |
| `WORKFLOW_MAX_STEPS` | — | Max steps in a workflow run |
| `WORKFLOW_TIMEOUT_MS` | — | Max workflow execution time |
| **OpenCode** | | |
| `OPENCODE_MODEL` | `anthropic/claude-opus-4-6` | LLM model used by the embedded OpenCode agent for code generation |
| `BUNDLE_HEALING_MAX_ITERATIONS` | `3` | Max self-healing validation loop iterations for game bundling (capped at 10) |
| **Provider Stubs** | | |
| `IMAGE_PROVIDER_STUB` | `false` | Use placeholder images instead of real generation |
| `VIDEO_PROVIDER_STUB` | `false` | Use placeholder videos |
| `AUDIO_PROVIDER_STUB` | `false` | Use placeholder audio |
| **Frontend** | | |
| `VITE_API_CENTER_BASE_URL` | `http://localhost:3001/api` | API URL for the frontend |
| `VITE_CLERK_PUBLISHABLE_KEY` | — | Clerk public key for the frontend |
| **CORS** | | |
| `CORS_DOMAIN` | — | Allowed CORS origin domain |

## Network Architecture

### Internal Communication

```
┌────────────┐     HTTP      ┌────────────────┐
│  webapp    │ ──────────── ▶│   api-center   │
│  :5173     │               │   :3001        │
└────────────┘               └───────┬────────┘
                                     │
                              BullMQ │ (via Valkey)
                                     │
                             ┌───────▼────────┐
                             │ agent-platform  │
                             │   :3002        │
                             └───────┬────────┘
                                     │
                     ┌───────────────┼───────────────┐
                     │               │               │
              ┌──────▼──────┐ ┌──────▼──────┐ ┌──────▼──────┐
              │ LiteLLM     │ │ PostgreSQL  │ │ External    │
              │ Proxy :4000 │ │ :5432       │ │ Providers   │
              └─────────────┘ └─────────────┘ └─────────────┘
```

- **webapp → api-center**: HTTP REST + SSE (Server-Sent Events for streaming)
- **api-center → agent-platform**: Indirect via BullMQ queues in Valkey
- **agent-platform → LiteLLM**: HTTP calls for LLM completions
- **agent-platform → PostgreSQL**: Direct for entity persistence and checkpointing
- **agent-platform → External Providers**: HTTP calls for media generation (Stability, Replicate, Suno, Meshy)

### Port Summary

| Port | Service | Protocol |
|------|---------|----------|
| 3001 | API Center | HTTP REST |
| 3002 | Agent Platform | HTTP (internal) |
| 4000 | LiteLLM Proxy | HTTP (OpenAI-compatible) |
| 5173 | Webapp | HTTP (Vite dev server) |
| 5432 | PostgreSQL | PostgreSQL protocol |
| 6379 | Valkey | Redis protocol |
| 9229 | API Center Debug | Node.js inspector |
| 9230 | Agent Platform Debug | Node.js inspector |

## Debugging

### Attaching a Debugger

Both `api-center` and `agent-platform` expose Node.js inspector ports:

- **API Center**: `--inspect=0.0.0.0:9229`
- **Agent Platform**: `--inspect=0.0.0.0:9230`

In VS Code, add a debug configuration that attaches to these ports.

### Viewing Logs

When running with `pnpm -r --parallel dev`, logs from all services are interleaved in the terminal. To isolate:

```bash
# Run just one service
pnpm --filter api-center dev
pnpm --filter agent-platform dev
```

### Health Checks

```bash
# API Center health
curl http://localhost:3001/api/health

# LiteLLM Proxy
curl http://localhost:4000/health
```

## Code Quality

### Linting

```bash
pnpm lint          # Check for issues
pnpm lint:fix      # Auto-fix issues
```

ESLint is configured with TypeScript type checking and decorator support.

### Formatting

```bash
pnpm format        # Run Prettier
```

Prettier settings: `printWidth: 180`, single quotes, trailing commas.

### Pre-commit Hooks

Husky runs linting and formatting checks before each commit. If checks fail, the commit is blocked.

### Type Checking

```bash
pnpm --filter webapp type-check    # Vue type checking
```

## Testing

```bash
pnpm test                                    # Run all tests
pnpm --filter agent-platform test            # Backend unit tests (Jest)
pnpm --filter webapp test:unit               # Frontend unit tests (Vitest)
pnpm --filter webapp test:e2e               # Frontend e2e tests (Playwright)

# Single test file
pnpm --filter agent-platform test -- path/to/test.spec.ts
```
