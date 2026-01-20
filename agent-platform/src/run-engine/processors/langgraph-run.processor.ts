import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QueueNames } from '@agentic-template/common/src/queues/queue-names';
import { TenantClsService } from '@agentic-template/common/src/tenant/tenant-cls.service';
import { RunEngineService, RunOrchestrationJobData } from '../services/run-engine.service';
import { WorkflowRegistryService } from '../services/workflow-registry.service';
import { LangGraphWorkflowBuilderService } from '../services/langgraph-workflow-builder.service';
import { WorkflowEngineService } from '../../workflow-orchestration/services/workflow-engine.service';
import { RunStateType } from '../interfaces/langgraph-run-state.interface';

@Processor(QueueNames.RUN_ORCHESTRATION, { concurrency: 1 })
export class LangGraphRunProcessor extends WorkerHost {
  private readonly logger = new Logger(LangGraphRunProcessor.name);

  constructor(
    private readonly runEngineService: RunEngineService,
    private readonly workflowRegistryService: WorkflowRegistryService,
    private readonly langGraphBuilder: LangGraphWorkflowBuilderService,
    private readonly workflowEngineService: WorkflowEngineService,
    private readonly tenantClsService: TenantClsService,
  ) {
    super();
  }

  async process(job: Job<RunOrchestrationJobData>): Promise<void> {
    const { runId, tenantId } = job.data;

    this.logger.log(`[LangGraphRun] Starting run: runId=${runId}, tenantId=${tenantId}`);

    await this.tenantClsService.runWithTenant(tenantId, undefined, async () => {
      try {
        const run = await this.runEngineService.getRun(runId);
        if (!run) {
          throw new Error(`Run ${runId} not found`);
        }

        const workflow = this.workflowRegistryService.getWorkflow(run.workflowName, run.workflowVersion);
        if (!workflow) {
          throw new Error(`Workflow ${run.workflowName} v${run.workflowVersion} not found`);
        }

        const existingSteps = await this.runEngineService.getRunSteps(runId);
        if (existingSteps.length === 0) {
          this.logger.log(`[LangGraphRun] Creating run steps for run ${runId}`);
          await this.runEngineService.createRunSteps(runId, tenantId, workflow, run.triggerPayload || {});
        }

        await this.runEngineService.updateRunStatus(runId, 'running');

        const graph = this.langGraphBuilder.buildGraph(workflow);

        const initialState: Partial<RunStateType> = {
          runId,
          tenantId,
          workflowName: workflow.workflowName,
          triggerPayload: run.triggerPayload || {},
          stepResults: new Map(),
          artifacts: new Map(),
          error: null,
        };

        this.logger.log(`[LangGraphRun] Executing workflow via LangGraph: ${workflow.workflowName}`);

        const result = await this.workflowEngineService.executeWorkflow(graph, initialState as RunStateType, runId, tenantId, `run-engine:${workflow.workflowName}`);

        const finalState = result as unknown as RunStateType;
        const stepResults = finalState.stepResults || new Map();
        const failedSteps = Array.from(stepResults.values()).filter((s) => s.status === 'failed');

        if (finalState.error || failedSteps.length > 0) {
          const failedStep = failedSteps[0];
          await this.runEngineService.updateRunStatus(runId, 'failed', {
            code: 'STEP_EXECUTION_FAILED',
            message: failedStep?.error?.message || finalState.error || 'Unknown error',
            failedStepId: failedStep?.stepId,
          });
          this.logger.error(`[LangGraphRun] Run failed: runId=${runId}, failedStep=${failedStep?.stepId || 'none'}`);
        } else {
          await this.runEngineService.updateRunStatus(runId, 'completed');
          this.logger.log(`[LangGraphRun] Run completed: runId=${runId}`);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        this.logger.error(`[LangGraphRun] Run error: runId=${runId}, error=${message}`);
        await this.runEngineService.updateRunStatus(runId, 'failed', {
          code: 'ORCHESTRATION_ERROR',
          message,
        });
        throw error;
      }
    });
  }
}
