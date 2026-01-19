# Quickstart: Provider Adapters

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)
**Date**: 2026-01-18

## Prerequisites

Before implementing Provider Adapters, ensure:

1. **Node.js 20.x** installed
2. **pnpm** package manager
3. **Docker** running (for LiteLLM proxy)
4. **Stability AI API key** (get from [platform.stability.ai](https://platform.stability.ai))

## Setup

### 1. Environment Variables

Add to `.env.local`:

```bash
# Stability AI (first provider implementation)
STABILITY_API_KEY=sk-...your-stability-key...

# LiteLLM (already configured)
LITELLM_BASE_URL=http://localhost:4000
LITELLM_API_KEY=your-litellm-master-key
```

### 2. Update LiteLLM Config

Add to `litellm/litellm_config.yaml`:

```yaml
model_list:
  # ... existing models ...

  # Stability AI Image Generation
  - model_name: stability/sd3.5-large
    litellm_params:
      model: stability/sd3.5-large
      api_key: os.environ/STABILITY_API_KEY
```

### 3. Install Dependencies

```bash
pnpm install
```

### 4. Start Infrastructure

```bash
docker compose up -d  # Starts PostgreSQL, Valkey, LiteLLM
```

## Implementation Steps

### Step 1: Create Interfaces in DTO Package

```bash
# Create provider interfaces directory
mkdir -p dto/src/providers/interfaces
mkdir -p dto/src/providers/types
```

Create `dto/src/providers/types/index.ts`:
```typescript
export * from './generation-params.interface';
export * from './provider-error.interface';
```

Create `dto/src/providers/interfaces/index.ts`:
```typescript
export * from './image-provider.interface';
export * from './video-provider.interface';
export * from './audio-provider.interface';
export * from './asset3d-provider.interface';
export * from './segmentation-provider.interface';
export * from './provider-registry.interface';
```

Create `dto/src/providers/index.ts`:
```typescript
export * from './types';
export * from './interfaces';
```

### Step 2: Create Provider Module in Common Package

```bash
# Create provider module structure
mkdir -p common/src/providers/adapters
mkdir -p common/src/providers/registries
mkdir -p common/src/providers/errors
```

Create `common/src/providers/errors/provider.error.ts`:
```typescript
import { ProviderErrorCode } from '@agentic-template/dto';

export class ProviderError extends Error {
  constructor(
    public readonly code: ProviderErrorCode,
    public readonly providerId: string | undefined,
    message: string,
    public readonly debugContext?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ProviderError';
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      providerId: this.providerId,
      debugContext: this.debugContext,
    };
  }
}
```

### Step 3: Implement Stability Adapter

Create `common/src/providers/adapters/stability.adapter.ts`:
```typescript
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ImageProviderAdapter,
  ImageGenerationParams,
  ImageGenerationResult,
  ProviderErrorCode,
} from '@agentic-template/dto';
import { LiteLLMHttpClient, LiteLLMClientFactory } from '../llm';
import { ProviderError } from '../errors/provider.error';

@Injectable()
export class StabilityAdapter implements ImageProviderAdapter {
  readonly providerId = 'stability';
  private readonly logger = new Logger(StabilityAdapter.name);
  private readonly llmClient: LiteLLMHttpClient;

  constructor(private readonly configService: ConfigService) {
    this.llmClient = LiteLLMClientFactory.createClientFromConfig(configService);
  }

  async generateImage(params: ImageGenerationParams): Promise<ImageGenerationResult> {
    this.logger.debug(`Generating image with prompt: ${params.prompt.substring(0, 50)}...`);

    try {
      const response = await this.llmClient.imageGeneration({
        model: 'stability/sd3.5-large',
        prompt: params.prompt,
        negative_prompt: params.negativePrompt,
        size: this.mapSize(params),
        n: params.numImages || 1,
        response_format: 'url',
      });

      const data = response.data[0];
      const [width, height] = this.parseSize(params);

      return {
        uri: data.url!,
        metadata: {
          providerId: this.providerId,
          model: 'sd3.5-large',
          width,
          height,
          format: 'png',
          revisedPrompt: data.revised_prompt,
          seed: params.seed,
        },
      };
    } catch (error) {
      this.logger.error(`Stability image generation failed: ${error.message}`);
      throw new ProviderError(
        ProviderErrorCode.GENERATION_FAILED,
        this.providerId,
        error.message,
        { originalError: error },
      );
    }
  }

  supportsParams(params: ImageGenerationParams): boolean {
    // Stability supports most standard parameters
    return true;
  }

  private mapSize(params: ImageGenerationParams): string {
    if (params.width && params.height) {
      return `${params.width}x${params.height}`;
    }
    if (params.aspectRatio) {
      const ratioMap: Record<string, string> = {
        '1:1': '1024x1024',
        '16:9': '1792x1024',
        '9:16': '1024x1792',
      };
      return ratioMap[params.aspectRatio] || '1024x1024';
    }
    return '1024x1024';
  }

  private parseSize(params: ImageGenerationParams): [number, number] {
    if (params.width && params.height) {
      return [params.width, params.height];
    }
    const size = this.mapSize(params).split('x');
    return [parseInt(size[0]), parseInt(size[1])];
  }
}
```

### Step 4: Create Image Provider Registry

Create `common/src/providers/registries/image-provider.registry.ts`:
```typescript
import { Injectable, Logger } from '@nestjs/common';
import {
  ImageProviderAdapter,
  ImageProviderRegistry as IImageProviderRegistry,
  ProviderErrorCode,
} from '@agentic-template/dto';
import { ProviderError } from '../errors/provider.error';
import { StabilityAdapter } from '../adapters/stability.adapter';

@Injectable()
export class ImageProviderRegistry implements IImageProviderRegistry {
  private readonly logger = new Logger(ImageProviderRegistry.name);
  private readonly providers: Map<string, ImageProviderAdapter>;
  private readonly defaultProviderId = 'stability';

  constructor(private readonly stabilityAdapter: StabilityAdapter) {
    this.providers = new Map();
    this.providers.set('stability', stabilityAdapter);
    this.logger.log(`Registered ${this.providers.size} image providers`);
  }

  getProvider(providerId: string): ImageProviderAdapter {
    const provider = this.providers.get(providerId);
    if (!provider) {
      throw new ProviderError(
        ProviderErrorCode.PROVIDER_NOT_FOUND,
        providerId,
        `Image provider '${providerId}' not found`,
      );
    }
    return provider;
  }

  getDefaultProvider(): ImageProviderAdapter {
    return this.getProvider(this.defaultProviderId);
  }

  listProviders(): string[] {
    return Array.from(this.providers.keys());
  }

  hasProvider(providerId: string): boolean {
    return this.providers.has(providerId);
  }
}
```

### Step 5: Create Providers Module

Create `common/src/providers/providers.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { StabilityAdapter } from './adapters/stability.adapter';
import { ImageProviderRegistry } from './registries/image-provider.registry';

@Module({
  imports: [ConfigModule],
  providers: [
    StabilityAdapter,
    ImageProviderRegistry,
  ],
  exports: [
    ImageProviderRegistry,
  ],
})
export class ProvidersModule {}
```

### Step 6: Export from Common Package

Update `common/src/index.ts`:
```typescript
// ... existing exports ...
export * from './providers';
```

### Step 7: Build Packages

```bash
pnpm --filter @agentic-template/dto build
pnpm --filter @agentic-template/common build
```

## Usage Example

### In a Skill Handler

```typescript
import { Injectable } from '@nestjs/common';
import { ImageProviderRegistry } from '@agentic-template/common';
import { SkillHandler, SkillResult, skillSuccess, skillFailure } from '@agentic-template/dto';

@Injectable()
export class MyImageSkillHandler implements SkillHandler<Input, Output> {
  constructor(private readonly imageProviders: ImageProviderRegistry) {}

  async execute(input: Input): Promise<SkillResult<Output>> {
    try {
      // Get specific provider or default
      const provider = input.provider
        ? this.imageProviders.getProvider(input.provider)
        : this.imageProviders.getDefaultProvider();

      // Generate image
      const result = await provider.generateImage({
        prompt: input.prompt,
        negativePrompt: input.negativePrompt,
        width: 1024,
        height: 1024,
      });

      return skillSuccess(
        { imageUrl: result.uri },
        [{
          artifact_type: 'image/generated',
          uri: result.uri,
          metadata: result.metadata,
        }],
      );
    } catch (error) {
      return skillFailure(error.message, 'EXECUTION_ERROR');
    }
  }
}
```

## Testing

### Unit Test Example

Create `common/src/providers/adapters/stability.adapter.spec.ts`:
```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { StabilityAdapter } from './stability.adapter';

describe('StabilityAdapter', () => {
  let adapter: StabilityAdapter;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StabilityAdapter,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const config: Record<string, string> = {
                LITELLM_BASE_URL: 'http://localhost:4000',
                LITELLM_API_KEY: 'test-key',
              };
              return config[key];
            }),
          },
        },
      ],
    }).compile();

    adapter = module.get<StabilityAdapter>(StabilityAdapter);
  });

  it('should have correct providerId', () => {
    expect(adapter.providerId).toBe('stability');
  });

  it('should support standard params', () => {
    expect(adapter.supportsParams({ prompt: 'test' })).toBe(true);
  });
});
```

### Run Tests

```bash
pnpm --filter @agentic-template/common test
```

## Verification

### Check Provider Registry

```typescript
// In a test or debug endpoint
const providers = imageProviderRegistry.listProviders();
console.log('Available providers:', providers);
// Expected: ['stability']
```

### Test Generation

```typescript
const result = await imageProviderRegistry
  .getDefaultProvider()
  .generateImage({
    prompt: 'A test image of a sunset',
    width: 1024,
    height: 1024,
  });

console.log('Generated:', result.uri);
console.log('Metadata:', result.metadata);
```

## Next Steps

After completing the basic implementation:

1. **Add DALL-E adapter** - Validate multi-provider pattern
2. **Add video/audio providers** - Extend to other media types
3. **Add unified registry** - Central access point for all provider types
4. **Add cost tracking** - Log costs in skill debug info
5. **Add integration tests** - Test with real providers (sandbox/test accounts)

## Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| `STABILITY_API_KEY not set` | Add to `.env.local` and restart |
| `LiteLLM connection refused` | Run `docker compose up -d` |
| `Provider not found` | Check provider is registered in registry |
| `Rate limited` | Wait and retry (no automatic retry in adapters) |

### Logs

Enable debug logging:
```bash
DEBUG=* pnpm --filter agent-platform dev
```

Check LiteLLM logs:
```bash
docker logs litellm-proxy
```
