import { Injectable, Logger, OnModuleInit, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TracingConfigurationInterface } from '../interfaces/tracing-configuration.interface';
import { WorkflowTraceMetadataInterface } from '../interfaces/workflow-trace-metadata.interface';
import { SensitiveDataPatternInterface } from '../interfaces/sensitive-data-pattern.interface';
import { DataSanitizationService } from './data-sanitization.service';

@Injectable()
export class TracingConfigService implements OnModuleInit {
  private readonly logger = new Logger(TracingConfigService.name);
  private static readonly SERVICE_NAME = 'agent-platform';

  constructor(
    private readonly configService: ConfigService,
    @Inject(forwardRef(() => DataSanitizationService))
    private readonly dataSanitizationService: DataSanitizationService,
  ) {}

  onModuleInit(): void {
    this.validateTracingConfiguration();
  }

  private validateTracingConfiguration(): void {
    const tracingEnabled = this.isTracingEnabled();
    const apiKey = this.getApiKey();

    if (tracingEnabled && !apiKey) {
      this.logger.warn('LangSmith tracing is enabled but LANGCHAIN_API_KEY is not configured. Traces will not be sent to LangSmith.');
    }

    if (tracingEnabled && apiKey) {
      this.logger.log(`LangSmith tracing enabled for project: ${this.getProjectName()}`);
    }

    if (!tracingEnabled) {
      this.logger.log('LangSmith tracing is disabled');
    }
  }

  isTracingEnabled(): boolean {
    const tracingEnabled = this.configService.get<string>('LANGCHAIN_TRACING_V2', 'false');
    return tracingEnabled === 'true';
  }

  getProjectName(): string {
    return this.configService.get<string>('LANGCHAIN_PROJECT', 'agentic-template-dev');
  }

  getApiKey(): string {
    return this.configService.get<string>('LANGCHAIN_API_KEY', '');
  }

  getApiEndpoint(): string {
    return this.configService.get<string>('LANGCHAIN_ENDPOINT', 'https://api.smith.langchain.com');
  }

  isBackgroundCallbacksEnabled(): boolean {
    const backgroundEnabled = this.configService.get<string>('LANGCHAIN_CALLBACKS_BACKGROUND', 'true');
    return backgroundEnabled === 'true';
  }

  getMaskedFieldPatterns(): SensitiveDataPatternInterface[] {
    return this.dataSanitizationService.getDefaultPatterns();
  }

  getTracingConfiguration(): TracingConfigurationInterface {
    return {
      enabled: this.isTracingEnabled(),
      projectName: this.getProjectName(),
      apiKey: this.getApiKey(),
      endpoint: this.getApiEndpoint(),
      backgroundCallbacks: this.isBackgroundCallbacksEnabled(),
      maskedFieldPatterns: this.getMaskedFieldPatterns(),
    };
  }

  buildWorkflowMetadata(threadId: string, tenantId: string, workflowType: string): WorkflowTraceMetadataInterface {
    return {
      threadId,
      tenantId,
      workflowType,
      environment: this.configService.get<string>('NODE_ENV', 'development'),
      serviceName: TracingConfigService.SERVICE_NAME,
      timestamp: new Date(),
    };
  }
}
