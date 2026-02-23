# Run Engine and Workflows

## Overview

The Run Engine is the heart of the agent platform. It takes a TypeScript workflow definition, builds a LangGraph state machine, and executes each step — handling dependency ordering, input resolution, caching, retries, and artifact tracking.

**Location**: `agent-platform/src/run-engine/`

## How a Workflow Executes

```
TypeScript Workflow Definitions
       ↓
WorkflowRegistryService       ← Registers WorkflowSpec objects at startup, validates dependencies
       ↓
WorkflowSpec (TypeScript)     ← Pre-built workflow with native input selector functions
       ↓
DependencyGraphService        ← Topological sort, cycle detection
       ↓
LangGraphWorkflowBuilderService  ← Builds StateGraph with parallel branches
       ↓
LangGraph StateGraph          ← Executable graph with nodes and edges
       ↓
CachedStepExecutorService     ← Runs each node: cache check → skill execution → cache store
       ↓
RunEngineService              ← Persists Run and RunStep status to database
```

## Workflow TypeScript Format

Workflows are defined as `WorkflowSpec` objects in `agent-platform/src/run-engine/workflow-definitions/`. Here's the anatomy of a workflow:

```typescript
import type { WorkflowSpec } from '../interfaces/workflow-spec.interface';
import { inputSelector, fromTrigger, fromStep, fromBaseRun, constant, merge } from './input-helpers';

export const campaignBuildWorkflow: WorkflowSpec = {
  workflowName: 'campaign.build',
  version: '1.0.0',
  description: 'End-to-end campaign build',
  steps: [
    {
      stepId: 'plan',
      skillId: 'campaign_plan_from_brief',
      dependsOn: [],
      description: 'Generate campaign plan',
      inputSelector: inputSelector({
        brief: fromTrigger('brief'),
        constraints: fromTrigger('constraints'),
      }),
      cachePolicy: { enabled: true, scope: 'run_only' },
      retryPolicy: { maxAttempts: 2, backoffMs: 1000 },
    },
    {
      stepId: 'intro_image',
      skillId: 'generate_intro_image',
      dependsOn: ['plan'],
      description: 'Generate intro image from plan',
      inputSelector: inputSelector({
        prompt: fromStep('plan', 'data.video_prompts[0].prompt'),
      }),
      cachePolicy: { enabled: true, scope: 'run_only' },
      retryPolicy: { maxAttempts: 2, backoffMs: 2000 },
    },
    {
      stepId: 'sfx',
      skillId: 'generate_sfx_pack',
      dependsOn: ['plan'],
      description: 'Generate sound effects pack',
      inputSelector: inputSelector({
        sfx_list: fromStep('plan', 'data.audio_specs.sfx_list'),
      }),
      cachePolicy: { enabled: true, scope: 'run_only' },
      retryPolicy: { maxAttempts: 2, backoffMs: 2000 },
    },
    {
      stepId: 'audio_mix',
      skillId: 'mix_audio_for_game',
      dependsOn: ['bgm', 'sfx'],
      description: 'Mix and normalize audio tracks',
      inputSelector: inputSelector({
        bgm_uri: fromStep('bgm', 'data.audio_uri'),
        loudness_targets: constant({ bgm_lufs: -14, sfx_lufs: -12 }),
      }),
      cachePolicy: { enabled: true, scope: 'run_only' },
      retryPolicy: { maxAttempts: 2, backoffMs: 1000 },
    },
  ],
};
```

### Input Selector Helpers

The `inputSelector` function and its helpers define how to resolve each input parameter for a step. Input selectors are plain TypeScript functions composed from helper functions in `input-helpers.ts`:

| Helper | Description | Example |
|--------|-------------|---------|
| `fromTrigger(path)` | From the original workflow trigger payload | `fromTrigger('brief')` |
| `fromStep(stepId, path)` | From a completed step's output data | `fromStep('plan', 'data.video_prompts[0].prompt')` |
| `fromBaseRun(stepId, path)` | From a previous run's step output (for update workflows) | `fromBaseRun('plan', 'data.audio_style')` |
| `constant(value)` | Literal values defined inline | `constant({ bgm_lufs: -14 })` |
| `merge(...resolvers)` | Merge multiple resolved objects into one | `merge(fromBaseRun('plan', 'data.mood'), fromTrigger('overrides.mood'))` |
| `inputSelector(fields)` | Compose field resolvers into a step-level input resolver | `inputSelector({ brief: fromTrigger('brief') })` |

