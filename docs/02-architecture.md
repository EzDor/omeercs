# System Architecture

## High-Level Architecture

The system follows a **decoupled microservices** pattern where the API server never does heavy work itself. Instead, it validates requests and pushes jobs onto queues, which the worker service picks up and processes asynchronously.

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend (Vue 3)                        │
│                     webapp - port 5173                          │
└──────────────────────────────┬──────────────────────────────────┘
                               │ HTTP / SSE
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                     API Center (NestJS)                         │
│                    api-center - port 3001                       │
│                                                                 │
│  ┌──────────┐ ┌───────────┐ ┌─────────────┐ ┌──────────────┐  │
│  │   Chat   │ │ Campaign  │ │Intelligence │ │  Run Engine  │  │
│  │Controller│ │Controller │ │ Controller  │ │  Controller  │  │
│  └────┬─────┘ └─────┬─────┘ └──────┬──────┘ └──────┬───────┘  │
│       │             │              │               │           │
│       ▼             ▼              ▼               ▼           │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              BullMQ Queue Producer                       │  │
│  └──────────────────────────┬───────────────────────────────┘  │
└─────────────────────────────┼──────────────────────────────────┘
                              │
                    ┌─────────▼─────────┐
                    │   Valkey (Redis)   │
                    │    port 6379       │
                    └─────────┬─────────┘
                              │
┌─────────────────────────────┼──────────────────────────────────┐
│                     Agent Platform (NestJS)                     │
│                  agent-platform - port 3002                     │
│                                                                 │
│  ┌──────────────────────────▼───────────────────────────────┐  │
│  │              BullMQ Queue Processors                      │  │
│  │    RUN_ORCHESTRATION  │  WORKFLOW_ORCHESTRATION           │  │
│  └──────────┬────────────┴──────────────────────────────────┘  │
│             │                                                   │
│  ┌──────────▼───────────┐                                      │
│  │     Run Engine       │  Loads YAML workflows, builds        │
│  │                      │  LangGraph state machines,           │
│  │  ┌────────────────┐  │  executes steps with caching         │
│  │  │ Workflow Builder│  │                                      │
│  │  │ Step Executor   │  │                                      │
│  │  │ Cache Service   │  │                                      │
│  │  └───────┬────────┘  │                                      │
│  └──────────┼───────────┘                                      │
│             │                                                   │
│  ┌──────────▼───────────┐     ┌─────────────────────────────┐  │
│  │    Skill Runner      │────▶│     Prompt Registry         │  │
│  │                      │     │  (versioned LLM prompts)    │  │
│  │  Handler-based       │     └─────────────────────────────┘  │
│  │  Template-based      │     ┌─────────────────────────────┐  │
│  │  (LLM generation)    │────▶│     Skill Catalog           │  │
│  └──────────┬───────────┘     │  (YAML skill descriptors)   │  │
│             │                 └─────────────────────────────┘  │
└─────────────┼──────────────────────────────────────────────────┘
              │
    ┌─────────▼─────────────────────────────────┐
    │          External Services                  │
    │                                             │
    │  ┌──────────────┐  ┌─────────────────────┐ │
    │  │ LiteLLM Proxy│  │ Media Providers     │ │
    │  │  port 4000   │  │ Stability, Replicate│ │
    │  │              │  │ Suno, Meshy, etc.   │ │
    │  │ Gemini       │  └─────────────────────┘ │
    │  │ OpenAI       │                           │
    │  │ Anthropic    │  ┌─────────────────────┐ │
    │  └──────────────┘  │   PostgreSQL 17     │ │
    │                    │   port 5432         │ │
    │                    │   Schema: app       │ │
    │                    └─────────────────────┘ │
    └─────────────────────────────────────────────┘
```

## Request Flow: Authentication and Multi-Tenancy

Every authenticated request follows this flow:

```
1. HTTP Request arrives with Bearer token (Clerk JWT)
       ↓
2. AuthGuard validates the JWT using Clerk SDK
   - Extracts userId and orgId (tenantId) from the token
   - If token is invalid → 401 Unauthorized
   - If no orgId → 401 (organization membership required)
       ↓
3. TenantContextInterceptor runs
   - Stores tenantId and userId in CLS (Context-Local Storage)
   - Opens a database transaction
   - Sets PostgreSQL session variable: SET app.current_tenant_id = '<tenantId>'
       ↓
4. Controller method executes
   - Reads tenantId from CLS via TenantClsService
   - All database queries are automatically tenant-scoped
       ↓
5. Response sent
   - On success: transaction commits
   - On error: transaction rolls back
