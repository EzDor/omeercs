# Agents, Skills & Workflows - Visual Architecture

## Table of Contents
1. [High-Level System Flow](#1-high-level-system-flow)
2. [Workflow Loading & Registration](#2-workflow-loading--registration)
3. [Skill Loading & Registration](#3-skill-loading--registration)
4. [Workflow Execution Flow (Run Engine)](#4-workflow-execution-flow-run-engine)
5. [LangGraph DAG Building](#5-langgraph-dag-building)
6. [Step Execution with Caching](#6-step-execution-with-caching)
7. [Skill Execution Detail](#7-skill-execution-detail)
8. [Handler Execution Example](#8-handler-execution-example-image-generation)
9. [Full Campaign Build - Step by Step](#9-full-campaign-build---step-by-step)
10. [Update Workflow - Partial Rebuild](#10-update-workflow---partial-rebuild)
11. [Summary: Component Interactions](#11-summary-component-interactions)

---

## 1. High-Level System Flow

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                    USER REQUEST                                         │
│                         "Build a campaign from this brief"                              │
└─────────────────────────────────────────────────────────────────────────────────────────┘
                                          │
                                          ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                   API CENTER                                            │
│  ┌─────────────────────────────────────────────────────────────────────────────────┐   │
│  │  POST /run-engine/trigger-run                                                    │   │
│  │  {                                                                               │   │
│  │    "workflowName": "campaign.build",                                            │   │
│  │    "triggerPayload": { "brief": {...}, "brand_assets": [...] }                  │   │
│  │  }                                                                               │   │
│  └─────────────────────────────────────────────────────────────────────────────────┘   │
│                                          │                                              │
│                           Creates Run entity (status: queued)                           │
│                           Enqueues to BullMQ                                            │
└──────────────────────────────────────────┬──────────────────────────────────────────────┘
                                           │
                                           ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                              AGENT PLATFORM (Worker)                                    │
│                                                                                         │
│  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐                  │
│  │                  │    │                  │    │                  │                  │
│  │  BullMQ Queue    │───▶│  Run Processor   │───▶│  Workflow Engine │                  │
│  │                  │    │                  │    │  (LangGraph)     │                  │
│  └──────────────────┘    └──────────────────┘    └────────┬─────────┘                  │
│                                                           │                             │
│                                                           ▼                             │
│  ┌─────────────────────────────────────────────────────────────────────────────────┐   │
│  │                           SKILL EXECUTION                                        │   │
│  │                                                                                  │   │
│  │   Step 1      Step 2      Step 3      Step 4      ...      Step N               │   │
│  │   ┌────┐      ┌────┐      ┌────┐      ┌────┐              ┌────┐                │   │
│  │   │Skill│────▶│Skill│────▶│Skill│────▶│Skill│────────────▶│Skill│               │   │
│  │   └────┘      └────┘      └────┘      └────┘              └────┘                │   │
│  │                                                                                  │   │
│  └─────────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                         │
└─────────────────────────────────────────────────────────────────────────────────────────┘
                                           │
                                           ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                    RESULT                                               │
│                    Campaign manifest with all generated assets                          │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Workflow Loading & Registration

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                       TYPESCRIPT WORKFLOW DEFINITIONS                                    │
│              (agent-platform/src/run-engine/workflow-definitions/)                       │
│                                                                                         │
│   ┌────────────────────────────────────────────────────────────────────────────────┐    │
│   │  campaign-build.workflow.ts          → campaignBuildWorkflow                    │    │
│   │  campaign-build-minimal.workflow.ts  → campaignBuildMinimalWorkflow             │    │
│   │  campaign-update-audio.workflow.ts   → campaignUpdateAudioWorkflow              │    │
│   │  campaign-update-intro.workflow.ts   → campaignUpdateIntroWorkflow              │    │
│   │  ...                                                                            │    │
│   │                                                                                 │    │
│   │  all-workflows.ts  → exports ALL_WORKFLOWS: WorkflowSpec[]                     │    │
│   │  input-helpers.ts  → fromTrigger, fromStep, fromBaseRun, constant, merge       │    │
│   └────────────────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────────────────┘
        │
        │  On Application Startup
        ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                        WorkflowRegistryService.onModuleInit()                           │
│                                                                                         │
│   ┌─────────────────────────────────────────────────────────────────────────────────┐  │
│   │  1. Import ALL_WORKFLOWS array                                                   │  │
│   │                                                                                  │  │
│   │     ALL_WORKFLOWS = [                                                            │  │
│   │       campaignBuildWorkflow,                                                     │  │
│   │       campaignBuildMinimalWorkflow,                                               │  │
│   │       campaignUpdateAudioWorkflow,                                                │  │
│   │       ...                                                                        │  │
│   │     ]                                                                            │  │
│   └─────────────────────────────────────────────────────────────────────────────────┘  │
│                                          │                                              │
│                                          ▼                                              │
│   ┌─────────────────────────────────────────────────────────────────────────────────┐  │
│   │  2. For each WorkflowSpec: Validate & Register                                   │  │
│   │                                                                                  │  │
│   │     DependencyGraphService.validateNoCycles(workflow.steps)                      │  │
│   │     Register in Map<workflowName, Map<version, WorkflowSpec>>                   │  │
│   └─────────────────────────────────────────────────────────────────────────────────┘  │
│                                          │                                              │
│                                          ▼                                              │
│   ┌─────────────────────────────────────────────────────────────────────────────────┐  │
│   │  3. Result: In-memory Registry                                                   │  │
│   │                                                                                  │  │
│   │     Map<workflowName, Map<version, WorkflowSpec>>                               │  │
│   │     ┌────────────────────────────────────────────────────────────────────────┐  │  │
│   │     │  "campaign.build" ──▶ { "1.0.0" ──▶ WorkflowSpec }                     │  │  │
│   │     │  "campaign.update_audio" ──▶ { "1.0.0" ──▶ WorkflowSpec }              │  │  │
│   │     │  ...                                                                    │  │  │
│   │     └────────────────────────────────────────────────────────────────────────┘  │  │
│   └─────────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                         │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Skill Loading & Registration

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                              SKILL CATALOG FILES                                        │
│                              (skills/catalog/)                                          │
└─────────────────────────────────────────────────────────────────────────────────────────┘
        │
        │  On Application Startup
        ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                           SkillCatalogService                                           │
│                                                                                         │
│   ┌─────────────────────────────────────────────────────────────────────────────────┐  │
│   │  1. Read index.yaml                                                              │  │
│   │     ┌────────────────────────────────────────────────────────────────────────┐  │  │
│   │     │ skills:                                                                 │  │  │
│   │     │   - skill_id: generate_intro_image                                      │  │  │
│   │     │     version: "1.0.0"                                                    │  │  │
│   │     │     status: active                                                      │  │  │
│   │     │   - skill_id: campaign_plan_from_brief                                  │  │  │
│   │     │     version: "1.0.0"                                                    │  │  │
│   │     │     status: active                                                      │  │  │
│   │     └────────────────────────────────────────────────────────────────────────┘  │  │
│   └─────────────────────────────────────────────────────────────────────────────────┘  │
│                                          │                                              │
│                                          ▼                                              │
│   ┌─────────────────────────────────────────────────────────────────────────────────┐  │
│   │  2. Load each skill descriptor YAML                                              │  │
│   │                                                                                  │  │
│   │     ┌─────────────────────────────────────────────────────────────────────────┐ │  │
│   │     │ skill_id: generate_intro_image                                          │ │  │
│   │     │ version: "1.0.0"                                                        │ │  │
│   │     │ title: "Generate Intro Image"                                           │ │  │
│   │     │ input_schema:                                                           │ │  │
│   │     │   type: object                                                          │ │  │
│   │     │   properties:                                                           │ │  │
│   │     │     prompt: { type: string }                                            │ │  │
│   │     │     style_refs: { ... }                                                 │ │  │
│   │     │ output_schema: { ... }                                                  │ │  │
│   │     │ implementation:                                                         │ │  │
│   │     │   type: ts_function                                                     │ │  │
│   │     │   handler: GenerateIntroImageHandler                                    │ │  │
│   │     └─────────────────────────────────────────────────────────────────────────┘ │  │
│   └─────────────────────────────────────────────────────────────────────────────────┘  │
│                                          │                                              │
│                                          ▼                                              │
│   ┌─────────────────────────────────────────────────────────────────────────────────┐  │
│   │  3. Register Handlers (TypeScript classes)                                       │  │
│   │                                                                                  │  │
│   │     Map<skillId, SkillHandler>                                                  │  │
│   │     ┌────────────────────────────────────────────────────────────────────────┐  │  │
│   │     │  "generate_intro_image" ──▶ GenerateIntroImageHandler                  │  │  │
│   │     │  "campaign_plan_from_brief" ──▶ CampaignPlanFromBriefHandler           │  │  │
│   │     │  "generate_bgm_track" ──▶ GenerateBgmTrackHandler                      │  │  │
│   │     │  ... (16 handlers total)                                               │  │  │
│   │     └────────────────────────────────────────────────────────────────────────┘  │  │
│   └─────────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                         │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Workflow Execution Flow (Run Engine)

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                              RUN ORCHESTRATION                                          │
└─────────────────────────────────────────────────────────────────────────────────────────┘

    ┌─────────────────────────────────────────────────────────────────────────────────┐
    │  BullMQ: RUN_ORCHESTRATION Queue                                                │
    │  ┌───────────────────────────────────────────────────────────────────────────┐  │
    │  │  Job: { runId: "abc-123", tenantId: "org_xxx" }                           │  │
    │  └───────────────────────────────────────────────────────────────────────────┘  │
    └─────────────────────────────────────────────────────────────────────────────────┘
                                          │
                                          ▼
    ┌─────────────────────────────────────────────────────────────────────────────────┐
    │  LangGraphRunProcessor.process()                                                │
    │                                                                                 │
    │  ┌───────────────────────────────────────────────────────────────────────────┐  │
    │  │  1. Fetch Run from database                                               │  │
    │  │     Run { id, workflowName: "campaign.build", status: "queued" }         │  │
    │  └───────────────────────────────────────────────────────────────────────────┘  │
    │                                          │                                      │
    │                                          ▼                                      │
    │  ┌───────────────────────────────────────────────────────────────────────────┐  │
    │  │  2. Get WorkflowSpec from registry                                        │  │
    │  │     WorkflowSpec { name, version, steps: [...] }                         │  │
    │  └───────────────────────────────────────────────────────────────────────────┘  │
    │                                          │                                      │
    │                                          ▼                                      │
    │  ┌───────────────────────────────────────────────────────────────────────────┐  │
    │  │  3. Create RunStep entities (topologically sorted)                        │  │
    │  │                                                                           │  │
    │  │     RunStep { runId, stepId: "plan", skillId, status: "pending" }        │  │
    │  │     RunStep { runId, stepId: "intro_image", skillId, status: "pending" } │  │
    │  │     RunStep { runId, stepId: "bgm", skillId, status: "pending" }         │  │
    │  │     ...                                                                   │  │
    │  └───────────────────────────────────────────────────────────────────────────┘  │
    │                                          │                                      │
    │                                          ▼                                      │
    │  ┌───────────────────────────────────────────────────────────────────────────┐  │
    │  │  4. Build LangGraph DAG                                                   │  │
    │  │     LangGraphWorkflowBuilderService.buildWorkflowGraph()                 │  │
    │  └───────────────────────────────────────────────────────────────────────────┘  │
    │                                          │                                      │
    │                                          ▼                                      │
    │  ┌───────────────────────────────────────────────────────────────────────────┐  │
    │  │  5. Execute via WorkflowEngineService                                     │  │
    │  │     graph.invoke(initialState, { thread_id, tenant_id })                 │  │
    │  └───────────────────────────────────────────────────────────────────────────┘  │
    │                                          │                                      │
    │                                          ▼                                      │
    │  ┌───────────────────────────────────────────────────────────────────────────┐  │
    │  │  6. Update Run status                                                     │  │
    │  │     Run { status: "completed" | "failed" }                               │  │
    │  └───────────────────────────────────────────────────────────────────────────┘  │
    │                                                                                 │
    └─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. LangGraph DAG Building

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                     LangGraphWorkflowBuilderService                                     │
└─────────────────────────────────────────────────────────────────────────────────────────┘

    INPUT: WorkflowSpec (TypeScript)
    ┌─────────────────────────────────────────────────────────────────────────────────┐
    │  steps:                                                                         │
    │    - step_id: plan         depends_on: []                                       │
    │    - step_id: intro_image  depends_on: [plan]                                   │
    │    - step_id: bgm          depends_on: [plan]                                   │
    │    - step_id: sfx          depends_on: [plan]                                   │
    │    - step_id: audio_mix    depends_on: [bgm, sfx]                              │
    │    - step_id: manifest     depends_on: [intro_image, audio_mix]                │
    └─────────────────────────────────────────────────────────────────────────────────┘
                                          │
                                          ▼
    ┌─────────────────────────────────────────────────────────────────────────────────┐
    │  1. Validate Dependencies (no cycles)                                           │
    │     DependencyGraphService.validateNoCycles()                                   │
    └─────────────────────────────────────────────────────────────────────────────────┘
                                          │
                                          ▼
    ┌─────────────────────────────────────────────────────────────────────────────────┐
    │  2. Create StateGraph                                                           │
    │                                                                                 │
    │     const graph = new StateGraph(RunStateAnnotation)                           │
    │       .addNode("plan", cachedExecutor.create("plan"))                          │
    │       .addNode("intro_image", cachedExecutor.create("intro_image"))            │
    │       .addNode("bgm", cachedExecutor.create("bgm"))                            │
    │       .addNode("sfx", cachedExecutor.create("sfx"))                            │
    │       .addNode("audio_mix", cachedExecutor.create("audio_mix"))                │
    │       .addNode("manifest", cachedExecutor.create("manifest"))                  │
    └─────────────────────────────────────────────────────────────────────────────────┘
                                          │
                                          ▼
    ┌─────────────────────────────────────────────────────────────────────────────────┐
    │  3. Add Edges (dependencies)                                                    │
    │                                                                                 │
    │     .addEdge(START, "plan")           // Entry point                           │
    │     .addEdge("plan", "intro_image")   // plan -> intro_image                   │
    │     .addEdge("plan", "bgm")           // plan -> bgm                           │
    │     .addEdge("plan", "sfx")           // plan -> sfx                           │
    │     .addEdge("bgm", "audio_mix")      // bgm -> audio_mix                      │
    │     .addEdge("sfx", "audio_mix")      // sfx -> audio_mix                      │
    │     .addEdge("intro_image", "manifest")                                        │
    │     .addEdge("audio_mix", "manifest")                                          │
    │     .addEdge("manifest", END)         // Terminal                              │
    └─────────────────────────────────────────────────────────────────────────────────┘
                                          │
                                          ▼
    OUTPUT: Compiled StateGraph (executable DAG)

    ┌─────────────────────────────────────────────────────────────────────────────────┐
    │                                                                                 │
    │                              ┌───────┐                                          │
    │                              │ START │                                          │
    │                              └───┬───┘                                          │
    │                                  │                                              │
    │                                  ▼                                              │
    │                              ┌───────┐                                          │
    │                              │ plan  │                                          │
    │                              └───┬───┘                                          │
    │                    ┌─────────────┼─────────────┐                                │
    │                    │             │             │                                │
    │                    ▼             ▼             ▼                                │
    │              ┌───────────┐  ┌───────┐    ┌───────┐                              │
    │              │intro_image│  │  bgm  │    │  sfx  │                              │
    │              └─────┬─────┘  └───┬───┘    └───┬───┘                              │
    │                    │            │            │                                  │
    │                    │            └──────┬─────┘                                  │
    │                    │                   │                                        │
    │                    │                   ▼                                        │
    │                    │            ┌───────────┐                                   │
    │                    │            │ audio_mix │                                   │
    │                    │            └─────┬─────┘                                   │
    │                    │                  │                                         │
    │                    └────────┬─────────┘                                         │
    │                             │                                                   │
    │                             ▼                                                   │
    │                        ┌──────────┐                                             │
    │                        │ manifest │                                             │
    │                        └────┬─────┘                                             │
    │                             │                                                   │
    │                             ▼                                                   │
    │                         ┌───────┐                                               │
    │                         │  END  │                                               │
    │                         └───────┘                                               │
    │                                                                                 │
    └─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Step Execution with Caching

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                        CachedStepExecutorService                                        │
│                        (Node Function for each step)                                    │
└─────────────────────────────────────────────────────────────────────────────────────────┘

    When LangGraph invokes a node (e.g., "intro_image"):

    ┌─────────────────────────────────────────────────────────────────────────────────┐
    │  INPUT: Current RunState                                                        │
    │  {                                                                              │
    │    runId: "abc-123",                                                           │
    │    triggerPayload: { brief: {...}, brand_assets: [...] },                      │
    │    stepResults: { "plan": { ok: true, data: {...}, artifacts: [...] } },       │
    │    artifacts: Map<stepId, artifactIds[]>                                       │
    │  }                                                                              │
    └─────────────────────────────────────────────────────────────────────────────────┘
                                          │
                                          ▼
    ┌─────────────────────────────────────────────────────────────────────────────────┐
    │  1. Evaluate input_selector (build step input)                                  │
    │                                                                                 │
    │     input_selector:                                                            │
    │       style_guide:                                                             │
    │         source: step_output ───────> stepResults["plan"].data.style_guide     │
    │         step_id: plan                                                          │
    │         path: data.style_guide                                                 │
    │       brand_assets:                                                            │
    │         source: trigger ──────────> triggerPayload.brand_assets               │
    │         path: brand_assets                                                     │
    │                                                                                 │
    │     RESULT: { style_guide: {...}, brand_assets: [...] }                        │
    └─────────────────────────────────────────────────────────────────────────────────┘
                                          │
                                          ▼
    ┌─────────────────────────────────────────────────────────────────────────────────┐
    │  2. Compute input hash (for caching)                                            │
    │                                                                                 │
    │     inputHash = SHA256(JSON.stringify(sortedInput))                            │
    │     cacheKey = "campaign.build:intro_image:a1b2c3d4..."                        │
    └─────────────────────────────────────────────────────────────────────────────────┘
                                          │
                                          ▼
    ┌─────────────────────────────────────────────────────────────────────────────────┐
    │  3. Check cache                                                                 │
    │                                                                                 │
    │     StepCacheService.get(cacheKey)                                             │
    │                                                                                 │
    │     ┌─────────────────────────────┐     ┌─────────────────────────────┐        │
    │     │      CACHE HIT              │     │      CACHE MISS             │        │
    │     │                             │     │                             │        │
    │     │  Return cached artifactIds  │     │  Continue to execution      │        │
    │     │  Update RunStep: cacheHit   │     │                             │        │
    │     │  Skip skill execution       │     │                             │        │
    │     └─────────────────────────────┘     └─────────────────────────────┘        │
    └─────────────────────────────────────────────────────────────────────────────────┘
                                          │
                                          │ (Cache Miss)
                                          ▼
    ┌─────────────────────────────────────────────────────────────────────────────────┐
    │  4. Execute Skill                                                               │
    │                                                                                 │
    │     SkillRunnerService.execute("generate_intro_image", input)                  │
    │                                                                                 │
    │     ┌─────────────────────────────────────────────────────────────────────┐    │
    │     │  -> Validate input schema                                           │    │
    │     │  -> Get handler: GenerateIntroImageHandler                          │    │
    │     │  -> Execute with timeout                                            │    │
    │     │  -> Validate output schema                                          │    │
    │     │  -> Return SkillResult                                              │    │
    │     └─────────────────────────────────────────────────────────────────────┘    │
    └─────────────────────────────────────────────────────────────────────────────────┘
                                          │
                                          ▼
    ┌─────────────────────────────────────────────────────────────────────────────────┐
    │  5. Update State & Cache                                                        │
    │                                                                                 │
    │     - Update RunStep (status: completed, outputArtifactIds, durationMs)        │
    │     - Store in cache: StepCacheService.set(cacheKey, artifactIds)              │
    │     - Return updated state with new stepResults entry                          │
    └─────────────────────────────────────────────────────────────────────────────────┘
                                          │
                                          ▼
    ┌─────────────────────────────────────────────────────────────────────────────────┐
    │  OUTPUT: Updated RunState                                                       │
    │  {                                                                              │
    │    stepResults: {                                                              │
    │      "plan": {...},                                                            │
    │      "intro_image": { ok: true, data: {...}, artifacts: [...] }  <- NEW       │
    │    },                                                                          │
    │    artifacts: Map { "intro_image" -> ["artifact-uuid-1"] }        <- NEW       │
    │  }                                                                              │
    └─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 7. Skill Execution Detail

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                              SkillRunnerService.execute()                               │
└─────────────────────────────────────────────────────────────────────────────────────────┘

    INPUT: skillId = "generate_intro_image", input = { prompt, style_refs, ... }

    ┌─────────────────────────────────────────────────────────────────────────────────┐
    │  1. Resolve Skill Descriptor                                                    │
    │                                                                                 │
    │     SkillCatalogService.getSkill("generate_intro_image")                       │
    │     -> SkillDescriptor { skill_id, version, input_schema, output_schema, ... } │
    └─────────────────────────────────────────────────────────────────────────────────┘
                                          │
                                          ▼
    ┌─────────────────────────────────────────────────────────────────────────────────┐
    │  2. Check Template Type                                                         │
    │                                                                                 │
    │     ┌─────────────────────────────┐     ┌─────────────────────────────┐        │
    │     │  template_type: defined     │     │  template_type: undefined   │        │
    │     │                             │     │                             │        │
    │     │  -> LLM-based execution     │     │  -> Handler-based execution │        │
    │     │  (LlmGenerationService)     │     │  (Custom TypeScript)        │        │
    │     └─────────────────────────────┘     └─────────────────────────────┘        │
    └─────────────────────────────────────────────────────────────────────────────────┘
                                          │
                      ┌───────────────────┴───────────────────┐
                      │                                       │
                      ▼                                       ▼
    ┌─────────────────────────────────────┐  ┌─────────────────────────────────────┐
    │  LLM_JSON_GENERATION Path           │  │  Handler Path                       │
    │                                     │  │                                     │
    │  ┌───────────────────────────────┐  │  │  ┌───────────────────────────────┐  │
    │  │ 1. Get prompt template        │  │  │  │ 1. Get handler instance       │  │
    │  │    from PromptRegistry        │  │  │  │    from SkillCatalog          │  │
    │  └───────────────────────────────┘  │  │  └───────────────────────────────┘  │
    │               │                     │  │               │                     │
    │               ▼                     │  │               ▼                     │
    │  ┌───────────────────────────────┐  │  │  ┌───────────────────────────────┐  │
    │  │ 2. Render prompt with input   │  │  │  │ 2. Create workspace directory │  │
    │  │    variables                  │  │  │  │    /tmp/skills/run-id/        │  │
    │  └───────────────────────────────┘  │  │  └───────────────────────────────┘  │
    │               │                     │  │               │                     │
    │               ▼                     │  │               ▼                     │
    │  ┌───────────────────────────────┐  │  │  ┌───────────────────────────────┐  │
    │  │ 3. Call LLM via LiteLLM       │  │  │  │ 3. Validate input schema      │  │
    │  │    (structured output)        │  │  │  │    (Ajv)                      │  │
    │  └───────────────────────────────┘  │  │  └───────────────────────────────┘  │
    │               │                     │  │               │                     │
    │               ▼                     │  │               ▼                     │
    │  ┌───────────────────────────────┐  │  │  ┌───────────────────────────────┐  │
    │  │ 4. Validate output against    │  │  │  │ 4. Execute handler with       │  │
    │  │    output_schema              │  │  │  │    timeout (AbortController)  │  │
    │  └───────────────────────────────┘  │  │  └───────────────────────────────┘  │
    │               │                     │  │               │                     │
    │               ▼                     │  │               ▼                     │
    │  ┌───────────────────────────────┐  │  │  ┌───────────────────────────────┐  │
    │  │ 5. Return SkillResult         │  │  │  │ 5. Validate output schema     │  │
    │  └───────────────────────────────┘  │  │  └───────────────────────────────┘  │
    │                                     │  │               │                     │
    │                                     │  │               ▼                     │
    │                                     │  │  ┌───────────────────────────────┐  │
    │                                     │  │  │ 6. Cleanup workspace          │  │
    │                                     │  │  └───────────────────────────────┘  │
    └─────────────────────────────────────┘  └─────────────────────────────────────┘
                      │                                       │
                      └───────────────────┬───────────────────┘
                                          │
                                          ▼
    ┌─────────────────────────────────────────────────────────────────────────────────┐
    │  OUTPUT: SkillResult                                                            │
    │  {                                                                              │
    │    ok: true,                                                                   │
    │    data: { image_uri: "/tmp/.../intro.png", width: 1792, height: 1024 },      │
    │    artifacts: [                                                                │
    │      { artifact_type: "image/intro-frame", uri: "...", metadata: {...} }      │
    │    ],                                                                          │
    │    debug: {                                                                    │
    │      timings_ms: { total: 5230, prompt_build: 12, generation: 5100, save: 118 }│
    │    }                                                                           │
    │  }                                                                              │
    └─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 8. Handler Execution Example (Image Generation)

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                        GenerateIntroImageHandler.execute()                              │
└─────────────────────────────────────────────────────────────────────────────────────────┘

    ┌─────────────────────────────────────────────────────────────────────────────────┐
    │  INPUT                                                                          │
    │  {                                                                              │
    │    prompt: "A vibrant game intro scene with...",                               │
    │    style_refs: { style: "cartoon", mood: "exciting", color_tone: "warm" },     │
    │    brand_assets: [{ uri: "logo.png", description: "Brand logo" }],             │
    │    specs: { aspect_ratio: "16:9", format: "png" }                              │
    │  }                                                                              │
    └─────────────────────────────────────────────────────────────────────────────────┘
                                          │
                                          ▼
    ┌─────────────────────────────────────────────────────────────────────────────────┐
    │  1. Build Enhanced Prompt                                                       │
    │                                                                                 │
    │     "A vibrant game intro scene with..."                                       │
    │     + "Style: cartoon"                                                         │
    │     + "Mood: exciting"                                                         │
    │     + "Color tone: warm"                                                       │
    │     + "Brand context: Brand logo"                                              │
    │     + "Composition: optimized for 16:9 aspect ratio"                           │
    └─────────────────────────────────────────────────────────────────────────────────┘
                                          │
                                          ▼
    ┌─────────────────────────────────────────────────────────────────────────────────┐
    │  2. Determine Dimensions                                                        │
    │                                                                                 │
    │     16:9 -> { width: 1792, height: 1024 }                                      │
    └─────────────────────────────────────────────────────────────────────────────────┘
                                          │
                                          ▼
    ┌─────────────────────────────────────────────────────────────────────────────────┐
    │  3. Get Provider from Registry                                                  │
    │                                                                                 │
    │     ImageProviderRegistry.getDefaultProvider()                                 │
    │     -> OpenAI DALL-E / Stability AI / Replicate                                │
    └─────────────────────────────────────────────────────────────────────────────────┘
                                          │
                                          ▼
    ┌─────────────────────────────────────────────────────────────────────────────────┐
    │  4. Call Image Generation API                                                   │
    │                                                                                 │
    │     provider.generateImage({                                                   │
    │       prompt: enhancedPrompt,                                                  │
    │       width: 1792, height: 1024,                                               │
    │       quality: "hd",                                                           │
    │       format: "png"                                                            │
    │     })                                                                         │
    │                                                                                 │
    │     ┌─────────────────────────────────────────────────────────────────────┐    │
    │     │                    EXTERNAL API CALL                                │    │
    │     │                                                                     │    │
    │     │  ┌─────────┐     HTTP POST      ┌─────────────────────────────┐   │    │
    │     │  │ Handler │ ────────────────-> │ OpenAI / Stability / etc.   │   │    │
    │     │  └─────────┘                    └─────────────────────────────┘   │    │
    │     │                                            │                       │    │
    │     │                                            ▼                       │    │
    │     │                                   { uri: "https://...", ... }      │    │
    │     └─────────────────────────────────────────────────────────────────────┘    │
    └─────────────────────────────────────────────────────────────────────────────────┘
                                          │
                                          ▼
    ┌─────────────────────────────────────────────────────────────────────────────────┐
    │  5. Download & Save Image                                                       │
    │                                                                                 │
    │     - Validate URL (SSRF prevention - only allowed domains)                    │
    │     - Download image from provider URL                                         │
    │     - Save to /tmp/skills/output/{executionId}/intro-frame.png                 │
    └─────────────────────────────────────────────────────────────────────────────────┘
                                          │
                                          ▼
    ┌─────────────────────────────────────────────────────────────────────────────────┐
    │  6. Return SkillResult                                                          │
    │                                                                                 │
    │     skillSuccess(output, artifacts, debug)                                     │
    │                                                                                 │
    │     output: {                                                                  │
    │       image_uri: "/tmp/skills/output/abc123/intro-frame.png",                 │
    │       width: 1792,                                                             │
    │       height: 1024,                                                            │
    │       format: "png",                                                           │
    │       file_size_bytes: 2457832                                                 │
    │     }                                                                          │
    │                                                                                 │
    │     artifacts: [{                                                              │
    │       artifact_type: "image/intro-frame",                                      │
    │       uri: "/tmp/skills/output/abc123/intro-frame.png",                       │
    │       metadata: { width, height, format, provider_id, model }                 │
    │     }]                                                                         │
    └─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 9. Full Campaign Build - Step by Step

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                         campaign.build WORKFLOW EXECUTION                               │
│                                  (14 Steps)                                             │
└─────────────────────────────────────────────────────────────────────────────────────────┘

    TRIGGER PAYLOAD:
    {
      campaign_id: "camp-001",
      brief: { theme: "Summer Sale", target: "Gen-Z", ... },
      brand_assets: [{ uri: "logo.png", ... }],
      constraints: { duration_sec: 30, difficulty: "medium", ... }
    }

    =======================================================================================

    STEP 1: plan
    ┌─────────────────────────────────────────────────────────────────────────────────┐
    │  Skill: campaign_plan_from_brief                                                │
    │  Input: { brief, brand_assets, constraints }                                    │
    │  Output: { style_guide, audio_style, game_type, win_message, ... }             │
    └─────────────────────────────────────────────────────────────────────────────────┘
                                          │
            ┌─────────────────────────────┼─────────────────────────────┐
            │                             │                             │
            ▼                             ▼                             ▼

    STEP 2: intro_image           STEP 5: bgm                   STEP 6: sfx
    ┌────────────────────┐       ┌────────────────────┐       ┌────────────────────┐
    │ generate_intro_    │       │ generate_bgm_      │       │ generate_sfx_      │
    │ image              │       │ track              │       │ pack               │
    │                    │       │                    │       │                    │
    │ -> Intro frame PNG │       │ -> BGM audio file  │       │ -> SFX audio files │
    └────────────────────┘       └────────────────────┘       └────────────────────┘
            │                             │                             │
            ▼                             └──────────┬──────────────────┘
    STEP 3: intro_button_                           │
    segmentation                                    ▼
    ┌────────────────────┐                  STEP 7: audio_mix
    │ segment_start_     │                 ┌────────────────────┐
    │ button             │                 │ mix_audio_for_     │
    │                    │                 │ game               │
    │ -> Button coords   │                 │                    │
    └────────────────────┘                 │ -> Mixed audio     │
            │                              └────────────────────┘
            ▼                                        │
    STEP 4: intro_video                             │
    ┌────────────────────┐                          │
    │ generate_intro_    │                          │
    │ video_loop         │                          │
    │                    │                          │
    │ -> Looping video   │                          │
    └────────────────────┘                          │
            │                                        │
            │                              ┌─────────┘
            │                              │
            │          STEP 8: game_config │
            │         ┌────────────────────┴───┐
            │         │ game_config_from_      │
            │         │ template               │
            │         │                        │
            │         │ -> Game JSON config    │
            │         └────────────────────────┘
            │                    │
            │                    ▼
            │          STEP 9: bundle_game
            │         ┌────────────────────────┐
            │         │ bundle_game_template   │
            │         │                        │
            │         │ -> Game bundle ZIP     │
            │         └────────────────────────┘
            │                    │
            │                    ├───────────────────┐
            │                    │                   │
            │                    ▼                   ▼
            │          STEP 13: qa_bundle    STEP 10-11: outcome videos
            │         ┌────────────────────┐ ┌────────────────────────────┐
            │         │ validate_game_     │ │ generate_outcome_video_win │
            │         │ bundle             │ │ generate_outcome_video_lose│
            │         │                    │ │                            │
            │         │ -> Validation      │ │ -> Win/Lose videos         │
            │         └────────────────────┘ └────────────────────────────┘
            │                                          │
            └──────────────────────┬───────────────────┘
                                   │
                                   ▼
                         STEP 12: manifest
                        ┌────────────────────────┐
                        │ assemble_campaign_     │
                        │ manifest               │
                        │                        │
                        │ -> Final manifest JSON │
                        │   with all asset refs  │
                        └────────────────────────┘
                                   │
                                   ▼
                         STEP 14: review_smoke
                        ┌────────────────────────┐
                        │ review_asset_quality   │
                        │                        │
                        │ -> QA review report    │
                        └────────────────────────┘
                                   │
                                   ▼
                               ┌───────┐
                               │  END  │
                               └───────┘

    =======================================================================================

    FINAL OUTPUT:
    {
      manifest: { campaign_id, assets: {...}, game_config: {...} },
      artifacts: [
        { type: "image/intro-frame", uri: "..." },
        { type: "video/intro-loop", uri: "..." },
        { type: "video/outcome-win", uri: "..." },
        { type: "video/outcome-lose", uri: "..." },
        { type: "audio/bgm", uri: "..." },
        { type: "audio/sfx-pack", uri: "..." },
        { type: "game/bundle", uri: "..." }
      ],
      qa_report: { ... }
    }
```

---

## 10. Update Workflow - Partial Rebuild

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                      campaign.update_audio WORKFLOW                                     │
│                      (Reuses assets from base_run)                                      │
└─────────────────────────────────────────────────────────────────────────────────────────┘

    TRIGGER:
    {
      triggerType: "update",
      baseRunId: "original-run-123",      <- Reference to previous run
      audio_overrides: { mood: "calmer" }  <- Only override what changed
    }

    =======================================================================================

                    ┌──────────────────────────────────────────────────────┐
                    │              BASE RUN (previous)                      │
                    │                                                       │
                    │  plan ------- intro_image ------- intro_video        │
                    │    │                                                  │
                    │    ├───────── bgm ────────┐                          │
                    │    │                      │                          │
                    │    ├───────── sfx ────────┤                          │
                    │    │                      ▼                          │
                    │    │               audio_mix                         │
                    │    │                      │                          │
                    │    └── game_config ───────┤                          │
                    │                           ▼                          │
                    │                      bundle_game ──── manifest       │
                    │                                                       │
                    │  [OK] All steps completed, artifacts available       │
                    └──────────────────────────────────────────────────────┘
                                          │
                                          │ base_run reference
                                          ▼
    ┌─────────────────────────────────────────────────────────────────────────────────┐
    │                         UPDATE RUN (new)                                        │
    │                                                                                 │
    │    ┌─────────────────┐                                                         │
    │    │ FROM BASE_RUN:  │ ─────────────────────────────────────────────────────┐  │
    │    │ - plan.data     │                                                      │  │
    │    │ - game_config   │                                                      │  │
    │    │ - intro_image   │                                                      │  │
    │    │ - intro_video   │                                                      │  │
    │    │ - outcome_win   │                                                      │  │
    │    │ - outcome_lose  │                                                      │  │
    │    └─────────────────┘                                                      │  │
    │                                                                              │  │
    │    ┌─────────────────┐     ┌─────────────────┐                              │  │
    │    │ NEW: bgm        │     │ NEW: sfx        │  <- Only regenerate audio   │  │
    │    │ (with overrides)│     │ (with overrides)│                              │  │
    │    └────────┬────────┘     └────────┬────────┘                              │  │
    │             │                       │                                        │  │
    │             └───────────┬───────────┘                                        │  │
    │                         │                                                    │  │
    │                         ▼                                                    │  │
    │               ┌─────────────────┐                                            │  │
    │               │ NEW: audio_mix  │                                            │  │
    │               └────────┬────────┘                                            │  │
    │                        │                                                     │  │
    │                        ▼                                                     │  │
    │               ┌─────────────────┐    <- Uses base_run game_config           │  │
    │               │ NEW: bundle_game│<───────────────────────────────────────────┤  │
    │               └────────┬────────┘                                            │  │
    │                        │                                                     │  │
    │                        ▼                                                     │  │
    │               ┌─────────────────┐    <- Uses base_run intro/outcome assets  │  │
    │               │ NEW: manifest   │<───────────────────────────────────────────┘  │
    │               └─────────────────┘                                               │
    │                                                                                 │
    └─────────────────────────────────────────────────────────────────────────────────┘

    RESULT: New manifest with updated audio, all other assets reused
```

---

## 11. Summary: Component Interactions

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                              COMPLETE SYSTEM FLOW                                       │
└─────────────────────────────────────────────────────────────────────────────────────────┘

    ┌──────────────┐
    │    User      │
    └──────┬───────┘
           │ HTTP POST /run-engine/trigger-run
           ▼
    ┌──────────────┐     Creates Run     ┌──────────────┐
    │  API Center  │ ─────────────────-> │  PostgreSQL  │
    └──────┬───────┘                     └──────────────┘
           │
           │ Enqueue job
           ▼
    ┌──────────────┐
    │   BullMQ     │
    │   (Valkey)   │
    └──────┬───────┘
           │
           │ Dequeue
           ▼
    ┌──────────────────────────────────────────────────────────────────────────────────┐
    │                            AGENT PLATFORM                                        │
    │                                                                                  │
    │   ┌─────────────────┐                                                           │
    │   │ Run Processor   │                                                           │
    │   └────────┬────────┘                                                           │
    │            │                                                                    │
    │            ▼                                                                    │
    │   ┌─────────────────┐     ┌─────────────────┐                                  │
    │   │ Workflow        │<────│ TypeScript      │                                  │
    │   │ Registry        │     │ Workflow Defs   │                                  │
    │   └────────┬────────┘     └─────────────────┘                                  │
    │            │                                                                    │
    │            ▼                                                                    │
    │   ┌─────────────────┐                                                           │
    │   │ LangGraph DAG   │                                                           │
    │   │ Builder         │                                                           │
    │   └────────┬────────┘                                                           │
    │            │                                                                    │
    │            ▼                                                                    │
    │   ┌─────────────────┐     ┌─────────────────┐                                  │
    │   │ Workflow Engine │<────│ PostgreSQL      │                                  │
    │   │ (LangGraph)     │     │ Checkpointer    │                                  │
    │   └────────┬────────┘     └─────────────────┘                                  │
    │            │                                                                    │
    │            │ For each step node                                                 │
    │            ▼                                                                    │
    │   ┌─────────────────┐     ┌─────────────────┐                                  │
    │   │ Cached Step     │<--->│ Step Cache      │                                  │
    │   │ Executor        │     │ (PostgreSQL)    │                                  │
    │   └────────┬────────┘     └─────────────────┘                                  │
    │            │                                                                    │
    │            │ On cache miss                                                      │
    │            ▼                                                                    │
    │   ┌─────────────────┐     ┌─────────────────┐                                  │
    │   │ Skill Runner    │<────│ Skill Catalog   │                                  │
    │   │                 │     │ (YAML + Handlers)│                                 │
    │   └────────┬────────┘     └─────────────────┘                                  │
    │            │                                                                    │
    │     ┌──────┴──────┐                                                            │
    │     │             │                                                            │
    │     ▼             ▼                                                            │
    │  ┌───────┐   ┌────────────┐                                                    │
    │  │Handler│   │LLM Template│                                                    │
    │  │       │   │Generation  │                                                    │
    │  └───┬───┘   └─────┬──────┘                                                    │
    │      │             │                                                           │
    │      │             ▼                                                           │
    │      │      ┌─────────────────┐                                                │
    │      │      │ LiteLLM Proxy   │ ─────────> OpenAI / Claude / Gemini           │
    │      │      └─────────────────┘                                                │
    │      │                                                                         │
    │      ▼                                                                         │
    │  ┌─────────────────┐                                                           │
    │  │ Provider Layer  │                                                           │
    │  │ (Image, Audio,  │ ─────────> DALL-E / Stability / Replicate / etc.         │
    │  │  Video)         │                                                           │
    │  └─────────────────┘                                                           │
    │                                                                                 │
    └─────────────────────────────────────────────────────────────────────────────────┘
           │
           │ Store artifacts
           ▼
    ┌──────────────┐
    │  PostgreSQL  │  (Run, RunStep, Artifact, StepCache)
    └──────────────┘
```

---

## Appendix: Registered Skills

| Skill ID | Purpose | Type |
|----------|---------|------|
| `campaign_plan_from_brief` | Generate campaign plan from creative brief | Handler |
| `game_config_from_template` | Generate game configuration | Handler |
| `review_asset_quality` | QA review of assets | Handler |
| `generate_intro_image` | Generate intro image | Handler + Image Provider |
| `segment_start_button` | Detect/segment start button | Handler |
| `generate_intro_video_loop` | Create looping intro video | Handler |
| `generate_outcome_video_win` | Win outcome video | Handler |
| `generate_outcome_video_lose` | Lose outcome video | Handler |
| `generate_bgm_track` | Background music generation | Handler |
| `generate_sfx_pack` | Sound effects pack | Handler |
| `mix_audio_for_game` | Mix/normalize audio tracks | Handler |
| `generate_3d_asset` | Generate 3D assets | Handler |
| `optimize_3d_asset` | Optimize 3D assets | Handler |
| `bundle_game_template` | Bundle game with assets | Handler |
| `validate_game_bundle` | Validate game bundle | Handler |
| `assemble_campaign_manifest` | Assemble final manifest | Handler |

---

## Appendix: Registered Workflows

| Workflow Name | Version | Description |
|---------------|---------|-------------|
| `campaign.build` | 1.0.0 | Full campaign build (14 steps) |
| `campaign.update_audio` | 1.0.0 | Update audio tracks only |
| `campaign.update_intro` | 1.0.0 | Update intro assets only |
| `campaign.update_outcome` | 1.0.0 | Update win/lose videos |
| `campaign.update_game_config` | 1.0.0 | Update game configuration |
| `campaign.replace_3d_asset` | 1.0.0 | Replace 3D assets |
