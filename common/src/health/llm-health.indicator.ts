import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HealthIndicatorResult } from '@nestjs/terminus';

const HEALTH_CHECK_TIMEOUT_MS = 5000;

@Injectable()
export class LlmHealthIndicator {
  constructor(private readonly configService: ConfigService) {}

  async isHealthy(key: string = 'llm'): Promise<HealthIndicatorResult> {
    const liteLlmBaseUrl = this.configService.get<string>('LITELLM_BASE_URL');

    if (!liteLlmBaseUrl) {
      return { [key]: { status: 'down', message: 'LITELLM_BASE_URL not configured' } };
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT_MS);

    try {
      const response = await fetch(`${liteLlmBaseUrl}/health/readiness`, {
        signal: controller.signal,
      });

      if (!response.ok) {
        return {
          [key]: {
            status: 'down',
            message: `LiteLLM readiness check failed with status ${response.status}`,
          },
        };
      }

      return { [key]: { status: 'up' } };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return { [key]: { status: 'down', message: 'Health check timed out' } };
      }
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return { [key]: { status: 'down', message: errorMessage } };
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
