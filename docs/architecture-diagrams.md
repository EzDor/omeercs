# Agents, Skills & Workflows - Visual Architecture

## Table of Contents
1. [High-Level System Flow](#1-high-level-system-flow)
2. [Workflow Registration & Dependency Injection](#2-workflow-registration--dependency-injection)
3. [Skill Loading & Registration](#3-skill-loading--registration)
4. [Workflow Execution Flow (Campaign Workflows)](#4-workflow-execution-flow-campaign-workflows)
5. [LangGraph DAG Building (Inside Workflow Classes)](#5-langgraph-dag-building-inside-workflow-classes)
6. [Step Execution via SkillNodeService](#6-step-execution-via-skillnodeservice)
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
│  │  POST /api/campaigns/:id/generate                                                 │   │
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

## 2. Workflow Registration & Dependency Injection

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                        TYPESCRIPT WORKFLOW CLASSES                                       │
│              (agent-platform/src/workflows/campaign/)                                    │
│                                                                                         │
│   ┌────────────────────────────────────────────────────────────────────────────────┐    │
│   │  campaign-build.workflow.ts          → CampaignBuildWorkflow          @Injectable│    │
│   │  campaign-build-minimal.workflow.ts  → CampaignBuildMinimalWorkflow   @Injectable│    │
│   │  campaign-update-audio.workflow.ts   → CampaignUpdateAudioWorkflow    @Injectable│    │
│   │  campaign-update-intro.workflow.ts   → CampaignUpdateIntroWorkflow    @Injectable│    │
│   │  ...                                                                            │    │
│   │                                                                                 │    │
│   │  Each class has createGraph() → returns StateGraph<CampaignWorkflowStateType>   │    │
│   │  All depend on SkillNodeService for creating node functions                     │    │
│   └────────────────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────────────────┘
        │
        │  NestJS Dependency Injection
        ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                CampaignWorkflowsModule (NestJS Module)                                   │
│                                                                                         │
│   ┌─────────────────────────────────────────────────────────────────────────────────┐  │
│   │  1. Provides all workflow classes as injectable services                         │  │
│   │                                                                                  │  │
│   │     providers: [                                                                 │  │
│   │       SkillNodeService,                                                          │  │
│   │       CampaignBuildWorkflow,                                                     │  │
│   │       CampaignBuildMinimalWorkflow,                                               │  │
│   │       CampaignUpdateAudioWorkflow,                                                │  │
│   │       ...                                                                        │  │
│   │       CampaignRunProcessor,                                                      │  │
│   │     ]                                                                            │  │
│   └─────────────────────────────────────────────────────────────────────────────────┘  │
│                                          │                                              │
│                                          ▼                                              │
│   ┌─────────────────────────────────────────────────────────────────────────────────┐  │
│   │  2. CampaignRunProcessor builds workflow map in constructor                      │  │
│   │                                                                                  │  │
│   │     Map<workflowName, WorkflowClass>                                            │  │
│   │     ┌────────────────────────────────────────────────────────────────────────┐  │  │
│   │     │  "campaign.build" ──▶ CampaignBuildWorkflow                            │  │  │
│   │     │  "campaign.build.minimal" ──▶ CampaignBuildMinimalWorkflow              │  │  │
│   │     │  "campaign.update_audio" ──▶ CampaignUpdateAudioWorkflow                │  │  │
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

## 4. Workflow Execution Flow (Campaign Workflows)

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
    │  CampaignRunProcessor.process()                                                 │
    │                                                                                 │
    │  ┌───────────────────────────────────────────────────────────────────────────┐  │
    │  │  1. Fetch Run from database                                               │  │
    │  │     Run { id, workflowName: "campaign.build", status: "queued" }         │  │
    │  └───────────────────────────────────────────────────────────────────────────┘  │
    │                                          │                                      │
    │                                          ▼                                      │
    │  ┌───────────────────────────────────────────────────────────────────────────┐  │
    │  │  2. Look up workflow class from workflowMap                               │  │
    │  │     workflowMap.get("campaign.build") → CampaignBuildWorkflow            │  │
    │  └───────────────────────────────────────────────────────────────────────────┘  │
    │                                          │                                      │
    │                                          ▼                                      │
    │  ┌───────────────────────────────────────────────────────────────────────────┐  │
    │  │  3. Build LangGraph StateGraph                                            │  │
    │  │     workflow.createGraph()                                                │  │
    │  │     → Returns StateGraph with nodes, edges, and conditional routing      │  │
    │  └───────────────────────────────────────────────────────────────────────────┘  │
    │                                          │                                      │
    │                                          ▼                                      │
    │  ┌───────────────────────────────────────────────────────────────────────────┐  │
    │  │  4. Load base run outputs (for update workflows)                          │  │
    │  │     Reads previous run checkpoint from PostgreSQL                         │  │
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
    │  │  6. Update Run and Campaign status                                        │  │
    │  │     Run { status: "completed" | "failed" }                               │  │
    │  │     Campaign { status: "live" | "failed" }                               │  │
    │  └───────────────────────────────────────────────────────────────────────────┘  │
    │                                                                                 │
    └─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. LangGraph DAG Building (Inside Workflow Classes)

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                     Workflow.createGraph() (e.g., CampaignBuildMinimalWorkflow)          │
└─────────────────────────────────────────────────────────────────────────────────────────┘

    Each workflow class builds its StateGraph directly in createGraph():

    ┌─────────────────────────────────────────────────────────────────────────────────┐
    │  1. Create StateGraph with nodes (each wraps a skill via SkillNodeService)      │
    │                                                                                 │
    │     const graph = new StateGraph(CampaignWorkflowState)                        │
    │       .addNode("plan", skillNode.createNode("plan", "campaign_plan", inputFn)) │
    │       .addNode("intro_image", skillNode.createNode("intro_image", ...))        │
    │       .addNode("bgm", skillNode.createNode("bgm", ...))                        │
    │       .addNode("sfx", skillNode.createNode("sfx", ...))                        │
    │       .addNode("audio_mix", skillNode.createNode("audio_mix", ...))            │
    │       .addNode("manifest", skillNode.createNode("manifest", ...))              │
    └─────────────────────────────────────────────────────────────────────────────────┘
                                          │
                                          ▼
    ┌─────────────────────────────────────────────────────────────────────────────────┐
    │  2. Add edges and conditional edges (dependencies + error short-circuiting)     │
    │                                                                                 │
    │     .addEdge("__start__", "plan")        // Entry point                        │
    │     .addConditionalEdges("plan", ...)     // plan -> intro_image, bgm, sfx     │
    │     .addConditionalEdges("bgm", ...)      // bgm -> audio_mix (if no error)    │
    │     .addConditionalEdges("sfx", ...)      // sfx -> audio_mix (if no error)    │
    │     .addConditionalEdges("audio_mix",...) // audio_mix -> manifest (if no error)│
    │     .addEdge("manifest", "__end__")       // Terminal                           │
    └─────────────────────────────────────────────────────────────────────────────────┘
                                          │
                                          ▼
    OUTPUT: StateGraph (executable DAG)

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

## 6. Step Execution via SkillNodeService

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                            SkillNodeService                                              │
│                        (Node Function for each step)                                    │
└─────────────────────────────────────────────────────────────────────────────────────────┘

    When LangGraph invokes a node (e.g., "intro_image"):

    ┌─────────────────────────────────────────────────────────────────────────────────┐
    │  INPUT: Current CampaignWorkflowState                                           │
    │  {                                                                              │
    │    runId: "abc-123",                                                           │
    │    triggerPayload: { brief: {...}, brand_assets: [...] },                      │
    │    stepResults: { "plan": { ok: true, data: {...}, artifactIds: [...] } },     │
    │    baseRunOutputs: { ... },                                                    │
    │    error: null                                                                 │
    │  }                                                                              │
    └─────────────────────────────────────────────────────────────────────────────────┘
                                          │
                                          ▼
    ┌─────────────────────────────────────────────────────────────────────────────────┐
    │  1. Evaluate input function (inline lambda from workflow class)                 │
    │                                                                                 │
    │     inputFn(state):                                                            │
    │       prompt ──────> state.stepResults["plan"].data.video_prompts[0].prompt   │
    │       brand_assets ──> state.triggerPayload.brand_assets                       │
    │                                                                                 │
    │     RESULT: { prompt: "...", brand_assets: [...] }                             │
    └─────────────────────────────────────────────────────────────────────────────────┘
                                          │
                                          ▼
    ┌─────────────────────────────────────────────────────────────────────────────────┐
    │  2. Execute Skill with Retry                                                    │
    │                                                                                 │
    │     SkillNodeService.executeWithRetry("intro_image", "generate_intro_image",   │
    │       input, { maxAttempts: 2, backoffMs: 2000 })                              │
    │                                                                                 │
    │     ┌─────────────────────────────────────────────────────────────────────┐    │
    │     │  Attempt 1:                                                         │    │
    │     │  -> SkillRunnerService.execute("generate_intro_image", input)       │    │
    │     │  -> If ok: return result                                            │    │
    │     │  -> If failed: wait (backoffMs * 2^(attempt-1)), try again          │    │
    │     │                                                                     │    │
    │     │  Attempt 2 (if needed):                                             │    │
    │     │  -> SkillRunnerService.execute("generate_intro_image", input)       │    │
    │     │  -> Return result (success or failure)                              │    │
    │     └─────────────────────────────────────────────────────────────────────┘    │
    └─────────────────────────────────────────────────────────────────────────────────┘
                                          │
                                          ▼
    ┌─────────────────────────────────────────────────────────────────────────────────┐
    │  3. Return State Update                                                         │
    │                                                                                 │
    │     On success:                                                                │
    │     { stepResults: { "intro_image": { ok: true, data: {...}, artifactIds } } } │
    │                                                                                 │
    │     On failure:                                                                │
    │     { stepResults: { "intro_image": { ok: false, error: "..." } },             │
    │       error: "Step intro_image failed: ..." }                                  │
    │     → Downstream conditional edges route to __end__                            │
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
           │ HTTP POST /api/campaigns/:id/generate
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
    │   ┌─────────────────┐     ┌─────────────────┐                                  │
    │   │ Campaign Run    │<────│ Workflow Classes │                                  │
    │   │ Processor       │     │ (TypeScript)     │                                  │
    │   └────────┬────────┘     └─────────────────┘                                  │
    │            │                                                                    │
    │            │ workflow.createGraph()                                              │
    │            ▼                                                                    │
    │   ┌─────────────────┐     ┌─────────────────┐                                  │
    │   │ Workflow Engine │<────│ PostgreSQL      │                                  │
    │   │ (LangGraph)     │     │ Checkpointer    │                                  │
    │   └────────┬────────┘     └─────────────────┘                                  │
    │            │                                                                    │
    │            │ For each step node                                                 │
    │            ▼                                                                    │
    │   ┌─────────────────┐                                                           │
    │   │ SkillNode       │  Wraps skill execution with retry logic                  │
    │   │ Service         │                                                           │
    │   └────────┬────────┘                                                           │
    │            │                                                                    │
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
    │  PostgreSQL  │  (Run, RunStep, Artifact, Checkpoints)
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
