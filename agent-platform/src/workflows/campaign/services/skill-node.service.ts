import { Injectable, Logger } from '@nestjs/common';
import { SkillRunnerService } from '../../../skills/skill-runner/skill-runner.service';
import { CampaignWorkflowStateType, SkillStepResult } from '../interfaces/campaign-workflow-state.interface';

export interface RetryConfig {
  maxAttempts: number;
  backoffMs: number;
}

type InputFn = (state: CampaignWorkflowStateType) => Record<string, unknown>;
type NodeFn = (state: CampaignWorkflowStateType) => Promise<Partial<CampaignWorkflowStateType>>;

const DEFAULT_RETRY: RetryConfig = { maxAttempts: 2, backoffMs: 1000 };

@Injectable()
export class SkillNodeService {
  private readonly logger = new Logger(SkillNodeService.name);

  constructor(private readonly skillRunner: SkillRunnerService) {}

  createNode(stepId: string, skillId: string, inputFn: InputFn, retry: RetryConfig = DEFAULT_RETRY): NodeFn {
    return async (state: CampaignWorkflowStateType): Promise<Partial<CampaignWorkflowStateType>> => {
      const startTime = Date.now();
      this.logger.log(`[SkillNode] Starting step: ${stepId}, skill: ${skillId}, runId=${state.runId}`);

      let input: Record<string, unknown>;
      try {
        input = inputFn(state);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        this.logger.error(`[SkillNode] Failed to compute input for ${stepId}: ${message}`);
        return this.buildFailure(stepId, startTime, message);
      }

      const result = await this.executeWithRetry(stepId, skillId, input, retry);
      const durationMs = Date.now() - startTime;

      if (result.ok) {
        const artifactIds = result.artifacts?.map((a) => (a.metadata?.id as string) || '').filter(Boolean) || [];
        this.logger.log(`[SkillNode] Completed: ${stepId}, durationMs=${durationMs}`);

        const stepResult: SkillStepResult = { ok: true, data: result.data as Record<string, unknown> | undefined, artifactIds, durationMs };
        return { stepResults: new Map([[stepId, stepResult]]) };
      }

      this.logger.error(`[SkillNode] Failed: ${stepId}, error=${result.error_code}`);
      return this.buildFailure(stepId, startTime, result.error || 'Unknown error');
    };
  }

  private buildFailure(stepId: string, startTime: number, errorMessage: string): Partial<CampaignWorkflowStateType> {
    const durationMs = Date.now() - startTime;
    const stepResult: SkillStepResult = { ok: false, artifactIds: [], error: errorMessage, durationMs };
    return {
      stepResults: new Map([[stepId, stepResult]]),
      error: `Step ${stepId} failed: ${errorMessage}`,
    };
  }

  private async executeWithRetry(stepId: string, skillId: string, input: Record<string, unknown>, retry: RetryConfig) {
    let lastResult: Awaited<ReturnType<SkillRunnerService['execute']>> | null = null;

    for (let attempt = 1; attempt <= retry.maxAttempts; attempt++) {
      try {
        const result = await this.skillRunner.execute(skillId, input);
        if (result.ok) return result;
        lastResult = result;
        this.logger.warn(`[SkillNode] Attempt ${attempt}/${retry.maxAttempts} failed: ${stepId}, error=${result.error_code}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        lastResult = { ok: false, error: message, error_code: 'EXECUTION_ERROR', artifacts: [], debug: { timings_ms: { total: 0 } } };
        this.logger.warn(`[SkillNode] Attempt ${attempt}/${retry.maxAttempts} threw: ${stepId}, error=${message}`);
      }

      if (attempt < retry.maxAttempts) {
        const delay = retry.backoffMs * Math.pow(2, attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    return lastResult || { ok: false as const, error: 'Max attempts exceeded', error_code: 'MAX_RETRIES', artifacts: [], debug: { timings_ms: { total: 0 } } };
  }
}
