# Agent Platform Deep Dive

## Overview

The agent platform (`agent-platform/`) is the worker service that does all the heavy computation. It receives jobs from BullMQ queues and executes AI workflows — orchestrating LLM calls, media generation, game bundling, and quality validation. It never receives direct HTTP requests from the frontend.

This document walks through every subsystem in detail, following the code paths from job arrival to final output.

## Module Structure

```
agent-platform/src/
├── run-engine/                    # TypeScript workflow execution system
│   ├── interfaces/                # TypeScript types for workflows, steps, state
│   ├── services/                  # Core services
│   ├── processors/                # BullMQ job processors
│   ├── workflow-definitions/      # TypeScript WorkflowSpec definitions and input helpers
│   └── run-engine.module.ts
├── skills/                        # Skill execution system
│   ├── handlers/                  # 20 handler implementations
│   ├── interfaces/                # SkillHandler interface
│   ├── services/                  # Skill catalog service
│   └── skill-runner/              # Skill execution engine
│       ├── interfaces/            # Execution context, results
│       ├── services/              # Runner, LLM gen, validator, workspace
│       └── exceptions/            # Typed exceptions
├── prompt-registry/               # Versioned prompt templates
│   ├── interfaces/
│   └── services/                  # Registry, loader, renderer
├── template-system/               # Game template manifests
│   ├── interfaces/
│   └── services/                  # Manifest loader, config validator
├── workflow-orchestration/        # LangGraph checkpointed workflows
│   ├── interfaces/
│   ├── services/
│   ├── processors/
│   └── providers/
├── campaign/                      # Campaign status management
├── intelligence/                  # Intelligence endpoints (internal)
└── core/                          # Auth, DB, queue config
```

## Startup Sequence

When the agent platform boots, these `OnModuleInit` hooks fire in dependency order:

```
1. SkillCatalogService.onModuleInit()
   ├── Reads skills/catalog/index.yaml
   ├── Loads each active skill's YAML descriptor
   ├── Validates descriptors (required fields, semver, schemas)
   ├── Registers handler instances for handler-based skills
   └── Result: 23 descriptors loaded, 19 handlers registered

2. PromptRegistryService.onModuleInit()
   ├── Scans agent-platform/prompts/ directory
   ├── Loads all prompt .md files (versioned)
   ├── Loads config and rubric templates
   └── Result: In-memory registry of versioned prompts

3. WorkflowRegistryService.onModuleInit()
   ├── Imports ALL_WORKFLOWS array from workflow-definitions/all-workflows.ts
   ├── For each WorkflowSpec: validates no cyclic dependencies via DependencyGraphService
   ├── Registers each WorkflowSpec in the in-memory registry
   └── Result: 7 workflows registered and ready to execute

4. BullMQ processors start listening:
   ├── LangGraphRunProcessor → RUN_ORCHESTRATION queue
   └── WorkflowQueueProcessor → WORKFLOW_ORCHESTRATION queue
```

## Run Engine: Complete Code Path

### 1. Job Arrival

When a job arrives on the `RUN_ORCHESTRATION` queue, `LangGraphRunProcessor.process()` is called:

```typescript
// agent-platform/src/run-engine/processors/langgraph-run.processor.ts
@Processor(QueueNames.RUN_ORCHESTRATION, { concurrency: 1 })
export class LangGraphRunProcessor extends WorkerHost {
  async process(job: Job<RunOrchestrationJobData>): Promise<void> {
    const { runId, tenantId } = job.data;

    // Everything runs inside a tenant context
    await this.tenantClsService.runWithTenant(tenantId, undefined, async () => {
      // 1. Fetch the Run entity from the database
      const run = await this.runEngineService.getRun(runId);

      // 2. Look up the compiled WorkflowSpec from the registry
      const workflow = this.workflowRegistryService.getWorkflow(
        run.workflowName,
        run.workflowVersion
      );

      // 3. Create RunStep entities for each step (if not already created)
      await this.runEngineService.createRunSteps(runId, tenantId, workflow, run.triggerPayload);

      // 4. Update Run status to 'running'
      await this.runEngineService.updateRunStatus(runId, 'running');

      // 5. Build the LangGraph state machine
      const graph = this.langGraphBuilder.buildGraph(workflow);

      // 6. Execute via the WorkflowEngineService (with checkpointing)
      const result = await this.workflowEngineService.executeWorkflow(
        graph, initialState, runId, tenantId, `run-engine:${workflow.workflowName}`
      );

      // 7. Check results and update statuses
      if (failedSteps.length > 0) {
        await this.runEngineService.updateRunStatus(runId, 'failed', { ... });
        await this.campaignStatusService.updateStatusFromRun(campaignId, { status: 'failed' });
      } else {
        await this.runEngineService.updateRunStatus(runId, 'completed');
        await this.campaignStatusService.updateStatusFromRun(campaignId, { status: 'live', bundleUrl });
      }
    });
  }
}
```

**Key detail**: Concurrency is set to 1 (`{ concurrency: 1 }`). Only one workflow runs at a time per worker instance. This prevents resource contention when multiple steps within a workflow run in parallel.

### 2. Graph Construction

`LangGraphWorkflowBuilderService.buildGraph()` converts a `WorkflowSpec` into an executable LangGraph `StateGraph`:

```typescript
// agent-platform/src/run-engine/services/langgraph-workflow-builder.service.ts
buildGraph(workflow: WorkflowSpec): StateGraph<RunStateType> {
  const stateGraph = new StateGraph(RunStateAnnotation);

  // Each step becomes a node
  for (const stepSpec of workflow.steps) {
    const nodeFunction = this.cachedStepExecutor.createNodeFunction(stepSpec);
    stateGraph.addNode(stepSpec.stepId, nodeFunction);
  }

  // Entry steps (no dependencies) connect from START
  const entrySteps = this.dependencyGraphService.getEntrySteps(workflow.steps);
  for (const entryStep of entrySteps) {
    stateGraph.addEdge(START, entryStep.stepId);
  }

  // Connect dependency edges
  for (const stepSpec of workflow.steps) {
    if (isTerminal) {
      stateGraph.addEdge(stepSpec.stepId, END);
    } else {
      for (const dependent of dependents) {
        stateGraph.addEdge(stepSpec.stepId, dependent);
      }
    }
  }

  return stateGraph;
}
```

**The state annotation** uses LangGraph's `Annotation.Root` with merge-map reducers. This is critical because parallel nodes produce partial state updates that must be merged:

```typescript
// agent-platform/src/run-engine/interfaces/langgraph-run-state.interface.ts
export const RunStateAnnotation = Annotation.Root({
  runId: Annotation<string>({ reducer: (_, update) => update }),
  tenantId: Annotation<string>({ reducer: (_, update) => update }),
  workflowName: Annotation<string>({ reducer: (_, update) => update }),
  triggerPayload: Annotation<Record<string, unknown>>({ reducer: (_, update) => update }),

  // These use merge-map reducers for parallel step results
  stepResults: Annotation<Map<string, StepResult>>({ reducer: mergeMapReducer }),
  artifacts: Annotation<Map<string, string[]>>({ reducer: mergeMapReducer }),

  error: Annotation<string | null>({ reducer: (_, update) => update }),
});
```

The `mergeMapReducer` merges Maps from parallel branches — when `intro_image` and `bgm` complete in parallel, their results are merged into the shared `stepResults` Map.

### 3. Step Execution

Each node in the graph is a closure created by `CachedStepExecutorService.createNodeFunction()`. Here's the complete flow:

