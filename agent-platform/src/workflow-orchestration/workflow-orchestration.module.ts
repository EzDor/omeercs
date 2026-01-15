import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule } from '@nestjs/config';
import { QueueNames } from '@agentic-template/common/src/queues/queue-names';
import { WorkflowEngineService } from './services/workflow-engine.service';
import { WorkflowConfigService } from './services/workflow-config.service';
import { WorkflowQueueService } from './services/workflow-queue.service';
import { WorkflowQueueProcessor } from './processors/workflow-queue.processor';
import { WorkflowPgPoolProvider } from './providers/workflow-pg-pool.provider';
import { TenantClsModule } from '@agentic-template/common/src/tenant/tenant-cls.module';
import { WorkflowErrorHandlerService } from './services/workflow-error-handler.service';
import { WorkflowTimeoutService } from './services/workflow-timeout.service';
import { TracingConfigService } from './services/tracing-config.service';
import { DataSanitizationService } from './services/data-sanitization.service';
import { DataEnrichmentModule } from '../workflows/data-enrichment/data-enrichment.module';

@Module({
  imports: [
    ConfigModule,
    TenantClsModule,
    BullModule.registerQueue({
      name: QueueNames.WORKFLOW_ORCHESTRATION,
    }),
    DataEnrichmentModule,
  ],
  providers: [
    WorkflowPgPoolProvider,
    WorkflowEngineService,
    WorkflowConfigService,
    WorkflowQueueService,
    WorkflowQueueProcessor,
    WorkflowErrorHandlerService,
    WorkflowTimeoutService,
    TracingConfigService,
    DataSanitizationService,
  ],
  exports: [WorkflowEngineService, WorkflowQueueService],
})
export class WorkflowOrchestrationModule {}