The `path` argument supports dot notation and array indexing (e.g., `data.video_prompts[0].prompt`). Each helper returns a `FieldResolver` function `(ctx: RunContext) => unknown` that is called at runtime with the current execution context.

### Cache Policy

```typescript
cachePolicy: { enabled: true, scope: 'run_only' }
```

- **enabled: true**: The step's inputs are hashed, and if a matching cache entry exists, the cached result is returned without re-executing the skill.
- **scope: global**: Cache entries can be reused across different runs. If another run executes the same step with the same inputs, it gets the cached result.
- **scope: run_only**: Cache entries are only valid within the current run.

### Retry Policy

```typescript
retryPolicy: { maxAttempts: 2, backoffMs: 1000 }
```

## Available Workflows

All workflows are exported from the `ALL_WORKFLOWS` array in `agent-platform/src/run-engine/workflow-definitions/all-workflows.ts`:

| Workflow | File | Purpose |
|----------|------|---------|
| `campaign.build` | `campaign-build.workflow.ts` | Full end-to-end campaign generation (18 steps) |
| `campaign.build.minimal` | `campaign-build-minimal.workflow.ts` | Minimal build for testing |
| `campaign.update_intro` | `campaign-update-intro.workflow.ts` | Regenerate intro video/image only |
| `campaign.update_outcome` | `campaign-update-outcome.workflow.ts` | Regenerate win/lose outcome videos |
| `campaign.update_audio` | `campaign-update-audio.workflow.ts` | Regenerate BGM and SFX |
| `campaign.update_game_config` | `campaign-update-game-config.workflow.ts` | Regenerate game configuration |
| `campaign.replace_3d_asset` | `campaign-replace-3d-asset.workflow.ts` | Replace 3D assets |

## The campaign.build Workflow (Full Pipeline)

This is the main workflow with 18 steps. Here's the dependency graph showing which steps can run in parallel:

```
                    ┌───────────────┐
                    │   TRIGGER     │
                    │  (brief,      │
                    │   constraints)│
                    └──┬───┬───┬───┘
                       │   │   │
          ┌────────────┘   │   └────────────┐
          ▼                ▼                 ▼
    ┌──────────┐    ┌────────────┐    ┌──────────────┐
    │   plan   │    │ intel_plan │    │intel_theme_  │
    │          │    │            │    │brief         │
    └──┬───────┘    └────────────┘    └──────────────┘
       │
       ├──────────────────────────────────────────────┐
       │                    │              │           │
       ▼                    ▼              ▼           ▼
 ┌───────────┐      ┌────────────┐  ┌──────────┐  ┌──────────┐
 │intro_image│      │ intel_copy │  │   bgm    │  │   sfx    │
 └──┬──┬──┬──┘      └────────────┘  └────┬─────┘  └────┬─────┘
    │  │  │                               │             │
    │  │  └──────────┐                    └──────┬──────┘
    │  │             │                           ▼
    ▼  ▼             ▼                    ┌────────────┐
┌──────┐ ┌────────┐ ┌───────────────┐    │ audio_mix  │
│intro_│ │intro_  │ │intel_theme_   │    └──────┬─────┘
│video │ │button_ │ │image          │           │
└──────┘ │segmen- │ └───────────────┘           │
         │tation  │                              │
         └────────┘                              │
                                                 │
       ├────────────────────┐                    │
       ▼                    ▼                    │
 ┌────────────┐      ┌─────────────┐            │
 │outcome_win │      │outcome_lose │            │
 └────────────┘      └─────────────┘            │
                                                 │
       ├─────────┐                               │
       ▼         ▼                               ▼
 ┌───────────┐  ┌──────────┐             ┌────────────┐
 │game_config│  │          │             │            │
 └─────┬─────┘  │          │             │            │
       │        │          │             │            │
       └────────┼──────────┘             │            │
                ▼                        ▼            │
          ┌──────────┐                                │
          │bundle_   │◄───────────────────────────────┘
          │game      │
          └────┬─────┘
               │
    ┌──────────┼──────────┐
    ▼                     ▼
┌──────────┐       ┌──────────┐
│qa_bundle │       │ manifest │ ← Depends on 9 steps
└──────────┘       └────┬─────┘
                        ▼
                 ┌──────────────┐
                 │review_smoke  │
                 └──────────────┘
```