```typescript
// agent-platform/src/run-engine/services/cached-step-executor.service.ts
createNodeFunction(stepSpec: StepSpec): (state: RunStateType) => Promise<Partial<RunStateType>> {
  return async (state: RunStateType): Promise<Partial<RunStateType>> => {
    // 1. Build the RunContext from current state
    const context = this.buildRunContext(state);

    // 2. Resolve inputs via the compiled input selector
    let input: Record<string, unknown>;
    try {
      input = stepSpec.inputSelector(context);
    } catch (error) {
      return this.buildFailureUpdate(stepSpec.stepId, ...);
    }

    // 3. Compute input hash for caching
    const inputHash = this.inputHasherService.computeHash(input);
    const cacheKey = this.inputHasherService.createCacheKeyFromHash(
      workflowName, stepSpec.stepId, inputHash
    );

    // 4. Update RunStep status to 'running'
    await this.runEngineService.updateRunStepStatus(runStep.id, 'running');

    // 5. Check cache (if enabled)
    if (stepSpec.cachePolicy.enabled) {
      const cached = await this.stepCacheService.get(cacheKey);
      if (cached) {
        // Cache hit! Update DB and return cached result
        await this.runEngineService.updateRunStepStatus(runStep.id, 'completed', {
          outputArtifactIds: cached.artifactIds,
          cacheHit: true,
          durationMs,
        });
        return this.buildSuccessUpdate(stepSpec.stepId, cached.artifactIds, true, ...);
      }
    }

    // 6. Execute with retry
    const result = await this.executeWithRetry(stepSpec, input, runStep.id);

    // 7. On success: update DB, cache result
    if (result.ok) {
      await this.runEngineService.updateRunStepStatus(runStep.id, 'completed', { ... });

      if (stepSpec.cachePolicy.enabled) {
        await this.stepCacheService.set({
          cacheKey, workflowName, stepId, inputHash,
          artifactIds, data: result.data, scope: stepSpec.cachePolicy.scope,
        });
      }

      return this.buildSuccessUpdate(...);
    }

    // 8. On failure: update DB with error
    await this.runEngineService.updateRunStepStatus(runStep.id, 'failed', { error: { ... } });
    return this.buildFailureUpdate(...);
  };
}
```

**Retry logic** uses exponential backoff:

```typescript
private async executeWithRetry(stepSpec, input, runStepId): Promise<SkillResult> {
  const { maxAttempts, backoffMs } = stepSpec.retryPolicy;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const result = await this.skillRunnerService.execute(stepSpec.skillId, input);
    if (result.ok) return result;

    if (attempt < maxAttempts) {
      const delay = backoffMs * Math.pow(2, attempt - 1);  // Exponential backoff
      await this.delay(delay);
      await this.runEngineService.incrementStepAttempt(runStepId);
    }
  }
}
```

### 4. Workflow TypeScript Registration

`WorkflowRegistryService` registers pre-defined TypeScript workflows at startup:

```
For each WorkflowSpec in ALL_WORKFLOWS:
  1. Validate no cyclic dependencies via DependencyGraphService.validateNoCycles()
  2. Register the WorkflowSpec in the in-memory Map<workflowName, Map<version, WorkflowSpec>>
```

Workflows are defined as TypeScript `WorkflowSpec` objects in `agent-platform/src/run-engine/workflow-definitions/`. Input selectors are composed from helper functions defined in `input-helpers.ts`:

```typescript
inputSelector: inputSelector({
  prompt: fromStep('plan', 'data.video_prompts[0].prompt'),
  brand_assets: fromTrigger('brand_assets'),
  target_loudness: constant(-14),
  style: merge(fromBaseRun('plan', 'data.mood'), fromTrigger('overrides.mood')),
})
```

Each helper (`fromTrigger`, `fromStep`, `fromBaseRun`, `constant`, `merge`) returns a `FieldResolver` function `(ctx: RunContext) => unknown` that resolves at runtime. The `inputSelector` function composes them into a step-level resolver.

## Skill Runner: Complete Code Path

### Execution Lifecycle

`SkillRunnerService.execute()` manages the full lifecycle:

