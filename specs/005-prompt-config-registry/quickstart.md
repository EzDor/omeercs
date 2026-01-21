# Quickstart: Prompt & Config Registry

**Feature**: 005-prompt-config-registry
**Estimated Setup Time**: 15 minutes

## Prerequisites

- Node.js 20.x installed
- pnpm installed (`npm install -g pnpm`)
- Repository cloned and dependencies installed (`pnpm install`)
- agent-platform service running (`pnpm --filter agent-platform dev`)

## Step 1: Create Your First Prompt Template

Create a prompt template file at `agent-platform/prompts/hello_world/1.0.0.md`:

```markdown
---
prompt_id: hello_world
version: 1.0.0
description: A simple greeting prompt for testing the registry
vars_schema:
  type: object
  required:
    - name
  properties:
    name:
      type: string
      description: The name to greet
    language:
      type: string
      default: English
      enum: [English, Spanish, French]
model_defaults:
  model: gemini/gemini-2.0-flash
  temperature: 0.7
---

Hello! Please greet {{name}} in {{language}}.

Be warm and friendly in your greeting.
```

## Step 2: Create Directory Structure

```bash
# Navigate to agent-platform
cd agent-platform

# Create template directories
mkdir -p prompts/hello_world
mkdir -p configs
mkdir -p rubrics

# Copy your template
# (already created in Step 1)
```

## Step 3: Restart the Service

The registry loads templates at startup, so restart the agent-platform:

```bash
# Stop the running service (Ctrl+C)
# Then restart
pnpm --filter agent-platform dev
```

You should see logs indicating templates were loaded:
```
[PromptRegistry] Loaded 1 prompt template(s)
[PromptRegistry]   - hello_world: 1 version(s)
```

## Step 4: Use in a Skill

In your skill handler, access the registry via the execution context:

```typescript
import { ExecutionContext } from '../interfaces/execution-context.interface';

export async function execute(
  input: { userName: string },
  ctx: ExecutionContext,
): Promise<{ greeting: string }> {
  // Render the prompt with variables
  const promptResult = ctx.promptRegistry.renderPrompt('hello_world', '1.0.0', {
    name: input.userName,
    language: 'Spanish',
  });

  if (!promptResult.ok) {
    throw new Error(`Failed to render prompt: ${promptResult.error}`);
  }

  // Use the rendered prompt with LLM
  const response = await ctx.llm.chat({
    messages: [{ role: 'user', content: promptResult.data.content }],
    model: promptResult.data.modelDefaults?.model,
    temperature: promptResult.data.modelDefaults?.temperature,
  });

  return { greeting: response.content };
}
```

## Step 5: Get Latest Version (Optional)

If you don't specify a version, the registry returns the latest:

```typescript
// Get latest version of prompt
const latestPrompt = ctx.promptRegistry.getPrompt('hello_world');

if (latestPrompt.ok) {
  console.log(`Using version: ${latestPrompt.data.version}`);
}
```

## Common Operations

### List Available Prompts

```typescript
const promptIds = ctx.promptRegistry.listPrompts();
// ['hello_world', 'campaign_plan', ...]

const versions = ctx.promptRegistry.listPromptVersions('hello_world');
// ['1.0.0', '1.1.0', '2.0.0'] (sorted newest first)
```

### Load a Config Template

```typescript
const configResult = ctx.promptRegistry.renderConfig('game_settings', '1.0.0', {
  difficulty: 'hard',
});

if (configResult.ok) {
  const gameConfig = configResult.data.config;
  // { difficulty: 'hard', max_players: 1, time_limit_seconds: 300, ... }
}
```

### Load a Review Rubric

```typescript
const rubricResult = ctx.promptRegistry.getRubric('asset_quality', '1.0.0');

if (rubricResult.ok) {
  const criteria = rubricResult.data.criteria;
  // [{ name: 'visual_clarity', description: '...', scoringGuidance: '...' }, ...]
}
```

## Error Handling

The registry uses result objects for predictable error handling:

```typescript
const result = ctx.promptRegistry.renderPrompt('hello_world', '1.0.0', {
  // Missing required 'name' variable
});

if (!result.ok) {
  switch (result.errorCode) {
    case 'VALIDATION_ERROR':
      console.error('Invalid variables:', result.details?.validationErrors);
      // [{ field: 'name', message: 'Missing required field: name' }]
      break;
    case 'TEMPLATE_NOT_FOUND':
      console.error('Prompt not found');
      break;
    case 'VERSION_NOT_FOUND':
      console.error('Available versions:', result.details?.availableVersions);
      break;
  }
}
```

## Creating More Templates

### Prompt Template Structure

```
agent-platform/prompts/
├── my_prompt/
│   ├── 1.0.0.md    # Initial version
│   ├── 1.1.0.md    # Minor update (new optional variable)
│   └── 2.0.0.md    # Major update (breaking change)
```

### Config Template Structure

```
agent-platform/configs/
└── my_config/
    └── 1.0.0.json
```

### Rubric Structure

```
agent-platform/rubrics/
└── my_rubric/
    └── 1.0.0.json
```

## Debugging

### Check Loaded Templates

View the startup logs to see which templates were loaded:

```
[PromptRegistry] Loading templates from: agent-platform/prompts, agent-platform/configs, agent-platform/rubrics
[PromptRegistry] Loaded 3 prompt template(s)
[PromptRegistry] Loaded 1 config template(s)
[PromptRegistry] Loaded 1 rubric(s)
```

### Validation Errors

If a template fails validation, you'll see detailed errors:

```
[PromptRegistry] Failed to load agent-platform/prompts/broken/1.0.0.md
  - vars_schema.properties.name: must have required property 'type'
  - Template variable {{undefined_var}} not defined in vars_schema
```

### Run Step Debug Data

After a skill executes, check the run step debug data:

```sql
SELECT debug->'provider_calls' FROM run_steps WHERE run_id = '...';
```

```json
[{
  "provider": "litellm",
  "model": "gemini/gemini-2.0-flash",
  "registry_prompt": {
    "prompt_id": "hello_world",
    "prompt_version": "1.0.0",
    "vars_provided": { "name": "Alice", "language": "Spanish" },
    "resolved_prompt": "Hello! Please greet Alice in Spanish..."
  }
}]
```

## Next Steps

1. Create prompt templates for your skills
2. Add version control for prompt iterations
3. Use rubrics for quality assessment workflows
4. Monitor resolved prompts in run step debug data
