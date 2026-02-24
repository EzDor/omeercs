# Campaign Workflows

## Overview

Campaign workflows are the heart of the agent platform. Each workflow is a TypeScript class that directly constructs a LangGraph `StateGraph`, defining nodes (skill executions) and edges (dependencies). The `CampaignRunProcessor` maps workflow names to workflow classes and uses `WorkflowEngineService` to compile and execute them.

**Location**: `agent-platform/src/workflows/campaign/`

## How a Workflow Executes

```
TypeScript Workflow Classes
       |
CampaignRunProcessor          <-- Maps workflow names to injectable workflow classes
       |
Workflow.createGraph()        <-- Each workflow builds a LangGraph StateGraph directly
       |
SkillNodeService              <-- Wraps skill execution with retry logic as graph node functions
       |
LangGraph StateGraph          <-- Executable graph with nodes, edges, and conditional routing
       |
WorkflowEngineService         <-- Compiles and executes the graph with PostgreSQL checkpointing
```

## Workflow TypeScript Classes

Workflows are defined as injectable NestJS classes in `agent-platform/src/workflows/campaign/`. Each class has a `createGraph()` method that builds a LangGraph `StateGraph` with nodes and edges defined inline.

```typescript
import { Injectable } from '@nestjs/common';
import { StateGraph } from '@langchain/langgraph';
import { SkillNodeService } from './services/skill-node.service';
import { CampaignWorkflowState, CampaignWorkflowStateType } from './interfaces/campaign-workflow-state.interface';

@Injectable()
export class CampaignBuildMinimalWorkflow {
  constructor(private readonly skillNode: SkillNodeService) {}

  createGraph(): StateGraph<CampaignWorkflowStateType> {
    const graph = new StateGraph(CampaignWorkflowState)
      .addNode(
        'game_config',
        this.skillNode.createNode('game_config', 'game_config_from_template', (s) => ({
          template_id: s.triggerPayload.template_id,
          theme: s.triggerPayload.theme,
          difficulty: s.triggerPayload.difficulty,
        })),
      )
      .addNode(
        'bgm',
        this.skillNode.createNode(
          'bgm',
          'generate_bgm_track',
          (s) => ({
            style: (s.triggerPayload.audio as Record<string, any>)?.style,
            duration_sec: (s.triggerPayload.audio as Record<string, any>)?.duration_sec,
            loopable: true,
          }),
          { maxAttempts: 2, backoffMs: 2000 },
        ),
      )
      .addNode(
        'bundle_game',
        this.skillNode.createNode('bundle_game', 'bundle_game_template', (s) => ({
          game_config: s.stepResults['game_config']?.data,
          audio_uri: s.stepResults['bgm']?.data?.audio_uri,
          template_id: s.triggerPayload.template_id,
        })),
      )
      .addNode(
        'manifest',
        this.skillNode.createNode('manifest', 'assemble_campaign_manifest', (s) => ({
          campaign_id: s.triggerPayload.campaign_id,
          game_bundle_uri: s.stepResults['bundle_game']?.data?.bundle_uri,
        })),
      );

    graph
      .addEdge('__start__', 'game_config')
      .addEdge('__start__', 'bgm')
      .addConditionalEdges('game_config', (s) => s.error ? '__end__' : 'continue', { continue: 'bundle_game', __end__: '__end__' })
      .addConditionalEdges('bgm', (s) => s.error ? '__end__' : 'continue', { continue: 'bundle_game', __end__: '__end__' })
      .addConditionalEdges('bundle_game', (s) => s.error ? '__end__' : 'continue', { continue: 'manifest', __end__: '__end__' })
      .addEdge('manifest', '__end__');

    return graph;
  }
}
```

### Input Resolution

Inputs are resolved inline via lambda functions that receive the current workflow state. Each node's input function reads from `state.triggerPayload` (original trigger data) or `state.stepResults` (outputs of completed steps).

### Retry Policy

Each node can specify a retry configuration:

```typescript
this.skillNode.createNode('intro_image', 'generate_intro_image', inputFn, { maxAttempts: 2, backoffMs: 2000 })
```

`SkillNodeService` handles exponential backoff retries internally.

### Conditional Edges (Error Propagation)

Workflows use LangGraph conditional edges to short-circuit on errors. If any step sets `state.error`, downstream conditional edges route to `__end__` instead of continuing.

## Available Workflows

All workflows are registered in `CampaignRunProcessor` via a `Map<workflowName, WorkflowClass>`. Workflow name constants are defined in `agent-platform/src/workflows/campaign/campaign-workflow.constants.ts`:

| Workflow | Class | Purpose |
|----------|-------|---------|
| `campaign.build` | `CampaignBuildWorkflow` | Full end-to-end campaign generation (18 steps) |
| `campaign.build.minimal` | `CampaignBuildMinimalWorkflow` | Minimal build for testing (4 steps) |
| `campaign.update_intro` | `CampaignUpdateIntroWorkflow` | Regenerate intro video/image only |
| `campaign.update_outcome` | `CampaignUpdateOutcomeWorkflow` | Regenerate win/lose outcome videos |
| `campaign.update_audio` | `CampaignUpdateAudioWorkflow` | Regenerate BGM and SFX |
| `campaign.update_game_config` | `CampaignUpdateGameConfigWorkflow` | Regenerate game configuration |
| `campaign.replace_3d_asset` | `CampaignReplace3dAssetWorkflow` | Replace 3D assets |

