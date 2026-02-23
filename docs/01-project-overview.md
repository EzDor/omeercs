# Project Overview

## What Is This?

This is an **AI-powered campaign generation platform** built as a production-ready microservices monorepo. It takes a marketing brief as input and automatically generates a complete interactive game campaign, including images, videos, audio, 3D assets, game code, and a playable bundle — all orchestrated by AI agents.

Think of it as a factory: you describe what you want ("a summer beach spin-the-wheel campaign for a shoe brand"), and the system produces every asset needed to deploy an interactive game experience.

## How It Works (The 30-Second Version)

```
Marketing Brief
      ↓
  AI Planning     →  Decides theme, colors, game template, difficulty, copy
      ↓
  Asset Generation (parallel)
      ├── Intro Image → Intro Video Loop
      ├── Win Outcome Video
      ├── Lose Outcome Video
      ├── Background Music + Sound Effects → Audio Mix
      ├── Game Configuration
      └── Theme Extraction + Copy Generation
      ↓
  Game Bundling   →  Packages game code + all assets into a playable bundle
      ↓
  QA Validation   →  Validates the bundle structure and quality
      ↓
  Campaign Manifest  →  Final deployable campaign with all references
```

## Monorepo Workspaces

The project uses **pnpm workspaces** with 6 packages that each have a distinct responsibility:

| Workspace | What It Does | Port |
|-----------|-------------|------|
| **api-center** | REST API server. Handles HTTP requests from the frontend, authenticates users, and enqueues work for the agent platform. | 3001 |
| **agent-platform** | Worker service. Picks up queued jobs and executes AI workflows — running skills like image generation, LLM calls, video creation, and game bundling. | 3002 |
| **webapp** | Frontend. Vue 3 single-page application where users create campaigns, chat with AI, and manage their generated content. | 5173 |
| **dao** | Data access layer. TypeORM entities, migrations, and the PostgreSQL data source configuration. No HTTP server — it's a library imported by other packages. | — |
| **dto** | Shared types. Data transfer objects with validation decorators used by both api-center and agent-platform to ensure consistent data contracts. | — |
| **common** | Shared utilities. Authentication guard, tenant context propagation, LLM client, storage service, media provider adapters, and exception filters. | — |

### Build Order

Packages depend on each other. You must build them in this order:

```
dto  →  common  →  dao  →  api-center / agent-platform / webapp
```

The `dto` package is the foundation (pure types), `common` builds on it (utilities), `dao` uses both (entities reference DTOs), and the three application packages consume everything.

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm (package manager)
- Docker and Docker Compose (for infrastructure)

### 1. Start Infrastructure

```bash
docker compose up -d
```

This launches:
- **PostgreSQL 17** (with pgvector) on port 5432
- **Valkey** (Redis-compatible cache) on port 6379
- **LiteLLM Proxy** (LLM gateway) on port 4000

### 2. Configure Environment

Copy `.env.example` to `.env.local` and set:

```bash
# Authentication (Clerk.com - must enable Organizations)
CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...

# At least one LLM provider key
GEMINI_API_KEY=...
OPENAI_API_KEY=...
ANTHROPIC_API_KEY=...

# LiteLLM proxy auth
LITELLM_MASTER_KEY=sk-litellm-...
```

### 3. Install Dependencies and Build

```bash
pnpm install
pnpm -r build
```

### 4. Run Database Migrations

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/agentic_template pnpm migration:run
```

### 5. Start All Services

```bash
pnpm -r --parallel dev
```

This starts api-center (3001), agent-platform (3002), and webapp (5173) simultaneously in watch mode.

### Running Individual Services

```bash
pnpm --filter api-center dev          # API only
pnpm --filter agent-platform dev      # Worker only
pnpm --filter webapp dev              # Frontend only
```

## Key Technologies

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Runtime | Node.js 20+, TypeScript 5.x (strict) | Type-safe JavaScript |
| Backend Framework | NestJS 10 | Dependency injection, modules, decorators |
| Frontend | Vue 3 + Vite | Reactive UI with hot-reload |
| UI Library | PrimeVue + Aura theme | Component library |
| State Management | Pinia | Vue store pattern |
| Database | PostgreSQL 17 + pgvector | Relational data + vector search |
| ORM | TypeORM | Entity mapping and migrations |
| Queue | BullMQ + Valkey | Async job processing |
| Auth | Clerk | JWT-based auth with organizations |
| LLM Gateway | LiteLLM Proxy | Multi-provider LLM abstraction |
| Workflow Engine | LangGraph | Stateful workflow graphs |
| Media Generation | Stability AI, Replicate, Suno, Meshy | External AI providers |
| Monorepo | pnpm workspaces | Package management |
