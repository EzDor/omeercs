# Quickstart: Campaign Context Model

**Feature**: 008-campaign-context
**Date**: 2026-02-03

## Overview

The Campaign Context Model provides a runtime contract for passing data between workflow steps. Use this guide to understand how to work with the context in workflow implementations.

## Prerequisites

- Existing `dto`, `common`, `dao` packages built
- Access to `agent-platform` service
- Database with `runs` table (Run entity)

## Usage Patterns

### 1. Creating a New Context

When a workflow starts, create a new context:

```typescript
import { CampaignContextService } from '@agentic-template/common';

const context = contextService.create({
  campaignId: 'camp_abc123',
  runId: run.id,
  workflowName: 'create_campaign',
  trigger: {
    type: 'api',
    timestamp: new Date().toISOString(),
    initiatedBy: userId,
    payload: { prompt: 'Create a mobile game ad' }
  }
});
```

### 2. Attaching Step Results

After each step completes, attach its artifacts:

```typescript
const result = contextService.attachStepResult(context, {
  stepId: 'generate_plan',
  artifacts: [
    {
      type: 'plan',
      uri: 's3://bucket/runs/run_456/plan.json',
      hash: 'sha256:abc123...'
    }
  ]
});

if (!result.ok) {
  // Handle error: INVALID_ARTIFACT_TYPE, CONTEXT_CAPACITY_EXCEEDED, etc.
  throw new Error(result.error.message);
}

context = result.data;
// context.refs.planArtifactId is now set automatically
```

### 3. Resolving Artifacts for Next Step

Input selectors use the resolver to get artifacts:

```typescript
import { ContextResolverService } from '@agentic-template/common';

// Get artifact by logical name
const planArtifact = resolver.getRef(context, 'plan');
if (!planArtifact) {
  throw new Error('Plan artifact not available');
}

console.log(planArtifact.uri);  // s3://bucket/runs/run_456/plan.json
console.log(planArtifact.type); // 'plan'

// Check multiple refs
const requiredRefs = ['plan', 'game_config'];
for (const refName of requiredRefs) {
  if (!resolver.hasRef(context, refName)) {
    throw new Error(`Missing required artifact: ${refName}`);
  }
}
```

### 4. Loading Context from Previous Run

For update workflows, load artifacts from a base run:

```typescript
const result = await contextService.loadFromRun(
  baseRunId,
  tenantId
);

if (!result.ok) {
  if (result.error.code === 'BASE_RUN_NOT_FOUND') {
    throw new Error(`Base run ${baseRunId} not found`);
  }
  throw new Error(result.error.message);
}

const context = result.data;
// Context now has all artifacts from base run
// Only re-run steps that need updating
```

### 5. Working with Computed Data

Store input hashes for caching:

```typescript
context = contextService.storeInputHash(context, {
  stepId: 'generate_intro_video',
  inputHash: 'sha256:input123...'
});

// Later, check for cache hit
const cachedHash = context.computed?.inputHashesByStep['generate_intro_video'];
if (cachedHash === currentInputHash) {
  // Skip step, use cached result
}
```

Store quality check results:

```typescript
context = contextService.storeQualityCheck(context, {
  artifactId: planArtifactId,
  checkType: 'content_validation',
  status: 'passed',
  message: 'All required sections present'
});

// Review quality checks
const checks = context.computed?.qualityChecks ?? [];
const failed = checks.filter(c => c.status === 'failed');
```

## Integration with Workflow Engine

The context integrates with the existing workflow engine:

```typescript
// In workflow state definition
interface CampaignWorkflowState {
  context: CampaignContext;
  currentStep: string;
  error?: string;
}

// In workflow step
async function generatePlanStep(state: CampaignWorkflowState) {
  const { context } = state;

  // Execute skill
  const planResult = await skillRunner.execute('plan_generator', { ... });

  // Attach artifact to context
  const updated = contextService.attachStepResult(context, {
    stepId: 'generate_plan',
    artifacts: [planResult.artifact]
  });

  return {
    ...state,
    context: updated.ok ? updated.data : state.context,
    error: updated.ok ? undefined : updated.error.message
  };
}
```

## Error Handling

Handle context errors appropriately:

```typescript
import { ContextErrorCodes } from '@agentic-template/dto';

const result = contextService.attachStepResult(context, params);

if (!result.ok) {
  switch (result.error.code) {
    case ContextErrorCodes.INVALID_ARTIFACT_TYPE:
      // Unknown artifact type - check registry config
      break;
    case ContextErrorCodes.CONTEXT_CAPACITY_EXCEEDED:
      // Hit 50 artifact limit - workflow too complex
      break;
    case ContextErrorCodes.DUPLICATE_ARTIFACT_ID:
      // UUID collision (extremely rare)
      break;
    default:
      // Unexpected error
      throw new Error(result.error.message);
  }
}
```

## File Locations (After Implementation)

| Component | Path |
|-----------|------|
| Interfaces | `dto/src/campaign-context/` |
| Context Service | `common/src/campaign-context/campaign-context.service.ts` |
| Resolver Service | `common/src/campaign-context/context-resolver.service.ts` |
| Type Registry | `common/src/campaign-context/reference-type-registry.service.ts` |
| Run Entity Update | `dao/src/entities/run.entity.ts` |
| Migration | `dao/src/migrations/AddContextColumnToRuns.ts` |

## Testing

Test context operations independently:

```typescript
describe('CampaignContextService', () => {
  it('should create empty context', () => {
    const context = service.create({
      campaignId: 'camp_1',
      runId: 'run_1',
      workflowName: 'test',
      trigger: { type: 'manual', timestamp: '2026-02-03T00:00:00Z' }
    });

    expect(context.refs).toEqual({});
    expect(context.artifacts).toEqual({});
  });

  it('should auto-update refs when attaching artifacts', () => {
    const result = service.attachStepResult(context, {
      stepId: 'step_1',
      artifacts: [{ type: 'plan', uri: 'test://uri', hash: 'abc' }]
    });

    expect(result.ok).toBe(true);
    expect(result.data.refs.planArtifactId).toBeDefined();
  });

  it('should resolve artifact by ref name', () => {
    const artifact = resolver.getRef(contextWithPlan, 'plan');

    expect(artifact).toBeDefined();
    expect(artifact?.type).toBe('plan');
  });
});
```

## Next Steps

1. Run `/speckit.tasks` to generate implementation tasks
2. Implement in order: interfaces → services → migration → tests
3. Integrate with workflow orchestrator
