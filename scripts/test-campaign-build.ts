#!/usr/bin/env npx tsx

import { buildPayload } from './workflow-payloads';

const CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY;
if (!CLERK_SECRET_KEY) throw new Error('CLERK_SECRET_KEY env var is required');
const API_URL = process.env.API_URL || 'http://localhost:3001';
const SESSION_ID = process.env.CLERK_SESSION_ID;
if (!SESSION_ID) throw new Error('CLERK_SESSION_ID env var is required');
const POLL_INTERVAL_MS = 3000;
const MAX_POLL_TIME_MS = 600000;

async function getFreshToken(): Promise<string> {
  const resp = await fetch(`https://api.clerk.com/v1/sessions/${SESSION_ID}/tokens`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${CLERK_SECRET_KEY}`,
      'Content-Type': 'application/json',
    },
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Clerk token error: ${resp.status} ${text}`);
  }
  const data = (await resp.json()) as { jwt: string };
  return data.jwt;
}

async function fetchJson<T>(url: string, options: RequestInit = {}): Promise<T> {
  const token = await getFreshToken();
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HTTP ${response.status}: ${text}`);
  }

  return response.json() as Promise<T>;
}

interface RunResponse {
  id: string;
  workflowName: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  stepsSummary?: { total: number; pending: number; running: number; completed: number; skipped: number; failed: number };
  error?: { code: string; message: string };
  durationMs?: number;
}

interface StepResponse {
  id: string;
  stepId: string;
  skillId: string;
  status: 'pending' | 'running' | 'skipped' | 'completed' | 'failed';
  cacheHit?: boolean;
  durationMs?: number;
  error?: { code: string; message: string };
}

async function main(): Promise<void> {
  console.log('=== Campaign Build E2E Test ===');
  console.log(`API: ${API_URL}`);
  console.log('');

  console.log('Verifying Clerk token...');
  const testToken = await getFreshToken();
  console.log(`Token obtained (${testToken.length} chars)`);
  console.log('');

  const payload = buildPayload('campaign.build', { campaignName: 'E2E Test Campaign' });
  console.log('Triggering campaign.build workflow...');

  const triggerResp = await fetchJson<{ runId: string }>(`${API_URL}/api/runs`, {
    method: 'POST',
    body: JSON.stringify({
      workflowName: 'campaign.build',
      workflowVersion: '1.0.0',
      triggerPayload: payload,
    }),
  });

  console.log(`Run ID: ${triggerResp.runId}`);
  console.log('');
  console.log('Polling for completion...');

  const startTime = Date.now();
  let lastStepStatuses: Record<string, string> = {};

  while (true) {
    const [run, stepsResp] = await Promise.all([
      fetchJson<RunResponse>(`${API_URL}/api/runs/${triggerResp.runId}`),
      fetchJson<{ steps: StepResponse[] }>(`${API_URL}/api/runs/${triggerResp.runId}/steps`),
    ]);

    const currentStatuses: Record<string, string> = {};
    for (const step of stepsResp.steps) {
      currentStatuses[step.stepId] = step.status;
      if (lastStepStatuses[step.stepId] !== step.status) {
        const icon = step.status === 'completed' ? '✓' : step.status === 'running' ? '▶' : step.status === 'failed' ? '✗' : step.status === 'skipped' ? '○' : '·';
        const dur = step.durationMs ? ` (${step.durationMs}ms)` : '';
        const err = step.error ? ` ERROR: ${step.error.code} - ${step.error.message}` : '';
        const cache = step.cacheHit ? ' [cached]' : '';
        console.log(`  ${icon} ${step.stepId} → ${step.status}${dur}${cache}${err}`);
      }
    }
    lastStepStatuses = currentStatuses;

    if (['completed', 'failed', 'cancelled'].includes(run.status)) {
      console.log('');
      console.log(`=== Run ${run.status.toUpperCase()} ===`);
      console.log(`Duration: ${run.durationMs}ms`);
      if (run.stepsSummary) {
        console.log(`Steps: ${run.stepsSummary.completed} completed, ${run.stepsSummary.failed} failed, ${run.stepsSummary.skipped} skipped`);
      }
      if (run.error) {
        console.log(`Error: ${run.error.code} - ${run.error.message}`);
      }

      const failedSteps = stepsResp.steps.filter((s) => s.status === 'failed');
      if (failedSteps.length > 0) {
        console.log('');
        console.log('Failed steps:');
        for (const step of failedSteps) {
          console.log(`  ✗ ${step.stepId} (${step.skillId}): ${step.error?.code} - ${step.error?.message}`);
        }
      }

      process.exit(run.status === 'completed' ? 0 : 1);
    }

    if (Date.now() - startTime > MAX_POLL_TIME_MS) {
      console.error('Polling timeout!');
      process.exit(1);
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

main().catch((e) => {
  console.error('Fatal error:', e.message || e);
  process.exit(1);
});
