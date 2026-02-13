import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Asset3DProviderAdapter } from '@agentic-template/dto/src/providers/interfaces/asset3d-provider.interface';
import { ProviderInfo } from '@agentic-template/dto/src/providers/interfaces/provider-registry.interface';
import { ProviderErrorCode } from '@agentic-template/dto/src/providers/types/provider-error.interface';
import { ProviderError } from '../errors/provider.error';
import { MeshyAsset3dAdapter } from '../adapters/meshy-3d.adapter';

@Injectable()
export class Asset3DProviderRegistry {
  private readonly logger = new Logger(Asset3DProviderRegistry.name);
  private readonly providers: Map<string, Asset3DProviderAdapter>;
  private readonly defaultProviderId: string;

  constructor(
    private readonly meshyAdapter: MeshyAsset3dAdapter,
    private readonly configService: ConfigService,
  ) {
    this.providers = new Map();
    this.providers.set('meshy', meshyAdapter);
    this.defaultProviderId = configService.get<string>('DEFAULT_3D_PROVIDER') || 'meshy';
    this.logger.log(`Registered ${this.providers.size} 3D provider(s): ${Array.from(this.providers.keys()).join(', ')} (default: ${this.defaultProviderId})`);
  }

  getProvider(providerId?: string): Asset3DProviderAdapter {
    const id = providerId || this.defaultProviderId;
    const provider = this.providers.get(id);
    if (!provider) {
      throw new ProviderError(ProviderErrorCode.PROVIDER_NOT_FOUND, id, `3D provider '${id}' not found`);
    }
    return provider;
  }

  getDefaultProvider(): Asset3DProviderAdapter {
    return this.getProvider(this.defaultProviderId);
  }

  listProviders(): ProviderInfo[] {
    return Array.from(this.providers.entries()).map(([providerId]) => ({
      providerId,
      type: '3d' as const,
      isDefault: providerId === this.defaultProviderId,
    }));
  }

  hasProvider(providerId: string): boolean {
    return this.providers.has(providerId);
  }

  getDefaultProviderId(): string {
    return this.defaultProviderId;
  }

  getProvidersInOrder(providerId?: string): Asset3DProviderAdapter[] {
    const primaryId = providerId || this.defaultProviderId;
    const result: Asset3DProviderAdapter[] = [];
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
