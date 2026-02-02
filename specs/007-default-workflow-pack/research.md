# Research: Default Workflow Pack

**Feature**: 007-default-workflow-pack
**Date**: 2026-02-02
**Purpose**: Resolve technical unknowns and document design decisions

---

## 1. Input Selector Syntax Design

### Decision
Adopt a JSON-based declarative syntax with explicit source and operation fields, parsed at registration time into TypeScript functions.

### Rationale
The spec requires declarative input mapping without embedding complex JS logic. A structured JSON format is:
- Validatable via JSON Schema at registration
- Parseable into TypeScript functions without eval()
- Human-readable in YAML workflow files
- Extensible for future operations

### YAML Syntax

```yaml
input_selector:
  campaign_brief:
    source: trigger
    path: brief
  style_from_plan:
    source: step_output
    step_id: plan
    path: data.style_guide
  prompt_id:
    source: registry
    type: prompt
    id: campaign_plan
    version: "1.0.0"
  default_duration:
    source: constants
    value: 30
```

### Supported Operations

| Operation | Syntax | Description |
|-----------|--------|-------------|
| `get(path)` | `{ source: "trigger", path: "brief.constraints.duration" }` | JSONPath-like lookup |
| `merge` | `{ operation: "merge", inputs: [...] }` | Combine multiple objects |
| `pick` | `{ operation: "pick", input: {...}, keys: ["a", "b"] }` | Select specific keys |
| `literal` | `{ source: "constants", value: 30 }` | Fixed value |

### Alternatives Considered

1. **String expression language** (e.g., `"trigger.brief"`) - Rejected: requires custom parser, less explicit, harder to validate
2. **JavaScript functions in YAML** - Rejected: security risk, violates declarative principle
3. **Template strings** (e.g., `${trigger.brief}`) - Rejected: mixing with f-string templates could cause confusion

---

## 2. Workflow YAML Schema Design

### Decision
Define a JSON Schema for workflow YAML validation, closely mirroring the existing `WorkflowSpec` and `StepSpec` TypeScript interfaces.

### Schema Structure

```json
{
  "workflow_name": "campaign.build.v1",
  "version": "1.0.0",
  "description": "End-to-end campaign build workflow",
  "steps": [
    {
      "step_id": "plan",
      "skill_id": "campaign_plan_from_brief",
      "depends_on": [],
      "input_selector": { ... },
      "cache_policy": { "enabled": true, "scope": "run_only" },
      "retry_policy": { "max_attempts": 2, "backoff_ms": 1000 }
    }
  ]
}
```

### Validation Rules
1. `workflow_name` must be lowercase alphanumeric with dots/underscores
2. `version` must be valid semver
3. `step_id` must be unique within workflow
4. `skill_id` must reference a registered skill (validated at load time)
5. `depends_on` must reference valid step_ids within same workflow
6. No cycles in dependency graph (validated via existing DependencyGraphService)

### Rationale
- Reuses existing patterns from SkillCatalogService
- Fail-fast validation ensures broken workflows never reach runtime
- JSON Schema enables IDE support for workflow authoring

---

## 3. Base Run Reference Handling (Update Workflows)

### Decision
Update workflows receive `base_run_id` in trigger payload. The input selector system resolves artifacts and step outputs from the base run transparently.

### Implementation Approach

```yaml
# In update workflow input_selector:
intro_image_url:
  source: base_run
  step_id: intro_image
  path: artifacts[0].url

plan_data:
  source: base_run
  step_id: plan
  path: data
```

### Resolution Flow
1. Trigger payload includes `base_run_id`
2. WorkflowYamlLoaderService detects `source: base_run` selectors
3. At runtime, CachedStepExecutorService fetches base run step outputs
4. Base run artifacts are accessible via `RunContext.baseRunOutputs` (new field)

### Validation Rules
1. Base run must exist and be in `completed` status
2. Base run must be for same campaign_id (extracted from trigger)
3. Referenced step_id must exist in base run
4. Optimistic locking: reject if another run completed after base_run_id

### Rationale
- Explicit `source: base_run` makes update workflow intent clear
- Validation at execution time (not registration) because base runs are dynamic
- Follows spec requirement for stale reference detection

---

## 4. Workflow Loading Pattern

### Decision
Follow SkillCatalogService pattern: load from `agent-platform/workflows/` directory via OnModuleInit, register with WorkflowRegistryService.

### Directory Structure

