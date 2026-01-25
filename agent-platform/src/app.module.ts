import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { CoreModule } from 'src/core/core.module';
import { WorkflowOrchestrationModule } from 'src/workflow-orchestration/workflow-orchestration.module';
import { HealthModule } from 'src/health/health.module';
import { SkillsModule } from 'src/skills/skills.module';
import { RunEngineModule } from 'src/run-engine/run-engine.module';
import { PromptRegistryModule } from 'src/prompt-registry/prompt-registry.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UnhandledExceptionFilter } from '@agentic-template/common/src/filters/unhandled-exception.filter';
import { GlobalHttpExceptionFilter } from '@agentic-template/common/src/filters/global-http-exception.filter';
import { ProvidersModule } from '@agentic-template/common/src/providers/providers.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    CoreModule,
    WorkflowOrchestrationModule,
    HealthModule,
    SkillsModule,
    ProvidersModule,
    RunEngineModule,
    PromptRegistryModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_FILTER,
      useClass: GlobalHttpExceptionFilter,
    },
    {
      provide: APP_FILTER,
      useClass: UnhandledExceptionFilter,
    },
  ],
})
export class AppModule {}
