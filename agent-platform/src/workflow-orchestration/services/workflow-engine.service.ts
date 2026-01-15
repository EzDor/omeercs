import { Injectable, Logger, Inject } from '@nestjs/common';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { StateGraph } from '@langchain/langgraph';
import { Pool } from 'pg';
import { WORKFLOW_PG_POOL } from '../providers/workflow-pg-pool.provider';
import { WorkflowConfigService } from './workflow-config.service';
import { TracingConfigService } from './tracing-config.service';
import { DataSanitizationService } from './data-sanitization.service';
import { WorkflowResult } from '../interfaces/workflow-result.interface';

@Injectable()
export class WorkflowEngineService {
  private readonly logger = new Logger(WorkflowEngineService.name);
  private checkpointer: PostgresSaver;

  constructor(
    @Inject(WORKFLOW_PG_POOL) private readonly pgPool: Pool,
    private readonly configService: WorkflowConfigService,
    private readonly tracingConfigService: TracingConfigService,
    private readonly dataSanitizationService: DataSanitizationService,
  ) {
    this.checkpointer = new PostgresSaver(pgPool, undefined, {
      schema: 'app',
    });
    this.logger.log('PostgreSQL checkpointer initialized (tables managed by migrations)');
  }

  async executeWorkflow<T extends object>(
    graph: StateGraph<T>,
    input: T,
    threadId: string,
    tenantId: string,
    workflowType: string,
    checkpointId?: string,
    signal?: AbortSignal,
  ): Promise<WorkflowResult> {
    const traceMetadata = this.tracingConfigService.buildWorkflowMetadata(threadId, tenantId, workflowType);

    const compiledGraph = graph.compile({
      checkpointer: this.checkpointer,
    });

    const runConfig = {
      configurable: {
        thread_id: threadId,
        checkpoint_id: checkpointId,
        tenant_id: tenantId,
        workflow_type: workflowType,
      },
      metadata: {
        environment: traceMetadata.environment,
        service: traceMetadata.serviceName,
        tenant_id: tenantId,
        workflow_type: workflowType,
      },
      signal,
    };

    try {
      this.logger.log(`Executing workflow with thread_id: ${threadId}, tenant_id: ${tenantId}, workflow_type: ${workflowType}`);

      if (signal?.aborted) {
        throw new Error('Workflow execution aborted before start');
      }

      try {
        const sanitizedInputForLogging = this.dataSanitizationService.maskSensitiveFields(input as Record<string, unknown>, this.tracingConfigService.getMaskedFieldPatterns());
        this.logger.debug(`Workflow input (sanitized): ${JSON.stringify(sanitizedInputForLogging)}`);
      } catch (sanitizationError) {
        this.logger.warn(`Failed to sanitize workflow input for logging: ${sanitizationError}`);
      }

      const invokeFunction = compiledGraph.invoke.bind(compiledGraph) as (input: T, config: typeof runConfig) => Promise<WorkflowResult>;
      const result = await invokeFunction(input, runConfig);
      this.logger.log(`Workflow execution completed for thread_id: ${threadId}`);
      return result;
    } catch (error) {
      this.logger.error(`Workflow execution failed for thread_id: ${threadId}`, error);
      throw error;
    }
  }

  async retryWorkflow<T extends object>(
    graph: StateGraph<T>,
    checkpointId: string,
    threadId: string,
    tenantId: string,
    workflowType: string,
    signal?: AbortSignal,
  ): Promise<WorkflowResult> {
    const checkpointExists = await this.validateCheckpoint(checkpointId, threadId);

    if (!checkpointExists) {
      const errorMessage = `Checkpoint not found: ${checkpointId} for thread ${threadId}`;
      this.logger.error(errorMessage);
      throw new Error(errorMessage);
    }

    this.logger.log(`Retrying workflow from checkpoint: ${checkpointId}, thread_id: ${threadId}, tenant_id: ${tenantId}`);

    try {
      const result = await this.executeWorkflow(graph, {} as T, threadId, tenantId, workflowType, checkpointId, signal);

      this.logger.log(`Workflow retry completed successfully for checkpoint: ${checkpointId}`);
      return result;
    } catch (error) {
      this.logger.error(`Workflow retry failed for checkpoint: ${checkpointId}, thread_id: ${threadId}, tenant_id: ${tenantId}`, error);
      throw error;
    }
  }

  async validateCheckpoint(checkpointId: string, threadId: string): Promise<boolean> {
    try {
      const checkpoint = await this.checkpointer.get({
        configurable: {
          thread_id: threadId,
          checkpoint_id: checkpointId,
        },
      });

      return checkpoint !== undefined;
    } catch (error) {
      this.logger.error(`Failed to validate checkpoint: ${checkpointId}`, error);
      return false;
    }
  }

  getCheckpointer(): PostgresSaver {
    return this.checkpointer;
  }
}
