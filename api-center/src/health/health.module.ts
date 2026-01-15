import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { ValkeyHealthIndicator } from '@agentic-template/common/src/health/valkey-health.indicator';
import { LlmHealthIndicator } from '@agentic-template/common/src/health/llm-health.indicator';
import { HealthController } from './health.controller';

@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
  providers: [ValkeyHealthIndicator, LlmHealthIndicator],
})
export class HealthModule {}