```
agent-platform/workflows/
├── index.yaml           # Master index with status (active/deprecated)
├── campaign.build.v1.yaml
├── campaign.update_audio.v1.yaml
├── campaign.update_intro.v1.yaml
├── campaign.update_outcome.v1.yaml
├── campaign.update_game_config.v1.yaml
└── campaign.replace_3d_asset.v1.yaml
```

### Index File Format

```yaml
version: "1.0.0"
updated_at: "2026-02-02T00:00:00Z"
workflows:
  - workflow_name: campaign.build
    version: "1.0.0"
    status: active
  - workflow_name: campaign.update_audio
    version: "1.0.0"
    status: active
  # ...
```

### Rationale
- Consistent with existing SkillCatalogService pattern
- Index file enables selective loading and status management
- File-per-workflow enables independent versioning

---

## 5. Input Selector Compilation Strategy

### Decision
Compile YAML input selectors to TypeScript functions at registration time, not runtime.

### Compilation Flow

```typescript
// At registration time:
const yamlSelector = { source: "trigger", path: "brief.duration" };
const compiledFn = (ctx: RunContext) => get(ctx.triggerPayload, "brief.duration");

// Store compiled function in StepSpec
const stepSpec: StepSpec = {
  stepId: "plan",
  skillId: "campaign_plan_from_brief",
  inputSelector: compiledFn,  // Already a function
  // ...
};
```

### Benefits
1. Zero runtime parsing overhead
2. Type errors caught at registration
3. Existing RunEngine/CachedStepExecutor unchanged
4. Input selector resolution remains <10ms target

### Rationale
The existing `StepSpec.inputSelector` is already `(ctx: RunContext) => Record<string, unknown>`. Compiling YAML to this function at load time maintains compatibility with existing infrastructure.

---

## 6. Skill Reference Validation

### Decision
Validate all `skill_id` references at workflow registration time (fail-fast).

### Implementation

```typescript
// In WorkflowYamlLoaderService
for (const step of workflow.steps) {
  if (!this.skillCatalogService.hasSkill(step.skill_id)) {
    throw new Error(`Workflow '${workflow.workflow_name}' references unknown skill: ${step.skill_id}`);
  }
}
```

### Dependency Order
Ensure SkillCatalogService initializes before WorkflowYamlLoaderService:

```typescript
@Module({
  imports: [SkillsModule],  // Ensures skills loaded first
  providers: [WorkflowYamlLoaderService, ...],
})
export class RunEngineModule {}
```

### Rationale
- Matches spec requirement FR-003 (skill_id validation at load time)
- Prevents runtime failures due to missing skills
- Consistent with skill catalog's own validation approach

---

## 7. RunContext Extension for Base Runs

### Decision
Extend `RunContext` interface to include base run data for update workflows.

### Interface Change

```typescript
// dto/src/run-engine/run-context.dto.ts
export interface RunContext {
  runId: string;
  tenantId: string;
  workflowName: string;
  triggerPayload: Record<string, unknown>;
  stepOutputs: Map<string, StepOutput>;
  artifacts: Map<string, string[]>;

  // NEW: For update workflows
  baseRunId?: string;
  baseRunOutputs?: Map<string, StepOutput>;
  baseRunArtifacts?: Map<string, string[]>;
}
```

### Population Flow
1. If `triggerPayload.base_run_id` exists, RunEngineService fetches base run data
2. Populates `baseRunOutputs` and `baseRunArtifacts` before workflow execution
3. Input selector interpreter uses these fields for `source: base_run` selectors

### Rationale
- Keeps RunContext as the single source of truth for step inputs
- Minimal change to existing infrastructure
- Clear separation between current run and base run data

---

## Summary

| Topic | Decision | Key Benefit |
|-------|----------|-------------|
| Input Selector Syntax | JSON-based declarative with explicit source/path | Validatable, secure, extensible |
| Workflow YAML Schema | JSON Schema mirroring TypeScript interfaces | IDE support, fail-fast validation |
| Base Run Handling | New `source: base_run` selector type | Explicit intent, validation at execution |
| Loading Pattern | SkillCatalogService pattern with index.yaml | Consistent, manageable, versioned |
| Selector Compilation | Compile to functions at registration | Zero runtime overhead |
| Skill Validation | Fail-fast at registration | Prevents runtime failures |
| RunContext Extension | Add baseRunOutputs/baseRunArtifacts | Single source of truth |