```

**CLS (Context-Local Storage)** is the key pattern here. It's like thread-local storage but for Node.js async contexts. Once the interceptor sets the tenant, any code downstream (services, repositories) can access it without passing it explicitly through every function call.

## Queue Architecture

The system uses **BullMQ** with Valkey (Redis-compatible) for async job processing. There are two distinct queue systems:

### RUN_ORCHESTRATION Queue

Used by the **Run Engine** for campaign workflows. This is the primary execution path.

```
API Center                    Valkey                    Agent Platform
    │                           │                           │
    │  enqueue({                │                           │
    │    workflowName,          │                           │
    │    triggerPayload,        │                           │
    │    tenantId               │                           │
    │  })                       │                           │
    │ ─────────────────────────▶│                           │
    │                           │  LangGraphRunProcessor    │
    │                           │◀──────────────────────────│
    │                           │  picks up job             │
    │                           │                           │
    │                           │  Executes workflow steps  │
    │                           │  (may take minutes)       │
    │                           │                           │
```

### WORKFLOW_ORCHESTRATION Queue

Used by the **Workflow Orchestration** system for LangGraph workflows with PostgreSQL checkpointing. Supports workflow pause/resume from checkpoints.

### Why Two Systems?

- **Run Engine**: Optimized for the campaign build pipeline. Provides YAML-defined workflows, input-based caching, dependency graphs, and artifact tracking. Purpose-built for deterministic multi-step generation.
- **Workflow Orchestration**: General-purpose LangGraph execution with checkpointing. Used for chat workflows and other conversational/iterative patterns.

## Data Flow: Campaign Build (End to End)

This is the complete flow when a user clicks "Generate Campaign":

```
1. User clicks "Generate" in the webapp
       ↓
2. Frontend: POST /api/campaigns/:id/generate
       ↓
3. API Center: CampaignController.generate()
   - Validates campaign is in 'draft' or 'failed' status
   - Updates campaign status to 'generating'
   - Calls RunEngineApiService.triggerRun()
       ↓
4. RunEngineApiService:
   - Creates a Run entity (status: 'queued')
   - Enqueues job to RUN_ORCHESTRATION queue
   - Returns { runId, status: 'queued' } immediately
       ↓
5. Agent Platform: LangGraphRunProcessor picks up the job
       ↓
6. WorkflowYamlLoaderService:
   - Loads campaign.build.v1.yaml
   - Compiles input selectors (YAML DSL → TypeScript functions)
   - Returns WorkflowSpec with typed steps
       ↓
7. RunEngineService:
   - Creates RunStep entities for each step (status: 'pending')
   - DependencyGraphService sorts steps topologically
       ↓
8. LangGraphWorkflowBuilderService:
   - Builds a LangGraph StateGraph from the WorkflowSpec
   - Each step becomes a node in the graph
   - Edges follow the dependency graph (steps run in parallel when possible)
       ↓
9. Graph execution begins. For each step:
   a. CachedStepExecutor resolves inputs via InputSelector
   b. InputHasherService computes SHA256 of the resolved inputs
   c. StepCacheService checks for a cache hit
   d. If cached → return cached artifacts, mark step 'completed' + cacheHit=true
   e. If not cached → SkillRunnerService.execute()
       ↓
10. SkillRunnerService:
    - Looks up the skill descriptor from SkillCatalogService
    - Validates input against the skill's input_schema (Ajv)
    - Routes to handler:
      • Handler-based skill → Calls the handler's execute() method
      • Template-based skill → Routes to LlmGenerationService
    - Validates output against the skill's output_schema
    - Stores artifacts via StorageService
    - Caches the result via StepCacheService
       ↓
11. When all steps complete:
    - Run status → 'completed'
    - Campaign status → 'live'
    - Campaign.bundleUrl → points to the generated game bundle
       ↓
12. Frontend polls GET /api/runs/:runId for status updates
    - Displays step-by-step progress
    - Shows the final playable campaign when complete
```

## Infrastructure Services

| Service | Image | Port | Purpose |
|---------|-------|------|---------|
| PostgreSQL | pgvector/pgvector:pg17 | 5432 | Primary database with vector search support |
| Valkey | valkey/valkey:8.0 | 6379 | Redis-compatible queue backend and cache |
| LiteLLM Proxy | ghcr.io/berriai/litellm | 4000 | Multi-provider LLM gateway |

### LiteLLM Proxy

The LiteLLM proxy acts as a unified gateway to multiple LLM providers. Instead of the application code managing different API formats for Gemini, OpenAI, and Anthropic, everything goes through LiteLLM which normalizes the interface.

Configuration lives in `/litellm/litellm_config.yaml`. The proxy exposes an OpenAI-compatible API at port 4000.

### PostgreSQL Schema

All application tables live in the `app` schema (not the default `public` schema). This is set in the TypeORM data source configuration:

```typescript
schema: process.env.APP_SCHEMA || 'app'
```

The database also stores LangGraph checkpoint tables for workflow state persistence and replay.
