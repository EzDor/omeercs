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
pnpm --filter webapp test:unit        # Frontend unit tests (Vitest)
pnpm --filter webapp test:e2e         # Frontend e2e tests (Playwright)
pnpm test:rls                         # Row-level security tests
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
| Workflow Engine | `agent-platform/src/workflow-orchestration/` |
| Chat Entities | `dao/src/entities/chat-*.entity.ts` |
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

## .specify Directory
Agentic workflow system for specification-driven development. Contains templates (spec, plan, tasks) and scripts for AI-assisted feature development. Used with Claude Code skills in `.claude/commands/`.

## Active Technologies
- TypeScript 5.x / Node.js 20.x (matches existing codebase) + NestJS 11.x, class-validator, class-transformer, js-yaml, Ajv (JSON Schema validation) (001-skill-runner)
- PostgreSQL with TypeORM (for artifact registry metadata) (001-skill-runner)
- TypeScript 5.x / Node.js 20.x (matches existing codebase) + NestJS 11.x, class-validator, class-transformer, existing LiteLLMHttpClien (003-provider-adapters)
- N/A (provider-hosted URLs returned directly, no platform storage layer) (003-provider-adapters)
- TypeScript 5.x / Node.js 20.x (matches existing codebase) + NestJS 11.x, BullMQ, TypeORM, class-validator, class-transformer, existing SkillRunner service (004-run-engine)
- PostgreSQL with TypeORM (new tables: runs, run_steps, step_cache); Valkey/Redis for step cache (TTL-based) (004-run-engine)
- TypeScript 5.x / Node.js 20.x (matches existing codebase) + NestJS 11.x, Mustache (template rendering), Ajv (existing SchemaValidatorService), js-yaml (YAML frontmatter parsing) (005-prompt-config-registry)
- Filesystem at startup (no database for templates); PostgreSQL for run_steps.debug storage (existing) (005-prompt-config-registry)
- TypeScript 5.x / Node.js 20.x (matches existing codebase) + NestJS 11.x, class-validator, class-transformer, js-yaml, Ajv (existing SchemaValidatorService), Mustache (existing PromptRegistryService), LiteLLMHttpClient (existing) (006-agent-layer-rules)
- PostgreSQL with TypeORM (existing Run/RunStep tables for debug storage); Filesystem for prompt templates (existing pattern) (006-agent-layer-rules)

## Recent Changes
- 001-skill-runner: Added TypeScript 5.x / Node.js 20.x (matches existing codebase) + NestJS 11.x, class-validator, class-transformer, js-yaml, Ajv (JSON Schema validation)
