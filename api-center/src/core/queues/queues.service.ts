import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { v4 as uuidv4 } from 'uuid';
import { QueueNames } from '@agentic-template/common/src/queues/queue-names';

export interface WorkflowJobData {
  executionId: string;
  workflowId: string;
  workflowType: string;
  tenantId: string;
  input: Record<string, unknown>;
}

@Injectable()
export class QueuesService {
  private readonly logger = new Logger(QueuesService.name);

  constructor(@InjectQueue(QueueNames.WORKFLOW_ORCHESTRATION) private workflowQueue: Queue<WorkflowJobData>) {}

  async enqueueWorkflow(tenantId: string, workflowType: string, input: Record<string, unknown>): Promise<string> {
    const executionId = uuidv4();
    const workflowId = uuidv4();

    const jobData: WorkflowJobData = {
      executionId,
      workflowId,
      workflowType,
      tenantId,
      input,
    };

    const job = await this.workflowQueue.add('execute-workflow', jobData, {
      removeOnComplete: false,
      removeOnFail: false,
    });

    const jobId = job.id ?? 'unknown';
    this.logger.log(`Enqueued workflow ${workflowType} (execution: ${executionId}, job: ${jobId})`);
    return jobId;
  }

  async getWorkflowJobStatus(jobId: string): Promise<{
    id: string;
    state: string;
    progress: number | string | boolean | object;
    data: WorkflowJobData;
    returnvalue: Record<string, unknown> | undefined;
    failedReason: string | undefined;
  } | null> {
    const job = await this.workflowQueue.getJob(jobId);
    if (!job) {
      return null;
    }

    return {
      id: job.id ?? jobId,
      state: await job.getState(),
      progress: job.progress,
      data: job.data,
      returnvalue: job.returnvalue as Record<string, unknown> | undefined,
      failedReason: job.failedReason,
    };
  }
}
