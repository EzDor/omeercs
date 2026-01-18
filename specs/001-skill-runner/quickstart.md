# Quickstart: Skill Runner

**Feature**: Skill Runner | **Date**: 2026-01-18

## Overview

This guide covers the essential steps to implement and use the Skill Runner system.

---

## Prerequisites

- Node.js 20.x
- pnpm 8.x
- Docker (for PostgreSQL, Valkey)
- Running infrastructure: `docker compose up -d`

---

## 1. Install Dependencies

```bash
# Add Ajv for JSON Schema validation to agent-platform
cd agent-platform
pnpm add ajv ajv-formats

# Build dependent packages
cd ..
pnpm --filter @agentic-template/dto build
pnpm --filter @agentic-template/common build
pnpm --filter dao build
```

---

## 2. Run Database Migration

```bash
# Generate migration (after creating ArtifactEntity)
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/agentic_template \
  pnpm migration:generate dao/src/migrations/CreateArtifactTable

# Run migration
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/agentic_template \
  pnpm migration:run
```

---

## 3. Create a Skill Descriptor

Create a YAML file in `skills/catalog/`:

```yaml
# skills/catalog/hello_world.yaml
skill_id: hello_world
version: "1.0.0"
title: Hello World Skill
description: A simple skill for testing the runner.

input_schema:
  type: object
  required: [name]
  properties:
    name:
      type: string
      minLength: 1
      maxLength: 100

output_schema:
  type: object
  required: [greeting]
  properties:
    greeting:
      type: string

implementation:
  type: ts_function
  handler: handlers/hello-world.handler

policy:
  timeout_ms: 5000
```

Add to catalog index:

```yaml
# skills/catalog/index.yaml
skills:
  - hello_world.yaml
  # ... other skills
```

---

## 4. Implement the Handler

```typescript
// agent-platform/src/skills/handlers/hello-world.handler.ts
import { Injectable, Logger } from '@nestjs/common';
import { SkillHandler } from '../interfaces/skill-handler.interface';
import { SkillResult, skillSuccess } from '../interfaces/skill-result.interface';
import { EnhancedSkillExecutionContext } from '../skill-runner/interfaces/execution-context.interface';

interface HelloWorldInput {
  name: string;
}

interface HelloWorldOutput {
  greeting: string;
}

@Injectable()
export class HelloWorldHandler implements SkillHandler<HelloWorldInput, HelloWorldOutput> {
  private readonly logger = new Logger(HelloWorldHandler.name);

  async execute(
    input: HelloWorldInput,
    context: EnhancedSkillExecutionContext,
  ): Promise<SkillResult<HelloWorldOutput>> {
    context.logger.log(`Executing hello_world for: ${input.name}`);

    const greeting = `Hello, ${input.name}!`;

    return skillSuccess(
      { greeting },
      [], // No artifacts
      {
        run_id: context.runId,
        skill_id: context.skillId,
        version: '1.0.0',
        duration_ms: 0,
        timing: {
          input_validation_ms: 0,
          execution_ms: 0,
          output_validation_ms: 0,
          artifact_registration_ms: 0,
        },
      },
    );
  }
}
```

---

## 5. Execute a Skill

```typescript
// Using SkillRunnerService
import { SkillRunnerService } from './skills/skill-runner/skill-runner.service';

@Injectable()
export class MyService {
  constructor(private readonly skillRunner: SkillRunnerService) {}

  async runSkill() {
    const result = await this.skillRunner.execute('hello_world', {
      name: 'World',
    });

    if (result.ok) {
      console.log(result.data.greeting); // "Hello, World!"
    } else {
      console.error(result.error, result.error_code);
    }
  }
}
```

---

## 6. Execute with Version

```typescript
// Execute specific version
const result = await this.skillRunner.execute(
  'generate_bgm_track',
  { mood: 'happy', genre: 'electronic', duration_seconds: 30 },
  { version: '1.0.0' },
);
```

---

## 7. Access Artifacts

```typescript
// Get artifacts from result
if (result.ok) {
  for (const artifact of result.artifacts) {
    console.log(`Artifact: ${artifact.type}`);
    console.log(`  URI: ${artifact.uri}`);
    console.log(`  Hash: ${artifact.contentHash}`);
    console.log(`  Size: ${artifact.sizeBytes} bytes`);
  }
}

// Query artifact registry
import { ArtifactRegistryService } from './skills/artifact-registry/artifact-registry.service';

const artifacts = await this.artifactRegistry.findByRunId(result.debug.run_id);
```

---

## 8. Handle Errors

```typescript
const result = await this.skillRunner.execute('some_skill', input);

if (!result.ok) {
  switch (result.error_code) {
    case 'INPUT_VALIDATION_FAILED':
      // Handle invalid input
      console.log('Input errors:', result.debug);
      break;
    case 'OUTPUT_VALIDATION_FAILED':
      // Skill produced invalid output
      break;
    case 'TIMEOUT':
      // Execution took too long
      break;
    case 'POLICY_VIOLATION':
      // Skill violated its policy constraints
      break;
    case 'EXECUTION_ERROR':
      // Handler threw an error
      console.error(result.error);
      break;
  }
}
```

---

## 9. Environment Configuration

```bash
# .env.local
SKILLS_CATALOG_PATH=/path/to/skills/catalog
SKILLS_WORKSPACE_DIR=/tmp/skill-workspaces
SKILLS_OUTPUT_DIR=/tmp/skills/output

# LLM Provider (for skills that use AI)
LITELLM_BASE_URL=http://localhost:4000
LITELLM_MASTER_KEY=sk-1234
LITELLM_MODEL=claude-sonnet
```

---

## 10. Testing

```bash
# Run unit tests
pnpm --filter agent-platform test -- --testPathPattern=skill-runner

# Run integration tests
pnpm --filter agent-platform test -- --testPathPattern=integration
```

Example test:

```typescript
// skill-runner.service.spec.ts
describe('SkillRunnerService', () => {
  let service: SkillRunnerService;
  let catalogService: jest.Mocked<SkillCatalogService>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        SkillRunnerService,
        {
          provide: SkillCatalogService,
          useValue: { getSkill: jest.fn(), executeSkill: jest.fn() },
        },
        // ... other mocks
      ],
    }).compile();

    service = module.get(SkillRunnerService);
    catalogService = module.get(SkillCatalogService);
  });

  it('should execute a skill successfully', async () => {
    catalogService.getSkill.mockResolvedValue(mockDescriptor);
    // ... test implementation
  });

  it('should return validation error for invalid input', async () => {
    // ... test implementation
  });
});
```

---

## Common Issues

### Skill Not Found

```
Error: Skill 'my_skill' not found in catalog
```

- Check that the YAML file exists in `skills/catalog/`
- Verify it's listed in `skills/catalog/index.yaml`
- Ensure `SKILLS_CATALOG_PATH` environment variable is set correctly

### Input Validation Failed

```
Error: Input validation failed
error_code: INPUT_VALIDATION_FAILED
```

- Check the skill's `input_schema` in the YAML descriptor
- Ensure input matches the JSON Schema requirements
- Look at `result.debug` for specific field errors

### Timeout

```
Error: Skill 'slow_skill' timed out after 60000ms
error_code: TIMEOUT
```

- Increase `policy.timeout_ms` in the skill descriptor
- Optimize the skill handler for faster execution
- Consider breaking into smaller operations

---

## Next Steps

1. Read `data-model.md` for entity details
2. Review `contracts/skill-runner.openapi.yaml` for API specification
3. Run `/speckit.tasks` to generate implementation tasks
