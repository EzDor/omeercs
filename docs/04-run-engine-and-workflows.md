# Run Engine and Workflows

## Overview

The Run Engine is the heart of the agent platform. It takes a YAML workflow definition, compiles it into a LangGraph state machine, and executes each step — handling dependency ordering, input resolution, caching, retries, and artifact tracking.

**Location**: `agent-platform/src/run-engine/`

## How a Workflow Executes

```
YAML Workflow File
       ↓
WorkflowYamlLoaderService     ← Parses YAML, compiles input selectors
       ↓
WorkflowSpec (TypeScript)     ← In-memory compiled workflow
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

## Workflow YAML Format

Workflows are defined in `agent-platform/workflows/` as YAML files. Here's the anatomy of a workflow:

```yaml
workflow_name: campaign.build          # Unique identifier
version: "1.0.0"                       # Semantic version
description: End-to-end campaign build # Human-readable description

steps:
  - step_id: plan                      # Unique step identifier within this workflow
    skill_id: campaign_plan_from_brief # Which skill to execute (from skill catalog)
    depends_on: []                     # No dependencies = runs immediately
    description: Generate campaign plan
    input_selector:                    # How to resolve this step's inputs
      brief:
        source: trigger                # From the workflow trigger payload
        path: brief
      constraints:
        source: trigger
        path: constraints
    cache_policy:
      enabled: true                    # Enable input-based caching
      scope: run_only                  # Cache is valid only within this run
    retry_policy:
      max_attempts: 2                  # Retry once on failure
      backoff_ms: 1000                 # Wait 1 second before retrying

  - step_id: intro_image
    skill_id: generate_intro_image
    depends_on: [plan]                 # Waits for 'plan' step to complete
    input_selector:
      prompt:
        source: step_output            # From a previous step's output
        step_id: plan
        path: data.video_prompts[0].prompt
    # ...

  - step_id: sfx
    skill_id: generate_sfx_pack
    depends_on: [plan]
    input_selector:
      sfx_list:
        source: step_output
        step_id: plan
        path: data.audio_specs.sfx_list
    # ...

  - step_id: audio_mix
    skill_id: mix_audio_for_game
    depends_on: [bgm, sfx]            # Waits for BOTH bgm AND sfx to complete
    input_selector:
      bgm_uri:
        source: step_output
        step_id: bgm
        path: data.audio_uri
      loudness_targets:
        source: constants              # Literal values, not from trigger or steps
        value:
          bgm_lufs: -14
          sfx_lufs: -12
    # ...
```

### Input Selector DSL

The `input_selector` is a declarative DSL that tells the engine how to resolve each input parameter for a step. There are three source types:

| Source | Description | Example |
|--------|-------------|---------|
| `trigger` | From the original workflow trigger payload (what the API sent) | `{ source: trigger, path: brief }` |
| `step_output` | From a completed step's output data | `{ source: step_output, step_id: plan, path: data.video_prompts[0].prompt }` |
| `constants` | Literal values defined inline in the YAML | `{ source: constants, value: 30 }` |

The `path` field supports dot notation and array indexing (e.g., `data.video_prompts[0].prompt`).

**Compilation**: At workflow registration time, `InputSelectorInterpreterService` compiles each input selector from YAML into a TypeScript function. This function is called at runtime with the current execution context and returns the resolved value.

### Cache Policy

```yaml
cache_policy:
  enabled: true       # Whether caching is enabled for this step
  scope: run_only     # 'global' or 'run_only'
```

- **enabled: true**: The step's inputs are hashed, and if a matching cache entry exists, the cached result is returned without re-executing the skill.
- **scope: global**: Cache entries can be reused across different runs. If another run executes the same step with the same inputs, it gets the cached result.
- **scope: run_only**: Cache entries are only valid within the current run.

### Retry Policy

```yaml
retry_policy:
  max_attempts: 2     # Total attempts (1 = no retry, 2 = one retry)
  backoff_ms: 1000    # Wait time between attempts
```

## Available Workflows

All workflows are registered in `agent-platform/workflows/index.yaml`:

| Workflow | File | Purpose |
|----------|------|---------|
| `campaign.build` | `campaign.build.v1.yaml` | Full end-to-end campaign generation (18 steps) |
| `campaign.build.minimal` | `campaign.build.minimal.v1.yaml` | Minimal build for testing |
| `campaign.update_intro` | `campaign.update_intro.v1.yaml` | Regenerate intro video/image only |
| `campaign.update_outcome` | `campaign.update_outcome.v1.yaml` | Regenerate win/lose outcome videos |
| `campaign.update_audio` | `campaign.update_audio.v1.yaml` | Regenerate BGM and SFX |
| `campaign.update_game_config` | `campaign.update_game_config.v1.yaml` | Regenerate game configuration |
| `campaign.replace_3d_asset` | `campaign.replace_3d_asset.v1.yaml` | Replace 3D assets |

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

### WorkflowYamlLoaderService

**File**: `agent-platform/src/run-engine/services/workflow-yaml-loader.service.ts`

Loads YAML workflow files from disk, validates their structure, and compiles them into `WorkflowSpec` objects. The compilation step converts the declarative input selectors into executable TypeScript functions.

Called once at startup to register all workflows, and can be called again to reload.

### DependencyGraphService

**File**: `agent-platform/src/run-engine/services/dependency-graph.service.ts`

Takes the `depends_on` declarations from the workflow steps and produces a topological ordering. This determines which steps can run in parallel and which must wait. Also performs cycle detection — if step A depends on step B which depends on step A, the workflow is rejected.

### LangGraphWorkflowBuilderService

**File**: `agent-platform/src/run-engine/services/langgraph-workflow-builder.service.ts`

Converts a `WorkflowSpec` into a LangGraph `StateGraph`. Each step becomes a node, edges connect dependencies, and the state annotation tracks step outputs and artifacts. The result is an executable graph that LangGraph can run with built-in support for parallel branches.

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

### WorkflowRegistryService

**File**: `agent-platform/src/run-engine/services/workflow-registry.service.ts`

In-memory registry of compiled workflows. Workflows are loaded from YAML at startup and stored here for fast lookup when a run is triggered.

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
- Does NOT use the YAML workflow format or skill catalog

**Key services**:
- `WorkflowEngineService` — Executes LangGraph workflows with checkpointing
- `WorkflowQueueService` — Queue management
- `WorkflowErrorHandlerService` — Error categorization and handling
- `WorkflowTimeoutService` — Timeout enforcement
- `DataSanitizationService` — PII/sensitive data redaction
