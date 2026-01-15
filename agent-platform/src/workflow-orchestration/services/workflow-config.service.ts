import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WorkflowConfigInterface } from '../interfaces/workflow-config.interface';

@Injectable()
export class WorkflowConfigService {
  constructor(private readonly configService: ConfigService) {}

  getWorkflowConfig(): WorkflowConfigInterface {
    return {
      recursionLimit: this.configService.get<number>('WORKFLOW_RECURSION_LIMIT', 50),
      maxSteps: this.configService.get<number>('WORKFLOW_MAX_STEPS', 100),
      timeoutMs: this.configService.get<number>('WORKFLOW_TIMEOUT_MS', 300000),
    };
  }

  getTimeoutMs(): number {
    return this.configService.get<number>('WORKFLOW_TIMEOUT_MS', 300000);
  }

  getRecursionLimit(): number {
    return this.configService.get<number>('WORKFLOW_RECURSION_LIMIT', 50);
  }

  getMaxSteps(): number {
    return this.configService.get<number>('WORKFLOW_MAX_STEPS', 100);
  }
}
