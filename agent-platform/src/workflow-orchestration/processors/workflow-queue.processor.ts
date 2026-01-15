import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, OnApplicationShutdown } from '@nestjs/common';
import { Job } from 'bullmq';
import { QueueNames } from '@agentic-template/common/src/queues/queue-names';
import { WorkflowEngineService } from '../services/workflow-engine.service';
import { WorkflowJobData } from '../interfaces/workflow-job.interface';
import { TenantClsService } from '@agentic-template/common/src/tenant/tenant-cls.service';
import { WorkflowErrorHandlerService } from '../services/workflow-error-handler.service';
import { WorkflowTimeoutService } from '../services/workflow-timeout.service';
import { WorkflowResult } from '../interfaces/workflow-result.interface';
import { DataEnrichmentWorkflow } from '../../workflows/data-enrichment/data-enrichment.workflow';
import { DATA_ENRICHMENT_WORKFLOW_TYPE } from '../../workflows/data-enrichment/data-enrichment.constants';

@Processor(QueueNames.WORKFLOW_ORCHESTRATION, { concurrency: 1 })
export class WorkflowQueueProcessor extends WorkerHost implements OnApplicationShutdown {
  private readonly logger = new Logger(WorkflowQueueProcessor.name);
  private isShuttingDown = false;

  constructor(
    private readonly workflowEngine: WorkflowEngineService,
    private readonly tenantCls: TenantClsService,
    private readonly errorHandler: WorkflowErrorHandlerService,
    private readonly timeoutService: WorkflowTimeoutService,
    private readonly dataEnrichmentWorkflow: DataEnrichmentWorkflow,
  ) {
    super();
    this.logger.log('Workflow queue processor initialized - Sequential mode (concurrency: 1)');
  }

  async process(job: Job<WorkflowJobData>): Promise<any> {
    this.validateJobCanBeProcessed(job);

    const { executionId, workflowId, workflowType, tenantId, input, checkpointId, isRetry } = job.data;
    const jobId = String(job.id);

    this.logJobStart(jobId, executionId, workflowType, isRetry ?? false, checkpointId);

    const startTime = Date.now();

    try {
      const result = await this.executeWorkflowWithTenant(tenantId, executionId, workflowType, input, checkpointId, isRetry ?? false);

      this.logJobSuccess(jobId, isRetry ?? false, checkpointId, startTime);

      return this.formatSuccessResult(executionId, workflowId, result);
    } catch (error) {
      throw this.handleWorkflowError(error, jobId, executionId, workflowId, workflowType);
    }
  }

  private validateJobCanBeProcessed(job: Job<WorkflowJobData>): void {
    if (this.isShuttingDown) {
      this.logger.warn(`Rejecting job ${job.id} - application is shutting down`);
      throw new Error('Application is shutting down - workflow execution cancelled');
    }
  }

  private logJobStart(jobId: string, executionId: string, workflowType: string, isRetry: boolean, checkpointId: string | undefined): void {
    if (isRetry && checkpointId) {
      this.logger.log(`Processing workflow RETRY job ${jobId} - execution: ${executionId}, type: ${workflowType}, checkpoint: ${checkpointId}`);
    } else {
      this.logger.log(`Processing workflow job ${jobId} - execution: ${executionId}, type: ${workflowType}`);
    }
  }

  private async executeWorkflowWithTenant(
    tenantId: string,
    executionId: string,
    workflowType: string,
    input: Record<string, unknown>,
    checkpointId: string | undefined,
    isRetry: boolean,
  ): Promise<WorkflowResult> {
    return await this.tenantCls.runWithTenantTransaction(tenantId, undefined, async () => {
      return await this.timeoutService.executeWithTimeout(executionId, async () => {
        return await this.executeWorkflow(workflowType, input, executionId, tenantId, checkpointId, isRetry);
      });
    });
  }

  private async executeWorkflow(
    workflowType: string,
    input: Record<string, unknown>,
    executionId: string,
    tenantId: string,
    checkpointId: string | undefined,
    isRetry: boolean,
  ): Promise<WorkflowResult> {
    this.logger.log(`Executing workflow type: ${workflowType}, execution: ${executionId}, isRetry: ${isRetry}`);

    switch (workflowType) {
      case DATA_ENRICHMENT_WORKFLOW_TYPE: {
        const graph = this.dataEnrichmentWorkflow.createGraph();
        return await this.workflowEngine.executeWorkflow(graph, input, executionId, tenantId, workflowType, checkpointId);
      }
      default:
        throw new Error(`Unknown workflow type: ${workflowType}. Please register your workflow in the processor.`);
    }
  }

  private logJobSuccess(jobId: string, isRetry: boolean, checkpointId: string | undefined, startTime: number): void {
    const durationMs = Date.now() - startTime;
    const actionType = isRetry && checkpointId ? 'RETRY' : 'EXECUTION';
    this.logger.log(`Workflow ${actionType} completed successfully for job ${jobId} (duration: ${durationMs}ms)`);
  }

  private formatSuccessResult(executionId: string, workflowId: string, result: WorkflowResult): any {
    return {
      success: true,
      executionId,
      workflowId,
      output: result,
    };
  }

  private handleWorkflowError(error: unknown, jobId: string, executionId: string, workflowId: string, workflowType: string): Error {
    this.logger.error(`Workflow execution failed for job ${jobId}`, error);

    const categorizedError = this.errorHandler.categorizeError(error instanceof Error ? error : new Error('Unknown error'), {
      executionId,
      workflowId,
      workflowType,
      jobId: jobId,
    });

    const { errorMessage, errorCategory } = this.errorHandler.formatErrorForStorage(categorizedError);

    this.logger.error(`Error details - category: ${errorCategory}, message: ${errorMessage}`);

    const errorToThrow = categorizedError.originalError;
    errorToThrow.message = `[${errorCategory}] ${errorMessage}`;
    return errorToThrow;
  }

  async onApplicationShutdown(signal?: string): Promise<void> {
    this.logger.log(`Workflow queue processor shutting down (signal: ${signal || 'unknown'})`);
    this.isShuttingDown = true;

    this.logger.log('Graceful shutdown: waiting for in-progress workflows to complete...');
    await new Promise((resolve) => setTimeout(resolve, 2000));

    this.logger.log('Workflow queue processor shutdown complete');
  }
}
