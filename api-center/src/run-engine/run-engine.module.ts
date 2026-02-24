import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QueueNames } from '@agentic-template/common/src/queues/queue-names';
import { TenantClsModule } from '@agentic-template/common/src/tenant/tenant-cls.module';
import { Run } from '@agentic-template/dao/src/entities/run.entity';
import { RunEngineApiService } from './services/run-engine-api.service';
import { RunEngineController } from './run-engine.controller';

@Module({
  imports: [
    TenantClsModule,
    TypeOrmModule.forFeature([Run]),
    BullModule.registerQueue({
      name: QueueNames.RUN_ORCHESTRATION,
    }),
  ],
  controllers: [RunEngineController],
  providers: [RunEngineApiService],
  exports: [RunEngineApiService],
})
export class RunEngineModule {}
