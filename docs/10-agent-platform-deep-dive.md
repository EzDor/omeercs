# Agent Platform Deep Dive

## Overview

The agent platform (`agent-platform/`) is the worker service that does all the heavy computation. It receives jobs from BullMQ queues and executes AI workflows — orchestrating LLM calls, media generation, game bundling, and quality validation. It never receives direct HTTP requests from the frontend.

This document walks through every subsystem in detail, following the code paths from job arrival to final output.

## Module Structure

```
agent-platform/src/
├── workflows/campaign/            # Campaign workflow execution system
│   ├── interfaces/                # Shared state annotation (CampaignWorkflowState)
│   ├── services/                  # SkillNodeService (retry-wrapped skill execution)
│   ├── processors/                # CampaignRunProcessor (BullMQ job processor)
│   ├── *.workflow.ts              # Workflow classes (each builds a LangGraph StateGraph)
│   └── campaign-workflows.module.ts
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

3. NestJS dependency injection wires up workflow classes:
   ├── SkillNodeService receives SkillRunnerService
   ├── Each workflow class (CampaignBuildWorkflow, etc.) receives SkillNodeService
   ├── CampaignRunProcessor receives all workflow class instances
   └── Result: CampaignRunProcessor has a Map of workflow names to workflow classes

4. BullMQ processors start listening:
   ├── CampaignRunProcessor → RUN_ORCHESTRATION queue
   └── WorkflowQueueProcessor → WORKFLOW_ORCHESTRATION queue
```

## Campaign Workflows: Complete Code Path

### 1. Job Arrival

When a job arrives on the `RUN_ORCHESTRATION` queue, `CampaignRunProcessor.process()` is called:

```typescript
// agent-platform/src/workflows/campaign/processors/campaign-run.processor.ts
@Processor(QueueNames.RUN_ORCHESTRATION, { concurrency: 1 })
export class CampaignRunProcessor extends WorkerHost {
  private readonly workflowMap: Map<string, CampaignWorkflow>;

  constructor(
    @InjectRepository(Run) private readonly runRepository: Repository<Run>,
    private readonly workflowEngine: WorkflowEngineService,
    private readonly tenantClsService: TenantClsService,
    private readonly campaignStatusService: CampaignStatusService,
    campaignBuild: CampaignBuildWorkflow,
    campaignBuildMinimal: CampaignBuildMinimalWorkflow,
    // ... all workflow classes injected via NestJS DI
  ) {
    super();
    this.workflowMap = new Map([
      [constants.CAMPAIGN_BUILD, campaignBuild],
      [constants.CAMPAIGN_BUILD_MINIMAL, campaignBuildMinimal],
      // ... one entry per workflow
    ]);
  }

  async process(job: Job<RunOrchestrationJobData>): Promise<void> {
    const { runId, tenantId } = job.data;

    await this.tenantClsService.runWithTenant(tenantId, undefined, async () => {
      // 1. Fetch the Run entity from the database
      const run = await this.runRepository.findOne({ where: { id: runId, tenantId } });

      // 2. Look up the workflow class by name
      const workflow = this.workflowMap.get(run.workflowName);

      // 3. Update Run status to 'running'
      await this.updateRunStatus(run, 'running');

      // 4. Load base run outputs (for update workflows)
      const baseRunOutputs = await this.loadBaseRunOutputs(run.baseRunId, tenantId);

      // 5. Build the LangGraph StateGraph
      const graph = workflow.createGraph();

      // 6. Execute via WorkflowEngineService (with checkpointing)
      const result = await this.workflowEngine.executeWorkflow(
        graph, initialState, runId, tenantId, `campaign:${run.workflowName}`
      );

      // 7. Check results and update statuses
      const finalState = result as CampaignWorkflowStateType;
      const failedSteps = this.findFailedSteps(finalState.stepResults);

      if (finalState.error || failedSteps.length > 0) {
        await this.updateRunStatus(run, 'failed', { ... });
        await this.updateCampaignStatus(campaignId, 'failed', undefined, runId);
      } else {
        await this.updateRunStatus(run, 'completed');
        await this.updateCampaignStatus(campaignId, 'live', bundleUrl, runId);
      }
    });
  }
}
```

**Key detail**: Concurrency is set to 1 (`{ concurrency: 1 }`). Only one workflow runs at a time per worker instance. This prevents resource contention when multiple steps within a workflow run in parallel.

### 2. Graph Construction

Each workflow class builds its LangGraph `StateGraph` directly in `createGraph()`. Nodes are created via `SkillNodeService.createNode()`, and edges (including conditional edges for error handling) are defined inline:

```typescript
// agent-platform/src/workflows/campaign/campaign-build-minimal.workflow.ts
@Injectable()
export class CampaignBuildMinimalWorkflow {
  constructor(private readonly skillNode: SkillNodeService) {}

  createGraph(): StateGraph<CampaignWorkflowStateType> {
    const graph = new StateGraph(CampaignWorkflowState)
      .addNode('game_config',
        this.skillNode.createNode('game_config', 'game_config_from_template', (s) => ({
          template_id: s.triggerPayload.template_id,
          theme: s.triggerPayload.theme,
        })),
      )
      .addNode('bgm',
        this.skillNode.createNode('bgm', 'generate_bgm_track', (s) => ({
          style: (s.triggerPayload.audio as Record<string, any>)?.style,
        }), { maxAttempts: 2, backoffMs: 2000 }),
      )
      // ... more nodes

    graph
      .addEdge('__start__', 'game_config')
      .addEdge('__start__', 'bgm')
      .addConditionalEdges('game_config', (s) => s.error ? '__end__' : 'continue',
        { continue: 'bundle_game', __end__: '__end__' })
      // ... more edges

    return graph;
  }
}
```

**The state annotation** uses LangGraph's `Annotation.Root` with merge reducers. This is critical because parallel nodes produce partial state updates that must be merged:

```typescript
// agent-platform/src/workflows/campaign/interfaces/campaign-workflow-state.interface.ts
export const CampaignWorkflowState = Annotation.Root({
  runId: Annotation<string>({ reducer: (_current, update) => update }),
  tenantId: Annotation<string>({ reducer: (_current, update) => update }),
  triggerPayload: Annotation<Record<string, unknown>>({ reducer: (_current, update) => update }),
  stepResults: Annotation<Record<string, SkillStepResult>>({
    reducer: mergeStepResults,    // Merges results from parallel branches
    default: () => ({}),
  }),
  baseRunOutputs: Annotation<Record<string, Record<string, unknown>>>({
    reducer: (_current, update) => update,
  }),
  error: Annotation<string | null>({ reducer: (_current, update) => update }),
});
```

The `mergeStepResults` reducer merges step results from parallel branches -- when `intro_image` and `bgm` complete in parallel, their results are merged into the shared `stepResults` record.

### 3. Step Execution

Each node in the graph is a closure created by `SkillNodeService.createNode()`. Here's the complete flow:

```typescript
// agent-platform/src/workflows/campaign/services/skill-node.service.ts
createNode(stepId: string, skillId: string, inputFn: InputFn, retry: RetryConfig = DEFAULT_RETRY): NodeFn {
  return async (state: CampaignWorkflowStateType): Promise<Partial<CampaignWorkflowStateType>> => {
    // 1. Resolve inputs via the provided input function
    let input: Record<string, unknown>;
    try {
      input = inputFn(state);
    } catch (error) {
      return this.buildFailure(stepId, startTime, error.message);
    }

    // 2. Execute with retry (exponential backoff)
    const result = await this.executeWithRetry(stepId, skillId, input, retry);

    // 3. On success: return state update with step result
    if (result.ok) {
      const stepResult: SkillStepResult = { ok: true, data: result.data, artifactIds, durationMs };
      return { stepResults: { [stepId]: stepResult } };
    }

    // 4. On failure: return state update with error (triggers conditional edge short-circuit)
    return this.buildFailure(stepId, startTime, result.error);
  };
}
```

**Retry logic** uses exponential backoff:

```typescript
private async executeWithRetry(stepId, skillId, input, retry): Promise<SkillResult> {
  for (let attempt = 1; attempt <= retry.maxAttempts; attempt++) {
    const result = await this.skillRunner.execute(skillId, input);
    if (result.ok) return result;

    if (attempt < retry.maxAttempts) {
      const delay = retry.backoffMs * Math.pow(2, attempt - 1);  // Exponential backoff
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}
```

### 4. Input Resolution

Inputs are resolved inline via lambda functions defined in each workflow class. Each input function receives the current `CampaignWorkflowStateType` and returns the input object for the skill:

```typescript
// From trigger payload:
(s) => ({ template_id: s.triggerPayload.template_id })

// From a previous step's output:
(s) => ({ game_config: s.stepResults['game_config']?.data })

// From base run outputs (for update workflows):
(s) => ({ plan_data: s.baseRunOutputs['plan']?.data })

// Mixed sources:
(s) => ({
  prompt: s.stepResults['plan']?.data?.video_prompts?.[0]?.prompt,
  brand_assets: s.triggerPayload.brand_assets,
})
```

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
