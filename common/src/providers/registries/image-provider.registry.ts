import { Injectable, Logger } from '@nestjs/common';
import { ImageProviderAdapter, ProviderErrorCode, ProviderInfo } from '@agentic-template/dto/src/providers';
import { ProviderError } from '../errors/provider.error';
import { StabilityAdapter } from '../adapters/stability.adapter';

@Injectable()
export class ImageProviderRegistry {
  private readonly logger = new Logger(ImageProviderRegistry.name);
  private readonly providers: Map<string, ImageProviderAdapter>;
  private readonly defaultProviderId = 'stability';

  constructor(private readonly stabilityAdapter: StabilityAdapter) {
    this.providers = new Map();
    this.providers.set('stability', stabilityAdapter);
    this.logger.log(`Registered ${this.providers.size} image provider(s): ${Array.from(this.providers.keys()).join(', ')}`);
  }

  getProvider(providerId?: string): ImageProviderAdapter {
    const id = providerId || this.defaultProviderId;
    const provider = this.providers.get(id);
    if (!provider) {
      throw new ProviderError(ProviderErrorCode.PROVIDER_NOT_FOUND, id, `Image provider '${id}' not found`);
    }
    return provider;
  }

  getDefaultProvider(): ImageProviderAdapter {
    return this.getProvider(this.defaultProviderId);
  }

  listProviders(): ProviderInfo[] {
    return Array.from(this.providers.entries()).map(([providerId]) => ({
      providerId,
      type: 'image' as const,
      isDefault: providerId === this.defaultProviderId,
    }));
  }

  hasProvider(providerId: string): boolean {
    return this.providers.has(providerId);
  }

  getDefaultProviderId(): string {
    return this.defaultProviderId;
  }
}
