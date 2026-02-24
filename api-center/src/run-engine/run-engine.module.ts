import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { QueueNames } from '@agentic-template/common/src/queues/queue-names';
import { TenantClsModule } from '@agentic-template/common/src/tenant/tenant-cls.module';
import { Run } from '@agentic-template/dao/src/entities/run.entity';
import { Artifact } from '@agentic-template/dao/src/entities/artifact.entity';
import { RunEngineApiService } from './services/run-engine-api.service';
import { RunEngineController } from './run-engine.controller';

@Module({
  imports: [
    ConfigModule,
    TenantClsModule,
    TypeOrmModule.forFeature([Run, Artifact]),
    BullModule.registerQueue({
      name: QueueNames.RUN_ORCHESTRATION,
    }),
  ],
  controllers: [RunEngineController],
  providers: [RunEngineApiService],
  exports: [RunEngineApiService],
})
export class RunEngineModule {}
