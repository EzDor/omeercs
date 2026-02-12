#!/usr/bin/env npx tsx

import { buildPayload, requiresBaseRun, VALID_WORKFLOWS, VALID_TEMPLATES, type WorkflowName, type TemplateName } from './workflow-payloads';

interface CliOptions {
  workflow: WorkflowName;
  template: TemplateName;
  baseRun?: string;
  tenantId: string;
  name: string;
  apiUrl: string;
  pollInterval: number;
  maxPollTime: number;
}

interface TriggerResponse {
  runId: string;
  status: string;
  message?: string;
}

interface RunResponse {
  id: string;
  workflowName: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  stepsSummary?: {
    total: number;
    pending: number;
    running: number;
    completed: number;
    skipped: number;
    failed: number;
  };
  error?: {
    code: string;
    message: string;
  };
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
}

interface StepResponse {
  id: string;
  stepId: string;
  skillId: string;
  status: 'pending' | 'running' | 'skipped' | 'completed' | 'failed';
  cacheHit?: boolean;
  durationMs?: number;
  error?: {
    code: string;
    message: string;
  };
}

interface RunStepsResponse {
  runId: string;
  steps: StepResponse[];
}

interface ArtifactResponse {
  id: string;
  type: string;
  uri: string;
  filename?: string;
  sizeBytes?: number;
}

interface ArtifactsResponse {
  runId: string;
  artifacts: ArtifactResponse[];
}

const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function color(text: string, c: keyof typeof COLORS): string {
  return `${COLORS[c]}${text}${COLORS.reset}`;
}

function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  const options: Partial<CliOptions> = {
    template: 'spin_wheel',
    tenantId: 'dev-tenant',
    name: 'Test Campaign',
    apiUrl: 'http://localhost:3001',
    pollInterval: 2000,
    maxPollTime: 300000,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    switch (arg) {
      case '-w':
      case '--workflow':
        options.workflow = nextArg as WorkflowName;
        i++;
        break;
      case '-t':
      case '--template':
        options.template = nextArg as TemplateName;
        i++;
        break;
      case '-b':
      case '--base-run':
        options.baseRun = nextArg;
        i++;
        break;
      case '-n':
      case '--name':
        options.name = nextArg;
        i++;
        break;
      case '--tenant-id':
        options.tenantId = nextArg;
        i++;
        break;
      case '--api-url':
        options.apiUrl = nextArg;
        i++;
        break;
      case '--poll-interval':
        options.pollInterval = parseInt(nextArg, 10);
        i++;
        break;
      case '--max-poll-time':
        options.maxPollTime = parseInt(nextArg, 10);
        i++;
        break;
      case '-h':
      case '--help':
        printUsage();
        process.exit(0);
    }
  }

  if (!options.workflow) {
    console.error(color('Error: --workflow is required', 'red'));
    printUsage();
    process.exit(1);
  }

  if (!VALID_WORKFLOWS.includes(options.workflow)) {
    console.error(color(`Error: Invalid workflow "${options.workflow}"`, 'red'));
    console.error(`Valid workflows: ${VALID_WORKFLOWS.join(', ')}`);
    process.exit(1);
  }

  if (options.template && !VALID_TEMPLATES.includes(options.template)) {
    console.error(color(`Error: Invalid template "${options.template}"`, 'red'));
    console.error(`Valid templates: ${VALID_TEMPLATES.join(', ')}`);
    process.exit(1);
  }

  if (requiresBaseRun(options.workflow) && !options.baseRun) {
    console.error(color(`Error: --base-run is required for ${options.workflow}`, 'red'));
    process.exit(1);
  }

  return options as CliOptions;
}