```
execute(skillId, input, options)
    │
    ├── 1. Get descriptor from catalog
    │       └── SkillCatalogService.getSkill(skillId, version)
    │
    ├── 2. Check for template_type
    │       ├── If LLM_JSON_GENERATION → executeTemplateSkill()
    │       └── If null → continue with handler path
    │
    ├── 3. Get handler from catalog
    │       └── SkillCatalogService.getHandler(skillId)
    │
    ├── 4. Create workspace (temporary directory)
    │       └── WorkspaceService.createWorkspace(runId)
    │
    ├── 5. Create execution context
    │       └── ExecutionContextService.createContext(descriptor, workspace, signal, options)
    │
    ├── 6. Validate input against input_schema
    │       └── SchemaValidatorService.validateInput(schema, input, skillId, version)
    │       └── Uses Ajv JSON Schema validator
    │
    ├── 7. Execute with timeout
    │       └── Promise.race([
    │             handler.execute(input, context),
    │             AbortController timeout
    │           ])
    │       └── Timeout from policy.max_runtime_sec
    │
    ├── 8. Validate output against output_schema
    │       └── SchemaValidatorService.validateOutput(schema, output, skillId, version)
    │
    ├── 9. Return SkillResult with debug timings
    │
    └── finally: Cleanup workspace
            └── WorkspaceService.cleanupWorkspace(workspaceDir)
```

**Timing instrumentation**: Every step is timed and included in the result:

```typescript
const timings = {
  total: 0,
  input_validation: 0,
  execution: 0,
  output_validation: 0,
  artifact_registration: 0,
};
```

### SkillResult Interface

Every skill returns a `SkillResult<T>`:

```typescript
interface SkillResult<T = unknown> {
  ok: boolean;                    // Success or failure
  data?: T;                       // Output data (on success)
  error?: string;                 // Error message (on failure)
  error_code?: string;            // Machine-readable error code
  artifacts: SkillArtifact[];     // Generated artifacts
  debug: SkillDebugInfo;          // Timing and provider call info
}

interface SkillArtifact {
  artifact_type: string;          // e.g., 'image/intro-frame', 'json/campaign-plan'
  uri: string;                    // File path or URL
  metadata?: Record<string, unknown>;
}

interface SkillDebugInfo {
  timings_ms: Record<string, number>;
  provider_calls?: Array<{
    provider: string;
    model: string;
    duration_ms: number;
    tokens?: { input: number; output: number };
  }>;
}
```

Helpers `skillSuccess()` and `skillFailure()` construct these consistently.

### Template Skill Execution (LLM Generation)

For template-based skills (those with `template_type: LLM_JSON_GENERATION`), the `LlmGenerationService` handles execution:

```
LlmGenerationService.generate(input, config)
    │
    ├── 1. Fetch prompt from PromptRegistryService
    │       └── getPrompt(promptId, promptVersion)
    │
    ├── 2. Render prompt with variables
    │       └── renderPrompt(promptId, version, variables)
    │       └── f-string substitution: {brief} → actual brief text
    │
    ├── 3. Resolve model parameters (priority order):
    │       input.context.model > config.model > prompt.modelDefaults.model > defaultModel
    │
    ├── 4. Build response format:
    │       ├── If model supports structured output → json_schema format
    │       └── Otherwise → json_object fallback
    │
    ├── 5. Call LLM with exponential backoff (max 3 attempts)
    │       └── callLlmWithBackoff(prompt, model, temperature, maxTokens, outputSchema)
    │       └── Backoff: 1s → 2s → 4s (capped at 8s)
    │
    ├── 6. Parse JSON response
    │
    ├── 7. Validate against output_schema
    │       ├── If valid → return success
    │       └── If invalid AND retryOnValidationFailure:
    │           ├── Build critique from validation errors
    │           ├── Re-render prompt with {previous_issues} and {suggestions}
    │           ├── Call LLM again with the enriched prompt
    │           └── Validate retry response
    │
    └── Return GenerationResult<T>
```

**Structured output support**: The service checks if the model supports `json_schema` response format. Models that support it get strict schema enforcement at the API level:

```typescript
const STRUCTURED_OUTPUT_MODELS = [
  'claude-sonnet-4.5', 'claude-opus-4', 'claude-sonnet-4',
  'gpt-4.1', 'gpt-4.1-mini', 'gpt-4o', 'gpt-4o-mini',
  'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.0-flash-lite',
  // ...
];
```

