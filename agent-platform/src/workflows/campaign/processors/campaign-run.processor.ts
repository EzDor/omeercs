import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Job } from 'bullmq';
import { QueueNames } from '@agentic-template/common/src/queues/queue-names';
import { TenantClsService } from '@agentic-template/common/src/tenant/tenant-cls.service';
import { Run } from '@agentic-template/dao/src/entities/run.entity';
import { WorkflowEngineService } from '../../../workflow-orchestration/services/workflow-engine.service';
import { CampaignStatusService } from '../../../campaign/campaign-status.service';
import { CampaignWorkflowStateType, SkillStepResult } from '../interfaces/campaign-workflow-state.interface';
import { CampaignBuildWorkflow } from '../campaign-build.workflow';
import { CampaignBuildMinimalWorkflow } from '../campaign-build-minimal.workflow';
import { CampaignUpdateIntroWorkflow } from '../campaign-update-intro.workflow';
import { CampaignUpdateAudioWorkflow } from '../campaign-update-audio.workflow';
import { CampaignUpdateOutcomeWorkflow } from '../campaign-update-outcome.workflow';
import { CampaignUpdateGameConfigWorkflow } from '../campaign-update-game-config.workflow';
import { CampaignReplace3dAssetWorkflow } from '../campaign-replace-3d-asset.workflow';
import * as constants from '../campaign-workflow.constants';

interface RunOrchestrationJobData {
  runId: string;
  tenantId: string;
}

type CampaignWorkflow = { createGraph(): ReturnType<CampaignBuildWorkflow['createGraph']> };

@Processor(QueueNames.RUN_ORCHESTRATION, { concurrency: 1 })
export class CampaignRunProcessor extends WorkerHost {
  private readonly logger = new Logger(CampaignRunProcessor.name);
  private readonly workflowMap: Map<string, CampaignWorkflow>;

  constructor(
    @InjectRepository(Run)
    private readonly runRepository: Repository<Run>,
    private readonly workflowEngine: WorkflowEngineService,
    private readonly tenantClsService: TenantClsService,
    private readonly campaignStatusService: CampaignStatusService,
    campaignBuild: CampaignBuildWorkflow,
    campaignBuildMinimal: CampaignBuildMinimalWorkflow,
    campaignUpdateIntro: CampaignUpdateIntroWorkflow,
    campaignUpdateAudio: CampaignUpdateAudioWorkflow,
    campaignUpdateOutcome: CampaignUpdateOutcomeWorkflow,
    campaignUpdateGameConfig: CampaignUpdateGameConfigWorkflow,
    campaignReplace3dAsset: CampaignReplace3dAssetWorkflow,
  ) {
    super();
    this.workflowMap = new Map<string, CampaignWorkflow>([
      [constants.CAMPAIGN_BUILD, campaignBuild],
      [constants.CAMPAIGN_BUILD_MINIMAL, campaignBuildMinimal],
      [constants.CAMPAIGN_UPDATE_INTRO, campaignUpdateIntro],
      [constants.CAMPAIGN_UPDATE_AUDIO, campaignUpdateAudio],
      [constants.CAMPAIGN_UPDATE_OUTCOME, campaignUpdateOutcome],
      [constants.CAMPAIGN_UPDATE_GAME_CONFIG, campaignUpdateGameConfig],
      [constants.CAMPAIGN_REPLACE_3D_ASSET, campaignReplace3dAsset],
    ]);
  }

