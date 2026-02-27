<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue';
import { apiClient } from '@/services/api/api-client.service';

interface WorkflowOption {
  name: string;
  displayName: string;
  stepCount: number;
  requiresTemplate: boolean;
  requiresBaseRun: boolean;
}

interface StepsSummary {
  total: number;
  pending: number;
  running: number;
  completed: number;
  skipped: number;
  failed: number;
}

interface RunStep {
  id: string;
  stepId: string;
  skillId: string;
  status: 'pending' | 'running' | 'skipped' | 'completed' | 'failed';
  cacheHit: boolean;
  durationMs?: number;
}

interface RunError {
  code: string;
  message: string;
}

interface GameRun {
  id: string;
  workflowName: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  steps: RunStep[];
  stepsSummary?: StepsSummary;
  error?: RunError;
  gameUrl?: string;
}

const workflows = ref<WorkflowOption[]>([
  { name: 'campaign.build', displayName: 'Full Build (14 steps)', stepCount: 14, requiresTemplate: true, requiresBaseRun: false },
  { name: 'campaign.build.minimal', displayName: 'Minimal Build (4 steps)', stepCount: 4, requiresTemplate: true, requiresBaseRun: false },
  { name: 'campaign.update_game_config', displayName: 'Update Game Config (4 steps)', stepCount: 4, requiresTemplate: false, requiresBaseRun: true },
  { name: 'campaign.update_audio', displayName: 'Update Audio (6 steps)', stepCount: 6, requiresTemplate: false, requiresBaseRun: true },
  { name: 'campaign.update_intro', displayName: 'Update Intro (5 steps)', stepCount: 5, requiresTemplate: false, requiresBaseRun: true },
  { name: 'campaign.update_outcome', displayName: 'Update Outcome (4 steps)', stepCount: 4, requiresTemplate: false, requiresBaseRun: true },
  { name: 'campaign.replace_3d_asset', displayName: 'Replace 3D Asset (5 steps)', stepCount: 5, requiresTemplate: false, requiresBaseRun: true },
]);

const gameTemplates = ref<string[]>(['spin_wheel', 'scratch_card', 'slot_machine', 'memory_match', 'catch_game', 'quiz']);

const selectedWorkflow = ref<string>('campaign.build.minimal');
const selectedTemplate = ref<string>('spin_wheel');
const campaignName = ref<string>('');
const baseRunId = ref<string>('');

const runs = ref<GameRun[]>([]);
const isTriggering = ref<boolean>(false);
const errorMessage = ref<string>('');

const pollingIntervals = ref<Map<string, ReturnType<typeof setInterval>>>(new Map());

const selectedWorkflowConfig = computed(() => workflows.value.find((w) => w.name === selectedWorkflow.value));

const showTemplateSelector = computed(() => selectedWorkflowConfig.value?.requiresTemplate ?? false);

const showBaseRunInput = computed(() => selectedWorkflowConfig.value?.requiresBaseRun ?? false);

async function triggerRunApi(workflowName: string, triggerPayload: Record<string, unknown>): Promise<{ runId: string; status: string }> {
  const response = await apiClient.post('/runs', {
    workflowName,
    workflowVersion: '1.0.0',
    triggerPayload,
  });
  return response.data;
}

async function getRunStatus(runId: string): Promise<{ status: string; stepsSummary?: StepsSummary; error?: RunError }> {
  const response = await apiClient.get(`/runs/${runId}`);
  return response.data;
}

async function getRunSteps(runId: string): Promise<{ runId: string; steps: RunStep[] }> {
  const response = await apiClient.get(`/runs/${runId}/steps`);
  return response.data;
}

