import { Controller, Get } from '@nestjs/common';
import { HealthCheckService, HealthCheck, TypeOrmHealthIndicator } from '@nestjs/terminus';
import { Public } from '@agentic-template/common/src/auth/public.decorator';
import { ValkeyHealthIndicator } from '@agentic-template/common/src/health/valkey-health.indicator';
import { LlmHealthIndicator } from '@agentic-template/common/src/health/llm-health.indicator';

@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: TypeOrmHealthIndicator,
    private readonly valkeyHealthIndicator: ValkeyHealthIndicator,
    private readonly llmHealthIndicator: LlmHealthIndicator,
  ) {}

  @Get()
  @Public()
  @HealthCheck()
  check() {
    return this.health.check([() => this.db.pingCheck('database'), () => this.valkeyHealthIndicator.isHealthy('valkey'), () => this.llmHealthIndicator.isHealthy('llm')]);
  }

  @Get('liveness')
  @Public()
  liveness() {
    return { status: 'ok' };
  }
}
