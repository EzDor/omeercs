import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ImageProviderAdapter, ImageGenerationParams, ImageGenerationResult, ProviderErrorCode } from '@agentic-template/dto/src/providers';
import { LiteLLMHttpClient } from '../../llm/litellm-http.client';
import { LiteLLMClientFactory } from '../../llm/litellm-client.factory';
import { ProviderError } from '../errors/provider.error';

type SupportedSize = '256x256' | '512x512' | '1024x1024' | '1792x1024' | '1024x1792';

@Injectable()
export class StabilityAdapter implements ImageProviderAdapter {
  readonly providerId = 'stability';
  private readonly logger = new Logger(StabilityAdapter.name);
  private readonly llmClient: LiteLLMHttpClient;
  private readonly model: string;

  constructor(private readonly configService: ConfigService) {
    this.llmClient = LiteLLMClientFactory.createClientFromConfig(configService);
    this.model = configService.get<string>('STABILITY_MODEL') || 'stability/sd3.5-large';
  }

  async generateImage(params: ImageGenerationParams): Promise<ImageGenerationResult> {
    const startTime = Date.now();
    const size = this.mapSize(params);
    this.logger.debug(`[${this.providerId}] Generating image: size=${size}, prompt="${params.prompt.substring(0, 50)}..."`);

    try {
      const response = await this.llmClient.imageGeneration({
        model: this.model,
        prompt: params.prompt,
        size,
        n: params.numImages || 1,
        quality: params.quality,
        response_format: 'url',
      });

      const data = response.data[0];
      if (!data.url) {
        throw new ProviderError(ProviderErrorCode.GENERATION_FAILED, this.providerId, 'No URL returned from provider');
      }

      const [width, height] = this.parseSize(params);
      const durationMs = Date.now() - startTime;
      this.logger.log(`[${this.providerId}] Image generated successfully in ${durationMs}ms: ${width}x${height}`);

      return this.normalizeResponse(data.url, width, height, params, data.revised_prompt);
    } catch (error) {
      const durationMs = Date.now() - startTime;
      if (error instanceof ProviderError) {
        this.logger.warn(`[${this.providerId}] Generation failed in ${durationMs}ms: ${error.code}`);
        throw error;
      }
      this.logger.error(`[${this.providerId}] Generation failed in ${durationMs}ms: ${(error as Error).message}`);
      throw new ProviderError(ProviderErrorCode.GENERATION_FAILED, this.providerId, (error as Error).message, { originalError: String(error) });
    }
  }

  supportsParams(params: ImageGenerationParams): boolean {
    // Validate dimensions if provided
    if (params.width !== undefined && (params.width < 256 || params.width > 4096)) {
      return false;
    }
    if (params.height !== undefined && (params.height < 256 || params.height > 4096)) {
      return false;
    }
    // Validate aspect ratio if provided
    if (params.aspectRatio && !['1:1', '16:9', '9:16'].includes(params.aspectRatio)) {
      return false;
    }
    return true;
  }

  private mapSize(params: ImageGenerationParams): SupportedSize {
    // If explicit dimensions provided, find nearest supported size
    if (params.width && params.height) {
      return this.findNearestSupportedSize(params.width, params.height);
    }
    // Map aspect ratio to supported size
    if (params.aspectRatio) {
      const ratioMap: Record<string, SupportedSize> = {
        '1:1': '1024x1024',
        '16:9': '1792x1024',
        '9:16': '1024x1792',
      };
      return ratioMap[params.aspectRatio] || '1024x1024';
    }
    return '1024x1024';
  }

  private findNearestSupportedSize(width: number, height: number): SupportedSize {
    const aspectRatio = width / height;
    // Landscape (aspect > 1.5)
    if (aspectRatio > 1.5) return '1792x1024';
    // Portrait (aspect < 0.67)
    if (aspectRatio < 0.67) return '1024x1792';
    // Square-ish - pick closest square size
    return '1024x1024';
  }

  private parseSize(params: ImageGenerationParams): [number, number] {
    const size = this.mapSize(params).split('x');
    return [parseInt(size[0]), parseInt(size[1])];
  }

  private normalizeResponse(uri: string, width: number, height: number, params: ImageGenerationParams, revisedPrompt?: string): ImageGenerationResult {
    return {
      uri,
      metadata: {
        providerId: this.providerId,
        model: this.model.split('/').pop() || this.model,
        width,
        height,
        format: params.format || 'png',
        revisedPrompt,
        seed: params.seed,
      },
    };
  }
}