function buildTriggerPayload(): Record<string, unknown> {
  const workflow = selectedWorkflow.value;

  if (workflow === 'campaign.build.minimal') {
    return {
      campaign_id: crypto.randomUUID(),
      campaign_name: campaignName.value || 'Test Campaign',
      template_id: selectedTemplate.value,
      theme: { primary_color: '#FF5733', style: 'modern' },
      difficulty: 'medium',
      color_scheme: { primary: '#FF5733', secondary: '#33FF57', background: '#FFFFFF' },
      copy: { title: campaignName.value || 'Test Game', instructions: 'Play to win!' },
      audio: { style: 'upbeat', duration_sec: 30, prompt: 'Fun arcade game music' },
      intro_video_uri: null,
      outcome_videos: { win: null, lose: null },
      button_config: { text: 'START', position: { x: 0.5, y: 0.8 } },
      rules: { max_plays: 3, win_probability: 0.3 },
      branding: { logo_url: null, company_name: 'Demo Company' },
    };
  }

  if (workflow === 'campaign.build') {
    return {
      campaign_id: crypto.randomUUID(),
      brief: {
        campaign_name: campaignName.value || 'Full Campaign',
        objective: 'Engage users with interactive game',
        target_audience: 'General consumers',
      },
      brand_assets: { logo_url: null },
      constraints: {
        game_type: selectedTemplate.value,
        difficulty: 'medium',
        duration_sec: 60,
        intro_duration_sec: 5,
      },
    };
  }

  return {
    campaign_id: crypto.randomUUID(),
    base_run_id: baseRunId.value,
  };
}

function startPolling(runId: string): void {
  if (pollingIntervals.value.has(runId)) return;

  const interval = setInterval(async () => {
    await updateRunStatus(runId);
  }, 2000);

  pollingIntervals.value.set(runId, interval);
}

function stopPolling(runId: string): void {
  const interval = pollingIntervals.value.get(runId);
  if (interval) {
    clearInterval(interval);
    pollingIntervals.value.delete(runId);
  }
}

async function updateRunStatus(runId: string): Promise<void> {
  try {
    const [runData, stepsData] = await Promise.all([getRunStatus(runId), getRunSteps(runId)]);

    const runIndex = runs.value.findIndex((r) => r.id === runId);
    if (runIndex === -1) return;

    runs.value[runIndex] = {
      ...runs.value[runIndex],
      status: runData.status as GameRun['status'],
      steps: stepsData.steps,
      stepsSummary: runData.stepsSummary,
      error: runData.error,
    };

    if (['completed', 'failed', 'cancelled'].includes(runData.status)) {
      stopPolling(runId);
      if (runData.status === 'completed') {
        runs.value[runIndex].gameUrl = `file:///tmp/skills/output/${runId}/bundle/index.html`;
      }
    }
  } catch (error) {
    console.error(`Error polling run ${runId}:`, error);
  }
}

async function handleTrigger(): Promise<void> {
  if (!campaignName.value.trim() && !selectedWorkflow.value.includes('update') && !selectedWorkflow.value.includes('replace')) {
    errorMessage.value = 'Please enter a campaign name';
    return;
  }

  const requiresBaseRun = selectedWorkflowConfig.value?.requiresBaseRun;
  if (requiresBaseRun && !baseRunId.value.trim()) {
    errorMessage.value = 'Please enter a base run ID for update workflows';
    return;
  }

  errorMessage.value = '';
  isTriggering.value = true;

  try {
    const payload = buildTriggerPayload();
    const result = await triggerRunApi(selectedWorkflow.value, payload);

    const newRun: GameRun = {
      id: result.runId,
      workflowName: selectedWorkflow.value,
      status: result.status as GameRun['status'],
      steps: [],
    };

    runs.value.unshift(newRun);
    startPolling(result.runId);
    campaignName.value = '';
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : 'Failed to trigger workflow';
    errorMessage.value = errorMsg;
  } finally {
    isTriggering.value = false;
  }
}

function getProgressPercent(run: GameRun): number {
  if (!run.stepsSummary || run.stepsSummary.total === 0) return 0;
  return Math.round(((run.stepsSummary.completed + run.stepsSummary.skipped) / run.stepsSummary.total) * 100);
}

