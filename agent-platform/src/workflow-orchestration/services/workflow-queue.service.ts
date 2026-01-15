import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QueueNames } from '@agentic-template/common/src/queues/queue-names';
import { WorkflowJobData } from '../interfaces/workflow-job.interface';
import { JobStatusResult } from '../interfaces/job-status-result.interface';

@Injectable()
export class WorkflowQueueService {
  private readonly logger = new Logger(WorkflowQueueService.name);

  constructor(
    @InjectQueue(QueueNames.WORKFLOW_ORCHESTRATION)
    private readonly workflowQueue: Queue,
  ) {}

  async queueWorkflow(jobData: WorkflowJobData): Promise<string> {
    const job = await this.workflowQueue.add('execute-workflow', jobData, {
      removeOnComplete: false,
      removeOnFail: false,
    });

    this.logger.log(`Queued workflow job ${job.id} for execution ${jobData.executionId}`);
    return job.id as string;
  }

  async getJobStatus(jobId: string): Promise<JobStatusResult | null> {
    const job = await this.workflowQueue.getJob(jobId);
    if (!job) {
      return null;
    }

    const state = await job.getState();
    return {
      jobId: job.id,
      state,
      progress: job.progress as number | object,
      data: job.data as unknown,
      returnvalue: job.returnvalue as unknown,
      failedReason: job.failedReason,
    };
  }

  async getQueueMetrics() {
    const [waiting, active, completed, failed] = await Promise.all([
      this.workflowQueue.getWaitingCount(),
      this.workflowQueue.getActiveCount(),
      this.workflowQueue.getCompletedCount(),
      this.workflowQueue.getFailedCount(),
    ]);

    return {
      queue: {
        waiting,
        active,
        completed,
        failed,
        total: waiting + active + completed + failed,
      },
    };
  }
}
