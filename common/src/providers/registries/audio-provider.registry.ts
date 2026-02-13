import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AudioProviderAdapter } from '@agentic-template/dto/src/providers/interfaces/audio-provider.interface';
import { ProviderInfo } from '@agentic-template/dto/src/providers/interfaces/provider-registry.interface';
import { ProviderErrorCode } from '@agentic-template/dto/src/providers/types/provider-error.interface';
import { ProviderError } from '../errors/provider.error';
import { StubAudioAdapter } from '../adapters/stub-audio.adapter';
import { NanoBananaSfxAdapter } from '../adapters/nano-banana-sfx.adapter';
import { SunoBgmAdapter } from '../adapters/suno-bgm.adapter';

@Injectable()
export class AudioProviderRegistry {
  private readonly logger = new Logger(AudioProviderRegistry.name);
  private readonly providers: Map<string, AudioProviderAdapter>;
  private readonly defaultProviderId: string;
  private readonly sfxProviderId: string;
  private readonly bgmProviderId: string;

  constructor(
    private readonly stubAudioAdapter: StubAudioAdapter,
    @Optional() private readonly nanoBananaSfxAdapter: NanoBananaSfxAdapter,
    @Optional() private readonly sunoBgmAdapter: SunoBgmAdapter,
    private readonly configService: ConfigService,
  ) {
    this.providers = new Map();
    this.providers.set('stub', stubAudioAdapter);

    if (nanoBananaSfxAdapter) {
      this.providers.set('nano-banana-sfx', nanoBananaSfxAdapter);
    }
    if (sunoBgmAdapter) {
      this.providers.set('suno-bgm', sunoBgmAdapter);
    }

    const useStub = this.configService.get<string>('AUDIO_PROVIDER_STUB') === 'true';
    this.defaultProviderId = useStub ? 'stub' : (nanoBananaSfxAdapter ? 'nano-banana-sfx' : 'stub');
    this.sfxProviderId = useStub ? 'stub' : (nanoBananaSfxAdapter ? 'nano-banana-sfx' : 'stub');
    this.bgmProviderId = useStub ? 'stub' : (sunoBgmAdapter ? 'suno-bgm' : 'stub');

    this.logger.log(`Registered ${this.providers.size} audio provider(s): ${Array.from(this.providers.keys()).join(', ')} (default: ${this.defaultProviderId})`);
  }

  routeByAudioType(type: 'sfx' | 'bgm'): AudioProviderAdapter {
    const providerId = type === 'sfx' ? this.sfxProviderId : this.bgmProviderId;
    return this.getProvider(providerId);
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

  getProvidersInOrder(providerId?: string): AudioProviderAdapter[] {
    const primaryId = providerId || this.defaultProviderId;
    const result: AudioProviderAdapter[] = [];
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