function getStepIcon(status: string): string {
  const icons: Record<string, string> = {
    pending: '???',
    running: '???',
    completed: '???',
    skipped: '????',
    failed: '???',
  };
  return icons[status] || '???';
}

async function copyToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
  }
}

onUnmounted(() => {
  pollingIntervals.value.forEach((_, runId) => stopPolling(runId));
});
</script>

<template>
  <div class="game-creation-container">
    <header class="header">
      <h1>Game Creation Trigger</h1>
    </header>

    <section class="trigger-section">
      <div class="form-group">
        <label for="workflow-select">Workflow:</label>
        <select id="workflow-select" v-model="selectedWorkflow">
          <option v-for="w in workflows" :key="w.name" :value="w.name">
            {{ w.displayName }}
          </option>
        </select>
      </div>

      <div v-if="showTemplateSelector" class="form-group">
        <label for="template-select">Mobile Game Template:</label>
        <select id="template-select" v-model="selectedTemplate">
          <option v-for="t in gameTemplates" :key="t" :value="t">
            {{ t.replace('_', ' ') }}
          </option>
        </select>
      </div>

      <div v-if="showBaseRunInput" class="form-group">
        <label for="base-run-input">Base Run ID:</label>
        <input id="base-run-input" type="text" v-model="baseRunId" placeholder="UUID of the original run to update" />
      </div>

      <div class="form-group">
        <label for="campaign-name">Campaign Name:</label>
        <input id="campaign-name" type="text" v-model="campaignName" placeholder="My Awesome Campaign" />
      </div>

      <button class="trigger-button" @click="handleTrigger" :disabled="isTriggering">
        {{ isTriggering ? 'Triggering...' : 'Trigger Workflow' }}
      </button>

      <p v-if="errorMessage" class="error-message">{{ errorMessage }}</p>
    </section>

    <section class="runs-section">
      <h2>Active & Completed Runs</h2>

      <div v-if="runs.length === 0" class="empty-state">No runs yet. Trigger a workflow to get started.</div>

      <div v-for="run in runs" :key="run.id" class="run-card">
        <div class="run-header">
          <span class="run-workflow">{{ run.workflowName }}</span>
          <span :class="['run-status', `status-${run.status}`]">{{ run.status }}</span>
        </div>

        <div class="run-id">ID: {{ run.id }}</div>

        <div v-if="run.stepsSummary" class="progress-container">
          <div class="progress-bar">
            <div class="progress-fill" :style="{ width: getProgressPercent(run) + '%' }"></div>
          </div>
          <span class="progress-text"> {{ run.stepsSummary.completed + run.stepsSummary.skipped }} / {{ run.stepsSummary.total }} steps </span>
        </div>

        <details v-if="run.steps.length > 0" class="steps-details">
          <summary>View Steps ({{ run.steps.length }})</summary>
          <ul class="steps-list">
            <li v-for="step in run.steps" :key="step.id" :class="['step-item', `step-${step.status}`]">
              <span class="step-status-icon">{{ getStepIcon(step.status) }}</span>
              <span class="step-name">{{ step.stepId }}</span>
              <span v-if="step.cacheHit" class="cache-badge">cached</span>
              <span v-if="step.durationMs" class="step-duration">{{ step.durationMs }}ms</span>
            </li>
          </ul>
        </details>

        <div v-if="run.error" class="run-error">Error: {{ run.error.message }}</div>

        <div v-if="run.status === 'completed' && run.gameUrl" class="game-url-section">
          <label>Game URL:</label>
          <div class="url-actions">
            <input type="text" :value="run.gameUrl" readonly class="url-input" />
            <button @click="copyToClipboard(run.gameUrl!)" class="copy-button">Copy</button>
          </div>
          <p class="url-note">Note: file:// URLs need to be pasted manually in browser</p>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.game-creation-container {
  max-width: 900px;
  margin: 0 auto;
  padding: 20px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.header {
  text-align: center;
  margin-bottom: 30px;
  border-bottom: 2px solid #eee;
  padding-bottom: 15px;
}

