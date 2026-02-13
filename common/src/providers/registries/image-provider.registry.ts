import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ImageProviderAdapter } from '@agentic-template/dto/src/providers/interfaces/image-provider.interface';
import { ProviderInfo } from '@agentic-template/dto/src/providers/interfaces/provider-registry.interface';
import { ProviderErrorCode } from '@agentic-template/dto/src/providers/types/provider-error.interface';
import { ProviderError } from '../errors/provider.error';
import { StabilityAdapter } from '../adapters/stability.adapter';
import { NanoBananaImageAdapter } from '../adapters/nano-banana-image.adapter';

@Injectable()
export class ImageProviderRegistry {
  private readonly logger = new Logger(ImageProviderRegistry.name);
  private readonly providers: Map<string, ImageProviderAdapter>;
  private readonly defaultProviderId: string;

  constructor(
    private readonly stabilityAdapter: StabilityAdapter,
    @Optional() private readonly nanoBananaImageAdapter: NanoBananaImageAdapter,
    private readonly configService: ConfigService,
  ) {
    this.providers = new Map();
    this.providers.set('stability', stabilityAdapter);
    if (nanoBananaImageAdapter) {
      this.providers.set('nano-banana-image', nanoBananaImageAdapter);
    }
    this.defaultProviderId = configService.get<string>('DEFAULT_IMAGE_PROVIDER') || 'stability';
    this.logger.log(`Registered ${this.providers.size} image provider(s): ${Array.from(this.providers.keys()).join(', ')} (default: ${this.defaultProviderId})`);
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

  getProvidersInOrder(providerId?: string): ImageProviderAdapter[] {
    const primaryId = providerId || this.defaultProviderId;
    const result: ImageProviderAdapter[] = [];
    const primary = this.providers.get(primaryId);
    if (primary) {
      result.push(primary);
    }
    for (const [id, provider] of this.providers) {
      if (id !== primaryId) {
        result.push(provider);
      }
    }
    return result;
  }
}
