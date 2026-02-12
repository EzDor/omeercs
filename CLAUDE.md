# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Agentic System Template - A production-ready microservices platform for AI-powered applications. Full-stack with decoupled services (API, Worker, Frontend) using a pnpm monorepo structure.

## Commands

### Development
```bash
pnpm install                          # Install all dependencies
pnpm -r --parallel dev                # Start all services in watch mode
pnpm --filter api-center dev          # API only (port 3001)
pnpm --filter agent-platform dev      # Worker only (port 3002)
pnpm --filter webapp dev              # Frontend only (port 5173)
docker compose up -d                  # Start infrastructure (DB, Redis, LiteLLM)
```

### Building
```bash
pnpm -r build                         # Build all packages
pnpm --filter @agentic-template/dto build    # Build DTO package first (dependency)
pnpm --filter @agentic-template/common build # Build common package
pnpm --filter dao build                       # Build DAO package
```

### Testing
```bash
pnpm test                             # Run all tests
pnpm --filter agent-platform test     # Backend unit tests (Jest)
pnpm --filter webapp test:unit        # Frontend unit tests (Vitest)
pnpm --filter webapp test:e2e         # Frontend e2e tests (Playwright)

# Run single test file
pnpm --filter agent-platform test -- path/to/test.spec.ts
pnpm --filter webapp test:unit -- path/to/test.spec.ts
```

### Linting & Formatting
```bash
pnpm lint                             # Run ESLint
pnpm lint:fix                         # Fix ESLint issues
pnpm format                           # Run Prettier
pnpm --filter webapp type-check       # Vue type checking
```

### Database Migrations
```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/agentic_template pnpm migration:generate dao/src/migrations/MigrationName
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/agentic_template pnpm migration:run
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/agentic_template pnpm migration:show
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/agentic_template pnpm migration:revert
```

## Architecture

### Monorepo Structure (6 Workspaces)
- **api-center**: NestJS REST API server (port 3001) - handles HTTP requests, Clerk auth, BullMQ queue producer
- **agent-platform**: NestJS worker service (port 3002) - LangGraph workflow orchestration, BullMQ job processor
- **webapp**: Vue 3 + Vite frontend (port 5173) - PrimeVue components, Pinia state, Clerk Vue SDK
- **dao**: TypeORM data access layer - entities, migrations, PostgreSQL with pgvector
- **dto**: Shared data transfer objects with class-validator
- **common**: Shared utilities - auth guard, tenant context (CLS), LiteLLM client, exception filters

### Dependency Order
Build order matters: `dto` → `common` → `dao` → `api-center`/`agent-platform`/`webapp`

### Infrastructure Services
- **PostgreSQL** (pgvector/pgvector:pg17) - port 5432, database: `agentic_template`, schema: `app`
- **Valkey** (Redis-compatible) - port 6379, password: `REDIS_PASSWORD` env var
- **LiteLLM Proxy** - port 4000, UI at /ui, supports Gemini/OpenAI/Anthropic models

### Key Patterns
1. **Multi-tenancy**: Every entity has `tenantId`, extracted from Clerk organization via `TenantContextInterceptor`, propagated via CLS
2. **Queue Architecture**: API Center enqueues jobs → BullMQ → Agent Platform processes with LangGraph workflows
3. **LLM Integration**: LiteLLM proxy abstracts model providers, configured in `/litellm/litellm_config.yaml`
4. **Auth Flow**: Clerk JWT → AuthGuard validates → TenantContextInterceptor extracts org → CLS propagates tenant

### Run Engine & Workflow Systems

The agent-platform has two parallel execution systems:

**Run Engine** (`agent-platform/src/run-engine/`):
- Executes workflows as sequential steps with skill invocation
- Key services: `RunEngineService`, `WorkflowRegistryService`, `CachedStepExecutorService`
- Workflow definitions loaded from YAML files via `WorkflowYamlLoaderService`
- Step dependencies managed via `DependencyGraphService` (topological sorting)
- Input-based caching via `StepCacheService` with hash-based keys
- Queue: `RUN_ORCHESTRATION` processed by `LangGraphRunProcessor`

