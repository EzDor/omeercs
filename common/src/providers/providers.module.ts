import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { StabilityAdapter } from './adapters/stability.adapter';
import { StubAudioAdapter } from './adapters/stub-audio.adapter';
import { ImageProviderRegistry } from './registries/image-provider.registry';
import { AudioProviderRegistry } from './registries/audio-provider.registry';

@Module({
  imports: [ConfigModule],
  providers: [StabilityAdapter, StubAudioAdapter, ImageProviderRegistry, AudioProviderRegistry],
  exports: [ImageProviderRegistry, AudioProviderRegistry],
})
export class ProvidersModule {}