**Validation retry**: If the LLM response doesn't match the output schema, the service formats the validation errors as "critique" and asks the LLM to try again:

```typescript
// Build retry input with critique
const retryInput = {
  ...originalInput,
  critique: {
    issues: ['Field "theme.primary_color": must match pattern ^#[0-9A-Fa-f]{6}$'],
    suggestions: ['Please fix the validation errors and ensure the output matches the expected schema.'],
  },
};
```

The prompt is re-rendered with `{previous_issues}` and `{suggestions}` template variables populated from the critique.

## Skill Catalog Service: Handler Registration

The `SkillCatalogService` registers all handler instances at startup:

```typescript
// agent-platform/src/skills/services/skill-catalog.service.ts
private getHandlerDefinitions(): Array<{ skillId: string; create: () => SkillHandler }> {
  return [
    { skillId: 'campaign_plan_from_brief',   create: () => new CampaignPlanFromBriefHandler(this.configService) },
    { skillId: 'generate_intro_image',       create: () => new GenerateIntroImageHandler(this.configService, this.imageProviderRegistry) },
    { skillId: 'generate_bgm_track',         create: () => new GenerateBgmTrackHandler(this.configService, this.audioProviderRegistry) },
    { skillId: 'bundle_game_template',       create: () => new BundleGameTemplateHandler(
      this.configService, this.templateManifestLoader, this.templateConfigValidator,
      new GenerateThreejsCodeHandler(this.configService),
      new ValidateBundleHandler(this.configService),
    )},
    // ... 19 handlers total
  ];
}
```

Each handler receives only the dependencies it needs. Some handlers (like `BundleGameTemplateHandler`) compose other handlers internally.

### Descriptor Validation

Every skill YAML is validated for:
- Required fields: `skill_id`, `version`, `title`, `input_schema`, `output_schema`, `implementation`
- `skill_id` format: lowercase alphanumeric with underscores, starting with a letter
- `version`: valid semver
- `implementation.type`: must be `ts_function`, `http_call`, or `cli_command`
- `implementation.handler`: required for non-template skills
- For template skills: `template_config.prompt_id` (LLM_JSON_GENERATION) or `template_config.rubric_id` (LLM_REVIEW)

## Prompt Registry: How Prompts Are Loaded

### Directory Structure

```
agent-platform/prompts/
├── intelligence_plan/
│   └── 1.0.0.md              # Versioned prompt file
├── generate_copy/
│   └── 1.0.0.md
└── extract_theme_brief/
    └── 1.0.0.md
```

### Loading Process

```
PromptRegistryService.onModuleInit()
    │
    ├── TemplateLoaderService.loadAllPrompts()
    │   ├── Scan prompts/ directory for subdirectories
    │   ├── Each subdirectory is a prompt ID
    │   ├── Each .md file inside is a version
    │   ├── Parse optional YAML frontmatter for model defaults and variable schemas
    │   └── Store content as the prompt template text
    │
    ├── TemplateLoaderService.loadAllConfigs()
    │   └── Same pattern from configs/ directory
    │
    └── TemplateLoaderService.loadAllRubrics()
        └── Same pattern from rubrics/ directory
```

### In-Memory State

```typescript
interface PromptRegistryState {
  prompts: Map<string, Map<string, LoadedPromptTemplate>>;    // promptId → version → template
  configs: Map<string, Map<string, LoadedConfigTemplate>>;
  rubrics: Map<string, Map<string, LoadedReviewRubric>>;
  promptVersions: Map<string, string[]>;                       // promptId → sorted versions (desc)
  configVersions: Map<string, string[]>;
  rubricVersions: Map<string, string[]>;
}
```

Versions are sorted descending so the latest version is always at index 0. When a skill requests a prompt without specifying a version, it gets the latest.

### Rendering

`TemplateRendererService` performs simple f-string substitution:

