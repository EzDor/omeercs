import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { QueueNames } from '@agentic-template/common/src/queues/queue-names';
import { TenantClsModule } from '@agentic-template/common/src/tenant/tenant-cls.module';

// Entities
import { Run } from '@agentic-template/dao/src/entities/run.entity';
import { RunStep } from '@agentic-template/dao/src/entities/run-step.entity';
import { Artifact } from '@agentic-template/dao/src/entities/artifact.entity';

// Services
import { RunEngineApiService } from './services/run-engine-api.service';

// Controllers
import { RunEngineController } from './run-engine.controller';
import { DevRunEngineController } from './dev-run-engine.controller';

const devControllers = process.env.NODE_ENV !== 'production' ? [DevRunEngineController] : [];

@Module({
  imports: [
    ConfigModule,
    TenantClsModule,
    TypeOrmModule.forFeature([Run, RunStep, Artifact]),
    BullModule.registerQueue({
      name: QueueNames.RUN_ORCHESTRATION,
    }),
  ],
  controllers: [RunEngineController, ...devControllers],
  providers: [RunEngineApiService],
  exports: [RunEngineApiService],
})
export class RunEngineModule {}