  async process(job: Job<RunOrchestrationJobData>): Promise<void> {
    const { runId, tenantId } = job.data;
    this.logger.log(`[CampaignRun] Starting run: runId=${runId}, tenantId=${tenantId}`);

    await this.tenantClsService.runWithTenant(tenantId, undefined, async () => {
      let campaignId: string | undefined;
      try {
        const run = await this.runRepository.findOne({ where: { id: runId, tenantId } });
        if (!run) throw new Error(`Run ${runId} not found`);

        campaignId = run.context?.campaignId;

        const workflow = this.workflowMap.get(run.workflowName);
        if (!workflow) throw new Error(`Unknown campaign workflow: ${run.workflowName}`);

        await this.updateRunStatus(run, 'running');

        const graph = workflow.createGraph();
        const initialState: Partial<CampaignWorkflowStateType> = {
          runId,
          tenantId,
          triggerPayload: run.triggerPayload || {},
          stepResults: new Map(),
          error: null,
        };

        const result = await this.workflowEngine.executeWorkflow(graph, initialState as CampaignWorkflowStateType, runId, tenantId, `campaign:${run.workflowName}`);

        const finalState = result as unknown as CampaignWorkflowStateType;
        const failedSteps = this.findFailedSteps(finalState.stepResults);

        if (finalState.error || failedSteps.length > 0) {
          const failedStep = failedSteps[0];
          await this.updateRunStatus(run, 'failed', {
            code: 'STEP_EXECUTION_FAILED',
            message: failedStep?.error || finalState.error || 'Unknown error',
            failedStepId: failedStep ? failedSteps[0]?.stepId : undefined,
          });
          this.logger.error(`[CampaignRun] Run failed: runId=${runId}`);
          await this.updateCampaignStatus(campaignId, 'failed', undefined, runId);
        } else {
          await this.updateRunStatus(run, 'completed');
          this.logger.log(`[CampaignRun] Run completed: runId=${runId}`);
          const bundleUrl = this.extractBundleUrl(finalState.stepResults);
          await this.updateCampaignStatus(campaignId, 'live', bundleUrl, runId);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        this.logger.error(`[CampaignRun] Run error: runId=${runId}, error=${message}`);
        await this.updateRunStatusById(runId, tenantId, 'failed', { code: 'ORCHESTRATION_ERROR', message });
        await this.updateCampaignStatus(campaignId, 'failed', undefined, runId);
        throw error;
      }
    });
  }

  private findFailedSteps(stepResults: Map<string, SkillStepResult>): Array<SkillStepResult & { stepId: string }> {
    const failed: Array<SkillStepResult & { stepId: string }> = [];
    for (const [stepId, result] of stepResults) {
      if (!result.ok) failed.push({ ...result, stepId });
    }
    return failed;
  }

  private extractBundleUrl(stepResults: Map<string, SkillStepResult>): string | undefined {
    for (const [, result] of stepResults) {
      if (result.data?.bundleUrl) return result.data.bundleUrl as string;
    }
    return undefined;
  }

  private async updateRunStatus(run: Run, status: Run['status'], error?: { code: string; message: string; failedStepId?: string }): Promise<void> {
    run.status = status;
    if (status === 'running') run.startedAt = new Date();
    if (status === 'completed' || status === 'failed' || status === 'cancelled') {
      run.completedAt = new Date();
      if (run.startedAt) run.durationMs = run.completedAt.getTime() - run.startedAt.getTime();
    }
    if (error) run.error = { ...error, timestamp: new Date().toISOString() };
    await this.runRepository.save(run);
  }

  private async updateRunStatusById(runId: string, tenantId: string, status: Run['status'], error?: { code: string; message: string }): Promise<void> {
    const run = await this.runRepository.findOne({ where: { id: runId, tenantId } });
    if (run) await this.updateRunStatus(run, status, error);
  }

  private async updateCampaignStatus(campaignId: string | undefined, status: 'live' | 'failed', bundleUrl: string | undefined, runId: string): Promise<void> {
    if (!campaignId) return;
    try {
      await this.campaignStatusService.updateStatusFromRun(campaignId, { status, bundleUrl, latestRunId: runId });
    } catch (error) {
      this.logger.error(`[CampaignRun] Failed to update campaign ${campaignId} status: ${(error as Error).message}`);
    }
  }
}
