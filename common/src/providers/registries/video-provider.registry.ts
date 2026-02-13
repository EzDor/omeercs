import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { VideoProviderAdapter } from '@agentic-template/dto/src/providers/interfaces/video-provider.interface';
import { ProviderInfo } from '@agentic-template/dto/src/providers/interfaces/provider-registry.interface';
import { ProviderErrorCode } from '@agentic-template/dto/src/providers/types/provider-error.interface';
import { ProviderError } from '../errors/provider.error';
import { NanoBananaVideoAdapter } from '../adapters/nano-banana-video.adapter';

@Injectable()
export class VideoProviderRegistry {
  private readonly logger = new Logger(VideoProviderRegistry.name);
  private readonly providers: Map<string, VideoProviderAdapter>;
  private readonly defaultProviderId: string;

  constructor(
    private readonly nanoBananaVideoAdapter: NanoBananaVideoAdapter,
    private readonly configService: ConfigService,
  ) {
    this.providers = new Map();
    this.providers.set('nano-banana-video', nanoBananaVideoAdapter);
    this.defaultProviderId = configService.get<string>('DEFAULT_VIDEO_PROVIDER') || 'nano-banana-video';
    this.logger.log(`Registered ${this.providers.size} video provider(s): ${Array.from(this.providers.keys()).join(', ')} (default: ${this.defaultProviderId})`);
  }

  getProvider(providerId?: string): VideoProviderAdapter {
    const id = providerId || this.defaultProviderId;
    const provider = this.providers.get(id);
    if (!provider) {
      throw new ProviderError(ProviderErrorCode.PROVIDER_NOT_FOUND, id, `Video provider '${id}' not found`);
    }
    return provider;
  }

  getDefaultProvider(): VideoProviderAdapter {
    return this.getProvider(this.defaultProviderId);
  }

  listProviders(): ProviderInfo[] {
    return Array.from(this.providers.entries()).map(([providerId]) => ({
      providerId,
      type: 'video' as const,
      isDefault: providerId === this.defaultProviderId,
    }));
  }

  hasProvider(providerId: string): boolean {
    return this.providers.has(providerId);
  }

  getDefaultProviderId(): string {
    return this.defaultProviderId;
  }

  getProvidersInOrder(providerId?: string): VideoProviderAdapter[] {
    const primaryId = providerId || this.defaultProviderId;
    const result: VideoProviderAdapter[] = [];
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
