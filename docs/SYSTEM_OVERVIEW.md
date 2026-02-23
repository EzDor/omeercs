# Agentic Game Creator - System Overview

## Table of Contents
1. [Infrastructure](#infrastructure)
2. [Architecture](#architecture)
3. [Data Model](#data-model)
4. [Skills System](#skills-system)
5. [Prompt Loading](#prompt-loading)
6. [Run Engine & Agents](#run-engine--agents)
7. [MVP Gap Analysis](#mvp-gap-analysis)

---

## Infrastructure

### Docker Compose Stack

| Service | Port | Purpose |
|---------|------|---------|
| **api-center** | 3001 | REST API server, Clerk auth, BullMQ producer |
| **agent-platform** | 3002 | Worker service, LangGraph workflows, job consumer |
| **webapp** | 5173 | Vue 3 + Vite frontend |
| **PostgreSQL** (pgvector) | 5432 | Primary database with vector search |
| **Valkey** (Redis) | 6379 | BullMQ queue broker, caching |
| **LiteLLM Proxy** | 4000 | LLM abstraction (OpenAI/Anthropic/Gemini) |

### Network Topology

```
┌─────────────┐     HTTP/JWT      ┌─────────────┐
│   Webapp    │ ────────────────► │  API Center │
│  (Vue 3)    │                   │  (NestJS)   │
└─────────────┘                   └──────┬──────┘
                                         │
                                         │ BullMQ Jobs
                                         ▼
┌─────────────┐                   ┌─────────────┐
│   Valkey    │ ◄───────────────► │   Agent     │
│   (Redis)   │                   │  Platform   │
└─────────────┘                   └──────┬──────┘
                                         │
                    ┌────────────────────┼────────────────────┐
                    │                    │                    │
                    ▼                    ▼                    ▼
             ┌───────────┐        ┌───────────┐        ┌───────────┐
             │ PostgreSQL│        │  LiteLLM  │        │   Skills  │
             │  (pgvector)│        │   Proxy   │        │  Catalog  │
             └───────────┘        └───────────┘        └───────────┘
```

### Environment Configuration

```bash
# Database
DB_HOST=center-db          # Docker hostname
DB_NAME=agentic_template
DB_USER=app_user

# Queue
REDIS_HOST=valkey
REDIS_PORT=6379

# LLM
LITELLM_BASE_URL=http://litellm-proxy:4000
LITELLM_MASTER_KEY=sk-...

# Auth
CLERK_PUBLISHABLE_KEY=pk_...
CLERK_SECRET_KEY=sk_...
```

---

## Architecture

### Monorepo Structure

```
omeercs/
├── api-center/           # REST API (NestJS)
├── agent-platform/       # Worker (NestJS + LangGraph)
├── webapp/               # Frontend (Vue 3 + Vite)
├── dao/                  # TypeORM entities & migrations
├── dto/                  # Shared interfaces & DTOs
├── common/               # Auth guards, tenant context, LLM client
├── skills/               # Skill catalog (YAML descriptors)
└── litellm/              # LLM proxy configuration
```

### Build Order

```
dto (no deps)
  ↓
common (depends: dto)
  ↓
dao (depends: common, dto)
  ↓
api-center / agent-platform / webapp
```

### Multi-Tenancy

Every entity has `tenantId` derived from Clerk Organization:

```
JWT Token → AuthGuard → TenantContextInterceptor → TenantClsService
                                                        ↓
                                               Propagated via CLS
                                               to all async contexts
```

### Request Flow (Workflow Trigger)

```
1. POST /api/runs { workflowName, triggerPayload }
2. API Center validates JWT, extracts tenant
3. Creates Run entity (status: 'queued')
4. Enqueues job to BullMQ 'run-orchestration' queue
5. Returns { runId, status }

6. Agent Platform picks up job
7. Loads WorkflowSpec from registry
8. Builds LangGraph state machine
9. Executes steps in dependency order
10. Each step calls SkillRunnerService
11. Updates Run/RunStep entities
12. Run completes (status: 'completed')
```

---

## Data Model

### Core Entities

#### Run
```typescript
Run {
  id: UUID
  tenantId: string
  workflowName: string        // e.g., "campaign.build.minimal"
  workflowVersion: string
  triggerType: 'initial' | 'update'
  triggerPayload: JSONB       // Input data
  status: 'queued' | 'running' | 'completed' | 'failed'
  context: CampaignContext    // Accumulated context
  error: { code, message, failedStepId }
  startedAt, completedAt, durationMs
}
```

#### RunStep
```typescript
RunStep {
  id: UUID
  runId: UUID                 // FK to Run
  stepId: string              // e.g., "game_config"
  skillId: string             // e.g., "game_config_from_template"
  status: 'pending' | 'running' | 'completed' | 'failed'
  inputHash: string           // SHA256 for caching
  attempt: number
  outputArtifactIds: string[] // Array of artifact UUIDs
  cacheHit: boolean
  error: { code, message }
  durationMs: number
}
```

#### Artifact
```typescript
Artifact {
  id: UUID
  tenantId: string
  runId: UUID
  skillId: string
  type: string                // "audio", "image", "bundle"
  uri: string                 // S3/file path
  contentHash: string         // SHA256
  sizeBytes: bigint
  metadata: JSONB
}
```

#### StepCache
```typescript
StepCache {
  cacheKey: string            // workflow:stepId:inputHash
  artifactIds: string[]
  scope: 'global' | 'run_only'
}
```

### ER Diagram

```
┌────────────┐       ┌────────────┐       ┌────────────┐
│    Run     │───────│  RunStep   │───────│  Artifact  │
├────────────┤  1:N  ├────────────┤  1:N  ├────────────┤
│ id         │       │ id         │       │ id         │
│ tenantId   │       │ runId      │       │ runId      │
│ workflowN. │       │ stepId     │       │ skillId    │
│ status     │       │ skillId    │       │ type       │
│ context    │       │ status     │       │ uri        │
│ error      │       │ inputHash  │       │ contentHash│
└────────────┘       │ artifactIds│       │ metadata   │
                     └────────────┘       └────────────┘
                            │
                            ▼ (cache lookup)
                     ┌────────────┐
                     │ StepCache  │
                     ├────────────┤
                     │ cacheKey   │
                     │ artifactIds│
                     └────────────┘
```

---

## Skills System

### Skill Catalog Structure

```
skills/catalog/
├── index.yaml                    # Registry of all skills
├── game_config_from_template.yaml
├── generate_bgm_track.yaml
├── bundle_game_template.yaml
├── assemble_campaign_manifest.yaml
└── ... (18 total skills)
```

### Skill Descriptor (YAML)

```yaml
skill_id: game_config_from_template
version: "1.0.0"
title: "Generate Game Configuration"
tags: [game, config, template]
status: active

input_schema:
  type: object
  properties:
    template_id: { type: string }
    theme: { type: string }
  required: [template_id]

output_schema:
  type: object
  properties:
    data: { type: object }

implementation:
  type: ts_function
  handler: GameConfigFromTemplateHandler

produces_artifacts:
  - artifact_type: game_config
    description: JSON configuration file

policy:
  max_runtime_sec: 30
  network: true
```

### Skill Loading Flow

```
1. App Startup
   ↓
2. SkillCatalogService.onModuleInit()
   ↓
3. loadCatalog() reads skills/catalog/index.yaml
   ↓
4. For each active skill:
   loadSkillDescriptor(skillId) → validate YAML
   ↓
5. registerHandlers() → instantiate TypeScript handlers
   ↓
6. Skills available via getHandler(skillId)
```

### Skill Handler Pattern

```typescript
interface SkillHandler<TInput, TOutput> {
  execute(
    input: TInput,
    context: SkillExecutionContext
  ): Promise<SkillResult<TOutput>>;
}

interface SkillResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
  error_code?: string;
  artifacts: SkillArtifact[];
  debug: { timings_ms, provider_calls };
}
```

### Current Skills (18 total)

| Category | Skills |
|----------|--------|
| **Planning** | campaign_plan_from_brief |
| **Video** | generate_intro_video_loop, generate_outcome_video_win, generate_outcome_video_lose |
| **Audio** | generate_bgm_track, generate_sfx_pack, mix_audio_for_game |
| **Image** | generate_intro_image, segment_start_button |
| **3D** | generate_3d_asset, optimize_3d_asset |
| **Game** | game_config_from_template, bundle_game_template, validate_game_bundle |
| **Manifest** | assemble_campaign_manifest |
| **QA** | review_asset_quality |

---

## Prompt Loading

### Prompt Registry Structure

```
agent-platform/prompts/
├── campaign_plan/
│   └── 1.0.0.md
└── example_json_generation/
    └── 1.0.0.md
```

### Prompt File Format

```markdown
---
prompt_id: campaign_plan
version: 1.0.0
vars_schema:
  type: object
  properties:
    brief: { type: string }
model_defaults:
  model: gemini-2.5-flash
  temperature: 0.7
output_schema:
  type: object
  properties:
    plan: { type: object }
---

# System Prompt

You are a campaign planner. Given the brief: {brief}

Generate a structured plan with:
- Theme selection
- Asset requirements
- Timeline
```

### Prompt Loading Flow

```
1. PromptRegistryService.onModuleInit()
   ↓
2. TemplateLoaderService scans prompts/ directory
   ↓
3. For each .md file:
   - Parse YAML frontmatter (gray-matter)
   - Validate vars_schema, output_schema
   - Store in memory: Map<promptId, Map<version, Template>>
   ↓
4. At runtime:
   TemplateRendererService.render(promptId, vars)
   → Replace {variable} placeholders
   → Return rendered prompt
```

---

## Run Engine & Agents

### Workflow Definition (TypeScript)

```typescript
import type { WorkflowSpec } from '../interfaces/workflow-spec.interface';
import { inputSelector, fromTrigger, fromStep, constant } from './input-helpers';

export const campaignBuildMinimalWorkflow: WorkflowSpec = {
  workflowName: 'campaign.build.minimal',
  version: '1.0.0',
  description: 'Minimal campaign build for reference implementation testing - 4 steps',
  steps: [
    {
      stepId: 'game_config',
      skillId: 'game_config_from_template',
      dependsOn: [],
      description: 'Generate game configuration from template',
      inputSelector: inputSelector({
        template_id: fromTrigger('template_id'),
        theme: fromTrigger('theme'),
        difficulty: fromTrigger('difficulty'),
        color_scheme: fromTrigger('color_scheme'),
        copy: fromTrigger('copy'),
      }),
      cachePolicy: { enabled: true, scope: 'global' },
      retryPolicy: { maxAttempts: 2, backoffMs: 1000 },
    },
    {
      stepId: 'bgm',
      skillId: 'generate_bgm_track',
      dependsOn: [],
      description: 'Generate background music track',
      inputSelector: inputSelector({
        style: fromTrigger('audio.style'),
        duration_sec: fromTrigger('audio.duration_sec'),
        loopable: constant(true),
      }),
      cachePolicy: { enabled: true, scope: 'global' },
      retryPolicy: { maxAttempts: 2, backoffMs: 2000 },
    },
    {
      stepId: 'bundle_game',
      skillId: 'bundle_game_template',
      dependsOn: ['game_config', 'bgm'],
      description: 'Bundle game template with assets',
      inputSelector: inputSelector({
        game_config: fromStep('game_config', 'data'),
        audio_uri: fromStep('bgm', 'audio_uri'),
        template_id: fromTrigger('template_id'),
      }),
      cachePolicy: { enabled: true, scope: 'run_only' },
      retryPolicy: { maxAttempts: 2, backoffMs: 2000 },
    },
  ],
};
```

### LangGraph Execution

```
1. WorkflowRegistryService provides pre-registered WorkflowSpec
   ↓
2. LangGraphWorkflowBuilderService builds StateGraph
   ↓
3. For each step → Create node function:

   async (state: RunStateType) => {
     context = buildRunContext(state)
     input = inputSelector(context)
     result = await skillRunner.execute(skillId, input)
     return buildSuccessUpdate(stepId, result)
   }
   ↓
4. Connect nodes via edges (dependsOn)
   ↓
5. WorkflowEngineService.executeWorkflow(graph, initialState)
```

### State Flow Between Steps

```typescript
RunStateType {
  runId, tenantId, workflowName
  triggerPayload: { ... }           // Initial input
  stepResults: Map<stepId, {
    status: 'completed'
    artifactIds: ['uuid-1', 'uuid-2']
    data: { ... }                   // Step output
    cacheHit: boolean
    durationMs: number
  }>
  artifacts: Map<stepId, string[]>  // Artifact IDs
  error: null | string
}
```

### Input Selector Helpers

| Helper | Description | Example |
|--------|-------------|---------|
| `fromTrigger(path)` | From the original trigger payload | `fromTrigger('template_id')`, `fromTrigger('audio.style')` |
| `fromStep(stepId, path)` | From a completed step's output | `fromStep('plan', 'data.bundle_uri')` |
| `fromBaseRun(stepId, path)` | From a previous run's step output | `fromBaseRun('plan', 'data.audio_style')` |
| `constant(value)` | Literal values | `constant(true)`, `constant({ bgm_lufs: -14 })` |
| `merge(...resolvers)` | Merge multiple resolved objects | `merge(fromBaseRun('plan', 'data.mood'), fromTrigger('overrides'))` |

### Caching Strategy

```
1. Hash input: SHA256(canonical_json(input))
2. Build cache key: "workflow:stepId:inputHash"
3. Check StepCache table
4. If HIT: Return cached artifactIds (skip execution)
5. If MISS: Execute skill, store result
```

---

## MVP Gap Analysis

### What Exists ✅

| Component | Status |
|-----------|--------|
| Infrastructure (Docker, DB, Redis, LiteLLM) | ✅ Working |
| Multi-tenant API with Clerk auth | ✅ Working |
| BullMQ job queue | ✅ Working |
| LangGraph workflow engine | ✅ Working |
| Skill catalog & handler framework | ✅ Working |
| Prompt registry | ✅ Working |
| Run/RunStep/Artifact persistence | ✅ Working |
| Step caching | ✅ Working |
| 4-step minimal workflow | ✅ Working |

### What's Missing for AI Game Creator MVP ❌

#### 1. **Real AI Provider Integrations**

Currently using stub providers that return placeholder files.

| Provider | Purpose | Status |
|----------|---------|--------|
| **Image Generation** | Intro images, game assets | ❌ Need DALL-E/Midjourney/Stability |
| **Video Generation** | Intro/outcome videos | ❌ Need Runway/Pika/Sora |
| **Audio Generation** | BGM, SFX | ❌ Need Suno/Udio/ElevenLabs |
| **3D Generation** | Game 3D assets | ❌ Need Meshy/Tripo/Rodin |

**Effort**: ~2-3 weeks per provider (API integration, error handling, rate limits)

#### 2. **Game Templates**

Currently bundle_game_template creates placeholder HTML.

**Need**:
- Actual game templates (HTML5 Canvas/Phaser.js/PixiJS)
- Template types: spin_wheel, scratch_card, quiz, memory_match
- Dynamic config injection (colors, prizes, timing)
- Mobile-responsive rendering

**Effort**: ~1-2 weeks per game template

#### 3. **Asset Storage (S3/CDN)**

Currently using local filesystem (`/tmp/skills/`).

**Need**:
- S3 bucket integration
- CDN for asset delivery (CloudFront/Cloudflare)
- Presigned URLs for secure access
- Content-hash based deduplication

**Effort**: ~1 week

#### 4. **Campaign Preview/Player**

Currently no way to view generated campaigns.

**Need**:
- Web-based campaign player
- Embed support (iframe)
- Analytics tracking
- Mobile app wrapper (optional)

**Effort**: ~2-3 weeks

#### 5. **User Interface**

Currently no UI for campaign creation.

**Need**:
- Campaign builder wizard
- Template selection
- Theme/color customization
- Asset preview
- Run status monitoring
- Campaign management (list, edit, delete)

**Effort**: ~3-4 weeks

#### 6. **LLM-Powered Planning**

Currently game_config_from_template is rule-based.

**Need**:
- Brief → Campaign plan (LLM)
- Theme extraction
- Copy generation
- Asset requirements analysis
- Smart defaults

**Effort**: ~1-2 weeks

#### 7. **Error Recovery & Retry**

Currently basic retry logic.

**Need**:
- Partial run resume
- Manual step retry from UI
- Provider fallback (if Suno fails, try Udio)
- Cost estimation before execution

**Effort**: ~1 week

### MVP Priority Roadmap

```
Phase 1: Core AI Integration (4 weeks)
├── S3/CDN storage
├── One image provider (Stability AI)
├── One audio provider (Suno)
└── One video provider (Runway)

Phase 2: Game Templates (3 weeks)
├── Spin wheel (fully functional)
├── Scratch card
└── Template config system

Phase 3: User Interface (4 weeks)
├── Campaign builder wizard
├── Preview player
├── Run monitoring dashboard
└── Campaign management

Phase 4: Intelligence (2 weeks)
├── LLM-powered planning
├── Smart theme extraction
└── Copy generation
```

### Technical Debt to Address

1. **Provider Registry Pattern**: Need consistent interface for all AI providers
2. **Rate Limiting**: Per-provider rate limits and queuing
3. **Cost Tracking**: Track API costs per run
4. **Webhook Support**: Notify external systems on completion
5. **API Versioning**: v1/v2 API structure
6. **E2E Testing**: Full workflow integration tests

---

## Quick Reference

### Start Development

```bash
# Infrastructure
docker compose up -d

# Services (pick one)
pnpm -r --parallel dev           # All services
pnpm --filter api-center dev     # API only
pnpm --filter agent-platform dev # Worker only
```

### Trigger a Workflow

```bash
curl -X POST http://localhost:3001/api/dev/runs \
  -H "Content-Type: application/json" \
  -d @/tmp/workflow-payload.json
```

### Check Run Status

```bash
curl http://localhost:3001/api/dev/runs/{runId}
```

### Key Files

| Purpose | Location |
|---------|----------|
| Workflow definitions | `agent-platform/src/run-engine/workflow-definitions/*.workflow.ts` |
| Skill catalog | `skills/catalog/index.yaml` |
| Skill handlers | `agent-platform/src/skills/handlers/` |
| Run engine | `agent-platform/src/run-engine/` |
| Entities | `dao/src/entities/` |
| API routes | `api-center/src/run-engine/` |