**Workflow Orchestration** (`agent-platform/src/workflow-orchestration/`):
- Executes LangGraph workflows with PostgreSQL checkpointing
- Key services: `WorkflowEngineService`, `WorkflowQueueService`
- Supports workflow retry from checkpoints
- Queue: `WORKFLOW_ORCHESTRATION` processed by `WorkflowQueueProcessor`

**Skills System** (`agent-platform/src/skills/`):
- `SkillRunnerService`: Main skill execution orchestrator with timeout/validation
- `SkillCatalogService`: Loads skill descriptors from YAML, manages versions
- Two skill types: handler-based (custom code) and template-based (LLM_JSON_GENERATION)
- `LlmGenerationService`: Executes LLM-based skills with prompt rendering

**Prompt Registry** (`agent-platform/src/prompt-registry/`):
- In-memory registry of prompt templates loaded from filesystem
- `TemplateRendererService`: f-string variable interpolation for prompts

### Data Flow (Chat Example)
```
Frontend → API Center (POST /api/chat/send) → BullMQ queue → Agent Platform → LangGraph workflow → LiteLLM → LLM Provider
                                                                                                            ↓
Frontend ← API Center (SSE stream) ←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←← Response
```

### Key Code Locations
| Component | Location |
|-----------|----------|
| API Routes | `api-center/src/chat/chat.controller.ts` |
| Auth Guard | `common/src/auth/auth.guard.ts` |
| Tenant Context | `common/src/tenant/tenant-cls.service.ts` |
| LLM Client | `common/src/llm/litellm-http.client.ts` |
| Run Engine | `agent-platform/src/run-engine/` |
| Workflow Engine | `agent-platform/src/workflow-orchestration/` |
| Skill Runner | `agent-platform/src/skills/skill-runner/skill-runner.service.ts` |
| Chat Entities | `dao/src/entities/chat-*.entity.ts` |
| Run Entities | `dao/src/entities/run.entity.ts`, `run-step.entity.ts` |
| Vue Routes | `webapp/src/router/` |
| Pinia Stores | `webapp/src/stores/` |

## Configuration

### Required Environment Variables
- `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` - Authentication (clerk.com, must enable Organizations)
- At least one LLM key: `GEMINI_API_KEY`, `OPENAI_API_KEY`, or `ANTHROPIC_API_KEY`
- `LITELLM_MASTER_KEY` - LiteLLM proxy authentication

### Default Ports
- API: 3001, Debug: 9229
- Worker: 3002, Debug: 9230
- Frontend: 5173
- PostgreSQL: 5432
- Valkey: 6379
- LiteLLM: 4000

## Code Style
- Prettier: printWidth 180, single quotes, trailing commas
- ESLint: TypeScript with type checking, decorators allowed
- Pre-commit hooks via Husky

## General Coding Principles
- **No code comments**: NEVER write code comments unless explicitly requested. Instead, extract the intended comment into a small, well-named function that makes the code self-documenting.
- **No README files**: NEVER create a README.md unless explicitly requested.
- **No barrel files (index.ts)**: NEVER create index.ts files that re-export from other files. Always import directly from the source file (e.g., import from './skill-result.interface' not from './index'). Exception: index.ts files that contain actual implementation logic (like webapp/src/router/index.ts which creates the Vue Router instance).
- **Check docs with Context7**: When working with 3rd party libraries or APIs, use the Context7 MCP tool (`mcp__context7__resolve-library-id` and `mcp__context7__get-library-docs`) to fetch up-to-date documentation before implementing.

## .specify Directory
Agentic workflow system for specification-driven development. Contains templates (spec, plan, tasks) and scripts for AI-assisted feature development. Used with Claude Code skills in `.claude/commands/`.
