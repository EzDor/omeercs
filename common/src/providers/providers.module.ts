import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { StabilityAdapter } from './adapters/stability.adapter';
import { ImageProviderRegistry } from './registries/image-provider.registry';

@Module({
  imports: [ConfigModule],
  providers: [StabilityAdapter, ImageProviderRegistry],
  exports: [ImageProviderRegistry],
})
export class ProvidersModule {}
