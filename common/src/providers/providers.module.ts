import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GenerationJob } from '@agentic-template/dao/src/entities/generation-job.entity';
import { StabilityAdapter } from './adapters/stability.adapter';
import { StubAudioAdapter } from './adapters/stub-audio.adapter';
import { NanoBananaVideoAdapter } from './adapters/nano-banana-video.adapter';
import { NanoBananaSfxAdapter } from './adapters/nano-banana-sfx.adapter';
import { SunoBgmAdapter } from './adapters/suno-bgm.adapter';
import { MeshyAsset3dAdapter } from './adapters/meshy-3d.adapter';
import { NanoBananaImageAdapter } from './adapters/nano-banana-image.adapter';
import { ImageProviderRegistry } from './registries/image-provider.registry';
import { AudioProviderRegistry } from './registries/audio-provider.registry';
import { VideoProviderRegistry } from './registries/video-provider.registry';
import { Asset3DProviderRegistry } from './registries/asset3d-provider.registry';
import { ConcurrencyLimiterService } from './services/concurrency-limiter.service';
import { PollingService } from './services/polling.service';

@Module({
  imports: [ConfigModule, TypeOrmModule.forFeature([GenerationJob])],
  providers: [
    StabilityAdapter,
    StubAudioAdapter,
    NanoBananaVideoAdapter,
    NanoBananaSfxAdapter,
    SunoBgmAdapter,
    MeshyAsset3dAdapter,
    NanoBananaImageAdapter,
    ImageProviderRegistry,
    AudioProviderRegistry,
    VideoProviderRegistry,
    Asset3DProviderRegistry,
    ConcurrencyLimiterService,
    PollingService,
  ],
  exports: [ImageProviderRegistry, AudioProviderRegistry, VideoProviderRegistry, Asset3DProviderRegistry, ConcurrencyLimiterService, PollingService],
})
export class ProvidersModule {}