function printUsage(): void {
  console.log(`
${color('Workflow Trigger Script', 'bright')}

${color('Usage:', 'cyan')}
  pnpm trigger -w <workflow> [options]

${color('Required:', 'cyan')}
  -w, --workflow     Workflow name to trigger

${color('Options:', 'cyan')}
  -t, --template     Game template (default: spin_wheel)
                     Valid: ${VALID_TEMPLATES.join(', ')}
  -b, --base-run     Base run ID (required for update workflows)
  -n, --name         Campaign name (default: Test Campaign)
  --tenant-id        Tenant ID (default: dev-tenant)
  --api-url          API base URL (default: http://localhost:3001)
  --poll-interval    Polling interval in ms (default: 2000)
  --max-poll-time    Max polling time in ms (default: 300000)
  -h, --help         Show this help message

${color('Available Workflows:', 'cyan')}
  ${VALID_WORKFLOWS.join('\n  ')}

${color('Examples:', 'cyan')}
  ${color('# Minimal build with spin_wheel template', 'dim')}
  pnpm trigger -w campaign.build.minimal -t spin_wheel -n "My Campaign"

  ${color('# Full build from brief', 'dim')}
  pnpm trigger -w campaign.build -n "Big Campaign"

  ${color('# Update audio on existing run', 'dim')}
  pnpm trigger -w campaign.update_audio -b <run-id>

  ${color('# Replace 3D asset', 'dim')}
  pnpm trigger -w campaign.replace_3d_asset -b <run-id>
`);
}

