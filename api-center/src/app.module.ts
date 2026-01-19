import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { CoreModule } from 'src/core/core.module';
import { ChatModule } from './chat/chat.module';
import { HealthModule } from './health/health.module';
import { RunEngineModule } from './run-engine/run-engine.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UnhandledExceptionFilter } from '@agentic-template/common/src/filters/unhandled-exception.filter';
import { GlobalHttpExceptionFilter } from '@agentic-template/common/src/filters/global-http-exception.filter';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),

    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 100,
      },
    ]),

    CoreModule,
    ChatModule,
    HealthModule,
    RunEngineModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
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