**Parallelism**: Steps with no dependencies on each other run concurrently. For example, `plan`, `intel_plan`, and `intel_theme_brief` all start simultaneously. After `plan` completes, `intro_image`, `intel_copy`, `bgm`, `sfx`, `game_config`, `outcome_win`, and `outcome_lose` all start in parallel.

## Key Services

### WorkflowRegistryService

**File**: `agent-platform/src/run-engine/services/workflow-registry.service.ts`

In-memory registry of workflow definitions. On startup (`onModuleInit`), it imports the `ALL_WORKFLOWS` array from `workflow-definitions/all-workflows.ts` and registers each `WorkflowSpec` directly. During registration, it validates that each workflow has no cyclic dependencies via `DependencyGraphService.validateNoCycles()`.

### DependencyGraphService

**File**: `agent-platform/src/run-engine/services/dependency-graph.service.ts`

Takes the `depends_on` declarations from the workflow steps and produces a topological ordering. This determines which steps can run in parallel and which must wait. Also performs cycle detection — if step A depends on step B which depends on step A, the workflow is rejected.

### LangGraphWorkflowBuilderService

**File**: `agent-platform/src/run-engine/services/langgraph-workflow-builder.service.ts`

Converts a `WorkflowSpec` into a LangGraph `StateGraph`. Each step becomes a node, edges connect dependencies, and the state annotation tracks step outputs and artifacts. The result is an executable graph that LangGraph can run with built-in support for parallel branches. Cycle detection is handled at registration time by `WorkflowRegistryService`, so the builder does not repeat it.

### CachedStepExecutorService

**File**: `agent-platform/src/run-engine/services/cached-step-executor.service.ts`

The workhorse that runs each step. For every step it:

1. **Resolves inputs** by calling the compiled input selector with the current run context
2. **Computes input hash** via `InputHasherService` (SHA256 of the serialized inputs)
3. **Checks cache** via `StepCacheService` — if hit, returns cached artifacts immediately
4. **Executes the skill** via `SkillRunnerService` if cache miss
5. **Stores the result** — creates Artifact records and a StepCache entry
6. **Updates RunStep** status, timing, and artifact references in the database
7. **Handles retries** according to the retry policy

### RunEngineService

**File**: `agent-platform/src/run-engine/services/run-engine.service.ts`

Manages the database records for Runs and RunSteps. Creates the initial records when a run starts, updates status as steps execute, and marks the run as completed or failed.

### StepCacheService

**File**: `agent-platform/src/run-engine/services/step-cache.service.ts`

Database-backed cache using the `step_cache` table. The cache key is computed from `workflowName + stepId + inputHash`. On a hit, it returns the cached artifact IDs and optional data without re-executing the skill.

### InputHasherService

**File**: `agent-platform/src/run-engine/services/input-hasher.service.ts`

Computes a deterministic SHA256 hash of the resolved step inputs. The hash is used as the cache key. Inputs are sorted and serialized to ensure the same logical inputs always produce the same hash.

### LangGraphRunProcessor

**File**: `agent-platform/src/run-engine/processors/langgraph-run.processor.ts`

BullMQ processor that listens on the `RUN_ORCHESTRATION` queue. When a job arrives, it:

1. Retrieves the workflow from the registry
2. Creates Run and RunStep records
3. Builds the LangGraph state graph
4. Invokes the graph with the trigger payload
5. Updates the Run status based on the outcome

## Workflow Orchestration (Separate System)

**Location**: `agent-platform/src/workflow-orchestration/`

This is a separate, parallel execution system from the Run Engine. It uses LangGraph with PostgreSQL checkpointing for stateful, resumable workflows.

**Key differences from Run Engine**:
- Uses the `WORKFLOW_ORCHESTRATION` queue (not `RUN_ORCHESTRATION`)
- Stores workflow state in PostgreSQL checkpoint tables
- Can resume workflows from any checkpoint after a crash
- Used for chat workflows and other conversational patterns
- Does NOT use the TypeScript workflow definitions or skill catalog

**Key services**:
- `WorkflowEngineService` — Executes LangGraph workflows with checkpointing
- `WorkflowQueueService` — Queue management
- `WorkflowErrorHandlerService` — Error categorization and handling
- `WorkflowTimeoutService` — Timeout enforcement
- `DataSanitizationService` — PII/sensitive data redaction
