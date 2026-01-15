import { ConfigService } from '@nestjs/config';
import { LiteLLMHttpClient } from './litellm-http.client';

export interface LiteLLMConfiguration {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface LiteLLMBasicConfiguration {
  baseUrl: string;
  apiKey: string;
}

export class LiteLLMClientFactory {
  static loadConfiguration(configService: ConfigService): LiteLLMConfiguration {
    const baseUrl = configService.get<string>('LITELLM_BASE_URL');
    const apiKey = configService.get<string>('LITELLM_API_KEY');
    const model = configService.get<string>('LITELLM_MODEL');

    this.validateConfiguration(baseUrl, apiKey, model);

    return { baseUrl: baseUrl!, apiKey: apiKey!, model: model! };
  }

  static validateConfiguration(baseUrl: string | undefined, apiKey: string | undefined, model: string | undefined): void {
    if (!baseUrl) {
      throw new Error('LITELLM_BASE_URL environment variable is required');
    }
    if (!apiKey) {
      throw new Error('LITELLM_API_KEY environment variable is required');
    }
    if (!model) {
      throw new Error('LITELLM_MODEL environment variable is required');
    }
  }

  static createClient(configuration: LiteLLMBasicConfiguration): LiteLLMHttpClient {
    return new LiteLLMHttpClient(configuration.baseUrl, configuration.apiKey);
  }

  static createClientFromConfig(configService: ConfigService): LiteLLMHttpClient {
    const configuration = this.loadBasicConfiguration(configService);
    return this.createClient(configuration);
  }

  static loadBasicConfiguration(configService: ConfigService): LiteLLMBasicConfiguration {
    const baseUrl = configService.get<string>('LITELLM_BASE_URL');
    const apiKey = configService.get<string>('LITELLM_API_KEY');

    this.validateBasicConfiguration(baseUrl, apiKey);

    return { baseUrl: baseUrl!, apiKey: apiKey! };
  }

  static validateBasicConfiguration(baseUrl: string | undefined, apiKey: string | undefined): void {
    if (!baseUrl) {
      throw new Error('LITELLM_BASE_URL environment variable is required');
    }
    if (!apiKey) {
      throw new Error('LITELLM_API_KEY environment variable is required');
    }
  }

  static createFileClient(configuration: LiteLLMBasicConfiguration): LiteLLMHttpClient {
    return new LiteLLMHttpClient(configuration.baseUrl, configuration.apiKey);
  }

  static createFileClientFromConfig(configService: ConfigService): LiteLLMHttpClient {
    const configuration = this.loadBasicConfiguration(configService);
    return this.createFileClient(configuration);
  }

  static createClientWithModelKwargs(configService: ConfigService): LiteLLMHttpClient {
    const baseConfig = this.loadBasicConfiguration(configService);
    return new LiteLLMHttpClient(baseConfig.baseUrl, baseConfig.apiKey);
  }
}