async function fetchJson<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HTTP ${response.status}: ${text}`);
  }

  return response.json();
}

async function triggerWorkflow(apiUrl: string, tenantId: string, workflowName: string, payload: Record<string, unknown>): Promise<TriggerResponse> {
  return fetchJson<TriggerResponse>(`${apiUrl}/api/runs`, {
    method: 'POST',
    headers: {
      'x-tenant-id': tenantId,
    },
    body: JSON.stringify({
      workflowName,
      workflowVersion: '1.0.0',
      triggerPayload: payload,
    }),
  });
}

async function getRun(apiUrl: string, tenantId: string, runId: string): Promise<RunResponse> {
  return fetchJson<RunResponse>(`${apiUrl}/api/runs/${runId}`, {
    headers: {
      'x-tenant-id': tenantId,
    },
  });
}

async function getRunSteps(apiUrl: string, tenantId: string, runId: string): Promise<RunStepsResponse> {
  return fetchJson<RunStepsResponse>(`${apiUrl}/api/runs/${runId}/steps`, {
    headers: {
      'x-tenant-id': tenantId,
    },
  });
}

async function getRunArtifacts(apiUrl: string, tenantId: string, runId: string): Promise<ArtifactsResponse> {
  return fetchJson<ArtifactsResponse>(`${apiUrl}/api/runs/${runId}/artifacts`, {
    headers: {
      'x-tenant-id': tenantId,
    },
  });
}

function getStepStatusIcon(status: StepResponse['status']): string {
  switch (status) {
    case 'completed':
      return color('✓', 'green');
    case 'running':
      return color('▶', 'yellow');
    case 'failed':
      return color('✗', 'red');
    case 'skipped':
      return color('○', 'dim');
    case 'pending':
    default:
      return color('·', 'dim');
  }
}

function formatDuration(ms?: number): string {
  if (!ms) return '';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function clearLines(count: number): void {
  for (let i = 0; i < count; i++) {
    process.stdout.write('\x1b[1A\x1b[2K');
  }
}

function renderProgress(run: RunResponse, steps: StepResponse[]): number {
  const lines: string[] = [];

  const statusColor = run.status === 'completed' ? 'green' : run.status === 'failed' ? 'red' : 'yellow';
  lines.push(`Status: ${color(run.status.toUpperCase(), statusColor)}`);
  lines.push('');

  if (run.stepsSummary) {
    const { completed, skipped, total } = run.stepsSummary;
    const progress = Math.round(((completed + skipped) / total) * 100);
    const barWidth = 30;
    const filled = Math.round((progress / 100) * barWidth);
    const bar = '█'.repeat(filled) + '░'.repeat(barWidth - filled);
    lines.push(`Progress: [${bar}] ${progress}% (${completed + skipped}/${total})`);
    lines.push('');
  }

  lines.push('Steps:');
  for (const step of steps) {
    const icon = getStepStatusIcon(step.status);
    const cached = step.cacheHit ? color(' [cached]', 'cyan') : '';
    const duration = step.durationMs ? ` (${formatDuration(step.durationMs)})` : '';
    const error = step.error ? color(` - ${step.error.message}`, 'red') : '';
    lines.push(`  ${icon} ${step.stepId}${cached}${duration}${error}`);
  }

  for (const line of lines) {
    console.log(line);
  }

  return lines.length;
}

async function pollUntilComplete(apiUrl: string, tenantId: string, runId: string, pollInterval: number, maxPollTime: number): Promise<{ run: RunResponse; steps: StepResponse[] }> {
  const startTime = Date.now();
  let lastLineCount = 0;

  while (true) {
    const [run, stepsResponse] = await Promise.all([getRun(apiUrl, tenantId, runId), getRunSteps(apiUrl, tenantId, runId)]);

    if (lastLineCount > 0) {
      clearLines(lastLineCount);
    }

    lastLineCount = renderProgress(run, stepsResponse.steps);

    if (['completed', 'failed', 'cancelled'].includes(run.status)) {
      return { run, steps: stepsResponse.steps };
    }

    if (Date.now() - startTime > maxPollTime) {
      throw new Error(`Polling timeout after ${maxPollTime}ms`);
    }

    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }
}

async function main(): Promise<void> {
  const options = parseArgs();

  console.log('');
  console.log(color('═══════════════════════════════════════════════', 'cyan'));
  console.log(color('  Workflow Trigger', 'bright'));
  console.log(color('═══════════════════════════════════════════════', 'cyan'));
  console.log('');

  console.log(`Workflow:  ${color(options.workflow, 'bright')}`);
  console.log(`Template:  ${options.template}`);
  console.log(`Name:      ${options.name}`);
  console.log(`Tenant:    ${options.tenantId}`);
  console.log(`API:       ${options.apiUrl}`);
  if (options.baseRun) {
    console.log(`Base Run:  ${options.baseRun}`);
  }
  console.log('');

  try {
    const payload = buildPayload(options.workflow, {
      campaignName: options.name,
      templateId: options.template,
      baseRunId: options.baseRun,
    });

    console.log(color('Triggering workflow...', 'dim'));
    const triggerResponse = await triggerWorkflow(options.apiUrl, options.tenantId, options.workflow, payload);

    console.log(`Run ID: ${color(triggerResponse.runId, 'bright')}`);
    console.log('');

    const { run, steps } = await pollUntilComplete(options.apiUrl, options.tenantId, triggerResponse.runId, options.pollInterval, options.maxPollTime);

    console.log('');
    console.log(color('═══════════════════════════════════════════════', 'cyan'));
    console.log(color('  Results', 'bright'));
    console.log(color('═══════════════════════════════════════════════', 'cyan'));
    console.log('');

    if (run.status === 'completed') {
      console.log(color('✓ Workflow completed successfully!', 'green'));
    } else if (run.status === 'failed') {
      console.log(color('✗ Workflow failed!', 'red'));
      if (run.error) {
        console.log(`  Error: ${run.error.code} - ${run.error.message}`);
      }
    } else {
      console.log(color(`Workflow ended with status: ${run.status}`, 'yellow'));
    }

    console.log('');
    console.log(`Duration: ${formatDuration(run.durationMs)}`);

    const cacheHits = steps.filter((s) => s.cacheHit).length;
    console.log(`Cache hits: ${cacheHits}/${steps.length} (${Math.round((cacheHits / steps.length) * 100)}%)`);

    try {
      const artifactsResponse = await getRunArtifacts(options.apiUrl, options.tenantId, triggerResponse.runId);
      if (artifactsResponse.artifacts.length > 0) {
        console.log('');
        console.log(color('Artifacts:', 'bright'));
        for (const artifact of artifactsResponse.artifacts) {
          const size = artifact.sizeBytes ? ` (${(artifact.sizeBytes / 1024).toFixed(1)} KB)` : '';
          console.log(`  - ${artifact.type}: ${artifact.uri}${size}`);
        }
      }
    } catch (error) {
      console.log(color('Note:', 'yellow'), 'Could not fetch artifacts:', error instanceof Error ? error.message : 'Unknown error');
    }

    console.log('');

    if (run.status === 'failed') {
      process.exit(1);
    }
  } catch (error) {
    console.error('');
    console.error(color('Error:', 'red'), error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
