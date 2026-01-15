import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HealthIndicatorResult } from '@nestjs/terminus';
import Redis from 'ioredis';

@Injectable()
export class ValkeyHealthIndicator implements OnModuleDestroy {
  private redis: Redis | null = null;

  constructor(private readonly configService: ConfigService) {}

  async isHealthy(key: string = 'valkey'): Promise<HealthIndicatorResult> {
    try {
      const redis = this.getRedisClient();
      const result = await redis.ping();
      const isHealthy = result === 'PONG';

      if (!isHealthy) {
        return { [key]: { status: 'down', message: 'Valkey ping failed' } };
      }

      return { [key]: { status: 'up' } };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return { [key]: { status: 'down', message: errorMessage } };
    }
  }

  async onModuleDestroy() {
    if (this.redis) {
      await this.redis.quit();
      this.redis = null;
    }
  }

  private getRedisClient(): Redis {
    if (!this.redis) {
      const tlsEnabled = this.configService.get<string>('REDIS_TLS_ENABLED') === 'true';

      this.redis = new Redis({
        host: this.configService.get<string>('REDIS_HOST'),
        port: this.configService.get<number>('REDIS_PORT'),
        password: this.configService.get<string>('REDIS_PASSWORD'),
        tls: tlsEnabled ? {} : undefined,
        connectTimeout: 5000,
        commandTimeout: 3000,
      });
    }
    return this.redis;
  }
}
