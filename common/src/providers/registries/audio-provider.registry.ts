import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AudioProviderAdapter } from '@agentic-template/dto/src/providers/interfaces/audio-provider.interface';
import { ProviderInfo } from '@agentic-template/dto/src/providers/interfaces/provider-registry.interface';
import { ProviderErrorCode } from '@agentic-template/dto/src/providers/types/provider-error.interface';
import { ProviderError } from '../errors/provider.error';
import { StubAudioAdapter } from '../adapters/stub-audio.adapter';

@Injectable()
export class AudioProviderRegistry {
  private readonly logger = new Logger(AudioProviderRegistry.name);
  private readonly providers: Map<string, AudioProviderAdapter>;
  private readonly defaultProviderId: string;

  constructor(
    private readonly stubAudioAdapter: StubAudioAdapter,
    private readonly configService: ConfigService,
  ) {
    this.providers = new Map();
    this.providers.set('stub', stubAudioAdapter);
    const useStub = this.configService.get<string>('AUDIO_PROVIDER_STUB') === 'true';
    this.defaultProviderId = useStub ? 'stub' : 'stub';
    this.logger.log(`Registered ${this.providers.size} audio provider(s): ${Array.from(this.providers.keys()).join(', ')} (default: ${this.defaultProviderId})`);
  }

  getProvider(providerId?: string): AudioProviderAdapter {
    const id = providerId || this.defaultProviderId;
    const provider = this.providers.get(id);
    if (!provider) {
      throw new ProviderError(ProviderErrorCode.PROVIDER_NOT_FOUND, id, `Audio provider '${id}' not found`);
    }
    return provider;
  }

  getDefaultProvider(): AudioProviderAdapter {
    return this.getProvider(this.defaultProviderId);
  }

  listProviders(): ProviderInfo[] {
    return Array.from(this.providers.entries()).map(([providerId]) => ({
      providerId,
      type: 'audio' as const,
      isDefault: providerId === this.defaultProviderId,
    }));
  }

  hasProvider(providerId: string): boolean {
    return this.providers.has(providerId);
  }

  getDefaultProviderId(): string {
    return this.defaultProviderId;
  }

  isStubMode(): boolean {
    return this.configService.get<string>('AUDIO_PROVIDER_STUB') === 'true';
  }
}