.header h1 {
  margin: 0;
  color: #333;
}

.trigger-section {
  background: #f9f9f9;
  padding: 20px;
  border-radius: 8px;
  margin-bottom: 30px;
}

.form-group {
  margin-bottom: 15px;
}

.form-group label {
  display: block;
  margin-bottom: 5px;
  font-weight: 600;
  color: #555;
}

.form-group select,
.form-group input {
  width: 100%;
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
  box-sizing: border-box;
}

.trigger-button {
  width: 100%;
  padding: 12px;
  background: #4caf50;
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 16px;
  cursor: pointer;
  transition: background 0.2s;
}

.trigger-button:hover:not(:disabled) {
  background: #45a049;
}

.trigger-button:disabled {
  background: #ccc;
  cursor: not-allowed;
}

.error-message {
  color: #d32f2f;
  margin-top: 10px;
}

.runs-section h2 {
  color: #333;
  margin-bottom: 20px;
}

.empty-state {
  text-align: center;
  color: #888;
  padding: 40px;
  background: #f5f5f5;
  border-radius: 8px;
}

.run-card {
  background: white;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  padding: 15px;
  margin-bottom: 15px;
}

.run-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.run-workflow {
  font-weight: 600;
  color: #333;
}

.run-status {
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
}

.status-queued {
  background: #fff3e0;
  color: #e65100;
}
.status-running {
  background: #e3f2fd;
  color: #1565c0;
}
.status-completed {
  background: #e8f5e9;
  color: #2e7d32;
}
.status-failed {
  background: #ffebee;
  color: #c62828;
}
.status-cancelled {
  background: #f5f5f5;
  color: #757575;
}

.run-id {
  font-size: 12px;
  color: #888;
  font-family: monospace;
  margin-bottom: 10px;
}

.progress-container {
  margin: 15px 0;
}

.progress-bar {
  height: 8px;
  background: #e0e0e0;
  border-radius: 4px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #4caf50, #8bc34a);
  transition: width 0.3s ease;
}

.progress-text {
  font-size: 12px;
  color: #666;
  margin-top: 5px;
  display: block;
}

.steps-details {
  margin-top: 10px;
}

.steps-details summary {
  cursor: pointer;
  color: #1976d2;
  font-weight: 500;
}

.steps-list {
  list-style: none;
  padding: 10px 0;
  margin: 0;
  max-height: 200px;
  overflow-y: auto;
}

.step-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  border-bottom: 1px solid #f0f0f0;
}

.step-status-icon {
  font-size: 14px;
}

.step-name {
  flex: 1;
  font-family: monospace;
  font-size: 13px;
}

.cache-badge {
  background: #e8f5e9;
  color: #388e3c;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 10px;
}

.step-duration {
  color: #888;
  font-size: 11px;
}

.run-error {
  background: #ffebee;
  color: #c62828;
  padding: 10px;
  border-radius: 4px;
  margin-top: 10px;
}

.game-url-section {
  margin-top: 15px;
  padding-top: 15px;
  border-top: 1px solid #e0e0e0;
}

.game-url-section label {
  font-weight: 600;
  color: #2e7d32;
  display: block;
  margin-bottom: 8px;
}

.url-actions {
  display: flex;
  gap: 10px;
}

.url-input {
  flex: 1;
  padding: 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-family: monospace;
  font-size: 12px;
}

.copy-button {
  padding: 8px 16px;
  background: #1976d2;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.copy-button:hover {
  background: #1565c0;
}

.url-note {
  font-size: 11px;
  color: #888;
  margin-top: 5px;
}
</style>
