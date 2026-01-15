import { Injectable, Logger } from '@nestjs/common';
import { WorkflowConfigService } from './workflow-config.service';

export interface TimeoutControllerInterface {
  signal: AbortSignal;
  clearTimeout: () => void;
}

@Injectable()
export class WorkflowTimeoutService {
  private readonly logger = new Logger(WorkflowTimeoutService.name);

  constructor(private readonly configService: WorkflowConfigService) {}

  createTimeoutSignal(executionId: string): TimeoutControllerInterface {
    const timeoutMs = this.configService.getTimeoutMs();
    const controller = new AbortController();

    const timeoutId = setTimeout(() => {
      this.logger.warn(`Workflow execution ${executionId} timed out after ${timeoutMs}ms`);
      controller.abort(new Error(`Workflow execution timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    return {
      signal: controller.signal,
      clearTimeout: () => {
        clearTimeout(timeoutId);
        this.logger.debug(`Timeout cleared for execution ${executionId}`);
      },
    };
  }

  async executeWithTimeout<T>(executionId: string, operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const { signal, clearTimeout } = this.createTimeoutSignal(executionId);

    try {
      const result = await operation(signal);
      clearTimeout();
      return result;
    } catch (error) {
      clearTimeout();
      if (signal.aborted) {
        const timeoutError = new Error(`Workflow execution timed out after ${this.configService.getTimeoutMs()}ms`);
        timeoutError.name = 'WorkflowTimeoutError';
        throw timeoutError;
      }
      throw error;
    }
  }
}