```
Template: "Given the following brief:\n{brief}\n\nGenerate a plan."
Variables: { brief: "Summer shoe campaign for millennials" }
Result:   "Given the following brief:\nSummer shoe campaign for millennials\n\nGenerate a plan."
```

## SkillHandler Interface

Every handler-based skill implements this interface:

```typescript
// agent-platform/src/skills/interfaces/skill-handler.interface.ts
export interface SkillHandler<TInput = unknown, TOutput = unknown> {
  execute(input: TInput, context: SkillExecutionContext): Promise<SkillResult<TOutput>>;
}

export interface SkillExecutionContext {
  tenantId: string;        // Organization ID for multi-tenancy
  executionId: string;     // Unique ID for this execution
  skillId: string;         // Which skill is being executed
  provider?: string;       // Optional provider override
}
```

The context is intentionally minimal — handlers get the tenant, a trace ID, and an optional provider preference. Heavy dependencies (LLM client, storage, providers) are injected at handler construction time, not per-execution.

## Error Handling

### Error Codes

The system uses machine-readable error codes at every level:

**Skill Runner errors**:
- `SKILL_NOT_FOUND` — Skill ID not in catalog
- `VERSION_NOT_FOUND` — Requested version not available
- `HANDLER_NOT_FOUND` — No handler registered for skill
- `INPUT_VALIDATION_FAILED` — Input doesn't match input_schema
- `OUTPUT_VALIDATION_FAILED` — Output doesn't match output_schema
- `TIMEOUT` — Execution exceeded policy.max_runtime_sec
- `EXECUTION_ERROR` — Unhandled error during execution

**LLM Generation errors**:
- `PROMPT_NOT_FOUND` — Prompt ID not in registry
- `PROMPT_RENDER_FAILED` — Variable substitution failed
- `LLM_CALL_FAILED` — LLM API call failed after retries
- `JSON_PARSE_FAILED` — Response isn't valid JSON
- `GENERATION_FAILED` — Output schema validation failed after retry

**Run Engine errors**:
- `INPUT_SELECTOR_ERROR` — Failed to resolve step inputs
- `STEP_EXECUTION_FAILED` — A step failed during workflow execution
- `ORCHESTRATION_ERROR` — Top-level workflow execution error
- `MAX_RETRIES` — Step exceeded retry attempts

### Exception Classes

```
SkillException (base)
├── SkillExecutionException      — General execution failure
├── SkillTimeoutException        — Timeout exceeded
├── SkillInputValidationException
├── SkillOutputValidationException
└── SkillPolicyViolationException — Network/fs policy violation
```

## Security Measures

### SSRF Prevention

Handlers that download from external URLs validate domains:

```typescript
// GenerateIntroImageHandler
private readonly ALLOWED_IMAGE_DOMAINS = [
  'oaidalleapiprodscus.blob.core.windows.net',
  'stability.ai',
  'api.stability.ai',
  'storage.googleapis.com',
  'replicate.delivery',
];

private validateImageUrl(url: string): void {
  const parsed = new URL(url);
  const isAllowed = this.ALLOWED_IMAGE_DOMAINS.some(
    domain => parsed.hostname === domain || parsed.hostname.endsWith(`.${domain}`)
  );
  if (!isAllowed) throw new Error(`Image URL from untrusted domain: ${parsed.hostname}`);
}
```

### Path Traversal Prevention

- `AssembleCampaignManifestHandler` validates local paths resolve under `SKILLS_OUTPUT_DIR`
- `StorageService` in common validates all paths before writing

### Skill Policies

Each skill YAML declares a security policy:

```yaml
policy:
  max_runtime_sec: 180            # Hard timeout
  network: allowlist              # Only allowed hosts can be contacted
  allowed_hosts:
    - "localhost:4000"            # LiteLLM proxy only
    - "api.stability.ai"
  fs:
    read_prefixes: ["/tmp/skills/"]
    write_prefixes: ["/tmp/skills/output/"]
```

### Workspace Isolation

Each skill execution gets a temporary workspace directory. The `WorkspaceService` creates it before execution and cleans it up after (in the `finally` block), preventing file leaks between executions.