## The campaign.build Workflow (Full Pipeline)

This is the main workflow with 18 steps. Here's the dependency graph showing which steps can run in parallel:

```
                    +---------------+
                    |   TRIGGER     |
                    |  (brief,      |
                    |   constraints)|
                    +--+---+---+---+
                       |   |   |
          +------------+   |   +------------+
          v                v                 v
    +----------+    +------------+    +--------------+
    |   plan   |    | intel_plan |    |intel_theme_  |
    |          |    |            |    |brief         |
    +--+-------+    +------------+    +--------------+
       |
       +----------------------------------------------+
       |                    |              |           |
       v                    v              v           v
 +-----------+      +------------+  +----------+  +----------+
 |intro_image|      | intel_copy |  |   bgm    |  |   sfx    |
 +--+--+--+--+      +------------+  +----+-----+  +----+-----+
    |  |  |                               |             |
    |  |  +----------+                    +------+------+
    |  |             |                           v
    v  v             v                    +------------+
+------+ +--------+ +---------------+    | audio_mix  |
|intro_| |intro_  | |intel_theme_   |    +------+-----+
|video | |button_ | |image          |           |
+------+ |segmen- | +---------------+           |
         |tation  |                              |
         +--------+                              |
                                                 |
       +--------------------+                    |
       v                    v                    |
 +------------+      +-------------+            |
 |outcome_win |      |outcome_lose |            |
 +------------+      +-------------+            |
                                                 |
       +---------+                               |
       v         v                               v
 +-----------+  +----------+             +------------+
 |game_config|  |          |             |            |
 +-----+-----+  |          |             |            |
       |        |          |             |            |
       +--------+----------+             |            |
                v                        v            |
          +----------+                                |
          |bundle_   |<-------------------------------+
          |game      |
          +----+-----+
               |
    +----------+----------+
    v                     v
+----------+       +----------+
|qa_bundle |       | manifest | <-- Depends on 9 steps
+----------+       +----+-----+
                        v
                 +--------------+
                 |review_smoke  |
                 +--------------+
```

**Parallelism**: Steps with no dependencies on each other run concurrently. For example, `plan`, `intel_plan`, and `intel_theme_brief` all start simultaneously. After `plan` completes, `intro_image`, `intel_copy`, `bgm`, `sfx`, `game_config`, `outcome_win`, and `outcome_lose` all start in parallel.

## Key Services

### CampaignRunProcessor

**File**: `agent-platform/src/workflows/campaign/processors/campaign-run.processor.ts`

BullMQ processor that listens on the `RUN_ORCHESTRATION` queue. When a job arrives, it:

1. Fetches the Run entity from the database
2. Looks up the workflow class from the `workflowMap` by `run.workflowName`
3. Calls `workflow.createGraph()` to build the LangGraph StateGraph
4. Loads base run outputs (for update workflows) from the checkpoint store
5. Executes the graph via `WorkflowEngineService` with PostgreSQL checkpointing
6. Updates the Run status and Campaign status based on the outcome

### SkillNodeService

**File**: `agent-platform/src/workflows/campaign/services/skill-node.service.ts`

Creates LangGraph node functions that wrap skill execution with retry logic. Each node function:

1. **Resolves inputs** by calling the provided input function with the current state
2. **Executes the skill** via `SkillRunnerService` with exponential backoff retries
3. **Returns a state update** with the step result (success or failure) merged into `stepResults`
4. **Propagates errors** by setting `state.error` on failure, which triggers conditional edges to short-circuit the workflow

### CampaignWorkflowState

**File**: `agent-platform/src/workflows/campaign/interfaces/campaign-workflow-state.interface.ts`

Defines the LangGraph state annotation shared by all campaign workflows:

```typescript
export const CampaignWorkflowState = Annotation.Root({
  runId: Annotation<string>({ ... }),
  tenantId: Annotation<string>({ ... }),
  triggerPayload: Annotation<Record<string, unknown>>({ ... }),
  stepResults: Annotation<Record<string, SkillStepResult>>({
    reducer: mergeStepResults,    // Merges results from parallel branches
    default: () => ({}),
  }),
  baseRunOutputs: Annotation<Record<string, Record<string, unknown>>>({ ... }),
  error: Annotation<string | null>({ ... }),
});
```

The `stepResults` field uses a merge reducer so that parallel nodes can each contribute their results independently.

### WorkflowEngineService

**File**: `agent-platform/src/workflow-orchestration/services/workflow-engine.service.ts`

Compiles and executes LangGraph workflows with PostgreSQL checkpointing. Supports workflow pause/resume from checkpoints. Used by both campaign workflows and chat workflows.
